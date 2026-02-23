import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import { EventEmitter } from 'node:events'

import { generateWorkspaceTreeText } from './fileTree'
import { resolveAtFileReferences } from './atFileResolver'
import { buildSystemPrompt } from './systemPrompt'

/** Ensure npm global bin is in PATH so Electron can find claude CLI. */
function getClaudeSpawnEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  if (process.platform === 'win32') {
    const npmBin = process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : ''
    if (npmBin && env.PATH && !env.PATH.includes(npmBin)) {
      env.PATH = `${npmBin}${path.delimiter}${env.PATH}`
    }
  }
  return env
}

export type ClaudeClientEvent =
  | { type: 'status'; status: 'starting' | 'ready' | 'error' | 'closed'; message?: string }
  | { type: 'assistantDelta'; delta: string }
  | { type: 'assistantCompleted' }
  | { type: 'usageUpdated'; usage: unknown }
  | { type: 'thinking'; message: string }

const INITIAL_HISTORY_MAX_MESSAGES = 24

export type ClaudeConnectOptions = {
  cwd: string
  model: string
  permissionMode?: 'verify-first' | 'proceed-always'
  sandbox?: 'read-only' | 'workspace-write'
  interactionMode?: string
  initialHistory?: Array<{ role: 'user' | 'assistant'; text: string }>
}

export class ClaudeClient extends EventEmitter {
  private model: string = 'sonnet'
  private cwd: string = process.cwd()
  private permissionMode: 'verify-first' | 'proceed-always' = 'verify-first'
  private sandbox: 'read-only' | 'workspace-write' = 'workspace-write'
  private interactionMode: string = 'agent'
  private history: Array<{ role: 'user' | 'assistant'; text: string }> = []
  private activeProc: ChildProcessWithoutNullStreams | null = null

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

  async connect(options: ClaudeConnectOptions) {
    const requestedModel = options.model || 'sonnet'
    const normalized = this.normalizeModelId(requestedModel)
    this.model = normalized
    this.cwd = options.cwd || process.cwd()
    this.permissionMode = options.permissionMode ?? 'verify-first'
    this.sandbox = options.sandbox ?? 'workspace-write'
    this.interactionMode = options.interactionMode ?? 'agent'
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
    this.emitEvent({ type: 'status', status: 'ready', message: 'Connected' })
    return { threadId: 'claude' }
  }

  async sendUserMessage(text: string, options?: { interactionMode?: string; gitStatus?: string }) {
    const trimmed = text.trim()
    if (!trimmed) return

    const fileContext = resolveAtFileReferences(trimmed, this.cwd)
    this.history.push({ role: 'user', text: trimmed + fileContext })

    const tree = generateWorkspaceTreeText(this.cwd)
    const mode = options?.interactionMode ?? this.interactionMode
    const COMPLETION_SYSTEM = buildSystemPrompt({
      workspaceTree: tree,
      cwd: this.cwd,
      permissionMode: this.permissionMode,
      sandbox: this.sandbox,
      interactionMode: mode,
      gitStatus: options?.gitStatus,
    })
    const prompt = this.buildPrompt()
    const permissionMode = this.permissionMode === 'proceed-always' ? 'bypassPermissions' : 'default'

    const runWithModel = async (modelId: string) => {
      let full = ''
      await new Promise<string>((resolve, reject) => {
        const args = [
          '--print',
          '--output-format',
          'text',
          '--model',
          modelId,
          '--permission-mode',
          permissionMode,
          '--append-system-prompt',
          COMPLETION_SYSTEM,
        ]
        const spawnOpts = {
          cwd: this.cwd,
          stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
          env: getClaudeSpawnEnv(),
        }
        const proc =
          process.platform === 'win32'
            ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'claude', ...args], {
                ...spawnOpts,
                windowsHide: true,
              } as object)
            : spawn('claude', args, spawnOpts)

        this.activeProc = proc
        
        // Write prompt to stdin
        proc.stdin.write(prompt)
        proc.stdin.end()

        proc.stdout.setEncoding('utf8')
        proc.stderr.setEncoding('utf8')

        let stderr = ''
        proc.stdout.on('data', (chunk: string) => {
          if (!chunk) return
          full += chunk
          this.emitEvent({ type: 'assistantDelta', delta: chunk })
        })

        proc.stderr.on('data', (chunk: string) => {
          stderr += chunk
        })

        proc.on('error', (err) => reject(err))
        proc.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
          this.activeProc = null
          if (code === 0) resolve(full)
          else reject(new Error(this.formatClaudeExitError(code, signal, stderr)))
        })
      })
      return full
    }

    try {
      let full = await runWithModel(this.model)

      if (!full.trim()) {
        // Keep behavior simple and deterministic: empty output is still treated as a completed response.
      }

      this.history.push({ role: 'assistant', text: full.trim() || full })
      this.emitEvent({ type: 'assistantCompleted' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (this.isModelNotFoundError(msg) && this.model !== 'sonnet') {
        try {
          this.emitEvent({
            type: 'status',
            status: 'starting',
            message: `Model "${this.model}" not found. Retrying with sonnet...`,
          })
          this.model = 'sonnet'
          const fallbackFull = await runWithModel(this.model)
          this.history.push({ role: 'assistant', text: fallbackFull.trim() || fallbackFull })
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
  }

  private buildPrompt(): string {
    const recent = this.history.slice(-12)
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
      const proc =
        process.platform === 'win32'
          ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'claude', '--version'], {
              ...spawnOpts,
              windowsHide: true,
            } as object)
          : spawn('claude', ['--version'], spawnOpts)

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
