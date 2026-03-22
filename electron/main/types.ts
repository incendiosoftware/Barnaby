import type { CodexConnectOptions, FireHarnessCodexEvent } from './codexAppServerClient'
import type { GeminiClientEvent } from './geminiClient'
import type { ClaudeClientEvent } from './claudeClient'
import type { OpenRouterClientEvent } from './openRouterClient'
import type { OpenAIClientEvent } from './openaiClient'
import type { CodexAppServerClient } from './codexAppServerClient'
import type { GeminiClient } from './geminiClient'
import type { ClaudeClient } from './claudeClient'
import type { OpenRouterClient } from './openRouterClient'
import type { OpenAIClient } from './openaiClient'

export type WorkspaceTreeOptions = {
  includeHidden?: boolean
  includeNodeModules?: boolean
}

export type WorkspaceTreeNode = {
  name: string
  relativePath: string
  type: 'file' | 'directory'
  children?: WorkspaceTreeNode[]
}

export type GitStatusEntry = {
  relativePath: string
  indexStatus: string
  workingTreeStatus: string
  staged: boolean
  unstaged: boolean
  untracked: boolean
  renamedFrom?: string
}

export type GitStatusResult = {
  ok: boolean
  branch: string
  ahead: number
  behind: number
  stagedCount: number
  unstagedCount: number
  untrackedCount: number
  clean: boolean
  entries: GitStatusEntry[]
  checkedAt: number
  error?: string
}

export type WorkspaceLockToken = {
  version: 1
  app: 'Barnaby'
  instanceId: string
  pid: number
  hostname: string
  workspaceRoot: string
  acquiredAt: number
  heartbeatAt: number
}

export type WorkspaceLockAcquireResult =
  | {
    ok: true
    workspaceRoot: string
    lockFilePath: string
  }
  | {
    ok: false
    reason: 'invalid-workspace' | 'in-use' | 'error'
    message: string
    workspaceRoot: string
    lockFilePath: string
    owner?: Pick<WorkspaceLockToken, 'pid' | 'hostname' | 'acquiredAt' | 'heartbeatAt'> | null
  }

export type ConnectOptions = CodexConnectOptions & {
  provider?: 'codex' | 'claude' | 'gemini' | 'openrouter'
  modelConfig?: Record<string, string>
  interactionMode?: string
  initialHistory?: Array<{ role: 'user' | 'assistant'; text: string }>
}

export type WorkspaceConfigSettingsPayload = {
  path?: string
  defaultModel?: string
  permissionMode?: 'verify-first' | 'proceed-always'
  sandbox?: 'read-only' | 'workspace-write'
  workspaceContext?: string
  showWorkspaceContextInPrompt?: boolean
  systemPrompt?: string
  allowedCommandPrefixes?: string[]
  allowedAutoReadPrefixes?: string[]
  allowedAutoWritePrefixes?: string[]
  deniedAutoReadPrefixes?: string[]
  deniedAutoWritePrefixes?: string[]
  cursorAllowBuilds?: boolean
  promptShortcuts?: string[]
}

export type BarnabyWorkspaceFolder = {
  id: string
  path: string
  name?: string
  settings?: WorkspaceConfigSettingsPayload
}

export type BarnabyWorkspaceFile = {
  version: 1
  app: 'Barnaby'
  kind: 'workspace'
  savedAt: number
  activeFolderId?: string
  folders: BarnabyWorkspaceFolder[]
}

export type ContextMenuKind = 'input-selection' | 'chat-selection'

export type ViewMenuDockPanelId =
  | 'orchestrator'
  | 'workspace-folder'
  | 'workspace-settings'
  | 'application-settings'
  | 'source-control'
  | 'terminal'
  | 'debug-output'

export type ViewMenuDockState = Record<ViewMenuDockPanelId, boolean>

export type ProviderName = 'codex' | 'claude' | 'gemini' | 'openrouter'

export type ProviderConfigForAuth = {
  id: string
  type?: 'cli' | 'api'
  cliCommand?: string
  cliPath?: string
  authCheckCommand?: string
  loginCommand?: string
  upgradeCommand?: string
  upgradePackage?: string
  apiBaseUrl?: string
  loginUrl?: string
}

export type ProviderAuthStatus = {
  provider: string
  installed: boolean
  authenticated: boolean
  detail: string
  checkedAt: number
}

export type PersistedChatAttachment = {
  id: string
  path: string
  label: string
  mimeType?: string
}

export type PersistedChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  format?: 'text' | 'markdown'
  attachments?: PersistedChatAttachment[]
}

export type PersistedChatHistoryEntry = {
  id: string
  title: string
  savedAt: number
  workspaceRoot: string
  model: string
  permissionMode: 'verify-first' | 'proceed-always'
  sandbox: 'read-only' | 'workspace-write'
  fontScale: number
  messages: PersistedChatMessage[]
}

export type ModelsByProvider = {
  codex: Array<{ id: string; displayName: string }>
  claude: Array<{ id: string; displayName: string }>
  gemini: Array<{ id: string; displayName: string }>
  openrouter: Array<{ id: string; displayName: string }>
}

export type ToolDefinition = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type AgentClient = CodexAppServerClient | ClaudeClient | GeminiClient | OpenRouterClient | OpenAIClient
export type AgentEvent = FireHarnessCodexEvent | ClaudeClientEvent | GeminiClientEvent | OpenRouterClientEvent | OpenAIClientEvent

export type DiagnosticsPathTarget = 'userData' | 'storage' | 'chatHistory' | 'appState' | 'runtimeLog' | 'debugLog' | 'crashDumps'
export type DiagnosticsFileTarget = 'chatHistory' | 'appState' | 'runtimeLog'
