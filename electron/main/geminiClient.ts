import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import { EventEmitter } from 'node:events'

/** Ensure npm global bin is in PATH so Electron can find gemini CLI. */
function getGeminiSpawnEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  if (process.platform === 'win32') {
    const npmBin = process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : ''
    if (npmBin && env.PATH && !env.PATH.includes(npmBin)) {
      env.PATH = `${npmBin}${path.delimiter}${env.PATH}`
    }
  }
  return env
}

import { generateWorkspaceTreeText } from './fileTree'
import { resolveAtFileReferences } from './atFileResolver'

export type GeminiClientEvent =
  | { type: 'status'; status: 'starting' | 'ready' | 'error' | 'closed'; message?: string }
  | { type: 'assistantDelta'; delta: string }
  | { type: 'assistantCompleted' }
  | { type: 'usageUpdated'; usage: unknown }
  | { type: 'thinking'; message: string }

const INITIAL_HISTORY_MAX_MESSAGES = 24

export type GeminiConnectOptions = {
  model: string
  cwd: string
  initialHistory?: Array<{ role: 'user' | 'assistant'; text: string }>
}

export class GeminiClient extends EventEmitter {
  private model: string = 'gemini-2.0-flash'
  private cwd: string = process.cwd()
  private history: Array<{ role: 'user' | 'assistant'; text: string }> = []
  private activeProc: ChildProcessWithoutNullStreams | null = null

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
    this.emitEvent({ type: 'status', status: 'ready', message: 'Connected' })
    return { threadId: 'gemini' }
  }

  async sendUserMessageWithImages(text: string, localImagePaths: string[]) {
    const trimmed = text.trim()
    const imagePaths = (localImagePaths ?? []).filter((p) => typeof p === 'string' && p.trim())
    if (!trimmed && imagePaths.length === 0) return

    const imageRefs = imagePaths.length > 0 ? '\n\n' + imagePaths.map((p) => `@${p}`).join('\n') : ''
    const userText = trimmed ? trimmed + imageRefs : imagePaths.map((p) => `@${p}`).join('\n')
    const fileContext = resolveAtFileReferences(userText, this.cwd)
    const fullMessage = userText + fileContext
    this.history.push({ role: 'user', text: fullMessage })

    const prompt = this.buildGeminiPrompt(fullMessage)
    await this.runTurn(prompt)
  }

  async sendUserMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return

    const fileContext = resolveAtFileReferences(trimmed, this.cwd)
    const fullMessage = trimmed + fileContext
    this.history.push({ role: 'user', text: fullMessage })

    const prompt = this.buildGeminiPrompt(fullMessage)
    await this.runTurn(prompt)
  }

  private async runTurn(prompt: string): Promise<void> {
    const startTurn = (modelId: string): Promise<void> =>
      new Promise((resolve, reject) => {
        const args = ['-m', modelId, '--yolo', '--output-format', 'stream-json']
        const spawnOpts = {
          cwd: this.cwd,
          stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
          env: getGeminiSpawnEnv(),
        }
        const proc =
          process.platform === 'win32'
            ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'gemini', ...args], {
                ...spawnOpts,
                windowsHide: true,
              } as object)
            : spawn('gemini', args, spawnOpts)

        this.activeProc = proc

        proc.stdin.write(prompt)
        proc.stdin.end()

        proc.stdout.setEncoding('utf8')
        proc.stderr.setEncoding('utf8')

        let assistantText = ''
        let stderr = ''
        let resolved = false
        let stdoutBuffer = ''

        const GEMINI_NOISE = /quota|retrying after|rate.?limit|capacity.*exhausted|reset after|YOLO mode|Loaded cached credentials|All tool calls will be/i
        const GEMINI_RETRYABLE = /status 429|Retrying with backoff|Attempt \d+ failed(?!.*Max attempts)|No capacity available/i

        proc.stdout.on('data', (chunk: string) => {
          if (!chunk) return
          stdoutBuffer += chunk
          const lines = stdoutBuffer.split('\n')
          // Keep the last (possibly incomplete) line in the buffer
          stdoutBuffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue
            let evt: any
            try {
              evt = JSON.parse(trimmed)
            } catch {
              if (GEMINI_NOISE.test(trimmed)) continue

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
                if (evt.role === 'assistant' && typeof evt.content === 'string') {
                  this.emitEvent({ type: 'assistantDelta', delta: evt.content })
                  assistantText += evt.content
                }
                break
              case 'tool_use': {
                const desc = `Using ${evt.tool_name ?? 'tool'}` +
                  (evt.parameters?.file_path ? `: ${evt.parameters.file_path}` :
                   evt.parameters?.command ? `: ${evt.parameters.command}` :
                   evt.parameters?.dir_path ? `: ${evt.parameters.dir_path}` :
                   evt.parameters?.pattern ? `: ${evt.parameters.pattern}` : '')
                this.emitEvent({ type: 'thinking', message: desc })
                break
              }
              case 'tool_result': {
                const status = evt.status === 'success' ? 'done' : (evt.status ?? 'done')
                const output = typeof evt.output === 'string' ? evt.output : ''
                const short = output.length > 120 ? output.slice(0, 120) + '...' : output
                this.emitEvent({ type: 'thinking', message: short || status })
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
              }
                break
              // 'init' and 'message' with role=user are silently ignored
            }
          }
        })

        proc.stderr.on('data', (chunk: string) => {
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
          this.activeProc = null
          // Flush any remaining stdout buffer
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
              // Non-JSON remainder, ignore
            }
          }

          if (!resolved) {
            resolved = true
            if (code === 0) resolve()
            else reject(new Error(this.formatGeminiExitError(code, signal, stderr)))
          }
          if (code === 0) {
            this.history.push({ role: 'assistant', text: assistantText.trim() || assistantText })
            this.emitEvent({ type: 'assistantCompleted' })
          } else {
            this.emitEvent({ type: 'status', status: 'error', message: this.formatGeminiExitError(code, signal, stderr) })
            this.emitEvent({ type: 'assistantCompleted' })
          }
        })

      })

    try {
      await startTurn(this.model)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (this.isModelNotFoundError(msg) && this.model !== 'gemini-2.0-flash') {
        try {
          this.emitEvent({
            type: 'status',
            status: 'starting',
            message: `Model "${this.model}" not found. Retrying with gemini-2.0-flash...`,
          })
          this.model = 'gemini-2.0-flash'
          await startTurn(this.model)
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

  private buildGeminiPrompt(userMessage: string): string {
    const tree = generateWorkspaceTreeText(this.cwd)
    const context = `Workspace: ${this.cwd}\n\n${tree}`

    const lastAssistant = [...this.history].reverse().find((m) => m.role === 'assistant')
    const continuationHint = lastAssistant
      ? `\n\nFor context, your previous response was:\n${lastAssistant.text.slice(0, 2000)}\n\n`
      : ''

    return `${context}${continuationHint}\n\n${userMessage}`
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
