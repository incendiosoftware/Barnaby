import { EventEmitter } from 'node:events'
import { GoogleGenAI } from '@google/genai'

export type GeminiClientEvent =
  | { type: 'status'; status: 'starting' | 'ready' | 'error' | 'closed'; message?: string }
  | { type: 'assistantDelta'; delta: string }
  | { type: 'assistantCompleted' }
  | { type: 'usageUpdated'; usage: unknown }

export type GeminiConnectOptions = {
  model: string
  apiKey: string
}

export class GeminiClient extends EventEmitter {
  private ai: GoogleGenAI | null = null
  private model: string = 'gemini-2.0-flash'
  private history: Array<{ role: 'user' | 'model'; parts: { text: string }[] }> = []
  private activeStream: AsyncGenerator<unknown> | null = null

  emitEvent(evt: GeminiClientEvent) {
    this.emit('event', evt)
  }

  async connect(options: GeminiConnectOptions) {
    this.model = options.model || 'gemini-2.0-flash'
    if (!options.apiKey?.trim()) {
      this.emitEvent({ type: 'status', status: 'error', message: 'Gemini API key required' })
      throw new Error('Gemini API key required. Add it in Edit > Model setup.')
    }

    this.emitEvent({ type: 'status', status: 'starting', message: 'Connecting to Gemini...' })
    this.ai = new GoogleGenAI({ apiKey: options.apiKey.trim() })
    this.history = []
    this.emitEvent({ type: 'status', status: 'ready', message: 'Connected' })
    return { threadId: 'gemini' }
  }

  async sendUserMessage(text: string) {
    if (!this.ai) throw new Error('Not connected')
    const trimmed = text.trim()
    if (!trimmed) return

    this.history.push({ role: 'user', parts: [{ text: trimmed }] })

    const COMPLETION_SYSTEM =
      'Complete all tasks fully. Do not stop after describing a plan—execute the plan. Continue until the work is done.'

    try {
      const contents = this.history.map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: m.parts,
      }))
      const stream = await this.ai.models.generateContentStream({
        model: this.model,
        contents,
        config: { systemInstruction: COMPLETION_SYSTEM, maxOutputTokens: 16384 },
      } as any)

      let full = ''
      for await (const chunk of stream as AsyncGenerator<{ text?: string }>) {
        const delta = chunk?.text ?? ''
        if (delta) {
          full += delta
          this.emitEvent({ type: 'assistantDelta', delta })
        }
      }
      this.history.push({ role: 'model', parts: [{ text: full }] })
      this.emitEvent({ type: 'assistantCompleted' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      this.emitEvent({ type: 'status', status: 'error', message: msg })
      this.emitEvent({ type: 'assistantCompleted' })
    }
  }

  async interruptActiveTurn() {
    this.activeStream = null
  }

  async close() {
    this.ai = null
    this.history = []
    this.activeStream = null
  }
}
