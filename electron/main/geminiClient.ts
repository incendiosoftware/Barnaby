import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { EventEmitter } from 'node:events'

/** Ensure npm global bin is in PATH so Electron can find gemini CLI. */
function getGeminiSpawnEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.CLAUDECODE
  if (process.platform === 'win32') {
    const npmBin = process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : ''
    if (npmBin && env.PATH && !env.PATH.includes(npmBin)) {
      env.PATH = `${npmBin}${path.delimiter}${env.PATH}`
    }
  }
  env.GEMINI_SANDBOX = 'false'
  return env
}

/**
 * Resolve the .js entry point from gemini.cmd's npm shim.
 * This lets us spawn node directly, bypassing cmd.exe's ~8K command-line limit.
 */
function resolveGeminiJsEntryPoint(): string | null {
  if (process.platform !== 'win32') return null
  const npmBin = process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : ''
  if (!npmBin) return null

  const cmdPath = path.join(npmBin, 'gemini.cmd')
  if (!fs.existsSync(cmdPath)) return null

  try {
    const cmdContent = fs.readFileSync(cmdPath, 'utf8')
    const match = cmdContent.match(/%dp0%\\([^\s"]+\.js)/i)
    if (match) {
      const jsPath = path.join(npmBin, match[1])
      if (fs.existsSync(jsPath)) return jsPath
    }
  } catch { /* fall through */ }
  return null
}

/**
 * Find 'node' executable on PATH (not process.execPath which is Electron in packaged apps).
 */
function findNodeExe(): string | null {
  const pathDirs = (process.env.PATH ?? '').split(path.delimiter)
  for (const dir of pathDirs) {
    const candidate = path.join(dir, process.platform === 'win32' ? 'node.exe' : 'node')
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

/**
 * Spawn the gemini CLI with proper Windows shim resolution.
 * On Windows, tries to resolve gemini.cmd → .js entry point and spawn via node.exe directly.
 * Falls back to cmd.exe /c gemini.
 */
function spawnGemini(
  args: string[],
  spawnOpts: { cwd: string; stdio: ['pipe', 'pipe', 'pipe'] | ['ignore', 'pipe', 'pipe']; env: NodeJS.ProcessEnv },
): ChildProcessWithoutNullStreams {
  if (process.platform !== 'win32') {
    return spawn('gemini', args, spawnOpts as object) as ChildProcessWithoutNullStreams
  }

  const jsEntry = resolveGeminiJsEntryPoint()
  const nodeExe = jsEntry ? findNodeExe() : null
  if (jsEntry && nodeExe) {
    return spawn(nodeExe, [jsEntry, ...args], {
      ...spawnOpts,
      windowsHide: true,
    } as object) as ChildProcessWithoutNullStreams
  }

  return spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'gemini', ...args], {
    ...spawnOpts,
    windowsHide: true,
  } as object) as ChildProcessWithoutNullStreams
}

import { resolveAtFileReferences } from './atFileResolver'
import { generateWorkspaceTreeText } from './fileTree'
import { buildStableSystemPrompt, buildDynamicContext } from './systemPrompt'
import { truncateHistoryWithMeta } from './historyTruncation'
import { logModelPayloadAudit } from './modelPayloadLogger'

export type GeminiClientEvent =
  | { type: 'status'; status: 'starting' | 'ready' | 'error' | 'closed'; message?: string }
  | { type: 'assistantDelta'; delta: string }
  | { type: 'assistantCompleted' }
  | { type: 'usageUpdated'; usage: unknown }
  | { type: 'thinking'; message: string }
  | { type: 'promptPreview'; content: string; format: 'text' | 'json' }
  | { type: 'contextCompacting'; detail?: string }
  | { type: 'contextCompacted'; detail?: string }

const INITIAL_HISTORY_MAX_MESSAGES = 24

export type GeminiConnectOptions = {
  model: string
  cwd: string
  permissionMode?: 'verify-first' | 'proceed-always'
  sandbox?: 'read-only' | 'workspace-write'
  interactionMode?: string
  workspaceContext?: string
  showWorkspaceContextInPrompt?: boolean
  systemPrompt?: string
  initialHistory?: Array<{ role: 'user' | 'assistant'; text: string }>
  mcpConfigPath?: string
}

export class GeminiClient extends EventEmitter {
  private model: string = 'gemini-2.0-flash'
  private cwd: string = process.cwd()
  private permissionMode: 'verify-first' | 'proceed-always' = 'verify-first'
  private sandbox: 'read-only' | 'workspace-write' = 'workspace-write'
  private interactionMode: string = 'agent'
  private workspaceContext = ''
  private showWorkspaceContextInPrompt = false
  private systemPrompt = ''
  private mcpConfigPath: string | null = null
  private mcpServerNames: string[] = []
  private history: Array<{ role: 'user' | 'assistant'; text: string }> = []
  private activeProc: ChildProcessWithoutNullStreams | null = null
  /** Track whether a session has been established (for --resume on turns 2+). */
  private hasActiveSession: boolean = false
  /** Path to the temp policy file containing the stable system prompt. */
  private policyFilePath: string | null = null
  private stableSystemPrompt = ''

  private static TURN_INACTIVITY_TIMEOUT_MS = 180_000
  private turnInactivityTimer: ReturnType<typeof setTimeout> | null = null

  private resetTurnInactivityTimer() {
    if (this.turnInactivityTimer) clearTimeout(this.turnInactivityTimer)
    if (!this.activeProc) return
    this.turnInactivityTimer = setTimeout(() => {
      this.turnInactivityTimer = null
      if (this.activeProc) {
        this.emitEvent({ type: 'status', status: 'error', message: 'Gemini turn timed out — no activity for 120 seconds.' })
        try { this.activeProc.kill() } catch { /* ignore */ }
      }
    }, GeminiClient.TURN_INACTIVITY_TIMEOUT_MS)
  }

  private clearTurnInactivityTimer() {
    if (this.turnInactivityTimer) {
      clearTimeout(this.turnInactivityTimer)
      this.turnInactivityTimer = null
    }
  }

  /**
   * Pass model ID through to the CLI as-is.
   * The Gemini CLI resolves model names internally — no hardcoded map needed.
   */
  private normalizeModelId(model: string) {
    return model
  }

  private isModelNotFoundError(message: string) {
    const lower = message.toLowerCase()
    return (
      lower.includes('modelnotfound') ||
      lower.includes('requested entity was not found') ||
      (lower.includes('not found') && lower.includes('model'))
    )
  }

  private static readonly STDERR_NOISE = /YOLO mode|Loaded cached credentials|All tool calls will be|^\s*at /i

  /** Map Gemini CLI exit codes to user-friendly messages (per Gemini CLI docs) */
  private formatGeminiExitError(code: number | null, signal: string | null, stderr: string): string {
    const stderrTrimmed = stderr.trim()
    if (stderrTrimmed) {
      const meaningful = stderrTrimmed
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !GeminiClient.STDERR_NOISE.test(l))
      const firstLine = meaningful[0] ?? stderrTrimmed.split('\n').find((l) => l.trim()) ?? stderrTrimmed.split('\n')[0]
      return firstLine.length > 300 ? firstLine.slice(0, 300) + '...' : firstLine
    }
    if (signal) return `Gemini CLI was terminated (${signal})`
    const knownCodes: Record<number, string> = {
      1: 'Gemini CLI failed. Model may be at capacity — try again in a moment or switch to a different model.',
      41: 'Authentication failed. Run `gemini` in a terminal and log in with Google.',
      42: 'Invalid or missing input. Check your prompt or model selection.',
      44: 'Sandbox error. Try without sandbox or check your Docker/Podman setup.',
      52: 'Invalid config. Check your Gemini CLI settings.json.',
      53: 'Session turn limit reached. Start a new session.',
    }
    const msg = knownCodes[code ?? 0]
    if (msg) return msg
    return `Gemini CLI exited with code ${code ?? 'unknown'}`
  }

  emitEvent(evt: GeminiClientEvent) {
    this.emit('event', evt)
  }

  private emitPromptPreview(content: string, format: 'text' | 'json' = 'text') {
    if (!this.showWorkspaceContextInPrompt) return
    const redacted = String(content ?? '').replace(/data:[^;\s]+;base64,[A-Za-z0-9+/=]+/g, '[data-url-redacted]')
    if (!redacted.trim()) return
    this.emitEvent({ type: 'promptPreview', content: redacted, format })
  }

  async connect(options: GeminiConnectOptions) {
    const requestedModel = options.model || 'gemini-2.0-flash'
    const normalized = this.normalizeModelId(requestedModel)
    this.model = normalized
    this.cwd = options.cwd || process.cwd()
    this.permissionMode = options.permissionMode ?? 'verify-first'
    this.sandbox = options.sandbox ?? 'workspace-write'
    this.interactionMode = options.interactionMode ?? 'agent'
    this.workspaceContext = typeof options.workspaceContext === 'string' ? options.workspaceContext.trim() : ''
    this.showWorkspaceContextInPrompt = options.showWorkspaceContextInPrompt === true
    this.systemPrompt = typeof options.systemPrompt === 'string' ? options.systemPrompt.trim() : ''
    this.mcpConfigPath = options.mcpConfigPath ?? null
    if (normalized !== requestedModel) {
      this.emitEvent({
        type: 'status',
        status: 'starting',
        message: `Model ${requestedModel} mapped to ${normalized} for Gemini CLI.`,
      })
    }
    this.emitEvent({ type: 'status', status: 'starting', message: 'Connecting to Gemini CLI...' })
    await this.assertGeminiCliAvailable()
    await this.syncMcpServers()
    this.writePolicyFile()
    this.history =
      (options.initialHistory?.length ?? 0) > 0
        ? options.initialHistory!.slice(-INITIAL_HISTORY_MAX_MESSAGES)
        : []
    this.emitEvent({ type: 'status', status: 'ready', message: 'Connected' })
    return { threadId: 'gemini' }
  }

  async sendUserMessageWithImages(text: string, localImagePaths: string[], options?: { interactionMode?: string; gitStatus?: string }) {
    const trimmed = text.trim()
    const imagePaths = (localImagePaths ?? []).filter((p) => typeof p === 'string' && p.trim())
    if (!trimmed && imagePaths.length === 0) return

    const imageRefs = imagePaths.length > 0 ? '\n\n' + imagePaths.map((p) => `@${p}`).join('\n') : ''
    const userText = trimmed ? trimmed + imageRefs : imagePaths.map((p) => `@${p}`).join('\n')
    const fileContext = resolveAtFileReferences(userText, this.cwd)
    const fullMessage = userText + fileContext
    this.history.push({ role: 'user', text: fullMessage })

    const prompt = this.buildGeminiPrompt(fullMessage, options?.interactionMode, options?.gitStatus)
    this.emitPromptPreview(
      [
        '[Stable system prompt]',
        this.stableSystemPrompt,
        '[Turn prompt]',
        prompt,
      ].join('\n\n'),
      'text',
    )
    const isResume = this.hasActiveSession
    await this.runTurn(prompt, isResume)
  }

  async sendUserMessage(text: string, options?: { interactionMode?: string; gitStatus?: string }) {
    const trimmed = text.trim()
    if (!trimmed) return

    const fileContext = resolveAtFileReferences(trimmed, this.cwd)
    const fullMessage = trimmed + fileContext
    this.history.push({ role: 'user', text: fullMessage })

    const prompt = this.buildGeminiPrompt(fullMessage, options?.interactionMode, options?.gitStatus)
    this.emitPromptPreview(
      [
        '[Stable system prompt]',
        this.stableSystemPrompt,
        '[Turn prompt]',
        prompt,
      ].join('\n\n'),
      'text',
    )
    const isResume = this.hasActiveSession
    await this.runTurn(prompt, isResume)
  }

  private async runTurn(prompt: string, resume: boolean = false): Promise<void> {
    const startTurn = (modelId: string, useResume: boolean): Promise<void> =>
      new Promise((resolve, reject) => {
        const args = ['-m', modelId, '--yolo', '--output-format', 'stream-json', '-p', prompt]
        if (useResume) {
          args.push('--resume')
        }
        if (this.policyFilePath && fs.existsSync(this.policyFilePath)) {
          args.push('--policy', this.policyFilePath)
        }
        if (this.mcpServerNames.length > 0) {
          args.push('--allowed-mcp-server-names', ...this.mcpServerNames)
        }
        const policyBytes =
          this.policyFilePath && fs.existsSync(this.policyFilePath)
            ? fs.statSync(this.policyFilePath).size
            : 0
        logModelPayloadAudit({
          provider: 'gemini',
          endpoint: 'cli:prompt-arg',
          model: modelId,
          serializedPayload: prompt,
          meta: {
            resume: useResume,
            promptChars: prompt.length,
            policyBytes,
            mcpServerCount: this.mcpServerNames.length,
          },
        })
        const spawnOpts = {
          cwd: this.cwd,
          stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
          env: getGeminiSpawnEnv(),
        }
        const proc = spawnGemini(args, spawnOpts)

        this.activeProc = proc
        this.resetTurnInactivityTimer()

        proc.stdout.setEncoding('utf8')
        proc.stderr.setEncoding('utf8')

        let assistantText = ''
        let stderr = ''
        let resolved = false
        let stdoutBuffer = ''

        const GEMINI_NOISE = /quota|retrying after|rate.?limit|capacity.*exhausted|reset after|YOLO mode|Loaded cached credentials|All tool calls will be/i
        const GEMINI_RETRYABLE = /status 429|Retrying with backoff|Attempt \d+ failed(?!.*Max attempts)|No capacity available/i
        // Only filter subagent metadata from non-JSON noise lines and thinking traces — never from real assistant message content.
        const SUBAGENT_NOISE = /^Subagent\s+\S+.*Finished|GOAL Result\s*:|Termination Reason\s*:/i

        proc.stdout.on('data', (chunk: string) => {
          if (!chunk) return
          this.resetTurnInactivityTimer()
          stdoutBuffer += chunk
          const lines = stdoutBuffer.split('\n')
          stdoutBuffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue
            let evt: any
            try {
              evt = JSON.parse(trimmed)
            } catch {
              if (GEMINI_NOISE.test(trimmed) || SUBAGENT_NOISE.test(trimmed)) continue

              const short = trimmed.length > 300 ? trimmed.slice(0, 300) + '...' : trimmed

              if (/Max attempts reached/i.test(trimmed)) {
                this.emitEvent({ type: 'status', status: 'error', message: short })
              } else if (GEMINI_RETRYABLE.test(trimmed)) {
                this.emitEvent({ type: 'thinking', message: 'Rate limited — CLI is retrying...' })
              } else {
                this.emitEvent({ type: 'thinking', message: short })
              }
              continue
            }

            switch (evt.type) {
              case 'message':
                if ((evt.role === 'assistant' || evt.role === 'model') && typeof evt.content === 'string') {
                  this.emitEvent({ type: 'assistantDelta', delta: evt.content })
                  assistantText += evt.content
                  if (evt.delta) {
                    const snippet = evt.content.trim()
                    if (snippet.length > 0 && snippet.length < 200) {
                      this.emitEvent({ type: 'thinking', message: snippet })
                    }
                  }
                }
                break
              case 'tool_use':
              case 'toolUse':
              case 'functionCall': {
                const toolName = evt.tool_name ?? evt.name ?? evt.toolName ?? 'tool'
                const params = evt.parameters ?? evt.args ?? evt.input ?? {}
                const detail = params.file_path ?? params.command ?? params.dir_path ??
                  params.pattern ?? params.query ?? params.path ?? params.url ?? ''
                const desc = detail ? `${toolName}: ${detail}` : toolName
                this.emitEvent({ type: 'thinking', message: desc })
                break
              }
              case 'tool_result':
              case 'toolResult':
              case 'functionResponse': {
                const toolStatus = evt.status ?? 'done'
                const isError = toolStatus === 'error' || toolStatus === 'failure'
                const output = typeof evt.output === 'string' ? evt.output
                  : typeof evt.result === 'string' ? evt.result
                    : typeof evt.response === 'string' ? evt.response
                      : typeof evt.error === 'string' ? evt.error : ''
                const toolName = evt.tool_name ?? evt.name ?? evt.toolName ?? 'tool'
                if (isError || /^error/i.test(output)) {
                  const errMsg = output.length > 300 ? output.slice(0, 300) + '...' : output
                  this.emitEvent({ type: 'status', status: 'error', message: errMsg || `Tool "${toolName}" failed` })
                } else if (!SUBAGENT_NOISE.test(output)) {
                  const short = output.length > 160 ? output.slice(0, 160) + '...' : output
                  this.emitEvent({ type: 'thinking', message: short || toolStatus })
                }
                break
              }
              case 'thinking':
              case 'thought': {
                const text = typeof evt.content === 'string' ? evt.content
                  : typeof evt.message === 'string' ? evt.message
                    : typeof evt.text === 'string' ? evt.text : ''
                if (text && !SUBAGENT_NOISE.test(text)) {
                  const short = text.length > 200 ? text.slice(0, 200) + '...' : text
                  this.emitEvent({ type: 'thinking', message: short })
                }
                break
              }
              case 'result':
                if (evt.stats) {
                  this.emitEvent({ type: 'usageUpdated', usage: evt.stats })
                }
                break
              case 'error': {
                const raw = evt.message ?? evt.content ?? 'Unknown error'
                const errMsg = typeof raw === 'string'
                  ? (raw.length > 300 ? raw.slice(0, 300) + '...' : raw)
                  : 'Gemini error'
                if (GEMINI_NOISE.test(errMsg)) break

                const isRetryable = /status 429|Retrying with backoff|Attempt \d+ failed/i.test(errMsg)
                if (isRetryable) {
                  this.emitEvent({ type: 'thinking', message: `Rate limited — CLI is retrying...` })
                } else {
                  this.emitEvent({ type: 'status', status: 'error', message: errMsg })
                }
                break
              }
              case 'init':
                break
              default: {
                const msg = evt.message ?? evt.content ?? evt.text ?? ''
                if (typeof msg === 'string' && msg.trim() && !SUBAGENT_NOISE.test(msg)) {
                  const short = msg.length > 200 ? msg.slice(0, 200) + '...' : msg
                  this.emitEvent({ type: 'thinking', message: `[${evt.type}] ${short}` })
                }
              }
            }
          }
        })

        proc.stderr.on('data', (chunk: string) => {
          this.resetTurnInactivityTimer()
          stderr += chunk
          const trimmed = chunk.trim()
          if (!trimmed) return
          if (!GEMINI_NOISE.test(trimmed)) {
            const short = trimmed.length > 200 ? trimmed.slice(0, 200) + '...' : trimmed
            this.emitEvent({ type: 'thinking', message: short })
          }
        })

        proc.on('error', (err) => {
          if (!resolved) {
            resolved = true
            reject(err)
          }
        })
        proc.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
          this.clearTurnInactivityTimer()
          this.activeProc = null
          if (stdoutBuffer.trim()) {
            try {
              const evt: any = JSON.parse(stdoutBuffer.trim())
              if (evt.type === 'message' && evt.role === 'assistant' && typeof evt.content === 'string') {
                this.emitEvent({ type: 'assistantDelta', delta: evt.content })
                assistantText += evt.content
              } else if (evt.type === 'result' && evt.stats) {
                this.emitEvent({ type: 'usageUpdated', usage: evt.stats })
              }
            } catch {
              // ignore
            }
          }

          if (!resolved) {
            resolved = true
            if (code === 0) resolve()
            else reject(new Error(this.formatGeminiExitError(code, signal, stderr)))
          }
          if (code === 0) {
            this.history.push({ role: 'assistant', text: assistantText.trim() || assistantText })
            this.hasActiveSession = true
            this.emitEvent({ type: 'assistantCompleted' })
          } else {
            this.emitEvent({ type: 'status', status: 'error', message: this.formatGeminiExitError(code, signal, stderr) })
            this.emitEvent({ type: 'assistantCompleted' })
          }
        })
      })

    try {
      await startTurn(this.model, resume)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)

      // Auto-reconnect: if --resume failed, retry as a fresh turn
      if (resume && this.isResumableError(msg)) {
        this.emitEvent({ type: 'thinking', message: 'Session resume failed — starting fresh turn...' })
        this.hasActiveSession = false
        try {
          await startTurn(this.model, false)
          return
        } catch (freshErr: unknown) {
          const freshMsg = freshErr instanceof Error ? freshErr.message : String(freshErr)
          this.emitEvent({ type: 'status', status: 'error', message: freshMsg })
          this.emitEvent({ type: 'assistantCompleted' })
          return
        }
      }

      if (this.isModelNotFoundError(msg) && this.model !== 'gemini-2.0-flash') {
        const originalModel = this.model
        this.model = 'gemini-2.0-flash'
        try {
          this.emitEvent({
            type: 'thinking',
            message: `Model "${originalModel}" not found — retrying with gemini-2.0-flash...`,
          })
          await startTurn(this.model, resume)
        } catch (retryErr: unknown) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr)
          this.emitEvent({ type: 'status', status: 'error', message: retryMsg })
          this.emitEvent({ type: 'assistantCompleted' })
        }
      } else {
        this.emitEvent({ type: 'status', status: 'error', message: msg })
        this.emitEvent({ type: 'assistantCompleted' })
      }
    }
  }

  async interruptActiveTurn() {
    this.clearTurnInactivityTimer()
    if (!this.activeProc) return
    try {
      this.activeProc.kill()
    } catch {
      // ignore
    } finally {
      this.activeProc = null
    }
  }

  async close() {
    await this.interruptActiveTurn()
    this.history = []
    this.hasActiveSession = false
    this.cleanupPolicyFile()
  }

  /**
   * Write the stable system prompt to a temp policy file.
   * The file is passed via --policy on each spawn, so Gemini treats it as system-level
   * instructions rather than user message text.
   */
  private writePolicyFile() {
    this.cleanupPolicyFile()
    const stablePrompt = buildStableSystemPrompt({
      interactionMode: this.interactionMode,
      additionalSystemPrompt: this.systemPrompt,
    })
    this.stableSystemPrompt = stablePrompt
    const tmpDir = os.tmpdir()
    this.policyFilePath = path.join(tmpDir, `barnaby-gemini-policy-${Date.now()}.md`)
    fs.writeFileSync(this.policyFilePath, stablePrompt, 'utf8')
  }

  /** Remove the temp policy file if it exists. */
  private cleanupPolicyFile() {
    if (this.policyFilePath) {
      try { fs.unlinkSync(this.policyFilePath) } catch { /* ignore */ }
      this.policyFilePath = null
    }
  }

  /** Detect errors that indicate a --resume session failure (corrupt/expired). */
  private isResumableError(message: string): boolean {
    const lower = message.toLowerCase()
    return (
      lower.includes('session') ||
      lower.includes('resume') ||
      lower.includes('turn limit') ||
      lower.includes('session turn limit') ||
      /exit(ed)? with code 53/i.test(message)
    )
  }

  private buildGeminiPrompt(userMessage: string, interactionMode?: string, gitStatus?: string): string {
    const tree = generateWorkspaceTreeText(this.cwd)

    // Build dynamic context (changes per turn)
    const dynamicCtx = buildDynamicContext({
      workspaceTree: tree,
      cwd: this.cwd,
      permissionMode: this.permissionMode,
      sandbox: this.sandbox,
      gitStatus,
      workspaceContext: this.workspaceContext,
      showWorkspaceContextInPrompt: this.showWorkspaceContextInPrompt,
    })

    // On resumed turns, only send dynamic context + user message.
    // The stable system prompt is injected via --policy file.
    if (this.hasActiveSession) {
      return `[Workspace context]\n${dynamicCtx}\n\n---\n\n${userMessage}`
    }

    // First turn: send dynamic context + truncated history + user message.
    // The stable system prompt is injected via the --policy file, NOT here.
    const truncation = truncateHistoryWithMeta(this.history.slice(0, -1)) // exclude the message we're about to send
    if (truncation.didTruncate) {
      this.emitEvent({ type: 'contextCompacting', detail: 'Preparing checkpoint summary...' })
      const parts: string[] = []
      if (truncation.droppedMessages > 0) {
        parts.push(`Removed ${truncation.droppedMessages} older message${truncation.droppedMessages === 1 ? '' : 's'}`)
      }
      if (truncation.truncatedAssistantMessages > 0) {
        parts.push(`Compressed ${truncation.truncatedAssistantMessages} long assistant message${truncation.truncatedAssistantMessages === 1 ? '' : 's'}`)
      }
      this.emitEvent({
        type: 'contextCompacted',
        detail: parts.length > 0 ? parts.join('; ') : 'Applied history compaction.',
      })
    }
    const truncated = truncation.history
    const historyHint = truncated.length > 0
      ? '\n\n' + truncated.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}:\n${m.text}`).join('\n\n') + '\n\n'
      : ''

    return `[Workspace context]\n${dynamicCtx}\n\n---\n${historyHint}${userMessage}`
  }

  /**
   * Sync Barnaby's MCP config directly into Gemini CLI's settings.json.
   * We write to the file directly instead of using `gemini mcp add` because
   * the CLI's `-e KEY=VALUE` flag misparses values containing `=` (e.g.
   * connection strings).
   */
  private async syncMcpServers(): Promise<void> {
    if (!this.mcpConfigPath || !fs.existsSync(this.mcpConfigPath)) {
      this.mcpServerNames = []
      return
    }
    let barnabyConfig: { mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string>; enabled?: boolean }> }
    try {
      barnabyConfig = JSON.parse(fs.readFileSync(this.mcpConfigPath, 'utf8'))
    } catch {
      this.mcpServerNames = []
      return
    }
    if (!barnabyConfig.mcpServers || typeof barnabyConfig.mcpServers !== 'object') {
      this.mcpServerNames = []
      return
    }

    const geminiSettingsPath = path.join(process.env.USERPROFILE || process.env.HOME || '', '.gemini', 'settings.json')
    let geminiSettings: Record<string, unknown> = {}
    try {
      if (fs.existsSync(geminiSettingsPath)) {
        geminiSettings = JSON.parse(fs.readFileSync(geminiSettingsPath, 'utf8'))
      }
    } catch {
      geminiSettings = {}
    }

    const existingMcp = (geminiSettings.mcpServers ?? {}) as Record<string, unknown>
    const names: string[] = []
    let changed = false

    for (const [name, srv] of Object.entries(barnabyConfig.mcpServers)) {
      if (srv.enabled === false) continue
      names.push(name)

      const geminiEntry: Record<string, unknown> = {
        command: srv.command,
        args: srv.args ?? [],
        trust: true,
      }
      if (srv.env && Object.keys(srv.env).length > 0) {
        geminiEntry.env = { ...srv.env }
      }

      const existingJson = JSON.stringify(existingMcp[name] ?? null)
      const newJson = JSON.stringify(geminiEntry)
      if (existingJson !== newJson) {
        existingMcp[name] = geminiEntry
        changed = true
        this.emitEvent({ type: 'thinking', message: `Synced MCP server "${name}" to Gemini CLI` })
      }
    }

    if (changed) {
      geminiSettings.mcpServers = existingMcp
      const dir = path.dirname(geminiSettingsPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(geminiSettingsPath, JSON.stringify(geminiSettings, null, 2), 'utf8')
    }

    this.mcpServerNames = names
  }

  private async assertGeminiCliAvailable() {
    await new Promise<void>((resolve, reject) => {
      const spawnOpts = {
        cwd: this.cwd,
        stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'],
        env: getGeminiSpawnEnv(),
      }
      const proc = spawnGemini(['--version'], spawnOpts)

      let stderr = ''
      proc.stderr.setEncoding('utf8')
      proc.stderr.on('data', (chunk: string) => {
        stderr += chunk
      })

      proc.on('error', (err) => reject(err))
      proc.on('exit', (code) => {
        if (code === 0) resolve()
        else reject(new Error(stderr.trim() || 'Gemini CLI not available. Install and login with `gemini`.'))
      })
    }).catch((err: unknown) => {
      const message =
        err instanceof Error
          ? err.message
          : 'Gemini CLI not available. Install and login with `gemini` first.'
      throw new Error(
        `${message}\nUse terminal: \`gemini\` and choose "Login with Google" (subscription).`,
      )
    })
  }
}
