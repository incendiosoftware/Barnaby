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
      'gemini-2.5-flash': 'flash',
      'gemini-2.5-pro': 'pro',
      'gemini-3-pro': 'pro',
      'gemini-3-pro-preview': 'pro',
      'gemini-3-flash-preview': 'flash',
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

  /** Map Gemini CLI exit codes to user-friendly messages (per Gemini CLI docs) */
  private formatGeminiExitError(code: number | null, signal: string | null, stderr: string): string {
    const stderrTrimmed = stderr.trim()
    if (stderrTrimmed) return stderrTrimmed
    if (signal) return `Gemini CLI was terminated (${signal})`
    const knownCodes: Record<number, string> = {
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
        message: `Model ${requestedModel} is deprecated/unavailable. Using ${normalized}.`,
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
        // Use stdin for the prompt to bypass command line length limits
        const args = ['-m', modelId, '--approval-mode=auto_edit']
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
        
        // Write prompt to stdin
        proc.stdin.write(prompt)
        proc.stdin.end()

        proc.stdout.setEncoding('utf8')
        proc.stderr.setEncoding('utf8')

        let full = ''
        let stderr = ''
        let resolved = false

        proc.stdout.on('data', (chunk: string) => {
          if (!chunk) return
          full += chunk
          this.emitEvent({ type: 'assistantDelta', delta: chunk })
        })

        proc.stderr.on('data', (chunk: string) => {
          stderr += chunk
          const trimmed = chunk.trim()
          if (!trimmed) return
          const isNoise = /quota|retrying after|rate.?limit|capacity.*exhausted|reset after/i.test(trimmed)
          if (!isNoise) {
            this.emitEvent({ type: 'assistantDelta', delta: chunk })
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
          if (!resolved) {
            resolved = true
            if (code === 0) resolve()
            else reject(new Error(this.formatGeminiExitError(code, signal, stderr)))
          }
          if (code === 0) {
            this.history.push({ role: 'assistant', text: full.trim() || full })
            this.emitEvent({ type: 'assistantCompleted' })
          } else {
            this.emitEvent({ type: 'status', status: 'error', message: this.formatGeminiExitError(code, signal, stderr) })
            this.emitEvent({ type: 'assistantCompleted' })
          }
        })

        setImmediate(() => {
          if (!resolved) {
            resolved = true
            resolve()
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
