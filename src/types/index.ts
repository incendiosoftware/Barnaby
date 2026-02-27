/**
 * Shared types for the Barnaby app.
 */

export type Theme = 'light' | 'dark'

export type StandaloneTheme = {
  id: string
  name: string
  mode: Theme
  accent500: string
  accent600: string
  accent700: string
  accentText: string
  accentSoft: string
  accentSoftDark: string
  assistantBubbleBgLight: string
  assistantBubbleBgDark: string
  dark950: string
  dark900: string
  debugNotes: string
  activityUpdates: string
  reasoningUpdates: string
  operationTrace: string
  thinkingProgress: string
}

export type ChatRole = 'user' | 'assistant' | 'system'
export type MessageFormat = 'text' | 'markdown'
export type PastedImageAttachment = { id: string; path: string; label: string; mimeType?: string }
export type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  format?: MessageFormat
  attachments?: PastedImageAttachment[]
  createdAt?: number
}

export type PermissionMode = 'verify-first' | 'proceed-always'
export type SandboxMode = 'read-only' | 'workspace-write'
export type AgentInteractionMode = 'agent' | 'plan' | 'debug' | 'ask'

export type LayoutMode = 'vertical' | 'horizontal' | 'grid'
export type WorkspaceDockSide = 'left' | 'right'
export type CodeWindowTab = 'code' | 'settings'

export type DockPanelId =
  | 'orchestrator'
  | 'workspace-folder'
  | 'workspace-settings'
  | 'application-settings'
  | 'source-control'
  | 'terminal'
  | 'debug-output'

/** Dock zone IDs. Single zones: left, right, bottom. Split: left-top, left-bottom, right-top, right-bottom, bottom-left, bottom-right. */
export type DockZoneId =
  | 'left'
  | 'left-top'
  | 'left-bottom'
  | 'right'
  | 'right-top'
  | 'right-bottom'
  | 'bottom'
  | 'bottom-left'
  | 'bottom-right'

/** Drop target: which zone and optional split hint (top/bottom for side docks, left/right for bottom). */
export type DropTargetHint = 'center' | 'top' | 'bottom' | 'left' | 'right'

export type DockLayoutState = {
  /** Tab lists per zone. Empty array = zone hidden. Panels can move between zones. */
  zones: Partial<Record<DockZoneId, DockPanelId[]>>
  /** Active tab per zone. */
  activeTab: Partial<Record<DockZoneId, DockPanelId>>
  /** @deprecated Use zones. Kept for migration. */
  visible?: Record<DockPanelId, boolean>
  /** @deprecated Use zones. Kept for migration. */
  leftTopTab?: 'orchestrator'
  /** @deprecated Use zones. Kept for migration. */
  leftBottomTab?: 'workspace-folder' | 'workspace-settings'
  /** @deprecated Use zones. Kept for migration. */
  rightTab?: 'application-settings' | 'source-control'
  /** @deprecated Use zones. Kept for migration. */
  bottomTab?: 'terminal' | 'debug-output'
  leftBottomTabs?: [DockPanelId, DockPanelId]
  rightTabs?: [DockPanelId, DockPanelId]
  bottomTabs?: [DockPanelId, DockPanelId]
}

export type AgentPanelState = {
  id: string
  historyId: string
  title: string
  cwd: string
  provider: ModelProvider  // Immutable - locked at panel creation
  model: string
  interactionMode: AgentInteractionMode
  permissionMode: PermissionMode
  sandbox: SandboxMode
  status: string
  connected: boolean
  streaming: boolean
  messages: ChatMessage[]
  attachments: PastedImageAttachment[]
  input: string
  pendingInputs: string[]
  fontScale: number
  usage?: {
    kind?: string
    primary?: { usedPercent?: number; windowMinutes?: number; resetsAt?: number } | null
    secondary?: { usedPercent?: number; windowMinutes?: number; resetsAt?: number } | null
  }
}

export type WorkspaceSettings = {
  path: string
  defaultModel: string
  permissionMode: PermissionMode
  sandbox: SandboxMode
  allowedCommandPrefixes: string[]
  allowedAutoReadPrefixes: string[]
  allowedAutoWritePrefixes: string[]
  deniedAutoReadPrefixes: string[]
  deniedAutoWritePrefixes: string[]
}

export type WorkspaceSettingsTextDraft = {
  allowedCommandPrefixes: string
  allowedAutoReadPrefixes: string
  allowedAutoWritePrefixes: string
  deniedAutoReadPrefixes: string
  deniedAutoWritePrefixes: string
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

export type GitStatusState = {
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

export type GitOperation = 'commit' | 'push' | 'deploy' | 'build' | 'release'

export type EditorPanelState = {
  id: string
  workspaceRoot: string
  relativePath: string
  title: string
  fontScale: number
  content: string
  size: number
  loading: boolean
  saving: boolean
  dirty: boolean
  binary: boolean
  error?: string
  savedAt?: number
  editMode?: boolean
  diagnosticsTarget?: 'chatHistory' | 'appState' | 'runtimeLog'
  diagnosticsReadOnly?: boolean
}

export type ExplorerPrefs = {
  showHiddenFiles: boolean
  showNodeModules: boolean
}

export type ChatHistoryEntry = {
  id: string
  title: string
  savedAt: number
  workspaceRoot: string
  model: string
  permissionMode: PermissionMode
  sandbox: SandboxMode
  fontScale: number
  messages: ChatMessage[]
}

export type DiagnosticsMessageColors = {
  debugNotes: string
  activityUpdates: string
  reasoningUpdates: string
  operationTrace: string
  thinkingProgress: string
}

export type ApplicationSettings = {
  restoreSessionOnStartup: boolean
  themeId: string
  /** @deprecated Use fontChat. Kept for migration. */
  fontFamily?: string
  fontChat: string
  fontChatSize: number
  fontCode: string
  fontCodeSize: number
  fontThinking: string
  fontThinkingSize: number
  fontEditor: string
  fontEditorSize: number
  responseStyle: 'concise' | 'standard' | 'detailed'
  showDebugNotesInTimeline: boolean
  verboseDiagnostics: boolean
  showResponseDurationAfterPrompt: boolean
  editorWordWrap: boolean
  customiseStandardThemes: boolean
}

export type OrchestratorSettings = {
  orchestratorModel: string
  workerProvider: string
  workerModel: string
  maxParallelPanels: number
  maxTaskAttempts: number
}

export type PersistedEditorPanelState = {
  id?: unknown
  workspaceRoot?: unknown
  relativePath?: unknown
  title?: unknown
  fontScale?: unknown
  content?: unknown
  size?: unknown
  dirty?: unknown
  binary?: unknown
  error?: unknown
  savedAt?: unknown
  editMode?: unknown
}

export type PersistedAgentPanelState = {
  id?: unknown
  historyId?: unknown
  title?: unknown
  cwd?: unknown
  model?: unknown
  interactionMode?: unknown
  permissionMode?: unknown
  sandbox?: unknown
  status?: unknown
  messages?: unknown
  attachments?: unknown
  input?: unknown
  pendingInputs?: unknown
  fontScale?: unknown
}

export type PersistedAppState = {
  workspaceRoot?: unknown
  workspaceList?: unknown
  workspaceSnapshotsByRoot?: unknown
  layoutMode?: unknown
  showWorkspaceWindow?: unknown
  showGitWindow?: unknown
  showSettingsWindow?: unknown
  showCodeWindow?: unknown
  codeWindowTab?: unknown
  dockTab?: unknown
  workspaceDockSide?: unknown
  gitDockSide?: unknown
  settingsDockSide?: unknown
  activePanelId?: unknown
  focusedEditorId?: unknown
  selectedWorkspaceFile?: unknown
  expandedDirectories?: unknown
  panels?: unknown
  editorPanels?: unknown
  applicationSettings?: unknown
  themeOverrides?: unknown
}

export type WorkspaceUiSnapshot = {
  layoutMode: LayoutMode
  showWorkspaceWindow: boolean
  showGitWindow: boolean
  showSettingsWindow: boolean
  showCodeWindow: boolean
  codeWindowTab: CodeWindowTab
  dockTab: 'orchestrator' | 'explorer' | 'git' | 'settings'
  workspaceDockSide: WorkspaceDockSide
  gitDockSide: WorkspaceDockSide
  settingsDockSide: WorkspaceDockSide
  panels: AgentPanelState[]
  editorPanels: EditorPanelState[]
  activePanelId: string | null
  focusedEditorId: string | null
  selectedWorkspaceFile: string | null
  expandedDirectories: Record<string, boolean>
}

export type ParsedAppState = {
  workspaceRoot: string | null
  workspaceList: string[] | null
  workspaceSnapshotsByRoot: Record<string, WorkspaceUiSnapshot>
  panels: AgentPanelState[]
  editorPanels: EditorPanelState[]
  dockTab: 'orchestrator' | 'explorer' | 'git' | 'settings' | null
  layoutMode: LayoutMode | null
  workspaceDockSide: WorkspaceDockSide | null
  gitDockSide: WorkspaceDockSide | null
  settingsDockSide: WorkspaceDockSide | null
  codeWindowTab: CodeWindowTab | null
  selectedWorkspaceFile: string | null | undefined
  activePanelId: string | null
  focusedEditorId: string | null | undefined
  showWorkspaceWindow: boolean | undefined
  showGitWindow: boolean | undefined
  showSettingsWindow: boolean | undefined
  showCodeWindow: boolean | undefined
  expandedDirectories: Record<string, boolean> | undefined
  applicationSettings: ApplicationSettings | undefined
  themeOverrides: ThemeOverrides | undefined
}

export type PanelActivityState = {
  lastEventAt: number
  lastEventLabel: string
  totalEvents: number
  recent?: ActivityFeedItem[]
}

export type PanelDebugEntry = {
  id: string
  at: number
  stage: string
  detail: string
}

export type ActivityKind = 'approval' | 'command' | 'reasoning' | 'event' | 'operation'
export type ActivityFeedItem = {
  id: string
  label: string
  detail?: string
  kind: ActivityKind
  at: number
  count: number
}

export type ModelProvider = 'codex' | 'claude' | 'gemini' | 'openrouter'
export type ConnectivityProvider = 'codex' | 'claude' | 'gemini' | 'openrouter'

export type ModelInterface = {
  id: string
  displayName: string
  provider: ModelProvider
  enabled: boolean
  config?: Record<string, string>
}

export type ModelConfig = {
  interfaces: ModelInterface[]
}

export type AvailableCatalogModels = {
  codex: { id: string; displayName: string }[]
  claude: { id: string; displayName: string }[]
  gemini: { id: string; displayName: string }[]
  openrouter: { id: string; displayName: string }[]
}

export type AppSettingsView = 'connectivity' | 'models' | 'preferences' | 'agents' | 'orchestrator' | 'mcp-servers' | 'diagnostics'

export type ModelCatalogRefreshStatus = {
  kind: 'success' | 'error'
  message: string
}

export type ProviderConfigCli = {
  id: string
  displayName: string
  enabled: boolean
  type: 'cli'
  cliCommand: string
  authCheckCommand?: string
  loginCommand?: string
  upgradeCommand?: string
  upgradePackage?: string
  cliPath?: string
  isBuiltIn?: boolean
}

export type ProviderConfigApi = {
  id: string
  displayName: string
  enabled: boolean
  type: 'api'
  apiBaseUrl: string
  loginUrl?: string
  isBuiltIn?: boolean
}

export type ProviderConfig = ProviderConfigCli | ProviderConfigApi
export type CustomProviderConfig = Omit<ProviderConfigCli, 'isBuiltIn'>
export type ConnectivityMode = 'cli' | 'api'

export type ProviderRegistry = {
  overrides: Record<
    string,
    {
      displayName?: string
      enabled?: boolean
      cliPath?: string
      apiBaseUrl?: string
      primary?: ConnectivityMode
      fallbackEnabled?: boolean
      fallback?: ConnectivityMode
    }
  >
  customProviders: CustomProviderConfig[]
}

export type ProviderAuthStatus = {
  provider: string
  installed: boolean
  authenticated: boolean
  detail: string
  checkedAt: number
}

export type WorkspaceLockOwner = {
  pid: number
  hostname: string
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
      owner?: WorkspaceLockOwner | null
    }

export type WorkspaceApplyFailure =
  | {
      kind: 'request-error'
      message: string
    }
  | {
      kind: 'lock-denied'
      result: WorkspaceLockAcquireResult
    }

export type ThemeEditableField =
  | 'accent500'
  | 'accent600'
  | 'accent700'
  | 'accentText'
  | 'accentSoft'
  | 'accentSoftDark'
  | 'assistantBubbleBgLight'
  | 'assistantBubbleBgDark'
  | 'dark950'
  | 'dark900'
  | 'debugNotes'
  | 'activityUpdates'
  | 'reasoningUpdates'
  | 'operationTrace'
  | 'thinkingProgress'

export type ThemeOverrideValues = Partial<Record<ThemeEditableField, string>>
export type ThemeOverrides = Record<string, ThemeOverrideValues>
