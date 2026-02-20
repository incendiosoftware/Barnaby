import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'

export type GeminiClientEvent =
  | { type: 'status'; status: 'starting' | 'ready' | 'error' | 'closed'; message?: string }
  | { type: 'assistantDelta'; delta: string }
  | { type: 'assistantCompleted' }
  | { type: 'usageUpdated'; usage: unknown }

export type GeminiConnectOptions = {
  model: string
}

export class GeminiClient extends EventEmitter {
  private model: string = 'gemini-2.0-flash'
  private history: Array<{ role: 'user' | 'assistant'; text: string }> = []
  private activeProc: ChildProcessWithoutNullStreams | null = null

  emitEvent(evt: GeminiClientEvent) {
    this.emit('event', evt)
  }

  async connect(options: GeminiConnectOptions) {
    this.model = options.model || 'gemini-2.0-flash'
    this.emitEvent({ type: 'status', status: 'starting', message: 'Connecting to Gemini CLI...' })
    await this.assertGeminiCliAvailable()
    this.history = []
    this.emitEvent({ type: 'status', status: 'ready', message: 'Connected' })
    return { threadId: 'gemini' }
  }

  async sendUserMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return

    this.history.push({ role: 'user', text: trimmed })

    const COMPLETION_SYSTEM =
      'You are a coding assistant running inside Agent Orchestrator. Complete tasks fully. Do not stop after describing a plan - execute the plan and provide concrete outputs.'
    const prompt = this.buildPrompt(COMPLETION_SYSTEM)

    try {
      let full = ''
      await new Promise<void>((resolve, reject) => {
        const args = ['-m', this.model, '-p', prompt]
        const proc =
          process.platform === 'win32'
            ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'gemini', ...args], {
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true,
              })
            : spawn('gemini', args, { stdio: ['ignore', 'pipe', 'pipe'] })

        this.activeProc = proc
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
        proc.on('exit', (code) => {
          this.activeProc = null
          if (code === 0) resolve()
          else reject(new Error(stderr.trim() || `Gemini CLI exited with code ${code ?? 'unknown'}`))
        })
      })

      this.history.push({ role: 'assistant', text: full.trim() || full })
      this.emitEvent({ type: 'assistantCompleted' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
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

  private buildPrompt(systemInstruction: string): string {
    const recent = this.history.slice(-12)
    const transcript = recent
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}:\n${m.text}`)
      .join('\n\n')
    return [systemInstruction, transcript, 'Assistant:'].filter(Boolean).join('\n\n')
  }

  private async assertGeminiCliAvailable() {
    await new Promise<void>((resolve, reject) => {
      const proc =
        process.platform === 'win32'
          ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'gemini', '--version'], {
              stdio: ['ignore', 'pipe', 'pipe'],
              windowsHide: true,
            })
          : spawn('gemini', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })

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
