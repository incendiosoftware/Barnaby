import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { EventEmitter } from 'node:events'

import { generateWorkspaceTreeText } from './fileTree'
import { resolveAtFileReferences } from './atFileResolver'
import { buildStableSystemPrompt, buildDynamicContext } from './systemPrompt'
import { truncateHistory } from './historyTruncation'
import { logModelPayloadAudit } from './modelPayloadLogger'

/** Convert local file path to base64 data URL payload blocks */
function readImageAsBase64Block(imagePath: string): { type: 'image', source: { type: 'base64', media_type: string, data: string } } | null {
  try {
    const ext = path.extname(imagePath).toLowerCase()
    let mediaType = 'image/jpeg'
    if (ext === '.png') mediaType = 'image/png'
    else if (ext === '.gif') mediaType = 'image/gif'
    else if (ext === '.webp') mediaType = 'image/webp'

    const buffer = fs.readFileSync(imagePath)
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: buffer.toString('base64'),
      }
    }
  } catch (err) {
    return null
  }
}

/** Ensure npm global bin is in PATH so Electron can find claude CLI. */
function getClaudeSpawnEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  if (process.platform === 'win32') {
    const npmBin = process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : ''
    if (npmBin && env.PATH && !env.PATH.includes(npmBin)) {
      env.PATH = `${npmBin}${path.delimiter}${env.PATH}`
    }
  }
  delete env.CLAUDECODE
  return env
}

/**
 * Resolve the .js entry point from claude.cmd's npm shim.
 * This lets us spawn node directly, bypassing cmd.exe's ~8K command-line limit.
 */
function resolveClaudeJsEntryPoint(): string | null {
  if (process.platform !== 'win32') return null
  const npmBin = process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : ''
  if (!npmBin) return null

  const cmdPath = path.join(npmBin, 'claude.cmd')
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

function spawnClaude(
  args: string[],
  spawnOpts: { cwd: string; stdio: ['pipe', 'pipe', 'pipe'] | ['ignore', 'pipe', 'pipe']; env: NodeJS.ProcessEnv },
): ChildProcessWithoutNullStreams {
  if (process.platform !== 'win32') {
    return spawn('claude', args, spawnOpts as object) as ChildProcessWithoutNullStreams
  }

  const jsEntry = resolveClaudeJsEntryPoint()
  const nodeExe = jsEntry ? findNodeExe() : null
  if (jsEntry && nodeExe) {
    return spawn(nodeExe, [jsEntry, ...args], {
      ...spawnOpts,
      windowsHide: true,
    } as object) as ChildProcessWithoutNullStreams
  }

  return spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'claude', ...args], {
    ...spawnOpts,
    windowsHide: true,
  } as object) as ChildProcessWithoutNullStreams
}

export type ClaudeClientEvent =
  | { type: 'status'; status: 'starting' | 'ready' | 'error' | 'closed'; message?: string }
  | { type: 'assistantDelta'; delta: string }
  | { type: 'assistantCompleted' }
  | { type: 'usageUpdated'; usage: unknown }
  | { type: 'thinking'; message: string }
  | { type: 'promptPreview'; content: string; format: 'text' | 'json' }

const INITIAL_HISTORY_MAX_MESSAGES = 24

export type ClaudeConnectOptions = {
  cwd: string
  model: string
  permissionMode?: 'verify-first' | 'proceed-always'
  sandbox?: 'read-only' | 'workspace-write'
  interactionMode?: string
  workspaceContext?: string
  showWorkspaceContextInPrompt?: boolean
  systemPrompt?: string
  initialHistory?: Array<{ role: 'user' | 'assistant'; text: string }>
  mcpConfigPath?: string
}

/**
 * Persistent Claude CLI client.
 *
 * Architecture (Feb 2026):
 *   connect() spawns ONE long-lived process with --input-format stream-json
 *   --output-format stream-json. The system prompt is written to a temp file
 *   and passed via --append-system-prompt-file to avoid cmd.exe line-length
 *   limits. Each sendUserMessage() writes a single JSON line to stdin.
 *   The process stays alive across turns — no per-turn spawn overhead.
 *
 * Key flags:
 *   --print                       SDK / non-interactive mode
 *   --input-format  stream-json   accept JSONL user messages on stdin
 *   --output-format stream-json   emit JSONL events on stdout
 *   --include-partial-messages    stream text deltas as they arrive
 *   --append-system-prompt-file   load system prompt from file (avoids 8K cmd limit)
 *   --permission-mode             bypassPermissions | default
 */
export class ClaudeClient extends EventEmitter {
  private model: string = 'sonnet'
  private cwd: string = process.cwd()
  private permissionMode: 'verify-first' | 'proceed-always' = 'verify-first'
  private sandbox: 'read-only' | 'workspace-write' = 'workspace-write'
  private interactionMode: string = 'agent'
  private workspaceContext = ''
  private showWorkspaceContextInPrompt = false
  private systemPrompt = ''
  private mcpConfigPath: string | null = null
  private history: Array<{ role: 'user' | 'assistant'; text: string }> = []

  /** The single long-lived CLI process. Null before connect() or after close(). */
  private proc: ChildProcessWithoutNullStreams | null = null
  private sessionId: string | null = null
  private stdoutBuffer: string = ''
  private stderr: string = ''
  private stableSystemPrompt = ''

  /** Temp file holding the system prompt (cleaned up on close). */
  private systemPromptFile: string | null = null

  /** Resolves when the current turn's `result` event arrives. */
  private turnResolve: ((text: string) => void) | null = null
  private turnReject: ((err: Error) => void) | null = null

  private static TURN_INACTIVITY_TIMEOUT_MS = 120_000

  /** Per-turn state, reset at the start of each sendUserMessage. */
  private emittedTextLen = 0
  private seenToolUseIds = new Set<string>()
  private assistantText = ''
  private turnInactivityTimer: ReturnType<typeof setTimeout> | null = null

  private normalizeModelId(model: string) {
    const trimmed = model.trim()
    if (!trimmed) return 'sonnet'
    const normalized = trimmed.toLowerCase()
    const aliasMap: Record<string, string> = {
      'claude-sonnet-4-5-20250929': 'sonnet',
      'claude-sonnet-4-6': 'sonnet',
      'claude-opus-4-1-20250805': 'opus',
      'claude-haiku-3-5-20241022': 'haiku',
    }
    return aliasMap[normalized] ?? trimmed
  }

  private isModelNotFoundError(message: string) {
    const lower = message.toLowerCase()
    return (
      lower.includes('model') &&
      (lower.includes('not found') || lower.includes('unknown') || lower.includes('invalid'))
    )
  }

  private formatClaudeExitError(code: number | null, signal: string | null, stderr: string): string {
    const stderrTrimmed = stderr.trim()
    if (stderrTrimmed) return stderrTrimmed
    if (signal) return `Claude CLI was terminated (${signal})`
    return `Claude CLI exited with code ${code ?? 'unknown'}`
  }

  emitEvent(evt: ClaudeClientEvent) {
    this.emit('event', evt)
  }

  private emitPromptPreview(content: string, format: 'text' | 'json' = 'text') {
    if (!this.showWorkspaceContextInPrompt) return
    const redacted = String(content ?? '').replace(/data:[^;\s]+;base64,[A-Za-z0-9+/=]+/g, '[data-url-redacted]')
    if (!redacted.trim()) return
    this.emitEvent({ type: 'promptPreview', content: redacted, format })
  }

  private resetTurnInactivityTimer() {
    if (this.turnInactivityTimer) clearTimeout(this.turnInactivityTimer)
    if (!this.turnReject) return
    this.turnInactivityTimer = setTimeout(() => {
      this.turnInactivityTimer = null
      if (this.turnReject) {
        this.rejectCurrentTurn(new Error('Claude turn timed out — no activity for 120 seconds.'))
      }
    }, ClaudeClient.TURN_INACTIVITY_TIMEOUT_MS)
  }

  private clearTurnInactivityTimer() {
    if (this.turnInactivityTimer) {
      clearTimeout(this.turnInactivityTimer)
      this.turnInactivityTimer = null
    }
  }

  /**
   * Spawn a persistent CLI process and wait for the system init event.
   * The process stays alive until close() is called.
   */
  async connect(options: ClaudeConnectOptions) {
    const requestedModel = options.model || 'sonnet'
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
        message: `Model ${requestedModel} normalized to ${normalized}.`,
      })
    }
    this.emitEvent({ type: 'status', status: 'starting', message: 'Connecting to Claude CLI...' })
    await this.assertClaudeCliAvailable()
    this.history =
      (options.initialHistory?.length ?? 0) > 0
        ? options.initialHistory!.slice(-INITIAL_HISTORY_MAX_MESSAGES)
        : []

    await this.spawnPersistentProcess()

    this.emitEvent({ type: 'status', status: 'ready', message: 'Connected' })
    return { threadId: 'claude' }
  }

  /**
   * Spawn the long-lived CLI process with stream-json I/O.
   * Writes the system prompt to a temp file to avoid command-line length limits.
   */
  private async spawnPersistentProcess() {
    // Write only the STABLE system prompt to the temp file.
    // This part does not change across turns, so Claude can cache it internally.
    // Dynamic context (workspace tree, git status) is prepended per-turn in sendUserMessage().
    const stablePrompt = buildStableSystemPrompt({
      interactionMode: this.interactionMode,
      additionalSystemPrompt: this.systemPrompt,
    })
    this.stableSystemPrompt = stablePrompt
    const tmpDir = os.tmpdir()
    this.systemPromptFile = path.join(tmpDir, `barnaby-claude-prompt-${Date.now()}.txt`)
    fs.writeFileSync(this.systemPromptFile, stablePrompt, 'utf8')

    const permissionMode = this.permissionMode === 'proceed-always' ? 'bypassPermissions' : 'default'
    const args = [
      '--print',
      '--verbose',
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--include-partial-messages',
      '--model', this.model,
      '--permission-mode', permissionMode,
      '--append-system-prompt-file', this.systemPromptFile,
    ]
    if (this.mcpConfigPath && fs.existsSync(this.mcpConfigPath)) {
      args.push('--mcp-config', this.mcpConfigPath)
    }

    const spawnOpts = {
      cwd: this.cwd,
      stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
      env: getClaudeSpawnEnv(),
    }

    const proc = spawnClaude(args, spawnOpts)
    this.proc = proc
    this.stdoutBuffer = ''
    this.stderr = ''

    proc.stdout.setEncoding('utf8')
    proc.stderr.setEncoding('utf8')

    proc.stdout.on('data', (chunk: string) => this.onStdoutData(chunk))
    proc.stderr.on('data', (chunk: string) => { this.stderr += chunk })

    proc.on('error', (err) => {
      this.rejectCurrentTurn(err)
    })

    proc.on('close', (code, signal) => {
      if (this.stdoutBuffer.trim()) {
        this.processLine(this.stdoutBuffer.trim())
        this.stdoutBuffer = ''
      }
      this.proc = null

      if (this.turnResolve) {
        if (code === 0 || code === null) {
          this.turnResolve(this.assistantText)
        } else {
          this.rejectCurrentTurn(new Error(this.formatClaudeExitError(code, signal, this.stderr)))
        }
        this.turnResolve = null
        this.turnReject = null
      }
    })

    // In stream-json input mode the CLI waits for the first stdin message
    // before emitting the system init event, so we cannot block here.
    // Instead we verify the process is alive by checking it hasn't exited
    // immediately (bad PATH, missing CLI, etc).
    await new Promise<void>((resolve, reject) => {
      const earlyExit = (code: number | null) => {
        reject(new Error(
          this.stderr.trim() ||
          `Claude CLI exited immediately (code ${code}). Is 'claude' on PATH?`
        ))
      }
      proc.once('exit', earlyExit)
      // Give the process a moment to crash if it's going to
      setTimeout(() => {
        proc.removeListener('exit', earlyExit)
        resolve()
      }, 1500)
    })
  }

  /** Process incoming stdout data, split into lines, parse JSONL events. */
  private onStdoutData(chunk: string) {
    if (!chunk) return
    this.stdoutBuffer += chunk
    const lines = this.stdoutBuffer.split('\n')
    this.stdoutBuffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      this.processLine(trimmed)
    }
  }

  /** Parse and dispatch a single JSONL event line. */
  private processLine(line: string) {
    this.resetTurnInactivityTimer()
    let evt: any
    try {
      evt = JSON.parse(line)
    } catch {
      return
    }

    const eventType = evt.type ?? ''

    if (eventType === 'system') {
      const sid = evt.session_id ?? evt.sessionId ?? ''
      if (typeof sid === 'string' && sid) {
        this.sessionId = sid
      }
      this.emit('cli-init')
      return
    }

    // stream_event — partial deltas from --include-partial-messages.
    // These arrive BEFORE the accumulated `assistant` event, so we use
    // them for real-time text streaming and skip text in `assistant`.
    if (eventType === 'stream_event') {
      const inner = evt.event
      if (!inner) return
      if (inner.type === 'content_block_delta' && inner.delta?.type === 'text_delta') {
        const text = inner.delta.text ?? ''
        if (text) {
          this.assistantText += text
          this.emittedTextLen += text.length
          this.emitEvent({ type: 'assistantDelta', delta: text })
        }
      }
      return
    }

    if (eventType === 'assistant') {
      const message = evt.message ?? evt
      const contentBlocks: any[] = Array.isArray(message.content) ? message.content : []
      for (const block of contentBlocks) {
        if (block.type === 'text' && typeof block.text === 'string') {
          // Text is already streamed via stream_event deltas above.
          // Only use the accumulated assistant text as a fallback if
          // stream_events somehow didn't deliver it.
          const fullText = block.text
          if (fullText.length > this.emittedTextLen) {
            const delta = fullText.slice(this.emittedTextLen)
            this.emittedTextLen = fullText.length
            this.assistantText += delta
            this.emitEvent({ type: 'assistantDelta', delta })
          }
        } else if (block.type === 'tool_use') {
          const toolId = block.id ?? ''
          if (toolId && this.seenToolUseIds.has(toolId)) continue
          if (toolId) this.seenToolUseIds.add(toolId)
          const toolName = block.name ?? ''
          const toolInput = block.input ?? {}
          if (toolName) {
            const detail = toolInput.file_path ?? toolInput.command ?? toolInput.path ?? toolInput.query ?? ''
            this.emitEvent({ type: 'thinking', message: detail ? `${toolName}: ${detail}` : toolName })
          }
        }
      }
      return
    }

    if (eventType === 'result') {
      const sid = evt.session_id ?? evt.sessionId ?? ''
      if (typeof sid === 'string' && sid) {
        this.sessionId = sid
      }
      const stats = evt.cost_usd != null || evt.duration_ms != null || evt.usage
        ? { cost_usd: evt.cost_usd, duration_ms: evt.duration_ms, ...(evt.usage ?? {}) }
        : evt.stats ?? null
      if (stats) this.emitEvent({ type: 'usageUpdated', usage: stats })
      const resultText = typeof evt.result === 'string' ? evt.result : ''
      if (resultText && !this.assistantText) {
        this.assistantText = resultText
        this.emitEvent({ type: 'assistantDelta', delta: resultText })
      }

      // Resolve the current turn's promise
      if (this.turnResolve) {
        this.turnResolve(this.assistantText)
        this.turnResolve = null
        this.turnReject = null
      }
    }
  }

  private rejectCurrentTurn(err: Error) {
    if (this.turnReject) {
      this.turnReject(err)
      this.turnResolve = null
      this.turnReject = null
    }
  }

  async sendUserMessageWithImages(text: string, imagePaths: string[], options?: { interactionMode?: string; gitStatus?: string }) {
    await this.sendUserMessageInternal(text, imagePaths, options)
  }

  async sendUserMessage(text: string, options?: { interactionMode?: string; gitStatus?: string }) {
    await this.sendUserMessageInternal(text, [], options)
  }

  private async sendUserMessageInternal(text: string, imagePaths: string[], options?: { interactionMode?: string; gitStatus?: string }) {
    const trimmed = text.trim()
    if (!trimmed && !imagePaths?.length) return

    const fileContext = resolveAtFileReferences(trimmed, this.cwd)
    const fullText = trimmed + fileContext

    let historyText = fullText
    if (imagePaths?.length) {
      historyText += `\n[Attached ${imagePaths.length} image(s)]`
    }
    this.history.push({ role: 'user', text: historyText })

    // If the persistent process died, respawn it
    if (!this.proc) {
      this.emitEvent({ type: 'status', status: 'starting', message: 'Reconnecting to Claude CLI...' })
      try {
        await this.spawnPersistentProcess()
        this.emitEvent({ type: 'status', status: 'ready', message: 'Reconnected' })
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        this.emitEvent({ type: 'status', status: 'error', message: msg })
        this.emitEvent({ type: 'assistantCompleted' })
        return
      }
    }

    // Reset per-turn state
    this.emittedTextLen = 0
    this.seenToolUseIds.clear()
    this.assistantText = ''

    // Build per-turn dynamic context (workspace tree + git status).
    // The stable system prompt is already cached via the temp file.
    const tree = generateWorkspaceTreeText(this.cwd)
    const dynamicCtx = buildDynamicContext({
      workspaceTree: tree,
      cwd: this.cwd,
      permissionMode: this.permissionMode === 'proceed-always' ? 'proceed-always' : 'verify-first',
      sandbox: this.sandbox,
      gitStatus: options?.gitStatus,
      workspaceContext: this.workspaceContext,
      showWorkspaceContextInPrompt: this.showWorkspaceContextInPrompt,
    })
    const messageWithContext = `[Workspace context]\n${dynamicCtx}\n\n---\n\n${fullText}`

    const contentBlocks: any[] = [{ type: 'text', text: messageWithContext }]
    for (const imgPath of (imagePaths || [])) {
      const block = readImageAsBase64Block(imgPath)
      if (block) contentBlocks.push(block)
    }

    // Write the user message as a JSONL line to the persistent process's stdin
    const userMsg = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: contentBlocks,
      },
    }) + '\n'
    this.emitPromptPreview(
      [
        '[Stable system prompt]',
        this.stableSystemPrompt,
        '[Turn payload]',
        userMsg.trim(),
      ].join('\n\n'),
      'text',
    )
    logModelPayloadAudit({
      provider: 'claude',
      endpoint: 'cli:stream-json-stdin',
      model: this.model,
      serializedPayload: userMsg,
      meta: {
        messageChars: messageWithContext.length,
        historyCount: this.history.length,
      },
    })

    try {
      const result = await new Promise<string>((resolve, reject) => {
        this.turnResolve = resolve
        this.turnReject = reject

        if (!this.proc || !this.proc.stdin.writable) {
          reject(new Error('Claude CLI process stdin is not writable'))
          return
        }
        this.proc.stdin.write(userMsg, (err) => {
          if (err) reject(err)
        })
        this.resetTurnInactivityTimer()
      })

      this.clearTurnInactivityTimer()
      this.history.push({ role: 'assistant', text: result.trim() || result })
      this.emitEvent({ type: 'assistantCompleted' })
    } catch (e: unknown) {
      this.clearTurnInactivityTimer()
      const msg = e instanceof Error ? e.message : String(e)
      if (this.isModelNotFoundError(msg) && this.model !== 'sonnet') {
        this.emitEvent({
          type: 'status',
          status: 'starting',
          message: `Model "${this.model}" not found. Retrying with sonnet...`,
        })
        this.model = 'sonnet'
        // Kill current process and respawn with the fallback model
        await this.killProc()
        try {
          await this.spawnPersistentProcess()
          // Retry the same message
          this.emittedTextLen = 0
          this.seenToolUseIds.clear()
          this.assistantText = ''

          const fallbackResult = await new Promise<string>((resolve, reject) => {
            this.turnResolve = resolve
            this.turnReject = reject
            if (!this.proc || !this.proc.stdin.writable) {
              reject(new Error('Claude CLI process stdin is not writable'))
              return
            }
            this.proc.stdin.write(userMsg, (writeErr) => {
              if (writeErr) reject(writeErr)
            })
            this.resetTurnInactivityTimer()
          })

          this.clearTurnInactivityTimer()
          this.history.push({ role: 'assistant', text: fallbackResult.trim() || fallbackResult })
          this.emitEvent({ type: 'status', status: 'ready', message: `Connected (using ${this.model})` })
          this.emitEvent({ type: 'assistantCompleted' })
          return
        } catch (retryErr: unknown) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr)
          this.emitEvent({ type: 'status', status: 'error', message: retryMsg })
          this.emitEvent({ type: 'assistantCompleted' })
          return
        }
      }
      this.emitEvent({ type: 'status', status: 'error', message: msg })
      this.emitEvent({ type: 'assistantCompleted' })
    }
  }

  async interruptActiveTurn() {
    this.clearTurnInactivityTimer()
    if (this.turnResolve) {
      this.turnResolve(this.assistantText)
      this.turnResolve = null
      this.turnReject = null
    }
    await this.killProc()
  }

  async close() {
    this.clearTurnInactivityTimer()
    this.turnResolve = null
    this.turnReject = null
    await this.killProc()
    this.history = []
    this.sessionId = null
  }

  private async killProc() {
    if (this.proc) {
      try {
        this.proc.stdin.end()
        this.proc.kill()
      } catch { /* ignore */ }
      this.proc = null
    }
    // Clean up temp system prompt file
    if (this.systemPromptFile) {
      try { fs.unlinkSync(this.systemPromptFile) } catch { /* ignore */ }
      this.systemPromptFile = null
    }
  }

  private buildPrompt(): string {
    const recent = truncateHistory(this.history)
    const transcript = recent
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}:\n${m.text}`)
      .join('\n\n')
    return [transcript, 'Assistant:'].filter(Boolean).join('\n\n')
  }

  private async assertClaudeCliAvailable() {
    await new Promise<void>((resolve, reject) => {
      const spawnOpts = {
        cwd: this.cwd,
        stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'],
        env: getClaudeSpawnEnv(),
      }
      const proc = spawnClaude(['--version'], spawnOpts as Parameters<typeof spawnClaude>[1])

      let stderr = ''
      proc.stderr.setEncoding('utf8')
      proc.stderr.on('data', (chunk: string) => {
        stderr += chunk
      })

      proc.on('error', (err) => reject(err))
      proc.on('exit', (code) => {
        if (code === 0) resolve()
        else reject(new Error(stderr.trim() || 'Claude CLI not available. Install and login with `claude`.'))
      })
    }).catch((err: unknown) => {
      const message =
        err instanceof Error
          ? err.message
          : 'Claude CLI not available. Install and login with `claude` first.'
      throw new Error(`${message}\nUse terminal: \`claude\` and complete login, then retry.`)
    })
  }
}
