import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'

import { generateWorkspaceTreeText } from './fileTree'
import { resolveAtFileReferences } from './atFileResolver'
import { buildSystemPrompt } from './systemPrompt'
import { AgentToolRunner, AGENT_MAX_TOOL_ROUNDS } from './agentTools'
import type { McpServerManager } from './mcpClient'

export type OpenAIClientEvent =
  | { type: 'status'; status: 'starting' | 'ready' | 'error' | 'closed'; message?: string }
  | { type: 'assistantDelta'; delta: string }
  | { type: 'assistantCompleted' }
  | { type: 'usageUpdated'; usage: unknown }
  | { type: 'thinking'; message: string }

export type OpenAIConnectOptions = {
  cwd: string
  model: string
  apiKey: string
  baseUrl?: string
  permissionMode?: 'verify-first' | 'proceed-always'
  sandbox?: 'read-only' | 'workspace-write'
  interactionMode?: string
  allowedCommandPrefixes?: string[]
  initialHistory?: Array<{ role: 'user' | 'assistant'; text: string }>
  mcpServerManager?: McpServerManager
}

const INITIAL_HISTORY_MAX_MESSAGES = 24
const TURN_TIMEOUT_MS = 120_000
const AGENT_MAX_IMAGE_ATTACHMENTS = 4

type OpenAIMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> | null
  tool_call_id?: string
  tool_calls?: OpenAIToolCall[]
}

type OpenAIToolCall = {
  id?: string
  type?: string
  function?: {
    name?: string
    arguments?: string
  }
}

export class OpenAIClient extends EventEmitter {
  private model = 'gpt-4o'
  private cwd = process.cwd()
  private apiKey = ''
  private baseUrl = 'https://api.openai.com/v1'
  private permissionMode: 'verify-first' | 'proceed-always' = 'verify-first'
  private sandbox: 'read-only' | 'workspace-write' = 'workspace-write'
  private allowedCommandPrefixes: string[] = []
  private interactionMode: string = 'agent'
  private history: Array<{ role: 'user' | 'assistant'; text: string }> = []
  private activeController: AbortController | null = null
  private toolRunner!: AgentToolRunner

  emitEvent(evt: OpenAIClientEvent) {
    this.emit('event', evt)
  }

  async connect(options: OpenAIConnectOptions) {
    this.model = (options.model || 'gpt-4o').trim()
    this.cwd = options.cwd || process.cwd()
    this.apiKey = (options.apiKey || '').trim()
    this.baseUrl = (options.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
    this.permissionMode = options.permissionMode === 'proceed-always' ? 'proceed-always' : 'verify-first'
    this.sandbox = options.sandbox === 'read-only' ? 'read-only' : 'workspace-write'
    this.allowedCommandPrefixes = Array.isArray(options.allowedCommandPrefixes)
      ? options.allowedCommandPrefixes
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim())
        .filter(Boolean)
      : []
    this.interactionMode = options.interactionMode ?? 'agent'
    this.history =
      (options.initialHistory?.length ?? 0) > 0
        ? options.initialHistory!.slice(-INITIAL_HISTORY_MAX_MESSAGES)
        : []
    this.toolRunner = new AgentToolRunner({
      cwd: this.cwd,
      sandbox: this.sandbox,
      permissionMode: this.permissionMode,
      allowedCommandPrefixes: this.allowedCommandPrefixes,
      mcpServerManager: options.mcpServerManager,
    })
    if (!this.apiKey) throw new Error('OpenAI API key is missing. Configure it in Settings -> Connectivity.')
    this.emitEvent({ type: 'status', status: 'ready', message: 'Connected' })
    return { threadId: 'openai' }
  }

  async sendUserMessage(text: string, options?: { interactionMode?: string; gitStatus?: string }) {
    const trimmed = text.trim()
    if (!trimmed) return

    const fileContext = resolveAtFileReferences(trimmed, this.cwd)
    const fullUser = trimmed + fileContext
    await this.sendUserMessageInternal(fullUser, fullUser, options?.interactionMode, options?.gitStatus)
  }

  async sendUserMessageWithImages(text: string, localImagePaths: string[], options?: { interactionMode?: string; gitStatus?: string }) {
    const trimmed = text.trim()
    const imagePaths = (localImagePaths ?? [])
      .filter((p) => typeof p === 'string' && p.trim().length > 0)
      .slice(0, AGENT_MAX_IMAGE_ATTACHMENTS)

    if (!trimmed && imagePaths.length === 0) return

    const fileContext = resolveAtFileReferences(trimmed, this.cwd)
    const fullUser = `${trimmed}${fileContext}`.trim()

    const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = []
    if (fullUser) content.push({ type: 'text', text: fullUser })
    for (const imgPath of imagePaths) {
      const asDataUrl = this.pathToDataUrl(imgPath)
      if (!asDataUrl) continue
      content.push({ type: 'image_url', image_url: { url: asDataUrl } })
    }

    if (content.length === 0) return

    const imageSummary = imagePaths.length > 0
      ? `\n\nAttached images:\n${imagePaths.map((p) => `- ${path.basename(p)}`).join('\n')}`
      : ''
    await this.sendUserMessageInternal(fullUser + imageSummary, content, options?.interactionMode, options?.gitStatus)
  }

  private async sendUserMessageInternal(
    historyUserText: string,
    latestUserContent: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>,
    interactionMode?: string,
    gitStatus?: string,
  ) {
    this.history.push({ role: 'user', text: historyUserText })

    const tree = generateWorkspaceTreeText(this.cwd)
    const mode = interactionMode ?? this.interactionMode
    const system = buildSystemPrompt({
      workspaceTree: tree,
      cwd: this.cwd,
      permissionMode: this.permissionMode,
      sandbox: this.sandbox,
      interactionMode: mode,
      gitStatus,
    })

    const recent = this.history.slice(-12)
    const messages: OpenAIMessage[] = [
      { role: 'system', content: system },
      ...recent.map((m) => ({ role: m.role, content: m.text })),
    ]
    if (messages.length > 0 && messages[messages.length - 1]?.role === 'user') {
      messages[messages.length - 1] = { role: 'user', content: latestUserContent }
    }

    const controller = new AbortController()
    this.activeController = controller
    const timer = setTimeout(() => controller.abort('timeout'), TURN_TIMEOUT_MS)
    this.emitEvent({ type: 'status', status: 'starting', message: 'Running OpenAI agent turn...' })
    try {
      const textOut = await this.runAgentLoop(messages, controller)
      this.history.push({ role: 'assistant', text: textOut })
      this.emitEvent({ type: 'assistantCompleted' })
      this.emitEvent({ type: 'status', status: 'ready', message: 'Connected' })
    } catch (err) {
      const aborted = controller.signal.aborted
      const reason = String(controller.signal.reason ?? '')
      const msg =
        err instanceof Error
          ? aborted && reason === 'interrupted'
            ? 'OpenAI request interrupted.'
            : aborted && reason === 'timeout'
              ? 'OpenAI request timed out.'
              : err.message
          : String(err)
      this.emitEvent({ type: 'status', status: 'error', message: msg })
      this.emitEvent({ type: 'assistantCompleted' })
    } finally {
      clearTimeout(timer)
      if (this.activeController === controller) this.activeController = null
    }
  }

  private async runAgentLoop(initialMessages: OpenAIMessage[], controller: AbortController): Promise<string> {
    const messages = [...initialMessages]
    let lastAssistantText = ''

    for (let round = 0; round < AGENT_MAX_TOOL_ROUNDS; round++) {
      const result = await this.fetchStreamedCompletion(messages, controller)

      if (result.assistantText) lastAssistantText = result.assistantText

      if (result.toolCalls.length === 0) {
        return result.assistantText || 'No response content returned by OpenAI.'
      }

      const normalizedToolCalls: OpenAIToolCall[] = result.toolCalls.map((call, i) => ({
        ...call,
        id: call.id || `tool_${round}_${i}`,
        type: call.type || 'function',
      }))

      const assistantMessage: OpenAIMessage = {
        role: 'assistant',
        content: result.assistantText || null,
        tool_calls: normalizedToolCalls,
      }
      messages.push(assistantMessage)

      for (let i = 0; i < normalizedToolCalls.length; i++) {
        const toolCall = normalizedToolCalls[i]
        const callId = toolCall.id as string
        const toolName = toolCall.function?.name || 'unknown_tool'
        const argsPreview = this.safeToolArgsPreview(toolCall.function?.arguments)
        this.emitEvent({
          type: 'thinking',
          message: argsPreview
            ? `${toolName}: ${argsPreview}`
            : toolName,
        })
        const toolResult = await this.toolRunner.executeTool(toolName, toolCall.function?.arguments)
        messages.push({
          role: 'tool',
          tool_call_id: callId,
          content: toolResult,
        })
      }
    }

    return lastAssistantText || 'Stopped after too many tool steps without a final answer.'
  }

  private async fetchStreamedCompletion(
    messages: OpenAIMessage[],
    controller: AbortController,
  ): Promise<{ assistantText: string; toolCalls: OpenAIToolCall[] }> {
    const maxRateLimitRetries = 3
    for (let attempt = 0; attempt <= maxRateLimitRetries; attempt++) {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          tools: this.toolRunner.getToolDefinitions(),
          tool_choice: 'auto',
          temperature: 0.1,
          stream: true,
        }),
        signal: controller.signal,
      })

      if (response.ok) {
        return this.consumeSSEStream(response, controller)
      }

      const retryAfterHeader = response.headers.get('retry-after')
      const body = await response.text().catch(() => '')
      const retryDelayMs = this.getRetryDelayMs(response.status, retryAfterHeader, body, attempt)
      const canRetry = retryDelayMs > 0 && attempt < maxRateLimitRetries
      if (canRetry) {
        const retrySeconds = (retryDelayMs / 1000).toFixed(1).replace(/\.0$/, '')
        this.emitEvent({
          type: 'thinking',
          message: `OpenAI rate limited — retrying in ${retrySeconds}s...`,
        })
        await this.sleepWithAbort(retryDelayMs, controller.signal)
        continue
      }

      const hint = body ? ` ${body.slice(0, 500)}` : ''
      throw new Error(`OpenAI request failed (${response.status}).${hint}`)
    }
    throw new Error('OpenAI request failed after retries.')
  }

  private async consumeSSEStream(
    response: Response,
    controller: AbortController,
  ): Promise<{ assistantText: string; toolCalls: OpenAIToolCall[] }> {
    let assistantText = ''
    const toolCallAccumulators: Map<number, { id: string; type: string; name: string; arguments: string }> = new Map()

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body for streaming.')
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        if (controller.signal.aborted) break
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === 'data: [DONE]') continue
          if (!trimmed.startsWith('data: ')) continue

          let chunk: any
          try {
            chunk = JSON.parse(trimmed.slice(6))
          } catch {
            continue
          }

          if (chunk.usage) this.emitEvent({ type: 'usageUpdated', usage: chunk.usage })

          const delta = chunk.choices?.[0]?.delta
          if (!delta) continue

          if (delta.content) {
            assistantText += delta.content
            this.emitEvent({ type: 'assistantDelta', delta: delta.content })
          }

          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              if (!toolCallAccumulators.has(idx)) {
                toolCallAccumulators.set(idx, {
                  id: tc.id ?? '',
                  type: tc.type ?? 'function',
                  name: tc.function?.name ?? '',
                  arguments: '',
                })
              }
              const acc = toolCallAccumulators.get(idx)!
              if (tc.id) acc.id = tc.id
              if (tc.function?.name) acc.name += tc.function.name
              if (tc.function?.arguments) acc.arguments += tc.function.arguments
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    const toolCalls: OpenAIToolCall[] = []
    for (const [, acc] of [...toolCallAccumulators.entries()].sort((a, b) => a[0] - b[0])) {
      toolCalls.push({
        id: acc.id,
        type: acc.type,
        function: { name: acc.name, arguments: acc.arguments },
      })
    }

    return { assistantText, toolCalls }
  }

  private getRetryDelayMs(status: number, retryAfterHeader: string | null, body: string, attempt: number): number {
    if (status !== 429) return 0

    if (retryAfterHeader) {
      const asSeconds = Number(retryAfterHeader)
      if (Number.isFinite(asSeconds) && asSeconds > 0) {
        return Math.max(250, Math.round(asSeconds * 1000))
      }
      const asDate = Date.parse(retryAfterHeader)
      if (!Number.isNaN(asDate)) {
        const delay = asDate - Date.now()
        if (delay > 0) return delay
      }
    }

    const bodySecondsMatch = body.match(/try again in\s*([\d.]+)\s*s/i)
    if (bodySecondsMatch) {
      const seconds = Number(bodySecondsMatch[1])
      if (Number.isFinite(seconds) && seconds > 0) {
        return Math.max(250, Math.round(seconds * 1000))
      }
    }

    // Fallback exponential backoff if server didn't provide a retry window.
    return Math.min(12000, 2000 * 2 ** attempt)
  }

  private async sleepWithAbort(delayMs: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw new Error('aborted')
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      }, delayMs)
      const onAbort = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        reject(new Error('aborted'))
      }
      signal.addEventListener('abort', onAbort)
    })
  }

  private safeToolArgsPreview(rawArgs: string | undefined): string {
    if (!rawArgs || !rawArgs.trim()) return ''
    const compact = rawArgs.replace(/\s+/g, ' ').trim()
    return compact.length > 120 ? compact.slice(0, 120) + '...' : compact
  }

  private pathToDataUrl(rawPath: string): string | null {
    const absolute = path.isAbsolute(rawPath) ? rawPath : path.resolve(this.cwd, rawPath)
    let stat: fs.Stats
    try {
      stat = fs.statSync(absolute)
    } catch {
      return null
    }
    if (!stat.isFile()) return null
    if (stat.size > 8 * 1024 * 1024) return null

    let bytes: Buffer
    try {
      bytes = fs.readFileSync(absolute)
    } catch {
      return null
    }

    const ext = path.extname(absolute).toLowerCase()
    const mime = ext === '.png'
      ? 'image/png'
      : ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.gif'
            ? 'image/gif'
            : null
    if (!mime) return null

    return `data:${mime};base64,${bytes.toString('base64')}`
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
