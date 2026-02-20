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

  private normalizeModelId(model: string) {
    const legacyMap: Record<string, string> = {
      'gemini-1.5-pro': 'gemini-2.0-flash',
      'gemini-1.5-flash': 'gemini-2.0-flash',
      'gemini-pro': 'gemini-2.0-flash',
      'gemini-1.0-pro': 'gemini-2.0-flash',
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

  emitEvent(evt: GeminiClientEvent) {
    this.emit('event', evt)
  }

  async connect(options: GeminiConnectOptions) {
    const requestedModel = options.model || 'gemini-2.0-flash'
    const normalized = this.normalizeModelId(requestedModel)
    this.model = normalized
    if (normalized !== requestedModel) {
      this.emitEvent({
        type: 'status',
        status: 'starting',
        message: `Model ${requestedModel} is deprecated/unavailable. Using ${normalized}.`,
      })
    }
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

    const runWithModel = async (modelId: string) => {
      let full = ''
      await new Promise<string>((resolve, reject) => {
        const args = ['-m', modelId, '-p', prompt]
        const proc =
          process.platform === 'win32'
            ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'gemini', ...args], {
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
              })
            : spawn('gemini', args, { stdio: ['pipe', 'pipe', 'pipe'] })

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
          if (code === 0) resolve(full)
          else reject(new Error(stderr.trim() || `Gemini CLI exited with code ${code ?? 'unknown'}`))
        })
      })
      return full
    }

    try {
      let full = await runWithModel(this.model)

      // Auto-recover once if selected model no longer exists.
      if (!full.trim()) {
        // no-op: keep behavior unchanged
      }

      this.history.push({ role: 'assistant', text: full.trim() || full })
      this.emitEvent({ type: 'assistantCompleted' })
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
