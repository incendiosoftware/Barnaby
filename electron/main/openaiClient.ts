import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'

import { generateWorkspaceTreeText } from './fileTree'
import { resolveAtFileReferences } from './atFileResolver'

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
  initialHistory?: Array<{ role: 'user' | 'assistant'; text: string }>
}

const INITIAL_HISTORY_MAX_MESSAGES = 24
const TURN_TIMEOUT_MS = 120_000
const AGENT_MAX_TOOL_ROUNDS = 8
const AGENT_MAX_TOOL_OUTPUT_CHARS = 14_000
const AGENT_MAX_FILE_BYTES = 350_000
const AGENT_MAX_SEARCH_RESULTS = 60
const AGENT_MAX_SEARCH_FILES = 1200
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
  private history: Array<{ role: 'user' | 'assistant'; text: string }> = []
  private activeController: AbortController | null = null

  emitEvent(evt: OpenAIClientEvent) {
    this.emit('event', evt)
  }

  async connect(options: OpenAIConnectOptions) {
    this.model = (options.model || 'gpt-4o').trim()
    this.cwd = options.cwd || process.cwd()
    this.apiKey = (options.apiKey || '').trim()
    this.baseUrl = (options.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
    this.history =
      (options.initialHistory?.length ?? 0) > 0
        ? options.initialHistory!.slice(-INITIAL_HISTORY_MAX_MESSAGES)
        : []
    if (!this.apiKey) throw new Error('OpenAI API key is missing. Configure it in Settings -> Connectivity.')
    this.emitEvent({ type: 'status', status: 'ready', message: 'Connected' })
    return { threadId: 'openai' }
  }

  async sendUserMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return

    const fileContext = resolveAtFileReferences(trimmed, this.cwd)
    const fullUser = trimmed + fileContext
    await this.sendUserMessageInternal(fullUser, fullUser)
  }

  async sendUserMessageWithImages(text: string, localImagePaths: string[]) {
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
    await this.sendUserMessageInternal(fullUser + imageSummary, content)
  }

  private async sendUserMessageInternal(
    historyUserText: string,
    latestUserContent: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>,
  ) {
    this.history.push({ role: 'user', text: historyUserText })

    const tree = generateWorkspaceTreeText(this.cwd)
    const system = `You are Barnaby's OpenAI API coding agent.
Workspace root: ${this.cwd}

${tree}

Rules:
- Use tools when asked about repository contents, functions, files, behavior, or implementation details.
- Never invent file names, symbols, or behavior. If not verified via tool output, say so.
- Cite concrete evidence in your answer (file path and line numbers when available).
- Keep working until you have enough evidence to answer accurately.`

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
      this.emitEvent({ type: 'assistantDelta', delta: textOut })
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
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          tools: this.agentTools(),
          tool_choice: 'auto',
          temperature: 0.1,
          stream: false,
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        const hint = body ? ` ${body.slice(0, 500)}` : ''
        throw new Error(`OpenAI request failed (${response.status}).${hint}`)
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }>; tool_calls?: OpenAIToolCall[] } }>
        usage?: unknown
      }
      if (data?.usage) this.emitEvent({ type: 'usageUpdated', usage: data.usage })

      const message = data?.choices?.[0]?.message
      const assistantContent = this.extractAssistantText(message?.content)
      if (assistantContent) lastAssistantText = assistantContent
      const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : []

      if (toolCalls.length === 0) {
        return assistantContent || 'No response content returned by OpenAI.'
      }

      const normalizedToolCalls: OpenAIToolCall[] = toolCalls.map((call, i) => ({
        ...call,
        id: call.id || `tool_${round}_${i}`,
        type: call.type || 'function',
      }))

      const assistantMessage: OpenAIMessage = {
        role: 'assistant',
        content: assistantContent || null,
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
            ? `Using ${toolName}(${argsPreview})`
            : `Using ${toolName}`,
        })
        const toolResult = this.runTool(toolName, toolCall.function?.arguments)
        messages.push({
          role: 'tool',
          tool_call_id: callId,
          content: toolResult,
        })
      }
    }

    return lastAssistantText || 'Stopped after too many tool steps without a final answer.'
  }

  private extractAssistantText(content: string | Array<{ type?: string; text?: string }> | undefined): string {
    if (typeof content === 'string') return content
    if (!Array.isArray(content)) return ''
    return content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .join('')
  }

  private agentTools() {
    return [
      {
        type: 'function',
        function: {
          name: 'list_workspace_tree',
          description: 'List the current workspace tree (truncated).',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {},
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'search_workspace',
          description: 'Search text in workspace files. Returns file:line snippets.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              query: { type: 'string', description: 'Text to search for.' },
              caseSensitive: { type: 'boolean' },
            },
            required: ['query'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'read_workspace_file',
          description: 'Read a text file from the workspace with optional line range.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              path: { type: 'string', description: 'Relative path from workspace root.' },
              startLine: { type: 'integer' },
              endLine: { type: 'integer' },
            },
            required: ['path'],
          },
        },
      },
    ]
  }

  private runTool(name: string, rawArgs: string | undefined): string {
    let args: Record<string, unknown> = {}
    if (typeof rawArgs === 'string' && rawArgs.trim()) {
      try {
        args = JSON.parse(rawArgs) as Record<string, unknown>
      } catch {
        return 'Tool error: Invalid JSON arguments.'
      }
    }

    if (name === 'list_workspace_tree') {
      return this.limitToolOutput(generateWorkspaceTreeText(this.cwd))
    }

    if (name === 'search_workspace') {
      return this.limitToolOutput(this.searchWorkspace(args))
    }

    if (name === 'read_workspace_file') {
      return this.limitToolOutput(this.readWorkspaceFile(args))
    }

    return `Tool error: Unknown tool "${name}".`
  }

  private resolveWorkspacePath(rawPath: unknown): { ok: true; absolute: string; relative: string } | { ok: false; error: string } {
    if (typeof rawPath !== 'string' || !rawPath.trim()) {
      return { ok: false, error: 'Path is required.' }
    }

    const normalizedRoot = path.resolve(this.cwd)
    const requested = rawPath.trim()
    const absolute = path.resolve(normalizedRoot, requested)
    const relative = path.relative(normalizedRoot, absolute)

    if (!relative || relative === '.') {
      return { ok: false, error: 'Path must point to a file inside the workspace.' }
    }
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return { ok: false, error: 'Path escapes workspace root.' }
    }
    return { ok: true, absolute, relative: relative.replace(/\\/g, '/') }
  }

  private readWorkspaceFile(args: Record<string, unknown>): string {
    const resolved = this.resolveWorkspacePath(args.path)
    if (!resolved.ok) return `Tool error: ${resolved.error}`

    let stat: fs.Stats
    try {
      stat = fs.statSync(resolved.absolute)
    } catch {
      return `Tool error: File not found: ${resolved.relative}`
    }
    if (!stat.isFile()) return `Tool error: Not a file: ${resolved.relative}`

    const bytes = fs.readFileSync(resolved.absolute)
    if (bytes.includes(0)) return `Tool error: File appears binary and cannot be read as text: ${resolved.relative}`

    const text = bytes.toString('utf8')
    if (text.length > AGENT_MAX_FILE_BYTES) {
      return `Tool error: File too large (${text.length} chars). Use search_workspace or narrower line range.`
    }

    const lines = text.split(/\r?\n/)
    const total = lines.length
    const startRaw = typeof args.startLine === 'number' ? Math.floor(args.startLine) : 1
    const endRaw = typeof args.endLine === 'number' ? Math.floor(args.endLine) : Math.min(total, startRaw + 220)
    const startLine = Math.min(Math.max(startRaw, 1), total)
    const endLine = Math.min(Math.max(endRaw, startLine), total)

    const numbered = lines
      .slice(startLine - 1, endLine)
      .map((line, i) => `${startLine + i}: ${line}`)
      .join('\n')
    return `File: ${resolved.relative}\nLines: ${startLine}-${endLine} of ${total}\n\n${numbered}`
  }

  private searchWorkspace(args: Record<string, unknown>): string {
    const query = typeof args.query === 'string' ? args.query.trim() : ''
    if (!query) return 'Tool error: query is required.'
    const caseSensitive = Boolean(args.caseSensitive)

    const root = path.resolve(this.cwd)
    const ignoredDirs = new Set([
      '.git',
      'node_modules',
      'dist',
      'dist-electron',
      'release',
      'build',
      '.barnaby',
      '.next',
      '.nuxt',
      '.output',
      'coverage',
    ])
    const ignoredFileExt = new Set([
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.webp',
      '.ico',
      '.pdf',
      '.zip',
      '.gz',
      '.exe',
      '.dll',
      '.woff',
      '.woff2',
      '.ttf',
      '.mp4',
      '.mp3',
      '.icns',
      '.bin',
      '.map',
      '.lock',
    ])

    const stack: string[] = [root]
    const results: string[] = []
    let scannedFiles = 0
    let truncated = false

    const needle = caseSensitive ? query : query.toLowerCase()

    while (stack.length > 0 && results.length < AGENT_MAX_SEARCH_RESULTS) {
      const dir = stack.pop() as string
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        continue
      }

      for (const entry of entries) {
        const name = entry.name
        if (!name || name.startsWith('.')) continue
        const absolute = path.join(dir, name)

        if (entry.isDirectory()) {
          if (ignoredDirs.has(name)) continue
          stack.push(absolute)
          continue
        }
        if (!entry.isFile()) continue

        const ext = path.extname(name).toLowerCase()
        if (ignoredFileExt.has(ext)) continue

        scannedFiles++
        if (scannedFiles > AGENT_MAX_SEARCH_FILES) {
          truncated = true
          break
        }

        let content = ''
        try {
          const stat = fs.statSync(absolute)
          if (stat.size > AGENT_MAX_FILE_BYTES) continue
          const buffer = fs.readFileSync(absolute)
          if (buffer.includes(0)) continue
          content = buffer.toString('utf8')
        } catch {
          continue
        }

        const lines = content.split(/\r?\n/)
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          const haystack = caseSensitive ? line : line.toLowerCase()
          if (!haystack.includes(needle)) continue
          const relative = path.relative(root, absolute).replace(/\\/g, '/')
          const snippet = line.length > 220 ? line.slice(0, 220) + '...' : line
          results.push(`${relative}:${i + 1}: ${snippet}`)
          if (results.length >= AGENT_MAX_SEARCH_RESULTS) break
        }
      }

      if (truncated) break
    }

    if (results.length === 0) return `No matches for "${query}".`
    const summary = truncated
      ? `Results for "${query}" (truncated after scanning ${AGENT_MAX_SEARCH_FILES} files):`
      : `Results for "${query}":`
    return `${summary}\n${results.join('\n')}`
  }

  private limitToolOutput(text: string): string {
    if (text.length <= AGENT_MAX_TOOL_OUTPUT_CHARS) return text
    return `${text.slice(0, AGENT_MAX_TOOL_OUTPUT_CHARS)}\n... [truncated]`
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
