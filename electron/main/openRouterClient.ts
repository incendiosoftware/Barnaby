import { EventEmitter } from 'node:events'

import { generateWorkspaceTreeText } from './fileTree'
import { resolveAtFileReferences } from './atFileResolver'

export type OpenRouterClientEvent =
  | { type: 'status'; status: 'starting' | 'ready' | 'error' | 'closed'; message?: string }
  | { type: 'assistantDelta'; delta: string }
  | { type: 'assistantCompleted' }
  | { type: 'usageUpdated'; usage: unknown }
  | { type: 'thinking'; message: string }

export type OpenRouterConnectOptions = {
  cwd: string
  model: string
  apiKey: string
  baseUrl?: string
  initialHistory?: Array<{ role: 'user' | 'assistant'; text: string }>
}

const INITIAL_HISTORY_MAX_MESSAGES = 24
const TURN_TIMEOUT_MS = 120_000

type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export class OpenRouterClient extends EventEmitter {
  private model = 'openrouter/auto'
  private cwd = process.cwd()
  private apiKey = ''
  private baseUrl = 'https://openrouter.ai/api/v1'
  private history: Array<{ role: 'user' | 'assistant'; text: string }> = []
  private activeController: AbortController | null = null

  emitEvent(evt: OpenRouterClientEvent) {
    this.emit('event', evt)
  }

  async connect(options: OpenRouterConnectOptions) {
    this.model = (options.model || 'openrouter/auto').trim()
    this.cwd = options.cwd || process.cwd()
    this.apiKey = (options.apiKey || '').trim()
    this.baseUrl = (options.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
    this.history =
      (options.initialHistory?.length ?? 0) > 0
        ? options.initialHistory!.slice(-INITIAL_HISTORY_MAX_MESSAGES)
        : []
    if (!this.apiKey) throw new Error('OpenRouter API key is missing. Configure it in Settings -> Connectivity.')
    this.emitEvent({ type: 'status', status: 'ready', message: 'Connected' })
    return { threadId: 'openrouter' }
  }

  async sendUserMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return

    const fileContext = resolveAtFileReferences(trimmed, this.cwd)
    const fullUser = trimmed + fileContext
    this.history.push({ role: 'user', text: fullUser })

    const tree = generateWorkspaceTreeText(this.cwd)
    const system = `You are a coding assistant running inside Barnaby.
Workspace root: ${this.cwd}

${tree}`
    const recent = this.history.slice(-12)
    const messages: OpenRouterMessage[] = [
      { role: 'system', content: system },
      ...recent.map((m) => ({ role: m.role, content: m.text })),
    ]

    const controller = new AbortController()
    this.activeController = controller
    const timer = setTimeout(() => controller.abort('timeout'), TURN_TIMEOUT_MS)
    this.emitEvent({ type: 'status', status: 'starting', message: 'Sending request to OpenRouter...' })
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://barnaby.build',
          'X-Title': 'Barnaby',
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.2,
          stream: false,
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        const hint = body ? ` ${body.slice(0, 400)}` : ''
        throw new Error(`OpenRouter request failed (${response.status}).${hint}`)
      }
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>
        usage?: unknown
      }
      const content = data?.choices?.[0]?.message?.content
      const textOut = Array.isArray(content)
        ? content.map((item) => (typeof item?.text === 'string' ? item.text : '')).join('')
        : typeof content === 'string'
          ? content
          : ''

      this.history.push({ role: 'assistant', text: textOut })
      if (data?.usage) this.emitEvent({ type: 'usageUpdated', usage: data.usage })
      this.emitEvent({ type: 'assistantDelta', delta: textOut })
      this.emitEvent({ type: 'assistantCompleted' })
      this.emitEvent({ type: 'status', status: 'ready', message: 'Connected' })
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.name === 'AbortError'
            ? 'OpenRouter request timed out.'
            : err.message
          : String(err)
      this.emitEvent({ type: 'status', status: 'error', message: msg })
      this.emitEvent({ type: 'assistantCompleted' })
    } finally {
      clearTimeout(timer)
      if (this.activeController === controller) this.activeController = null
    }
  }

  async interruptActiveTurn() {
    if (!this.activeController) return
    try {
      this.activeController.abort('interrupted')
    } catch {
      // ignore
    } finally {
      this.activeController = null
    }
  }

  async close() {
    await this.interruptActiveTurn()
    this.history = []
  }
}
