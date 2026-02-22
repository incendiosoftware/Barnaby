import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import readline from 'node:readline'

type JsonRpcId = number

type JsonRpcRequest = {
  id: JsonRpcId
  method: string
  params?: unknown
}

type JsonRpcNotification = {
  method: string
  params?: unknown
}

type JsonRpcResponse =
  | { id: JsonRpcId; result: unknown }
  | { id: JsonRpcId; error: { code?: number; message: string } }

type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse

export type FireHarnessCodexEvent =
  | { type: 'status'; status: 'starting' | 'ready' | 'error' | 'closed'; message?: string }
  | { type: 'assistantDelta'; delta: string }
  | { type: 'assistantCompleted' }
  | { type: 'usageUpdated'; usage: unknown }
  | { type: 'planUpdated'; plan: unknown }
  | { type: 'rawNotification'; method: string; params?: unknown }

export type CodexConnectOptions = {
  cwd: string
  model: string
  provider?: 'codex' | 'claude' | 'gemini' | 'openrouter'
  permissionMode?: 'verify-first' | 'proceed-always'
  approvalPolicy?: 'on-request' | 'never'
  sandbox?: 'read-only' | 'workspace-write'
}

export class CodexAppServerClient extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null
  private rl: readline.Interface | null = null

  private nextId: number = 1
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()

  private threadId: string | null = null
  private activeTurnId: string | null = null
  private permissionMode: 'verify-first' | 'proceed-always' = 'verify-first'
  private lastStderr = ''

  emitEvent(evt: FireHarnessCodexEvent) {
    this.emit('event', evt)
  }

  isConnected() {
    return this.proc !== null
  }

  getThreadId() {
    return this.threadId
  }

  async connect(options: CodexConnectOptions) {
    if (options.provider && options.provider !== 'codex') {
      throw new Error(
        `Provider "${options.provider}" is not implemented yet. Select a Codex model/provider for now.`,
      )
    }

    this.permissionMode = options.permissionMode ?? 'verify-first'

    if (this.proc) await this.close()

    this.emitEvent({ type: 'status', status: 'starting', message: 'Starting codex app-server...' })

    // `codex app-server` speaks JSON-RPC over JSONL on stdio (one JSON object per line).
    // On Windows, Codex is commonly installed as an npm shim (`codex.cmd`), which can't be
    // executed via CreateProcess directly. Run it through cmd.exe so stdin/stdout pipes work.
    const proc =
      process.platform === 'win32'
        ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'codex app-server'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
          })
        : spawn('codex', ['app-server'], {
            stdio: ['pipe', 'pipe', 'pipe'],
          })
    this.proc = proc

    proc.on('exit', (code, signal) => {
      const msg = code !== null ? `codex app-server exited (${code})` : `codex app-server exited (${signal ?? 'unknown'})`
      this.emitEvent({ type: 'status', status: 'closed', message: msg })
      this.cleanupAfterExit()
    })

    proc.on('error', (err) => {
      this.emitEvent({ type: 'status', status: 'error', message: String(err?.message ?? err) })
      this.cleanupAfterExit()
    })

    proc.stderr.setEncoding('utf8')
    proc.stderr.on('data', (chunk: string) => {
      // Keep stderr out of the main chat UI, but surface as a status error.
      const trimmed = String(chunk).trim()
      this.lastStderr = `${this.lastStderr}\n${trimmed}`.trim().slice(-2000)
      if (trimmed) this.emitEvent({ type: 'status', status: 'error', message: trimmed })
    })

    proc.stdout.setEncoding('utf8')
    const rl = readline.createInterface({ input: proc.stdout })
    this.rl = rl
    rl.on('line', (line) => this.onLine(line))

    // Handshake required: initialize (request) then initialized (notification).
    await this.sendRequest('initialize', {
      clientInfo: { name: 'agent_orchestrator', title: 'Agent Orchestrator', version: '0.0.2' },
      // Keep full stream; we can ignore what we don't use.
    })
    this.sendNotification('initialized', {})

    // Create a thread that behaves like chat: no approvals, no side-effect permissions.
    const threadStart = await this.sendRequest('thread/start', {
      model: options.model,
      cwd: options.cwd,
      approvalPolicy:
        options.approvalPolicy ??
        (this.permissionMode === 'proceed-always' ? 'never' : 'on-request'),
      sandbox: options.sandbox ?? 'workspace-write',
    })

    const threadId = (threadStart as any)?.thread?.id
    if (!threadId || typeof threadId !== 'string') {
      throw new Error('codex app-server did not return a thread id')
    }
    this.threadId = threadId

    this.emitEvent({ type: 'status', status: 'ready', message: 'Connected' })
    return { threadId }
  }

  async sendUserMessage(text: string) {
    if (!this.threadId) throw new Error('Not connected (no threadId).')
    const trimmed = text.trim()
    if (!trimmed) return

    // Start a new turn and stream deltas via item notifications.
    const turnStart = await this.sendRequest('turn/start', {
      threadId: this.threadId,
      input: [{ type: 'text', text: trimmed }],
    })
    const turnId = (turnStart as any)?.turn?.id
    if (turnId && typeof turnId === 'string') this.activeTurnId = turnId
  }

  async sendUserMessageWithImages(text: string, localImagePaths: string[]) {
    if (!this.threadId) throw new Error('Not connected (no threadId).')
    const trimmed = text.trim()
    const imagePaths = (localImagePaths ?? []).filter((p) => typeof p === 'string' && p.trim())
    if (!trimmed && imagePaths.length === 0) return

    const input: Array<{ type: 'text'; text: string } | { type: 'localImage'; path: string }> = []
    if (trimmed) input.push({ type: 'text', text: trimmed })
    for (const path of imagePaths) input.push({ type: 'localImage', path })

    const turnStart = await this.sendRequest('turn/start', {
      threadId: this.threadId,
      input,
    })
    const turnId = (turnStart as any)?.turn?.id
    if (turnId && typeof turnId === 'string') this.activeTurnId = turnId
  }

  async interruptActiveTurn() {
    if (!this.threadId || !this.activeTurnId) return
    await this.sendRequest('turn/interrupt', { threadId: this.threadId, turnId: this.activeTurnId })
  }

  async close() {
    if (!this.proc) return

    // Best-effort: closing stdin usually tells the server to exit.
    try {
      this.proc.stdin.end()
    } catch {
      // ignore
    }

    try {
      this.proc.kill()
    } catch {
      // ignore
    }

    this.cleanupAfterExit()
  }

  private cleanupAfterExit() {
    this.rl?.close()
    this.rl = null
    this.proc = null
    const detail = this.lastStderr ? ` | stderr: ${this.lastStderr}` : ''
    this.pending.forEach(({ reject }) =>
      reject(
        new Error(
          `codex app-server closed. Check codex login/PATH/workspace/model selection${detail}`,
        ),
      ),
    )
    this.pending.clear()
    this.threadId = null
    this.activeTurnId = null
    this.lastStderr = ''
  }

  private onLine(line: string) {
    const trimmed = line.trim()
    if (!trimmed) return

    let msg: JsonRpcMessage
    try {
      msg = JSON.parse(trimmed) as JsonRpcMessage
    } catch (e) {
      this.emitEvent({ type: 'status', status: 'error', message: `Bad JSON from codex: ${trimmed.slice(0, 200)}` })
      return
    }

    // Response
    if (typeof (msg as any).id === 'number' && ('result' in (msg as any) || 'error' in (msg as any))) {
      const id = (msg as any).id as number
      const pending = this.pending.get(id)
      if (!pending) return
      this.pending.delete(id)
      if ('error' in (msg as any) && (msg as any).error) {
        pending.reject(new Error((msg as any).error?.message ?? 'Unknown JSON-RPC error'))
      } else {
        pending.resolve((msg as any).result)
      }
      return
    }

    // Server-initiated request (rare in MVP; approvals, etc). We currently decline by default.
    if (typeof (msg as any).id === 'number' && typeof (msg as any).method === 'string') {
      const id = (msg as any).id as number
      const method = (msg as any).method as string
      this.emitEvent({ type: 'rawNotification', method, params: (msg as any).params })

      // Best-effort: respond "decline" for approval requests.
      if (method.endsWith('/requestApproval')) {
        if (this.permissionMode === 'proceed-always') {
          this.sendResponse(id, { decision: 'accept' })
        } else {
          this.emitEvent({
            type: 'status',
            status: 'error',
            message: 'Action requires approval. Set permissions to Proceed always to allow writes.',
          })
          this.sendResponse(id, { decision: 'decline' })
        }
      } else {
        this.sendResponse(id, null)
      }
      return
    }

    // Notification
    if (typeof (msg as any).method === 'string') {
      const method = (msg as any).method as string
      const params = (msg as any).params
      this.handleNotification(method, params)
    }
  }

  private handleNotification(method: string, params: any) {
    // Core chat streaming
    if (method === 'item/agentMessage/delta') {
      const delta =
        typeof params?.delta === 'string'
          ? params.delta
          : typeof params?.text === 'string'
            ? params.text
            : typeof params?.textDelta === 'string'
              ? params.textDelta
              : typeof params?.delta?.text === 'string'
                ? params.delta.text
                : ''
      if (delta) this.emitEvent({ type: 'assistantDelta', delta })
      return
    }

    if (method === 'item/completed') {
      // When the agent message item completes, consider the assistant message finalized.
      const itemType = params?.item?.type
      if (itemType === 'agentMessage') this.emitEvent({ type: 'assistantCompleted' })
      // For non-agent items (tool calls, command activity, etc.), fall through so the
      // renderer can decide what to surface.
      if (itemType === 'agentMessage') return
    }

    if (method === 'turn/completed') {
      this.activeTurnId = null
      return
    }

    // Optional: usage and plan surfaces
    if (method === 'thread/tokenUsage/updated') {
      this.emitEvent({ type: 'usageUpdated', usage: params })
      return
    }

    // Legacy notification seen in current Codex CLI builds. Contains rate limit usage like
    // "5h limit used_percent" which is helpful to show in the UI.
    if (method === 'codex/event/token_count') {
      const primary = params?.rate_limits?.primary
      const secondary = params?.rate_limits?.secondary
      this.emitEvent({
        type: 'usageUpdated',
        usage: {
          kind: 'rateLimits',
          primary: primary
            ? {
                usedPercent: primary.used_percent,
                windowMinutes: primary.window_minutes,
                resetsAt: primary.resets_at,
              }
            : null,
          secondary: secondary
            ? {
                usedPercent: secondary.used_percent,
                windowMinutes: secondary.window_minutes,
                resetsAt: secondary.resets_at,
              }
            : null,
        },
      })
      return
    }

    if (method === 'turn/plan/updated') {
      this.emitEvent({ type: 'planUpdated', plan: params })
      return
    }

    // For debugging, but keep it out of the primary UI unless user enables it later.
    this.emitEvent({ type: 'rawNotification', method, params })
  }

  private sendNotification(method: string, params?: unknown) {
    this.writeMessage({ method, params } satisfies JsonRpcNotification)
  }

  private sendResponse(id: JsonRpcId, result: unknown) {
    // App-server uses JSON-RPC 2.0 messages without the header on the wire.
    this.writeMessage({ id, result } satisfies JsonRpcResponse)
  }

  private sendRequest(method: string, params?: unknown) {
    const id = this.nextId++
    const message: JsonRpcRequest = { id, method, params }

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.writeMessage(message)
    })
  }

  private writeMessage(message: unknown) {
    if (!this.proc) throw new Error('codex app-server process not running')
    this.proc.stdin.write(`${JSON.stringify(message)}\n`)
  }
}

