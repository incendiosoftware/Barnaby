import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import { EventEmitter } from 'node:events'

import { resolveAtFileReferences } from './atFileResolver'

function getGeminiSpawnEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  if (process.platform === 'win32') {
    const npmBin = process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : ''
    if (npmBin && env.PATH && !env.PATH.includes(npmBin)) {
      env.PATH = `${npmBin}${path.delimiter}${env.PATH}`
    }
  }
  env.GEMINI_SANDBOX = 'false'
  return env
}

export type GeminiClientEvent =
  | { type: 'status'; status: 'starting' | 'ready' | 'error' | 'closed'; message?: string }
  | { type: 'assistantDelta'; delta: string }
  | { type: 'assistantCompleted' }
  | { type: 'usageUpdated'; usage: unknown }
  | { type: 'thinking'; message: string }

const INITIAL_HISTORY_MAX_MESSAGES = 24

const GEMINI_NOISE = /quota|retrying after|rate.?limit|capacity.*exhausted|reset after|YOLO mode|Loaded cached credentials|All tool calls will be/i
const GEMINI_RETRYABLE = /status 429|Retrying with backoff|Attempt \d+ failed(?!.*Max attempts)|No capacity available/i
const STDERR_NOISE = /YOLO mode|Loaded cached credentials|All tool calls will be|^\s*at /i

export type GeminiConnectOptions = {
  model: string
  cwd: string
  initialHistory?: Array<{ role: 'user' | 'assistant'; text: string }>
}

export class GeminiClient extends EventEmitter {
  private model: string = 'gemini-2.0-flash'
  private cwd: string = process.cwd()
  private history: Array<{ role: 'user' | 'assistant'; text: string }> = []
  private proc: ChildProcessWithoutNullStreams | null = null
  private stdoutBuffer: string = ''
  private stderrAccum: string = ''
  private turnResolve: (() => void) | null = null
  private turnReject: ((err: Error) => void) | null = null
  private assistantText: string = ''
  private sessionReady: boolean = false

  private normalizeModelId(model: string) {
    const legacyMap: Record<string, string> = {
      'gemini-1.5-pro': 'pro',
      'gemini-1.5-flash': 'flash',
      'gemini-2.0-flash': 'flash',
      'gemini-3-pro': 'pro',
      'gemini-pro': 'flash',
      'gemini-1.0-pro': 'flash',
    }
    return legacyMap[model] ?? model
  }

  private isModelNotFoundError(message: string) {
    const lower = message.toLowerCase()
    return (
      lower.includes('modelnotfound') ||
      lower.includes('requested entity was not found') ||
      (lower.includes('not found') && lower.includes('model'))
    )
  }

  private formatExitError(code: number | null, signal: string | null): string {
    const stderrTrimmed = this.stderrAccum.trim()
    if (stderrTrimmed) {
      const meaningful = stderrTrimmed
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !STDERR_NOISE.test(l))
      const firstLine = meaningful[0] ?? stderrTrimmed.split('\n').find((l) => l.trim()) ?? stderrTrimmed.split('\n')[0]
      return firstLine.length > 300 ? firstLine.slice(0, 300) + '...' : firstLine
    }
    if (signal) return `Gemini CLI was terminated (${signal})`
    const knownCodes: Record<number, string> = {
      1: 'Gemini CLI failed. Model may be at capacity — try again shortly or switch models.',
      41: 'Authentication failed. Run `gemini` in a terminal and log in with Google.',
      42: 'Invalid or missing input. Check your prompt or model selection.',
      44: 'Sandbox error. Try without sandbox or check your Docker/Podman setup.',
      52: 'Invalid config. Check your Gemini CLI settings.json.',
      53: 'Session turn limit reached. Start a new session.',
    }
    return knownCodes[code ?? 0] ?? `Gemini CLI exited with code ${code ?? 'unknown'}`
  }

  emitEvent(evt: GeminiClientEvent) {
    this.emit('event', evt)
  }

  async connect(options: GeminiConnectOptions) {
    const requestedModel = options.model || 'gemini-2.0-flash'
    const normalized = this.normalizeModelId(requestedModel)
    this.model = normalized
    this.cwd = options.cwd || process.cwd()

    if (normalized !== requestedModel) {
      this.emitEvent({
        type: 'status',
        status: 'starting',
        message: `Model ${requestedModel} mapped to ${normalized} for Gemini CLI.`,
      })
    }

    this.emitEvent({ type: 'status', status: 'starting', message: 'Connecting to Gemini CLI...' })
    await this.assertGeminiCliAvailable()

    this.history =
      (options.initialHistory?.length ?? 0) > 0
        ? options.initialHistory!.slice(-INITIAL_HISTORY_MAX_MESSAGES)
        : []

    await this.spawnPersistentSession()
    return { threadId: 'gemini' }
  }

  /**
   * Spawn the Gemini CLI in interactive mode with stream-json output.
   * The process stays alive across multiple turns.
   */
  private async spawnPersistentSession(): Promise<void> {
    if (this.proc) {
      try { this.proc.kill() } catch { /* ignore */ }
      this.proc = null
    }

    this.sessionReady = false
    this.stdoutBuffer = ''
    this.stderrAccum = ''

    const args = ['-m', this.model, '--yolo', '--output-format', 'stream-json']
    const spawnEnv = getGeminiSpawnEnv()
    const spawnOpts = {
      cwd: this.cwd,
      stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
      env: spawnEnv,
    }

    const proc =
      process.platform === 'win32'
        ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'gemini', ...args], {
            ...spawnOpts,
            windowsHide: true,
          } as object)
        : spawn('gemini', args, spawnOpts)

    this.proc = proc
    proc.stdout.setEncoding('utf8')
    proc.stderr.setEncoding('utf8')

    proc.stdout.on('data', (chunk: string) => this.handleStdout(chunk))
    proc.stderr.on('data', (chunk: string) => this.handleStderr(chunk))

    proc.on('error', (err) => {
      this.sessionReady = false
      if (this.turnReject) {
        this.turnReject(err)
        this.turnResolve = null
        this.turnReject = null
      }
      this.emitEvent({ type: 'status', status: 'error', message: err.message })
    })

    proc.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      this.sessionReady = false
      this.proc = null

      if (this.stdoutBuffer.trim()) {
        this.processLine(this.stdoutBuffer.trim())
        this.stdoutBuffer = ''
      }

      if (this.turnResolve) {
        if (code === 0) {
          this.finishTurn()
        } else {
          const errMsg = this.formatExitError(code, signal)
          this.emitEvent({ type: 'status', status: 'error', message: errMsg })
          this.turnReject?.(new Error(errMsg))
          this.turnResolve = null
          this.turnReject = null
          this.emitEvent({ type: 'assistantCompleted' })
        }
      }

      this.emitEvent({ type: 'status', status: 'closed', message: 'Gemini CLI session ended' })
    })

    // Wait for the init event to confirm session is alive
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Gemini CLI did not start within 30 seconds'))
      }, 30_000)

      const onEvent = (evt: GeminiClientEvent) => {
        if (evt.type === 'status' && evt.status === 'ready') {
          clearTimeout(timeout)
          this.removeListener('event', onEvent)
          resolve()
        } else if (evt.type === 'status' && evt.status === 'error') {
          clearTimeout(timeout)
          this.removeListener('event', onEvent)
          reject(new Error(evt.message ?? 'Gemini CLI failed to start'))
        }
      }
      this.on('event', onEvent)
    })
  }

  private handleStdout(chunk: string) {
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

  private processLine(trimmed: string) {
    let evt: any
    try {
      evt = JSON.parse(trimmed)
    } catch {
      if (GEMINI_NOISE.test(trimmed)) return

      const short = trimmed.length > 300 ? trimmed.slice(0, 300) + '...' : trimmed

      if (/Max attempts reached/i.test(trimmed)) {
        this.emitEvent({ type: 'status', status: 'error', message: short })
      } else if (GEMINI_RETRYABLE.test(trimmed)) {
        this.emitEvent({ type: 'thinking', message: 'Rate limited — CLI is retrying...' })
      } else {
        this.emitEvent({ type: 'thinking', message: short })
      }
      return
    }

    switch (evt.type) {
      case 'init':
        this.sessionReady = true
        this.emitEvent({ type: 'status', status: 'ready', message: 'Connected' })
        break

      case 'message':
        if (evt.role === 'user') break
        if ((evt.role === 'assistant' || evt.role === 'model') && typeof evt.content === 'string') {
          this.emitEvent({ type: 'assistantDelta', delta: evt.content })
          this.assistantText += evt.content
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
        this.emitEvent({ type: 'thinking', message: `Using ${toolName}${detail ? `: ${detail}` : ''}` })
        break
      }

      case 'tool_result':
      case 'toolResult':
      case 'functionResponse': {
        const output = typeof evt.output === 'string' ? evt.output
          : typeof evt.result === 'string' ? evt.result
          : typeof evt.response === 'string' ? evt.response : ''
        const status = evt.status === 'success' ? 'done' : (evt.status ?? 'done')
        const short = output.length > 160 ? output.slice(0, 160) + '...' : output
        this.emitEvent({ type: 'thinking', message: short || status })
        break
      }

      case 'thinking':
      case 'thought': {
        const text = typeof evt.content === 'string' ? evt.content
          : typeof evt.message === 'string' ? evt.message
          : typeof evt.text === 'string' ? evt.text : ''
        if (text) {
          const short = text.length > 200 ? text.slice(0, 200) + '...' : text
          this.emitEvent({ type: 'thinking', message: short })
        }
        break
      }

      case 'result':
        if (evt.stats) {
          this.emitEvent({ type: 'usageUpdated', usage: evt.stats })
        }
        this.finishTurn()
        break

      case 'error': {
        const raw = evt.message ?? evt.content ?? 'Unknown error'
        const errMsg = typeof raw === 'string'
          ? (raw.length > 300 ? raw.slice(0, 300) + '...' : raw)
          : 'Gemini error'
        if (GEMINI_NOISE.test(errMsg)) break

        if (/status 429|Retrying with backoff|Attempt \d+ failed/i.test(errMsg)) {
          this.emitEvent({ type: 'thinking', message: 'Rate limited — CLI is retrying...' })
        } else {
          this.emitEvent({ type: 'status', status: 'error', message: errMsg })
        }
        break
      }

      default: {
        const msg = evt.message ?? evt.content ?? evt.text ?? ''
        if (typeof msg === 'string' && msg.trim()) {
          const short = msg.length > 200 ? msg.slice(0, 200) + '...' : msg
          this.emitEvent({ type: 'thinking', message: `[${evt.type}] ${short}` })
        }
      }
    }
  }

  private finishTurn() {
    const text = this.assistantText.trim()
    if (text) {
      this.history.push({ role: 'assistant', text })
    }
    this.assistantText = ''
    this.emitEvent({ type: 'assistantCompleted' })
    if (this.turnResolve) {
      this.turnResolve()
      this.turnResolve = null
      this.turnReject = null
    }
  }

  private handleStderr(chunk: string) {
    this.stderrAccum += chunk
    const trimmed = chunk.trim()
    if (!trimmed) return
    if (!STDERR_NOISE.test(trimmed) && !GEMINI_NOISE.test(trimmed)) {
      const short = trimmed.length > 200 ? trimmed.slice(0, 200) + '...' : trimmed
      this.emitEvent({ type: 'thinking', message: short })
    }
  }

  async sendUserMessageWithImages(text: string, localImagePaths: string[]) {
    const trimmed = text.trim()
    const imagePaths = (localImagePaths ?? []).filter((p) => typeof p === 'string' && p.trim())
    if (!trimmed && imagePaths.length === 0) return

    const imageRefs = imagePaths.length > 0 ? '\n\n' + imagePaths.map((p) => `@${p}`).join('\n') : ''
    const userText = trimmed ? trimmed + imageRefs : imagePaths.map((p) => `@${p}`).join('\n')
    const fileContext = resolveAtFileReferences(userText, this.cwd)
    const fullMessage = userText + fileContext

    await this.sendTurn(fullMessage)
  }

  async sendUserMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return

    const fileContext = resolveAtFileReferences(trimmed, this.cwd)
    const fullMessage = trimmed + fileContext

    await this.sendTurn(fullMessage)
  }

  private async sendTurn(message: string): Promise<void> {
    if (!this.proc || !this.sessionReady) {
      throw new Error('Gemini session is not active. Reconnect first.')
    }

    this.history.push({ role: 'user', text: message })
    this.assistantText = ''
    this.stderrAccum = ''

    return new Promise<void>((resolve, reject) => {
      this.turnResolve = resolve
      this.turnReject = reject

      try {
        this.proc!.stdin.write(message + '\n')
      } catch (err) {
        this.turnResolve = null
        this.turnReject = null
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  async interruptActiveTurn() {
    if (this.turnResolve) {
      this.finishTurn()
    }
  }

  async close() {
    this.turnResolve = null
    this.turnReject = null
    if (this.proc) {
      try { this.proc.kill() } catch { /* ignore */ }
      this.proc = null
    }
    this.sessionReady = false
    this.history = []
    this.assistantText = ''
    this.stdoutBuffer = ''
    this.stderrAccum = ''
  }

  private async assertGeminiCliAvailable() {
    await new Promise<void>((resolve, reject) => {
      const spawnOpts = {
        cwd: this.cwd,
        stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'],
        env: getGeminiSpawnEnv(),
      }
      const proc =
        process.platform === 'win32'
          ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'gemini', '--version'], {
              ...spawnOpts,
              windowsHide: true,
            } as object)
          : spawn('gemini', ['--version'], spawnOpts)

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
