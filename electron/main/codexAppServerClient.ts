import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import readline from 'node:readline'
import fs from 'node:fs'
import path from 'node:path'

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
  | { type: 'thinking'; message: string }
  | { type: 'planUpdated'; plan: unknown }
  | { type: 'rawNotification'; method: string; params?: unknown }

export type CodexConnectOptions = {
  cwd: string
  model: string
  provider?: 'codex' | 'claude' | 'gemini' | 'openrouter'
  permissionMode?: 'verify-first' | 'proceed-always'
  approvalPolicy?: 'on-request' | 'never'
  sandbox?: 'read-only' | 'workspace-write'
  allowedCommandPrefixes?: string[]
  allowedAutoReadPrefixes?: string[]
  allowedAutoWritePrefixes?: string[]
  deniedAutoReadPrefixes?: string[]
  deniedAutoWritePrefixes?: string[]
}

export class CodexAppServerClient extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null
  private rl: readline.Interface | null = null

  private nextId: number = 1
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()

  private threadId: string | null = null
  private activeTurnId: string | null = null
  private permissionMode: 'verify-first' | 'proceed-always' = 'verify-first'
  private allowedCommandPrefixes: string[] = []
  private allowedAutoReadPrefixes: string[] = []
  private allowedAutoWritePrefixes: string[] = []
  private deniedAutoReadPrefixes: string[] = []
  private deniedAutoWritePrefixes: string[] = []
  private lastStderr = ''

  private static TURN_INACTIVITY_TIMEOUT_MS = 120_000
  private turnInactivityTimer: ReturnType<typeof setTimeout> | null = null

  emitEvent(evt: FireHarnessCodexEvent) {
    this.emit('event', evt)
  }

  private resetTurnInactivityTimer() {
    if (this.turnInactivityTimer) clearTimeout(this.turnInactivityTimer)
    if (!this.activeTurnId) return
    this.turnInactivityTimer = setTimeout(() => {
      this.turnInactivityTimer = null
      if (this.activeTurnId) {
        this.activeTurnId = null
        this.emitEvent({ type: 'status', status: 'error', message: 'OpenAI turn timed out — no activity for 120 seconds.' })
        this.emitEvent({ type: 'assistantCompleted' })
      }
    }, CodexAppServerClient.TURN_INACTIVITY_TIMEOUT_MS)
  }

  private clearTurnInactivityTimer() {
    if (this.turnInactivityTimer) {
      clearTimeout(this.turnInactivityTimer)
      this.turnInactivityTimer = null
    }
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
    this.allowedCommandPrefixes = this.normalizeAllowedCommandPrefixes(options.allowedCommandPrefixes)
    this.allowedAutoReadPrefixes = this.normalizeAllowedCommandPrefixes(options.allowedAutoReadPrefixes)
    this.allowedAutoWritePrefixes = this.normalizeAllowedCommandPrefixes(options.allowedAutoWritePrefixes)
    this.deniedAutoReadPrefixes = this.normalizeAllowedCommandPrefixes(options.deniedAutoReadPrefixes)
    this.deniedAutoWritePrefixes = this.normalizeAllowedCommandPrefixes(options.deniedAutoWritePrefixes)

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

    // Create the thread and let approval policy come from workspace permission settings.
    const threadStart = await this.sendRequest('thread/start', {
      model: options.model,
      cwd: options.cwd,
      approvalPolicy:
        options.approvalPolicy ??
        (this.permissionMode === 'proceed-always' ? 'never' : 'on-request'),
      sandbox: options.sandbox ?? 'workspace-write',
    })

    // Write the CLI config to enforce permissions
    this.writeCliConfig(options.cwd)

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
    this.resetTurnInactivityTimer()
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
    this.resetTurnInactivityTimer()
  }

  async interruptActiveTurn() {
    this.clearTurnInactivityTimer()
    if (!this.threadId || !this.activeTurnId) return
    await this.sendRequest('turn/interrupt', { threadId: this.threadId, turnId: this.activeTurnId })
  }

  async close() {
    this.clearTurnInactivityTimer()
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
    this.clearTurnInactivityTimer()
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
          const command = this.extractApprovalCommand((msg as any).params)
          const filePath = this.extractApprovalPath((msg as any).params)
          
          if (filePath) {
             const mode = method.includes('read') ? 'read' : 'write' // Heuristic
             if (this.shouldAutoApprovePath(filePath, mode)) {
               this.sendResponse(id, { decision: 'accept' })
             } else {
               this.emitEvent({
                 type: 'status',
                 status: 'error',
                 message: `Action blocked by allowed command prefixes (${filePath}). Update workspace prefix allowlist to permit this command.`,
               })
               this.sendResponse(id, { decision: 'decline' })
             }
          } else if (command) {
            if (this.shouldAutoApproveCommand(command)) {
              this.sendResponse(id, { decision: 'accept' })
            } else {
              const commandNote = command ? ` (${this.shorten(command, 120)})` : ''
              this.emitEvent({
                type: 'status',
                status: 'error',
                message: `Action blocked by allowed command prefixes${commandNote}. Update workspace prefix allowlist to permit this command.`,
              })
              this.sendResponse(id, { decision: 'decline' })
            }
          } else {
             // Fallback
             this.sendResponse(id, { decision: 'decline' })
          }
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
    if (this.activeTurnId) this.resetTurnInactivityTimer()

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

    if (method === 'item/created' || method === 'item/completed') {
      const item = params?.item
      const itemType = item?.type
      if (method === 'item/completed' && itemType === 'agentMessage') return

      if (itemType === 'function_call' || itemType === 'tool_call') {
        const name = item?.name ?? item?.function?.name ?? 'tool'
        const rawArgs = item?.arguments ?? item?.function?.arguments ?? ''
        let argSummary = ''
        try {
          const parsed = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs
          argSummary = parsed?.command ?? parsed?.file_path ?? parsed?.path ?? parsed?.pattern ?? ''
        } catch { argSummary = typeof rawArgs === 'string' ? rawArgs.slice(0, 60) : '' }
        const short = typeof argSummary === 'string' && argSummary.length > 60 ? argSummary.slice(0, 60) + '...' : argSummary
        this.emitEvent({ type: 'thinking', message: short ? `${name}: ${short}` : name })
        return
      }
      if (itemType === 'function_call_output' || itemType === 'tool_result') return
      if (typeof itemType === 'string' && /file_|shell|command|exec|read|write|search|patch/i.test(itemType)) {
        const desc = item?.name ?? item?.command ?? item?.path ?? itemType
        this.emitEvent({ type: 'thinking', message: `${desc}` })
        return
      }
    }

    if (method === 'turn/completed') {
      this.clearTurnInactivityTimer()
      this.activeTurnId = null
      this.emitEvent({ type: 'assistantCompleted' })
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

  private writeCliConfig(cwd: string) {
    // Only proceed if we have meaningful permissions to write
    if (this.permissionMode !== 'proceed-always') return
    
    const configDir = path.join(cwd, '.cursor')
    const configPath = path.join(configDir, 'cli.json')

    // If all lists are empty, we should NOT enforce a restrictive cli.json.
    // Instead, we remove it to restore the default "Allow All" behavior of the agent.
    if (this.allowedCommandPrefixes.length === 0 &&
        this.allowedAutoReadPrefixes.length === 0 &&
        this.allowedAutoWritePrefixes.length === 0 &&
        this.deniedAutoReadPrefixes.length === 0 &&
        this.deniedAutoWritePrefixes.length === 0) {
        
        if (fs.existsSync(configPath)) {
            try {
                fs.unlinkSync(configPath)
            } catch (e) { /* ignore */ }
        }
        return
    }
    
    // Resolve shell permissions from explicit prefixes plus required toolchain companions.
    const allowedBinaries = this.buildAllowedShellPermissions()

    // Build read/write rules
    const readRules = this.allowedAutoReadPrefixes.length > 0 
        ? this.allowedAutoReadPrefixes.map(p => `Read(${p}**)`)
        : ['Read(**)']

    const writeRules = this.allowedAutoWritePrefixes.length > 0 
        ? this.allowedAutoWritePrefixes.map(p => `Write(${p}**)`)
        : ['Write(**)']
    
    const deniedRead = this.deniedAutoReadPrefixes.map(p => `Read(${p}**)`)
    const deniedWrite = this.deniedAutoWritePrefixes.map(p => `Write(${p}**)`)

    const config = {
      permissions: {
        allow: [
          ...allowedBinaries,
          ...readRules,
          ...writeRules
        ],
        deny: [
          ...deniedRead,
          ...deniedWrite
        ]
      }
    }

    try {
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }
      fs.writeFileSync(
        configPath, 
        JSON.stringify(config, null, 2),
        'utf8'
      )
    } catch (err) {
      this.emitEvent({ 
        type: 'status', 
        status: 'error', 
        message: `Failed to write permission config: ${String(err)}` 
      })
    }
  }

  private buildAllowedShellPermissions(): string[] {
    const binaries = new Set<string>()
    const add = (binary: string) => {
      const value = binary.trim()
      if (!value) return
      binaries.add(`Shell(${value})`)
    }
    const addCompanionBinaries = () => {
      add('node')
      add('esbuild')
      add('esbuild.exe')
      if (process.platform === 'win32') {
        add('cmd')
        add('cmd.exe')
      } else {
        add('sh')
        add('bash')
      }
    }
    const packageManagers = new Set(['npm', 'npx', 'pnpm', 'yarn', 'bun'])

    if (this.allowedCommandPrefixes.length === 0) {
      // With an empty command prefix list we keep command execution broadly available.
      add('npm')
      add('npx')
      add('pnpm')
      add('yarn')
      add('bun')
      add('git')
      addCompanionBinaries()
      return Array.from(binaries)
    }

    for (const prefix of this.allowedCommandPrefixes) {
      const parts = prefix.trim().split(/\s+/)
      const primary = parts[0]
      if (!primary) continue
      add(primary)
      if (packageManagers.has(primary.toLowerCase())) {
        addCompanionBinaries()
      }
    }

    return Array.from(binaries)
  }

  private extractApprovalPath(params: any): string | null {
    const direct =
      this.pickString(params, ['path', 'file', 'filename']) ??
      this.pickString(params?.path, ['path', 'file', 'filename']) ??
      this.pickString(params?.request, ['path', 'file', 'filename']) ??
      this.pickString(params?.request?.path, ['path', 'file', 'filename']) ??
      this.pickString(params?.action, ['path', 'file', 'filename']) ??
      this.pickString(params?.toolInput, ['path', 'file', 'filename']) ??
      this.pickString(params?.input, ['path', 'file', 'filename']) ??
      null
    if (direct) return direct
    if (typeof params?.path === 'string' && params.path.trim()) return params.path.trim()
    return null
  }

  private shouldAutoApprovePath(pathStr: string, mode: 'read' | 'write'): boolean {
    const list = mode === 'read' ? this.allowedAutoReadPrefixes : this.allowedAutoWritePrefixes
    const denied = mode === 'read' ? this.deniedAutoReadPrefixes : this.deniedAutoWritePrefixes
    if (list.length === 0 && denied.length === 0) return true
    
    const p = pathStr.trim().replace(/\\/g, '/')
    
    // Check denials first
    for (const prefix of denied) {
      if (p.startsWith(prefix)) return false
    }

    // Then check allows
    if (list.length === 0) return true // Default to allow if no explicit allows
    for (const prefix of list) {
      if (p.startsWith(prefix)) return true
    }
    
    return false
  }

  private normalizeAllowedCommandPrefixes(raw: unknown): string[] {
    if (!Array.isArray(raw)) return []
    const seen = new Set<string>()
    const result: string[] = []
    for (const item of raw) {
      if (typeof item !== 'string') continue
      const value = item.trim()
      if (!value) continue
      const key = value.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      result.push(value)
    }
    return result.slice(0, 64)
  }

  private shouldAutoApproveCommand(command: string | null): boolean {
    if (this.allowedCommandPrefixes.length === 0) return true
    if (!command) return false
    const normalizedCommand = command.trim().toLowerCase()
    return this.allowedCommandPrefixes.some((prefix) =>
      normalizedCommand.startsWith(prefix.toLowerCase()),
    )
  }

  private extractApprovalCommand(params: any): string | null {
    const direct =
      this.pickString(params, ['command', 'cmd']) ??
      this.pickString(params?.command, ['command', 'cmd', 'raw']) ??
      this.pickString(params?.request, ['command', 'cmd']) ??
      this.pickString(params?.request?.command, ['command', 'cmd', 'raw']) ??
      this.pickString(params?.action, ['command', 'cmd']) ??
      this.pickString(params?.toolInput, ['command', 'cmd']) ??
      this.pickString(params?.input, ['command', 'cmd']) ??
      null
    if (direct) return direct
    if (typeof params?.command === 'string' && params.command.trim()) return params.command.trim()
    if (typeof params?.cmd === 'string' && params.cmd.trim()) return params.cmd.trim()
    return null
  }

  private pickString(obj: any, keys: string[]): string | null {
    if (!obj || typeof obj !== 'object') return null
    for (const key of keys) {
      const value = obj?.[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
    return null
  }

  private shorten(value: string, maxLen: number) {
    if (value.length <= maxLen) return value
    return `${value.slice(0, maxLen)}...`
  }
}

