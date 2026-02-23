import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Group, Panel, Separator } from 'react-resizable-panels'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { buildTimelineForPanel } from './chat/timelineParser'
import type { TimelineUnit } from './chat/timelineTypes'
import { EmbeddedTerminal } from './components/Terminal'
import { CodeMirrorEditor } from './components/CodeMirrorEditor'
import { registerPluginHostCallbacks, unregisterPluginHostCallbacks } from './pluginHostRenderer'

type Theme = 'light' | 'dark'

type StandaloneTheme = {
  id: string
  name: string
  mode: Theme
  accent500: string
  accent600: string
  accent700: string
  accentText: string
  accentSoft: string
  accentSoftDark: string
  dark950: string
  dark900: string
  debugNotes: string
  activityUpdates: string
  reasoningUpdates: string
  operationTrace: string
  thinkingProgress: string
}
type ChatRole = 'user' | 'assistant' | 'system'
type MessageFormat = 'text' | 'markdown'
type PastedImageAttachment = { id: string; path: string; label: string; mimeType?: string }
type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  format?: MessageFormat
  attachments?: PastedImageAttachment[]
  createdAt?: number
}
type PermissionMode = 'verify-first' | 'proceed-always'
type SandboxMode = 'read-only' | 'workspace-write'
type AgentInteractionMode = 'agent' | 'plan' | 'debug' | 'ask'

type LayoutMode = 'vertical' | 'horizontal' | 'grid'
type WorkspaceDockSide = 'left' | 'right'
type CodeWindowTab = 'code' | 'settings'

type AgentPanelState = {
  id: string
  historyId: string
  title: string
  cwd: string
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

type WorkspaceSettings = {
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

type WorkspaceSettingsTextDraft = {
  allowedCommandPrefixes: string
  allowedAutoReadPrefixes: string
  allowedAutoWritePrefixes: string
  deniedAutoReadPrefixes: string
  deniedAutoWritePrefixes: string
}

type WorkspaceTreeNode = {
  name: string
  relativePath: string
  type: 'file' | 'directory'
  children?: WorkspaceTreeNode[]
}

type GitStatusEntry = {
  relativePath: string
  indexStatus: string
  workingTreeStatus: string
  staged: boolean
  unstaged: boolean
  untracked: boolean
  renamedFrom?: string
}

type GitStatusState = {
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

type GitOperation = 'commit' | 'push' | 'deploy' | 'build' | 'release'

type EditorPanelState = {
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

type ExplorerPrefs = {
  showHiddenFiles: boolean
  showNodeModules: boolean
}

type ChatHistoryEntry = {
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

type DiagnosticsMessageColors = {
  debugNotes: string
  activityUpdates: string
  reasoningUpdates: string
  operationTrace: string
  thinkingProgress: string
}

type ApplicationSettings = {
  restoreSessionOnStartup: boolean
  themeId: string
  responseStyle: 'concise' | 'standard' | 'detailed'
  showDebugNotesInTimeline: boolean
  verboseDiagnostics: boolean
  showResponseDurationAfterPrompt: boolean
  editorWordWrap: boolean
}

type OrchestratorSettings = {
  orchestratorModel: string
  workerProvider: string
  workerModel: string
  maxParallelPanels: number
  maxTaskAttempts: number
}


type PersistedEditorPanelState = {
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

type PersistedAgentPanelState = {
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

type PersistedAppState = {
  workspaceRoot?: unknown
  workspaceList?: unknown
  workspaceSnapshotsByRoot?: unknown
  layoutMode?: unknown
  showWorkspaceWindow?: unknown
  showCodeWindow?: unknown
  codeWindowTab?: unknown
  dockTab?: unknown
  workspaceDockSide?: unknown
  activePanelId?: unknown
  focusedEditorId?: unknown
  selectedWorkspaceFile?: unknown
  expandedDirectories?: unknown
  panels?: unknown
  editorPanels?: unknown
}

type ParsedAppState = {
  workspaceRoot: string | null
  workspaceList: string[] | null
  workspaceSnapshotsByRoot: Record<string, WorkspaceUiSnapshot>
  panels: AgentPanelState[]
  editorPanels: EditorPanelState[]
  dockTab: 'orchestrator' | 'explorer' | 'git' | 'settings' | null
  layoutMode: LayoutMode | null
  workspaceDockSide: WorkspaceDockSide | null
  codeWindowTab: CodeWindowTab | null
  selectedWorkspaceFile: string | null | undefined
  activePanelId: string | null
  focusedEditorId: string | null | undefined
  showWorkspaceWindow: boolean | undefined
  showCodeWindow: boolean | undefined
  expandedDirectories: Record<string, boolean> | undefined
}

type WorkspaceUiSnapshot = {
  layoutMode: LayoutMode
  showWorkspaceWindow: boolean
  showCodeWindow: boolean
  codeWindowTab: CodeWindowTab
  dockTab: 'orchestrator' | 'explorer' | 'git' | 'settings'
  workspaceDockSide: WorkspaceDockSide
  panels: AgentPanelState[]
  editorPanels: EditorPanelState[]
  activePanelId: string | null
  focusedEditorId: string | null
  selectedWorkspaceFile: string | null
  expandedDirectories: Record<string, boolean>
}

type PanelActivityState = {
  lastEventAt: number
  lastEventLabel: string
  totalEvents: number
  recent?: ActivityFeedItem[]
}

type PanelDebugEntry = {
  id: string
  at: number
  stage: string
  detail: string
}

type ActivityKind = 'approval' | 'command' | 'reasoning' | 'event' | 'operation'
type ActivityFeedItem = {
  id: string
  label: string
  detail?: string
  kind: ActivityKind
  at: number
  count: number
}

const DEFAULT_MODEL = 'gpt-5.3-codex'
const MODEL_BANNER_PREFIX = 'Model: '
const AUTO_CONTINUE_PROMPT = 'Please continue from where you left off. Complete the task fully.'
const STARTUP_LOCKED_WORKSPACE_PROMPT =
  'The workspace being opened is locked by another Barnaby. Select another workspace or try again.'
const ALL_WORKSPACES_LOCKED_PROMPT =
  'No workspace is available right now. Another Barnaby instance is already using each saved workspace.'

function isLockedWorkspacePrompt(prompt: string | null): boolean {
  return prompt === STARTUP_LOCKED_WORKSPACE_PROMPT || prompt === ALL_WORKSPACES_LOCKED_PROMPT
}

type ModelProvider = 'codex' | 'claude' | 'gemini' | 'openrouter'
type ConnectivityProvider = 'codex' | 'claude' | 'gemini' | 'openrouter'

type ModelInterface = {
  id: string
  displayName: string
  provider: ModelProvider
  enabled: boolean
  config?: Record<string, string>
}

type ModelConfig = {
  interfaces: ModelInterface[]
}

type AvailableCatalogModels = {
  codex: { id: string; displayName: string }[]
  claude: { id: string; displayName: string }[]
  gemini: { id: string; displayName: string }[]
  openrouter: { id: string; displayName: string }[]
}

type AppSettingsView = 'connectivity' | 'models' | 'preferences' | 'agents' | 'orchestrator' | 'diagnostics'

type ModelCatalogRefreshStatus = {
  kind: 'success' | 'error'
  message: string
}

type ProviderConfigCli = {
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

type ProviderConfigApi = {
  id: string
  displayName: string
  enabled: boolean
  type: 'api'
  apiBaseUrl: string
  loginUrl?: string
  isBuiltIn?: boolean
}

type ProviderConfig = ProviderConfigCli | ProviderConfigApi

type CustomProviderConfig = Omit<ProviderConfigCli, 'isBuiltIn'>

type ConnectivityMode = 'cli' | 'api'

type ProviderRegistry = {
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

const PROVIDERS_WITH_DUAL_MODE: ConnectivityProvider[] = ['gemini', 'claude', 'codex']
const PROVIDERS_CLI_ONLY: ConnectivityProvider[] = []
const PROVIDERS_API_ONLY: ConnectivityProvider[] = ['openrouter']

const API_CONFIG_BY_PROVIDER: Record<string, { apiBaseUrl: string; loginUrl: string }> = {
  codex: { apiBaseUrl: 'https://api.openai.com/v1', loginUrl: 'https://platform.openai.com/api-keys' },
  claude: { apiBaseUrl: 'https://api.anthropic.com/v1', loginUrl: 'https://console.anthropic.com/' },
  gemini: { apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta', loginUrl: 'https://aistudio.google.com/' },
}

/** URLs for viewing subscription limits and purchasing credits */
const PROVIDER_SUBSCRIPTION_URLS: Record<string, string> = {
  codex: 'https://platform.openai.com/account/usage',
  claude: 'https://claude.ai',
  gemini: 'https://aistudio.google.com/',
  openrouter: 'https://openrouter.ai/credits',
}

type ProviderAuthStatus = {
  provider: string
  installed: boolean
  authenticated: boolean
  detail: string
  checkedAt: number
}

type WorkspaceLockOwner = {
  pid: number
  hostname: string
  acquiredAt: number
  heartbeatAt: number
}

type WorkspaceLockAcquireResult =
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

type WorkspaceApplyFailure =
  | {
      kind: 'request-error'
      message: string
    }
  | {
      kind: 'lock-denied'
      result: WorkspaceLockAcquireResult
    }

const CODEX_API_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo']

const DEFAULT_MODEL_INTERFACES: ModelInterface[] = [
  { id: 'gpt-5.3-codex', displayName: 'GPT 5.3', provider: 'codex', enabled: true },
  { id: 'gpt-5.2-codex', displayName: 'GPT 5.2', provider: 'codex', enabled: true },
  { id: 'gpt-5.1-codex', displayName: 'GPT 5.1', provider: 'codex', enabled: true },
  { id: 'sonnet', displayName: 'Claude Sonnet', provider: 'claude', enabled: true },
  { id: 'opus', displayName: 'Claude Opus', provider: 'claude', enabled: true },
  { id: 'claude-opus-4-6', displayName: 'Claude Opus 4.6', provider: 'claude', enabled: true },
  { id: 'haiku', displayName: 'Claude Haiku', provider: 'claude', enabled: true },
  { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', provider: 'gemini', enabled: true },
  { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', provider: 'gemini', enabled: true },
  { id: 'gemini-3-pro-preview', displayName: 'Gemini 3 Pro (Preview)', provider: 'gemini', enabled: true },
  { id: 'openrouter/auto', displayName: 'OpenRouter Auto', provider: 'openrouter', enabled: true },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', displayName: 'Llama 3.3 70B (Free)', provider: 'openrouter', enabled: true },
  { id: 'gpt-4o', displayName: 'GPT-4o', provider: 'codex', enabled: true },
  { id: 'gpt-4o-mini', displayName: 'GPT-4o Mini', provider: 'codex', enabled: true },
  { id: 'gpt-4-turbo', displayName: 'GPT-4 Turbo', provider: 'codex', enabled: true },
]

const MAX_PANELS = 5
const MAX_EDITOR_PANELS = 20
const MAX_EDITOR_FILE_SIZE_BYTES = 2 * 1024 * 1024
const MAX_AUTO_CONTINUE = 3
const MODAL_BACKDROP_CLASS = 'fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] flex items-center justify-center p-4'
const MODAL_CARD_CLASS = 'rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white/95 dark:bg-neutral-950 shadow-2xl'
const UI_BUTTON_SECONDARY_CLASS = 'px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
const UI_BUTTON_PRIMARY_CLASS = 'px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-500'
const UI_ICON_BUTTON_CLASS = 'h-9 w-9 inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 shadow-sm text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
const UI_CLOSE_ICON_BUTTON_CLASS = 'h-7 w-9 inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700'
const UI_TOOLBAR_ICON_BUTTON_CLASS = 'h-7 w-7 inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
const CODE_WINDOW_TOOLBAR_BUTTON = 'h-7 w-7 inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-700 dark:border-neutral-700/80 dark:bg-transparent dark:hover:bg-neutral-800/80 dark:text-neutral-300'
const CODE_WINDOW_TOOLBAR_BUTTON_SM = 'h-7 w-9 inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700/80 dark:bg-transparent dark:hover:bg-neutral-800/80 dark:text-neutral-300'
const UI_INPUT_CLASS = 'px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400'
const UI_SELECT_CLASS = 'px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100'
const PANEL_INTERACTION_MODES: AgentInteractionMode[] = ['agent', 'plan', 'debug', 'ask']
const STATUS_SYMBOL_ICON_CLASS = 'h-[15px] w-[15px] text-neutral-600 dark:text-neutral-300'
const CONNECTIVITY_PROVIDERS: ConnectivityProvider[] = ['codex', 'claude', 'gemini', 'openrouter']
const APP_SETTINGS_VIEWS: AppSettingsView[] = ['connectivity', 'models', 'preferences', 'agents', 'orchestrator', 'diagnostics']
const PANEL_COMPLETION_NOTICE_MS = 15000
const ONGOING_WORK_LABELS = new Set([
  'Task step complete',
  'Running command',
  'Command finished',
  'Edited file',
  'Reasoning update',
  'Reasoning step',
  'Scanning workspace',
  'Approval requested',
  'Thinking',
  'Read file',
  'Searched workspace',
  'Updated code',
  'Ran command',
])
const DEFAULT_DIAGNOSTICS_MESSAGE_COLORS: DiagnosticsMessageColors = {
  debugNotes: '#b91c1c',
  activityUpdates: '#b45309',
  reasoningUpdates: '#047857',
  operationTrace: '#1e3a8a',
  thinkingProgress: '#737373',
}
const DEFAULT_DIAGNOSTICS_VISIBILITY = {
  showActivityUpdates: false,
  showReasoningUpdates: false,
  showOperationTrace: true,
  showThinkingProgress: true,
}

const DEFAULT_BUILTIN_PROVIDER_CONFIGS: Record<ConnectivityProvider, ProviderConfig> = {
  codex: {
    id: 'codex',
    displayName: 'OpenAI',
    enabled: true,
    type: 'cli',
    cliCommand: 'codex',
    authCheckCommand: 'login status',
    loginCommand: 'codex login',
    upgradeCommand: 'npm update -g @openai/codex',
    upgradePackage: '@openai/codex',
    isBuiltIn: true,
  },
  claude: {
    id: 'claude',
    displayName: 'Claude',
    enabled: true,
    type: 'cli',
    cliCommand: 'claude',
    authCheckCommand: '--version',
    loginCommand: 'claude',
    upgradeCommand: 'npm update -g @anthropic-ai/claude-code',
    upgradePackage: '@anthropic-ai/claude-code',
    isBuiltIn: true,
  },
  gemini: {
    id: 'gemini',
    displayName: 'Gemini',
    enabled: true,
    type: 'cli',
    cliCommand: 'gemini',
    authCheckCommand: '--version',
    loginCommand: 'gemini',
    upgradeCommand: 'npm update -g @google/gemini-cli',
    upgradePackage: '@google/gemini-cli',
    isBuiltIn: true,
  },
  openrouter: {
    id: 'openrouter',
    displayName: 'OpenRouter',
    enabled: true,
    type: 'api',
    apiBaseUrl: 'https://openrouter.ai/api/v1',
    loginUrl: 'https://openrouter.ai/keys',
    isBuiltIn: true,
  },
}

function syncModelConfigWithCatalog(
  prev: ModelConfig,
  available: AvailableCatalogModels,
  providerRegistry: ProviderRegistry,
): ModelConfig {
  const enabledProviders = new Set<ModelProvider>(
    resolveProviderConfigs(providerRegistry)
      .filter(
        (config): config is ProviderConfig & { id: ConnectivityProvider } =>
          Boolean(config.enabled) && CONNECTIVITY_PROVIDERS.includes(config.id as ConnectivityProvider),
      )
      .map((config) => config.id as ModelProvider),
  )
  // Codex is the app's default model family; keep it available for stability
  // even if setup/connectivity toggles were changed unexpectedly.
  enabledProviders.add('codex')
  const defaultModelsByProvider: Record<ModelProvider, { id: string; displayName: string }[]> = {
    codex: DEFAULT_MODEL_INTERFACES.filter((m) => m.provider === 'codex').map(({ id, displayName }) => ({ id, displayName })),
    claude: DEFAULT_MODEL_INTERFACES.filter((m) => m.provider === 'claude').map(({ id, displayName }) => ({ id, displayName })),
    gemini: DEFAULT_MODEL_INTERFACES.filter((m) => m.provider === 'gemini').map(({ id, displayName }) => ({ id, displayName })),
    openrouter: DEFAULT_MODEL_INTERFACES.filter((m) => m.provider === 'openrouter').map(({ id, displayName }) => ({ id, displayName })),
  }
  const catalogModelsByProvider: Record<ModelProvider, { id: string; displayName: string }[]> = {
    codex: [...(available.codex ?? []), ...defaultModelsByProvider.codex],
    claude: [...(available.claude ?? []), ...defaultModelsByProvider.claude],
    gemini: [...(available.gemini ?? []), ...defaultModelsByProvider.gemini],
    openrouter: [...(available.openrouter ?? []), ...defaultModelsByProvider.openrouter],
  }
  const keptById = new Map<string, ModelInterface>()
  for (const model of prev.interfaces) {
    if (!enabledProviders.has(model.provider)) continue
    const id = String(model.id ?? '').trim()
    if (!id) continue
    const normalized: ModelInterface = {
      ...model,
      id,
      // Show raw model IDs to avoid ambiguous friendly aliases.
      displayName: id,
    }
    const existing = keptById.get(id)
    if (!existing) {
      keptById.set(id, normalized)
      continue
    }
    // If duplicates exist, keep whichever entry is enabled.
    if (!existing.enabled && normalized.enabled) keptById.set(id, normalized)
  }
  const nextInterfaces = [...keptById.values()]
  const existingIds = new Set(nextInterfaces.map((m) => m.id))
  for (const provider of CONNECTIVITY_PROVIDERS) {
    if (!enabledProviders.has(provider)) continue
    for (const model of catalogModelsByProvider[provider]) {
      const id = String(model.id ?? '').trim()
      if (!id || existingIds.has(id)) continue
      nextInterfaces.push({ id, displayName: id, provider, enabled: true })
      existingIds.add(id)
    }
  }
  return { interfaces: nextInterfaces }
}

function renderSandboxSymbol(mode: SandboxMode) {
  if (mode === 'read-only') {
    return (
      <svg className={STATUS_SYMBOL_ICON_CLASS} viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="4.1" y="7.1" width="7.8" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.1" />
        <path d="M5.9 7.1V5.5C5.9 4.34 6.84 3.4 8 3.4C9.16 3.4 10.1 4.34 10.1 5.5V7.1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M8 9.3V10.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg className={STATUS_SYMBOL_ICON_CLASS} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 4.8H6L7.2 6H14V12.8H2V4.8Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M2 6H14" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  )
}

function renderPermissionSymbol(mode: PermissionMode) {
  if (mode === 'verify-first') {
    return (
      <svg className={STATUS_SYMBOL_ICON_CLASS} viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="6.8" cy="6.8" r="3.5" stroke="currentColor" strokeWidth="1.1" />
        <path d="M5.4 6.8L6.5 7.9L8.4 6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9.6 9.6L13.2 13.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg className={STATUS_SYMBOL_ICON_CLASS} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.8" stroke="currentColor" strokeWidth="1.1" />
      <path d="M5.4 8H10.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M8.8 6.4L10.6 8L8.8 9.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function renderInteractionModeSymbol(mode: AgentInteractionMode) {
  if (mode === 'agent') {
    return (
      <svg className={STATUS_SYMBOL_ICON_CLASS} viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="3.1" y="4.5" width="9.8" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.1" />
        <path d="M8 2.8V4.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <circle cx="5.9" cy="8.2" r="0.7" fill="currentColor" />
        <circle cx="10.1" cy="8.2" r="0.7" fill="currentColor" />
        <path d="M6.1 10H9.9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    )
  }
  if (mode === 'plan') {
    return (
      <svg className={STATUS_SYMBOL_ICON_CLASS} viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="2.5" y="3.2" width="8.8" height="10.3" rx="1.3" stroke="currentColor" strokeWidth="1.1" />
        <path d="M4.5 6H9.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M4.5 8.4H8.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M9.8 10.8L12.9 7.7L14.3 9.1L11.2 12.2L9.4 12.6L9.8 10.8Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      </svg>
    )
  }
  if (mode === 'debug') {
    return (
      <svg className={STATUS_SYMBOL_ICON_CLASS} viewBox="0 0 16 16" fill="none" aria-hidden>
        <ellipse cx="8" cy="8.5" rx="3" ry="3.3" stroke="currentColor" strokeWidth="1.1" />
        <path d="M8 3.1V5.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M5.1 6.6L3.2 5.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M10.9 6.6L12.8 5.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M5 10.1L3.1 11.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M11 10.1L12.9 11.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg className={STATUS_SYMBOL_ICON_CLASS} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.8" stroke="currentColor" strokeWidth="1.1" />
      <path d="M6.8 6.2C6.8 5.54 7.34 5 8 5C8.66 5 9.2 5.54 9.2 6.2C9.2 6.72 8.88 7.03 8.42 7.4C7.94 7.78 7.6 8.13 7.6 8.8V9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="8" cy="11.2" r="0.8" fill="currentColor" />
    </svg>
  )
}

const INTERACTION_MODE_META: Record<AgentInteractionMode, { label: string; promptPrefix: string; hint: string }> = {
  agent: {
    label: 'Agent',
    promptPrefix: '',
    hint: 'Default mode: implement directly.',
  },
  plan: {
    label: 'Plan',
    promptPrefix:
      'Mode: Plan. Explore and design the implementation first. Focus on options, trade-offs, and concrete steps before making code changes.',
    hint: 'Plan-first with trade-offs.',
  },
  debug: {
    label: 'Debug',
    promptPrefix:
      'Mode: Debug. Investigate systematically. Prioritize root-cause analysis, evidence, and verification steps before proposing fixes.',
    hint: 'Root-cause and evidence.',
  },
  ask: {
    label: 'Ask',
    promptPrefix:
      'Mode: Ask. Answer in read-only guidance mode. Explain clearly and avoid code changes unless explicitly requested.',
    hint: 'Read-only Q&A guidance.',
  },
}

function looksIncomplete(content: string): boolean {
  const t = content.trim().toLowerCase()
  if (!t) return false
  const incompletePhrases = [
    'i\'m about to',
    "i'm about to",
    'about to edit',
    'about to implement',
    'i have a concrete',
    'i\'ll ',
    "i'll ",
    'let me ',
    'i will ',
    'implementing now',
    'implementing the',
    'now and edit',
  ]
  for (const p of incompletePhrases) {
    if (t.includes(p)) return true
  }
  if (t.endsWith('...')) return true
  return false
}

const THINKING_MAX_CHARS = 180

function isLikelyThinkingUpdate(content: string): boolean {
  const text = content.trim()
  if (!text) return false
  if (text.length > THINKING_MAX_CHARS) return false
  if (text.includes('```')) return false
  if (/^#{1,6}\s/m.test(text)) return false
  const paragraphCount = (text.match(/\n\s*\n/g) || []).length + 1
  if (paragraphCount >= 2) return false
  const lower = text.toLowerCase().replace(/\s+/g, ' ')
  const markers = [
    "i'll ",
    'i will ',
    "i'm ",
    'i am ',
    'let me ',
    'next i',
    'now i',
    'working on',
    'checking',
    'verifying',
    'reviewing',
    'searching',
    'scanning',
    'applying',
    'updating',
    'editing',
    'running',
    'testing',
    'implementing',
    'i found ',
    'i located ',
    'i patched ',
    'i fixed ',
    'i am checking ',
    "i'm checking ",
  ]
  if (markers.some((m) => lower.includes(m))) return true

  if (
    /^i\s/.test(lower) &&
    /\b(checking|verifying|reviewing|scanning|searching|looking|working|patching|editing|updating|running|testing|implementing|applying|fixing|changing|replacing|adding|removing|wiring)\b/.test(lower)
  ) {
    return true
  }

  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (
    lines.length >= 2 &&
    /\b(i|i'm|i am|i'll|i will)\b/.test(lower) &&
    /\b(next|then|now)\b/.test(lower)
  ) {
    return true
  }

  return false
}

function stripSyntheticAutoContinueMessages(messages: ChatMessage[]): ChatMessage[] {
  const filtered = messages.filter((message) => {
    if (message.role !== 'user') return true
    if ((message.attachments?.length ?? 0) > 0) return true
    return message.content.trim() !== AUTO_CONTINUE_PROMPT
  })
  return filtered.length === messages.length ? messages : filtered
}

function filterMessagesForPresentation(
  messages: ChatMessage[],
  responseStyle: 'concise' | 'standard' | 'detailed',
): ChatMessage[] {
  const visibleMessages = stripSyntheticAutoContinueMessages(messages)
  if (responseStyle === 'detailed') return visibleMessages
  if (responseStyle === 'concise') {
    return visibleMessages.filter((m) => !(m.role === 'assistant' && isLikelyThinkingUpdate(m.content)))
  }
  const next: ChatMessage[] = []
  for (let i = 0; i < visibleMessages.length; i += 1) {
    const current = visibleMessages[i]
    const isThinking = current.role === 'assistant' && isLikelyThinkingUpdate(current.content)
    if (!isThinking) {
      next.push(current)
      continue
    }

    // Group consecutive thinking updates and keep only the latest one
    // when there is no final assistant response in the same turn.
    let endOfThinkingRun = i
    while (
      endOfThinkingRun + 1 < visibleMessages.length &&
      visibleMessages[endOfThinkingRun + 1].role === 'assistant' &&
      isLikelyThinkingUpdate(visibleMessages[endOfThinkingRun + 1].content)
    ) {
      endOfThinkingRun += 1
    }

    let turnBoundary = endOfThinkingRun + 1
    while (turnBoundary < visibleMessages.length && visibleMessages[turnBoundary].role !== 'user') {
      turnBoundary += 1
    }
    const hasFinalAssistantInTurn = visibleMessages
      .slice(endOfThinkingRun + 1, turnBoundary)
      .some((m) => m.role === 'assistant' && !isLikelyThinkingUpdate(m.content))

    if (!hasFinalAssistantInTurn) {
      const latestThinking = visibleMessages[endOfThinkingRun]
      const prev = next[next.length - 1]
      const isDuplicate =
        prev &&
        prev.role === 'assistant' &&
        isLikelyThinkingUpdate(prev.content) &&
        prev.content.trim() === latestThinking.content.trim()
      if (!isDuplicate) {
        next.push(latestThinking)
      }
    }
    i = endOfThinkingRun
  }
  return next
}
const WORKSPACE_STORAGE_KEY = 'agentorchestrator.workspaceRoot'
const WORKSPACE_LIST_STORAGE_KEY = 'agentorchestrator.workspaceList'
const WORKSPACE_SETTINGS_STORAGE_KEY = 'agentorchestrator.workspaceSettings'
const WORKSPACE_DOCK_SIDE_STORAGE_KEY = 'agentorchestrator.workspaceDockSide'
const MODEL_CONFIG_STORAGE_KEY = 'agentorchestrator.modelConfig'
const PROVIDER_REGISTRY_STORAGE_KEY = 'agentorchestrator.providerRegistry'
const SETUP_WIZARD_DONE_STORAGE_KEY = 'agentorchestrator.setupWizardDone'
const EXPLORER_PREFS_STORAGE_KEY = 'agentorchestrator.explorerPrefsByWorkspace'
const CHAT_HISTORY_STORAGE_KEY = 'agentorchestrator.chatHistory'
const APP_SETTINGS_STORAGE_KEY = 'agentorchestrator.appSettings'
const ORCHESTRATOR_SETTINGS_STORAGE_KEY = 'agentorchestrator.orchestratorSettings'
const MIN_FONT_SCALE = 0.75
const MAX_FONT_SCALE = 1.5
const FONT_SCALE_STEP = 0.05
const INPUT_MAX_HEIGHT_PX = 220
const DEFAULT_EXPLORER_PREFS: ExplorerPrefs = { showHiddenFiles: false, showNodeModules: false }
const CONNECT_TIMEOUT_MS = 30000
const TURN_START_TIMEOUT_MS = 300000
const STALL_WATCHDOG_MS = 360000
const COLLAPSIBLE_CODE_MIN_LINES = 14

function looksLikeDiff(code: string): boolean {
  const lines = code.split('\n')
  let plusCount = 0
  let minusCount = 0
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) plusCount++
    else if (line.startsWith('-') && !line.startsWith('---')) minusCount++
  }
  return plusCount + minusCount >= 3 && plusCount > 0 && minusCount > 0
}
const MAX_CHAT_HISTORY_ENTRIES = 80
const DEFAULT_GPT_CONTEXT_TOKENS = 200_000
const CONTEXT_OUTPUT_RESERVE_RATIO = 0.2
const CONTEXT_MIN_OUTPUT_RESERVE_TOKENS = 4_096
const CONTEXT_MAX_OUTPUT_RESERVE_TOKENS = 32_768
const TOKEN_ESTIMATE_CHARS_PER_TOKEN = 4
const TOKEN_ESTIMATE_WORDS_MULTIPLIER = 1.35
const TOKEN_ESTIMATE_MESSAGE_OVERHEAD = 8
const TOKEN_ESTIMATE_IMAGE_ATTACHMENT_TOKENS = 850
const TOKEN_ESTIMATE_THREAD_OVERHEAD_TOKENS = 700
const APP_STATE_AUTOSAVE_MS = 800
const DEFAULT_THEME_ID = 'default-dark'
const THEME_ID_STORAGE_KEY = 'agentorchestrator.themeId'
const THEME_OVERRIDES_STORAGE_KEY = 'agentorchestrator.themeOverrides'

/** Default workspace safety policy values for fresh workspaces. */
const DEFAULT_WORKSPACE_ALLOWED_COMMAND_PREFIXES = [
  'npm run build:dist:raw',
  'npx vite build',
]
const DEFAULT_WORKSPACE_ALLOWED_AUTO_READ_PREFIXES = [
  'src/',
  'package.json',
]
const DEFAULT_WORKSPACE_ALLOWED_AUTO_WRITE_PREFIXES = [
  'src/',
  'package.json',
]
const DEFAULT_WORKSPACE_DENIED_AUTO_READ_PREFIXES = [
  '../',
  '.env',
]
const DEFAULT_WORKSPACE_DENIED_AUTO_WRITE_PREFIXES = [
  '../',
  '.env',
]

type BaseStandaloneTheme = Omit<StandaloneTheme, keyof DiagnosticsMessageColors>

const BASE_THEMES: BaseStandaloneTheme[] = [
  { id: 'default-light', name: 'Default Light', mode: 'light', accent500: '#3b82f6', accent600: '#2563eb', accent700: '#1d4ed8', accentText: '#dbeafe', accentSoft: '#eff6ff', accentSoftDark: 'rgba(30,58,138,0.28)', dark950: '#0a0a0a', dark900: '#171717' },
  { id: 'default-dark', name: 'Default Dark', mode: 'dark', accent500: '#88c0d0', accent600: '#5e81ac', accent700: '#4c6a91', accentText: '#d8e9f0', accentSoft: '#e5f2f7', accentSoftDark: 'rgba(94,129,172,0.28)', dark950: '#383838', dark900: '#454545' },
  { id: 'obsidian-black', name: 'Obsidian Black', mode: 'dark', accent500: '#7c3aed', accent600: '#6d28d9', accent700: '#5b21b6', accentText: '#ddd6fe', accentSoft: '#ede9fe', accentSoftDark: 'rgba(124,58,237,0.24)', dark950: '#000000', dark900: '#0a0a0a' },
  { id: 'dracula', name: 'Dracula', mode: 'dark', accent500: '#bd93f9', accent600: '#a87ef5', accent700: '#8f62ea', accentText: '#f3e8ff', accentSoft: '#f5f3ff', accentSoftDark: 'rgba(189,147,249,0.25)', dark950: '#191a21', dark900: '#232533' },
  { id: 'nord-light', name: 'Nord Light', mode: 'light', accent500: '#88c0d0', accent600: '#5e81ac', accent700: '#4c6a91', accentText: '#d8e9f0', accentSoft: '#e5f2f7', accentSoftDark: 'rgba(94,129,172,0.28)', dark950: '#2e3440', dark900: '#3b4252' },
  { id: 'nord-dark', name: 'Nord Dark', mode: 'dark', accent500: '#88c0d0', accent600: '#5e81ac', accent700: '#4c6a91', accentText: '#d8e9f0', accentSoft: '#e5f2f7', accentSoftDark: 'rgba(94,129,172,0.28)', dark950: '#2e3440', dark900: '#3b4252' },
  { id: 'solarized-light', name: 'Solarized Light', mode: 'light', accent500: '#2aa198', accent600: '#268e87', accent700: '#1f7a74', accentText: '#d1fae5', accentSoft: '#dcfce7', accentSoftDark: 'rgba(42,161,152,0.26)', dark950: '#002b36', dark900: '#073642' },
  { id: 'solarized-dark', name: 'Solarized Dark', mode: 'dark', accent500: '#2aa198', accent600: '#268e87', accent700: '#1f7a74', accentText: '#d1fae5', accentSoft: '#dcfce7', accentSoftDark: 'rgba(42,161,152,0.26)', dark950: '#002b36', dark900: '#073642' },
  { id: 'gruvbox-light', name: 'Gruvbox Light', mode: 'light', accent500: '#d79921', accent600: '#b57614', accent700: '#9a5f10', accentText: '#fef3c7', accentSoft: '#fffbeb', accentSoftDark: 'rgba(215,153,33,0.26)', dark950: '#1d2021', dark900: '#282828' },
  { id: 'gruvbox-dark', name: 'Gruvbox Dark', mode: 'dark', accent500: '#d79921', accent600: '#b57614', accent700: '#9a5f10', accentText: '#fef3c7', accentSoft: '#fffbeb', accentSoftDark: 'rgba(215,153,33,0.26)', dark950: '#1d2021', dark900: '#282828' },
  { id: 'tokyo-night-light', name: 'Tokyo Night Light', mode: 'light', accent500: '#0db9d7', accent600: '#0aa2c0', accent700: '#0889a3', accentText: '#cceef3', accentSoft: '#e0f7fa', accentSoftDark: 'rgba(13,185,215,0.22)', dark950: '#1a1b26', dark900: '#24283b' },
  { id: 'tokyo-night-dark', name: 'Tokyo Night Dark', mode: 'dark', accent500: '#7aa2f7', accent600: '#5f88e8', accent700: '#4c74d0', accentText: '#dbeafe', accentSoft: '#eff6ff', accentSoftDark: 'rgba(122,162,247,0.26)', dark950: '#1a1b26', dark900: '#24283b' },
  { id: 'catppuccin-mocha', name: 'Catppuccin Mocha', mode: 'dark', accent500: '#cba6f7', accent600: '#b68cf0', accent700: '#9f73e3', accentText: '#f5e8ff', accentSoft: '#faf5ff', accentSoftDark: 'rgba(203,166,247,0.26)', dark950: '#1e1e2e', dark900: '#313244' },
  { id: 'github-dark', name: 'GitHub Dark', mode: 'dark', accent500: '#58a6ff', accent600: '#3b82d6', accent700: '#2f6fb8', accentText: '#dbeafe', accentSoft: '#eff6ff', accentSoftDark: 'rgba(88,166,255,0.26)', dark950: '#0d1117', dark900: '#161b22' },
  { id: 'monokai', name: 'Monokai', mode: 'dark', accent500: '#a6e22e', accent600: '#84cc16', accent700: '#65a30d', accentText: '#ecfccb', accentSoft: '#f7fee7', accentSoftDark: 'rgba(166,226,46,0.22)', dark950: '#1f1f1f', dark900: '#272822' },
  { id: 'one-dark', name: 'One Dark', mode: 'dark', accent500: '#61afef', accent600: '#3d8fd9', accent700: '#2f75ba', accentText: '#dbeafe', accentSoft: '#eff6ff', accentSoftDark: 'rgba(97,175,239,0.26)', dark950: '#1e2127', dark900: '#282c34' },
  { id: 'ayu-mirage', name: 'Ayu Mirage', mode: 'dark', accent500: '#ffb454', accent600: '#f59e0b', accent700: '#d97706', accentText: '#ffedd5', accentSoft: '#fff7ed', accentSoftDark: 'rgba(255,180,84,0.24)', dark950: '#1f2430', dark900: '#242936' },
  { id: 'material-ocean', name: 'Material Ocean', mode: 'dark', accent500: '#82aaff', accent600: '#5d8bef', accent700: '#4a74d1', accentText: '#dbeafe', accentSoft: '#eff6ff', accentSoftDark: 'rgba(130,170,255,0.26)', dark950: '#0f111a', dark900: '#1a1c25' },
  { id: 'synthwave-84', name: 'Synthwave 84', mode: 'dark', accent500: '#ff7edb', accent600: '#ec4899', accent700: '#be185d', accentText: '#fce7f3', accentSoft: '#fdf2f8', accentSoftDark: 'rgba(255,126,219,0.26)', dark950: '#241b2f', dark900: '#2b213a' },
]

const THEMES: StandaloneTheme[] = BASE_THEMES.map((theme) => ({
  ...theme,
  ...DEFAULT_DIAGNOSTICS_MESSAGE_COLORS,
}))

type ThemeEditableField =
  | 'accent500'
  | 'accent600'
  | 'accent700'
  | 'accentText'
  | 'accentSoft'
  | 'accentSoftDark'
  | 'dark950'
  | 'dark900'
  | 'debugNotes'
  | 'activityUpdates'
  | 'reasoningUpdates'
  | 'operationTrace'
  | 'thinkingProgress'

type ThemeOverrideValues = Partial<Record<ThemeEditableField, string>>
type ThemeOverrides = Record<string, ThemeOverrideValues>

const THEME_EDITABLE_FIELDS: Array<{ key: ThemeEditableField; label: string; group?: string }> = [
  { key: 'accent500', label: 'Primary hover & links (buttons, borders, focus ring)', group: 'Primary / interactive' },
  { key: 'accent600', label: 'Primary button solid & focus border', group: 'Primary / interactive' },
  { key: 'accent700', label: 'Text on primary (light mode)', group: 'Primary / interactive' },
  { key: 'accentText', label: 'Text on primary (dark mode)', group: 'Primary / interactive' },
  { key: 'accentSoft', label: 'Primary tint background (light mode, e.g. user bubbles)', group: 'Primary / interactive' },
  { key: 'accentSoftDark', label: 'Primary tint background (dark mode)', group: 'Primary / interactive' },
  { key: 'dark950', label: 'Darkest surface (main dark bg, scrollbar track)', group: 'Dark surfaces' },
  { key: 'dark900', label: 'Dark surface (panels, borders, scrollbar)', group: 'Dark surfaces' },
  { key: 'debugNotes', label: 'Debug notes', group: 'Diagnostics' },
  { key: 'activityUpdates', label: 'Activity updates', group: 'Diagnostics' },
  { key: 'reasoningUpdates', label: 'Reasoning updates', group: 'Diagnostics' },
  { key: 'operationTrace', label: 'Operation trace', group: 'Diagnostics' },
  { key: 'thinkingProgress', label: 'Thinking progress', group: 'Diagnostics' },
]

function applyThemeOverrides(overrides: ThemeOverrides): StandaloneTheme[] {
  return THEMES.map((theme) => {
    const override = overrides[theme.id]
    if (!override) return theme
    const next: StandaloneTheme = { ...theme }
    for (const field of THEME_EDITABLE_FIELDS) {
      const value = override[field.key]
      if (typeof value === 'string' && value.trim()) next[field.key] = value.trim()
    }
    return next
  })
}

function sanitizeThemeOverrides(raw: unknown): ThemeOverrides {
  if (!raw || typeof raw !== 'object') return {}
  const knownIds = new Set(THEMES.map((theme) => theme.id))
  const source = raw as Record<string, unknown>
  const result: ThemeOverrides = {}
  for (const [themeId, overrideValue] of Object.entries(source)) {
    if (!knownIds.has(themeId)) continue
    if (!overrideValue || typeof overrideValue !== 'object') continue
    const override = overrideValue as Record<string, unknown>
    const nextOverride: ThemeOverrideValues = {}
    for (const field of THEME_EDITABLE_FIELDS) {
      const value = override[field.key]
      if (typeof value === 'string' && value.trim()) nextOverride[field.key] = value.trim()
    }
    if (Object.keys(nextOverride).length > 0) result[themeId] = nextOverride
  }
  return result
}

function getInitialThemeOverrides(): ThemeOverrides {
  try {
    const raw = globalThis.localStorage?.getItem(THEME_OVERRIDES_STORAGE_KEY)
    if (!raw) return {}
    return sanitizeThemeOverrides(JSON.parse(raw))
  } catch {
    return {}
  }
}

function cloneTheme(theme: StandaloneTheme): StandaloneTheme {
  return { ...theme }
}

function extractHexColor(value: string): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const shortHex = raw.match(/^#([0-9a-fA-F]{3})$/)
  if (shortHex) {
    const [r, g, b] = shortHex[1].split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  const fullHex = raw.match(/^#([0-9a-fA-F]{6})$/)
  if (fullHex) return `#${fullHex[1].toLowerCase()}`
  const rgb = raw.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+\s*)?\)$/i)
  if (!rgb) return null
  const [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function getNextFontScale(current: number, deltaY: number) {
  const direction = deltaY < 0 ? 1 : -1
  return Math.max(MIN_FONT_SCALE, Math.min(MAX_FONT_SCALE, Number((current + direction * FONT_SCALE_STEP).toFixed(2))))
}

function isZoomWheelGesture(e: { ctrlKey: boolean; metaKey: boolean }) {
  return e.ctrlKey || e.metaKey
}

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function fileNameFromRelativePath(relativePath: string) {
  const parts = relativePath.split('/')
  return parts[parts.length - 1] || relativePath
}

function toLocalFileUrl(filePath: string) {
  const normalized = String(filePath ?? '').replace(/\\/g, '/')
  if (!normalized) return ''
  if (/^file:\/\//i.test(normalized)) return normalized
  if (normalized.startsWith('//')) return `file:${encodeURI(normalized)}`
  if (/^[a-zA-Z]:\//.test(normalized)) return `file:///${encodeURI(normalized)}`
  if (normalized.startsWith('/')) return `file://${encodeURI(normalized)}`
  return encodeURI(normalized)
}

function normalizeWorkspacePathForCompare(value: string) {
  return value.trim().replace(/\//g, '\\').toLowerCase()
}

function decodeUriComponentSafe(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function stripLinkQueryAndHash(value: string) {
  const q = value.indexOf('?')
  const h = value.indexOf('#')
  const end = Math.min(q >= 0 ? q : Number.POSITIVE_INFINITY, h >= 0 ? h : Number.POSITIVE_INFINITY)
  return Number.isFinite(end) ? value.slice(0, end) : value
}

function stripFileLineAndColumnSuffix(pathLike: string) {
  const m = pathLike.match(/^(.*?)(?::\d+)(?::\d+)?$/)
  return m?.[1] ? m[1] : pathLike
}

function normalizeWorkspaceRelativePath(pathLike: string): string | null {
  const normalized = pathLike
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\.\/+/, '')
    .trim()
  if (!normalized || normalized.startsWith('/')) return null
  const segments = normalized.split('/').filter(Boolean)
  if (segments.length === 0) return null
  if (segments.some((segment) => segment === '.' || segment === '..')) return null
  return segments.join('/')
}

function toWorkspaceRelativePathIfInsideRoot(workspaceRoot: string, absolutePath: string): string | null {
  const root = workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '')
  if (!root) return null
  let target = absolutePath.replace(/\\/g, '/')
  if (/^\/[a-zA-Z]:\//.test(target)) target = target.slice(1)
  const rootCompare = root.toLowerCase()
  const targetCompare = target.toLowerCase()
  if (targetCompare === rootCompare) return null
  if (!targetCompare.startsWith(`${rootCompare}/`)) return null
  return normalizeWorkspaceRelativePath(target.slice(root.length + 1))
}

function resolveWorkspaceRelativePathFromChatHref(workspaceRoot: string, href: string): string | null {
  const rawHref = String(href ?? '').trim()
  if (!workspaceRoot || !rawHref || rawHref.startsWith('#')) return null

  const withoutQueryOrHash = stripLinkQueryAndHash(rawHref)
  if (!withoutQueryOrHash) return null
  const decoded = decodeUriComponentSafe(stripFileLineAndColumnSuffix(withoutQueryOrHash)).replace(/\\/g, '/')
  if (!decoded) return null

  if (/^file:\/\//i.test(decoded)) {
    try {
      const parsed = new URL(decoded)
      let filePath = decodeUriComponentSafe(parsed.pathname || '')
      if (parsed.host) filePath = `//${parsed.host}${filePath}`
      return toWorkspaceRelativePathIfInsideRoot(workspaceRoot, filePath)
    } catch {
      return null
    }
  }

  const isWindowsAbsolute = /^[a-zA-Z]:\//.test(decoded)
  const hasUriScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(decoded)
  if (hasUriScheme && !isWindowsAbsolute) return null
  if (isWindowsAbsolute || decoded.startsWith('/')) {
    return toWorkspaceRelativePathIfInsideRoot(workspaceRoot, decoded)
  }
  return normalizeWorkspaceRelativePath(decoded)
}

const LEGACY_PRESET_TO_THEME_ID: Record<string, { light: string; dark: string }> = {
  default: { light: 'default-light', dark: 'default-dark' },
  'obsidian-black': { light: 'default-light', dark: 'obsidian-black' },
  dracula: { light: 'default-light', dark: 'dracula' },
  nord: { light: 'nord-light', dark: 'nord-dark' },
  'solarized-dark': { light: 'solarized-light', dark: 'solarized-dark' },
  'gruvbox-dark': { light: 'gruvbox-light', dark: 'gruvbox-dark' },
  'tokyo-night': { light: 'tokyo-night-light', dark: 'tokyo-night-dark' },
  'catppuccin-mocha': { light: 'default-light', dark: 'catppuccin-mocha' },
  'github-dark': { light: 'default-light', dark: 'github-dark' },
  monokai: { light: 'default-light', dark: 'monokai' },
  'one-dark': { light: 'default-light', dark: 'one-dark' },
  'ayu-mirage': { light: 'default-light', dark: 'ayu-mirage' },
  'material-ocean': { light: 'default-light', dark: 'material-ocean' },
  'synthwave-84': { light: 'default-light', dark: 'synthwave-84' },
}

function getInitialThemeId(): string {
  const stored = globalThis.localStorage?.getItem(THEME_ID_STORAGE_KEY) ?? ''
  if (THEMES.some((t) => t.id === stored)) return stored
  const legacyTheme = (globalThis.localStorage?.getItem('agentorchestrator.theme') ?? '').toLowerCase()
  let legacyPreset: string | null = null
  try {
    const app = globalThis.localStorage?.getItem(APP_SETTINGS_STORAGE_KEY)
    if (app) {
      const p = JSON.parse(app) as { themePresetId?: string }
      legacyPreset = p?.themePresetId ?? null
    }
  } catch {
    /* ignore */
  }
  const mapping = legacyPreset && LEGACY_PRESET_TO_THEME_ID[legacyPreset]
  if (mapping) {
    const id = legacyTheme === 'light' ? mapping.light : mapping.dark
    if (THEMES.some((t) => t.id === id)) return id
  }
  if (legacyPreset && THEMES.some((t) => t.id === legacyPreset)) return legacyPreset
  if (legacyTheme === 'light') return 'default-light'
  return DEFAULT_THEME_ID
}

function getInitialWorkspaceRoot() {
  return (globalThis.localStorage?.getItem(WORKSPACE_STORAGE_KEY) ?? '').trim()
}

function getInitialSetupWizardDone() {
  return (globalThis.localStorage?.getItem(SETUP_WIZARD_DONE_STORAGE_KEY) ?? '') === '1'
}

function getDefaultSetupWizardSelection(): Record<ConnectivityProvider, boolean> {
  return {
    codex: true,
    claude: false,
    gemini: false,
    openrouter: false,
  }
}

function getInitialWorkspaceDockSide(): WorkspaceDockSide {
  const stored = (globalThis.localStorage?.getItem(WORKSPACE_DOCK_SIDE_STORAGE_KEY) ?? '').toLowerCase()
  return stored === 'right' ? 'right' : 'left'
}

function getInitialModelConfig(): ModelConfig {
  try {
    const stored = globalThis.localStorage?.getItem(MODEL_CONFIG_STORAGE_KEY)
    if (!stored) return { interfaces: DEFAULT_MODEL_INTERFACES }
    const parsed = JSON.parse(stored) as ModelConfig
    if (!parsed?.interfaces?.length) return { interfaces: DEFAULT_MODEL_INTERFACES }
    return parsed
  } catch {
    return { interfaces: DEFAULT_MODEL_INTERFACES }
  }
}

function getInitialProviderRegistry(): ProviderRegistry {
  try {
    const stored = globalThis.localStorage?.getItem(PROVIDER_REGISTRY_STORAGE_KEY)
    if (!stored) return { overrides: {}, customProviders: [] }
    const parsed = JSON.parse(stored) as ProviderRegistry
    if (!parsed || typeof parsed !== 'object') return { overrides: {}, customProviders: [] }
    return {
      overrides: parsed.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {},
      customProviders: Array.isArray(parsed.customProviders) ? parsed.customProviders : [],
    }
  } catch {
    return { overrides: {}, customProviders: [] }
  }
}

function resolveProviderConfigs(registry: ProviderRegistry): ProviderConfig[] {
  const result: ProviderConfig[] = []
  for (const id of CONNECTIVITY_PROVIDERS) {
    const builtIn = DEFAULT_BUILTIN_PROVIDER_CONFIGS[id]
    const override = registry.overrides[id]
    if (builtIn.type === 'cli') {
      result.push({
        ...builtIn,
        ...(override && {
          displayName: override.displayName ?? builtIn.displayName,
          enabled: override.enabled ?? builtIn.enabled,
          cliPath: override.cliPath,
        }),
      })
    } else {
      result.push({
        ...builtIn,
        ...(override && {
          displayName: override.displayName ?? builtIn.displayName,
          enabled: override.enabled ?? builtIn.enabled,
          apiBaseUrl: override.apiBaseUrl ?? builtIn.apiBaseUrl,
        }),
      })
    }
  }
  for (const custom of registry.customProviders) {
    result.push({ ...custom, isBuiltIn: false })
  }
  return result
}

function getInitialWorkspaceList(): string[] {
  const root = getInitialWorkspaceRoot()
  try {
    const stored = globalThis.localStorage?.getItem(WORKSPACE_LIST_STORAGE_KEY)
    if (!stored) return root ? [root] : []
    const list = JSON.parse(stored) as string[]
    if (!Array.isArray(list)) return root ? [root] : []
    const deduped = [...new Set([root, ...list])]
    return deduped.filter(Boolean)
  } catch {
    return root ? [root] : []
  }
}

function cloneChatMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    ...m,
    attachments: m.attachments ? m.attachments.map((a) => ({ ...a })) : undefined,
  }))
}

const INITIAL_HISTORY_MAX_MESSAGES = 24

function panelMessagesToInitialHistory(
  messages: ChatMessage[],
  maxMessages = INITIAL_HISTORY_MAX_MESSAGES,
): Array<{ role: 'user' | 'assistant'; text: string }> {
  const trimmed = messages.slice(-maxMessages)
  return trimmed
    .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, text: (m.content ?? '').trim() }))
    .filter((m) => m.text.length > 0)
}

function parseHistoryMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return []
  const next: ChatMessage[] = []
  for (const message of raw) {
    if (!message || typeof message !== 'object') continue
    const record = message as Partial<ChatMessage>
    const role: ChatRole =
      record.role === 'user' || record.role === 'assistant' || record.role === 'system'
        ? record.role
        : 'system'
    const format: MessageFormat | undefined =
      record.format === 'text' || record.format === 'markdown' ? record.format : undefined
    const attachments = Array.isArray(record.attachments)
      ? record.attachments
        .filter((x): x is PastedImageAttachment => Boolean(x && typeof x === 'object'))
        .map((x) => ({
          id: typeof x.id === 'string' && x.id ? x.id : newId(),
          path: typeof x.path === 'string' ? x.path : '',
          label: typeof x.label === 'string' ? x.label : 'attachment',
          mimeType: typeof x.mimeType === 'string' ? x.mimeType : undefined,
        }))
        .filter((x) => Boolean(x.path))
      : undefined

    next.push({
      id: typeof record.id === 'string' && record.id ? record.id : newId(),
      role,
      content: typeof record.content === 'string' ? record.content : '',
      format,
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
      createdAt: typeof record.createdAt === 'number' && Number.isFinite(record.createdAt) ? record.createdAt : undefined,
    })
  }
  return stripSyntheticAutoContinueMessages(next)
}

function parseChatHistoryEntries(raw: unknown, fallbackWorkspaceRoot: string): ChatHistoryEntry[] {
  if (!Array.isArray(raw)) return []
  const entries: ChatHistoryEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Partial<ChatHistoryEntry>
    const messages = parseHistoryMessages(record.messages)
    if (messages.length === 0) continue
    const title = typeof record.title === 'string' && record.title.trim() ? record.title.trim() : 'Untitled chat'
    const savedAt = typeof record.savedAt === 'number' ? record.savedAt : Date.now()
    const sandbox: SandboxMode =
      record.sandbox === 'read-only' || record.sandbox === 'workspace-write'
        ? record.sandbox
        : 'workspace-write'
    const permissionMode: PermissionMode = record.permissionMode === 'proceed-always' ? 'proceed-always' : 'verify-first'
    entries.push({
      id: typeof record.id === 'string' && record.id ? record.id : newId(),
      title,
      savedAt,
      workspaceRoot:
        typeof record.workspaceRoot === 'string' && record.workspaceRoot ? record.workspaceRoot : fallbackWorkspaceRoot,
      model: typeof record.model === 'string' && record.model ? record.model : DEFAULT_MODEL,
      permissionMode,
      sandbox,
      fontScale: typeof record.fontScale === 'number' ? Math.max(MIN_FONT_SCALE, Math.min(MAX_FONT_SCALE, record.fontScale)) : 1,
      messages,
    })
  }
  return entries
}

function getInitialChatHistory(): ChatHistoryEntry[] {
  try {
    const raw = globalThis.localStorage?.getItem(CHAT_HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return parseChatHistoryEntries(parsed, getInitialWorkspaceRoot())
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, MAX_CHAT_HISTORY_ENTRIES)
  } catch {
    return []
  }
}


function getInitialApplicationSettings(): ApplicationSettings {
  const defaults: ApplicationSettings = {
    restoreSessionOnStartup: true,
    themeId: DEFAULT_THEME_ID,
    responseStyle: 'standard',
    showDebugNotesInTimeline: false,
    verboseDiagnostics: false,
    showResponseDurationAfterPrompt: false,
    editorWordWrap: true,
  }
  try {
    const raw = globalThis.localStorage?.getItem(APP_SETTINGS_STORAGE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<ApplicationSettings>
    return {
      restoreSessionOnStartup:
        typeof parsed?.restoreSessionOnStartup === 'boolean' ? parsed.restoreSessionOnStartup : true,
      themeId: (() => {
        if (typeof parsed?.themeId === 'string' && THEMES.some((t) => t.id === parsed.themeId)) return parsed.themeId
        return getInitialThemeId()
      })(),
      responseStyle:
        parsed?.responseStyle === 'concise' || parsed?.responseStyle === 'standard' || parsed?.responseStyle === 'detailed'
          ? parsed.responseStyle
          : 'standard',
      showDebugNotesInTimeline: Boolean(parsed?.showDebugNotesInTimeline),
      verboseDiagnostics: Boolean(parsed?.verboseDiagnostics),
      showResponseDurationAfterPrompt: Boolean(parsed?.showResponseDurationAfterPrompt),
      editorWordWrap: typeof parsed?.editorWordWrap === 'boolean' ? parsed.editorWordWrap : true,
    }
  } catch {
    return defaults
  }
}

function mergeChatHistoryEntries(primary: ChatHistoryEntry[], secondary: ChatHistoryEntry[]): ChatHistoryEntry[] {
  const byId = new Map<string, ChatHistoryEntry>()
  for (const entry of [...primary, ...secondary]) {
    if (byId.has(entry.id)) continue
    byId.set(entry.id, entry)
  }
  return Array.from(byId.values())
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_CHAT_HISTORY_ENTRIES)
}

function parsePanelAttachments(raw: unknown): PastedImageAttachment[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is PastedImageAttachment => Boolean(x && typeof x === 'object'))
    .map((x) => ({
      id: typeof x.id === 'string' && x.id ? x.id : newId(),
      path: typeof x.path === 'string' ? x.path : '',
      label: typeof x.label === 'string' && x.label ? x.label : 'attachment',
      mimeType: typeof x.mimeType === 'string' && x.mimeType ? x.mimeType : undefined,
    }))
    .filter((x) => Boolean(x.path))
}

function clampFontScale(value: unknown, fallback = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(MIN_FONT_SCALE, Math.min(MAX_FONT_SCALE, value))
}

function parseInteractionMode(value: unknown): AgentInteractionMode {
  return value === 'plan' || value === 'debug' || value === 'ask' ? value : 'agent'
}

function normalizeAllowedCommandPrefixes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const next: string[] = []
  for (const value of raw) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    next.push(trimmed)
  }
  return next.slice(0, 64)
}

function parseAllowedCommandPrefixesInput(raw: string): string[] {
  return raw.split(/\r?\n/g)
}

function workspaceSettingsToTextDraft(settings: WorkspaceSettings): WorkspaceSettingsTextDraft {
  return {
    allowedCommandPrefixes: settings.allowedCommandPrefixes.join('\n'),
    allowedAutoReadPrefixes: settings.allowedAutoReadPrefixes.join('\n'),
    allowedAutoWritePrefixes: settings.allowedAutoWritePrefixes.join('\n'),
    deniedAutoReadPrefixes: settings.deniedAutoReadPrefixes.join('\n'),
    deniedAutoWritePrefixes: settings.deniedAutoWritePrefixes.join('\n'),
  }
}

function applyWorkspaceTextDraftField(
  form: WorkspaceSettings,
  field: keyof WorkspaceSettingsTextDraft,
  raw: string,
): WorkspaceSettings {
  const parsed = parseAllowedCommandPrefixesInput(raw)
  if (field === 'allowedCommandPrefixes') {
    return { ...form, allowedCommandPrefixes: parsed }
  }
  if (field === 'allowedAutoReadPrefixes') {
    return { ...form, allowedAutoReadPrefixes: parsed }
  }
  if (field === 'allowedAutoWritePrefixes') {
    return { ...form, allowedAutoWritePrefixes: parsed }
  }
  if (field === 'deniedAutoReadPrefixes') {
    return { ...form, deniedAutoReadPrefixes: parsed }
  }
  return { ...form, deniedAutoWritePrefixes: parsed }
}

function parsePersistedAgentPanel(raw: unknown, fallbackWorkspaceRoot: string): AgentPanelState | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as PersistedAgentPanelState
  const messages = parseHistoryMessages(rec.messages)
  if (messages.length === 0) return null
  const id = typeof rec.id === 'string' && rec.id ? rec.id : newId()
  const title = typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim() : `Agent ${id.slice(-4)}`
  const permissionMode: PermissionMode = rec.permissionMode === 'proceed-always' ? 'proceed-always' : 'verify-first'
  const sandbox: SandboxMode =
    rec.sandbox === 'read-only' || rec.sandbox === 'workspace-write'
      ? rec.sandbox
      : 'workspace-write'
  const cwd =
    typeof rec.cwd === 'string' && rec.cwd.trim()
      ? rec.cwd
      : fallbackWorkspaceRoot || ''
  return {
    id,
    historyId: typeof rec.historyId === 'string' && rec.historyId ? rec.historyId : newId(),
    title,
    cwd,
    model: typeof rec.model === 'string' && rec.model ? rec.model : DEFAULT_MODEL,
    interactionMode: parseInteractionMode(rec.interactionMode),
    permissionMode,
    sandbox,
    status: typeof rec.status === 'string' && rec.status.trim() ? rec.status.trim() : 'Restored from previous session.',
    connected: false,
    streaming: false,
    messages,
    attachments: parsePanelAttachments(rec.attachments),
    input: typeof rec.input === 'string' ? rec.input : '',
    pendingInputs: Array.isArray(rec.pendingInputs) ? rec.pendingInputs.filter((x): x is string => typeof x === 'string') : [],
    fontScale: clampFontScale(rec.fontScale),
    usage: undefined,
  }
}

function parsePersistedEditorPanel(raw: unknown, fallbackWorkspaceRoot: string): EditorPanelState | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as PersistedEditorPanelState
  const relativePath = typeof rec.relativePath === 'string' && rec.relativePath ? rec.relativePath : ''
  if (!relativePath) return null
  const content = typeof rec.content === 'string' ? rec.content : ''
  return {
    id: typeof rec.id === 'string' && rec.id ? rec.id : `editor-${newId()}`,
    workspaceRoot:
      typeof rec.workspaceRoot === 'string' && rec.workspaceRoot.trim()
        ? rec.workspaceRoot
        : fallbackWorkspaceRoot || '',
    relativePath,
    title: typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim() : fileNameFromRelativePath(relativePath),
    fontScale: clampFontScale(rec.fontScale),
    content,
    size: typeof rec.size === 'number' && Number.isFinite(rec.size) ? Math.max(0, rec.size) : content.length,
    loading: false,
    saving: false,
    dirty: Boolean(rec.dirty),
    binary: Boolean(rec.binary),
    error: typeof rec.error === 'string' && rec.error ? rec.error : undefined,
    savedAt: typeof rec.savedAt === 'number' && Number.isFinite(rec.savedAt) ? rec.savedAt : undefined,
    editMode: rec.editMode === undefined ? true : Boolean(rec.editMode),
  }
}

function parsePersistedAppState(raw: unknown, fallbackWorkspaceRoot: string): ParsedAppState | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as PersistedAppState
  const workspaceRoot =
    typeof rec.workspaceRoot === 'string' && rec.workspaceRoot.trim()
      ? rec.workspaceRoot.trim()
      : null
  const workspaceList = Array.isArray(rec.workspaceList)
    ? rec.workspaceList
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((x) => x.trim())
    : null
  const workspaceSnapshotsByRoot: ParsedAppState['workspaceSnapshotsByRoot'] = {}
  if (rec.workspaceSnapshotsByRoot && typeof rec.workspaceSnapshotsByRoot === 'object') {
    const snapshotsRecord = rec.workspaceSnapshotsByRoot as Record<string, unknown>
    for (const [workspacePath, snapshotRaw] of Object.entries(snapshotsRecord)) {
      if (!workspacePath || typeof workspacePath !== 'string') continue
      if (!snapshotRaw || typeof snapshotRaw !== 'object') continue
      const snapshot = snapshotRaw as Partial<WorkspaceUiSnapshot>
      const parsedPanels = Array.isArray(snapshot.panels)
        ? snapshot.panels
            .map((panel) => parsePersistedAgentPanel(panel, workspacePath))
            .filter((panel): panel is AgentPanelState => Boolean(panel))
        : []
      const parsedEditors = Array.isArray(snapshot.editorPanels)
        ? snapshot.editorPanels
            .map((panel) => parsePersistedEditorPanel(panel, workspacePath))
            .filter((panel): panel is EditorPanelState => Boolean(panel))
        : []
      workspaceSnapshotsByRoot[workspacePath] = {
        layoutMode:
          snapshot.layoutMode === 'vertical' || snapshot.layoutMode === 'horizontal' || snapshot.layoutMode === 'grid'
            ? snapshot.layoutMode
            : 'vertical',
        showWorkspaceWindow: typeof snapshot.showWorkspaceWindow === 'boolean' ? snapshot.showWorkspaceWindow : true,
        showCodeWindow: typeof snapshot.showCodeWindow === 'boolean' ? snapshot.showCodeWindow : true,
        codeWindowTab: snapshot.codeWindowTab === 'code' || snapshot.codeWindowTab === 'settings' ? snapshot.codeWindowTab : 'code',
        dockTab:
          snapshot.dockTab === 'orchestrator' || snapshot.dockTab === 'explorer' || snapshot.dockTab === 'git' || snapshot.dockTab === 'settings'
            ? snapshot.dockTab
            : 'explorer',
        workspaceDockSide: snapshot.workspaceDockSide === 'left' || snapshot.workspaceDockSide === 'right' ? snapshot.workspaceDockSide : 'right',
        panels: parsedPanels,
        editorPanels: parsedEditors,
        activePanelId: typeof snapshot.activePanelId === 'string' ? snapshot.activePanelId : null,
        focusedEditorId: typeof snapshot.focusedEditorId === 'string' ? snapshot.focusedEditorId : null,
        selectedWorkspaceFile: typeof snapshot.selectedWorkspaceFile === 'string' ? snapshot.selectedWorkspaceFile : null,
        expandedDirectories:
          snapshot.expandedDirectories && typeof snapshot.expandedDirectories === 'object'
            ? Object.fromEntries(
                Object.entries(snapshot.expandedDirectories as Record<string, unknown>).filter(
                  ([k, v]) => typeof k === 'string' && typeof v === 'boolean',
                ),
              ) as Record<string, boolean>
            : {},
      }
    }
  }
  const panels = Array.isArray(rec.panels)
    ? rec.panels
      .map((item) => parsePersistedAgentPanel(item, fallbackWorkspaceRoot))
      .filter((x): x is AgentPanelState => Boolean(x))
      .slice(0, MAX_PANELS)
    : []
  const editorPanels = Array.isArray(rec.editorPanels)
    ? rec.editorPanels
      .map((item) => parsePersistedEditorPanel(item, fallbackWorkspaceRoot))
      .filter((x): x is EditorPanelState => Boolean(x))
    : []
  const dockTab: ParsedAppState['dockTab'] =
    rec.dockTab === 'orchestrator' || rec.dockTab === 'explorer' || rec.dockTab === 'git' || rec.dockTab === 'settings'
      ? rec.dockTab
      : null
  const codeWindowTab: ParsedAppState['codeWindowTab'] =
    rec.codeWindowTab === 'code' || rec.codeWindowTab === 'settings'
      ? rec.codeWindowTab
      : null
  const layoutMode: ParsedAppState['layoutMode'] =
    rec.layoutMode === 'vertical' || rec.layoutMode === 'horizontal' || rec.layoutMode === 'grid'
    ? rec.layoutMode
    : null
  const workspaceDockSide: ParsedAppState['workspaceDockSide'] =
    rec.workspaceDockSide === 'left' || rec.workspaceDockSide === 'right' ? rec.workspaceDockSide : null
  const selectedWorkspaceFile: ParsedAppState['selectedWorkspaceFile'] =
    typeof rec.selectedWorkspaceFile === 'string' && rec.selectedWorkspaceFile
      ? rec.selectedWorkspaceFile
      : rec.selectedWorkspaceFile === null
        ? null
        : undefined
  const activePanelId: ParsedAppState['activePanelId'] =
    typeof rec.activePanelId === 'string' && rec.activePanelId ? rec.activePanelId : null
  const focusedEditorId: ParsedAppState['focusedEditorId'] =
    typeof rec.focusedEditorId === 'string' && rec.focusedEditorId
      ? rec.focusedEditorId
      : rec.focusedEditorId === null
        ? null
        : undefined
  const expandedDirectories: ParsedAppState['expandedDirectories'] =
    rec.expandedDirectories && typeof rec.expandedDirectories === 'object'
      ? (Object.fromEntries(
          Object.entries(rec.expandedDirectories as Record<string, unknown>).filter(
            ([k, v]) => typeof k === 'string' && typeof v === 'boolean',
          ),
        ) as Record<string, boolean>)
      : undefined
  return {
    workspaceRoot,
    workspaceList,
    workspaceSnapshotsByRoot,
    panels,
    editorPanels,
    dockTab,
    codeWindowTab,
    layoutMode,
    workspaceDockSide,
    selectedWorkspaceFile,
    activePanelId,
    focusedEditorId,
    showWorkspaceWindow: typeof rec.showWorkspaceWindow === 'boolean' ? rec.showWorkspaceWindow : undefined,
    showCodeWindow: typeof rec.showCodeWindow === 'boolean' ? rec.showCodeWindow : undefined,
    expandedDirectories,
  }
}

function formatHistoryOptionLabel(entry: ChatHistoryEntry): string {
  const dt = new Date(entry.savedAt)
  const when = Number.isFinite(dt.getTime())
    ? dt.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''
  return when ? `${entry.title} (${when})` : entry.title
}

function getConversationPrecis(panel: AgentPanelState): string {
  const firstUser = stripSyntheticAutoContinueMessages(panel.messages).find((m) => m.role === 'user')
  if (!firstUser?.content?.trim()) return panel.title
  const text = firstUser.content.trim().replace(/\s+/g, ' ')
  const maxLen = 36
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen).trim() + '...'
}

function toShortJson(value: unknown, maxLen = 280): string {
  try {
    const s = JSON.stringify(value)
    if (!s) return ''
    return s.length > maxLen ? `${s.slice(0, maxLen)}...` : s
  } catch {
    return String(value ?? '')
  }
}

function truncateText(value: string, maxLen = 200): string {
  const text = String(value ?? '').trim()
  if (!text) return ''
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text
}

function pickString(obj: any, keys: string[]): string | null {
  for (const key of keys) {
    const v = obj?.[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

function summarizeRawNotification(method: string, params: any): string | null {
  if (!method) return null

  if (method.endsWith('/requestApproval')) {
    const reason =
      pickString(params, ['reason', 'message', 'description']) ??
      pickString(params?.request, ['reason', 'message', 'description']) ??
      pickString(params?.action, ['reason', 'message', 'description'])
    const command =
      pickString(params, ['command', 'cmd']) ??
      pickString(params?.command, ['command', 'cmd', 'raw']) ??
      pickString(params?.action, ['command', 'cmd'])
    const filePath =
      pickString(params, ['path', 'file']) ??
      pickString(params?.action, ['path', 'file']) ??
      pickString(params?.edit, ['path', 'file'])
    const bits = ['Approval requested']
    if (reason) bits.push(reason)
    if (command) bits.push(`cmd: ${command}`)
    if (filePath) bits.push(`file: ${filePath}`)
    if (!reason && !command && !filePath) bits.push(toShortJson(params))
    return `${bits.join(' | ')}`
  }

  if (method === 'item/completed') {
    const itemType = params?.item?.type
    if (!itemType || itemType === 'agentMessage') return null
    const command =
      pickString(params?.item, ['command', 'cmd']) ??
      pickString(params?.item?.command, ['command', 'cmd', 'raw']) ??
      pickString(params?.item?.input, ['command', 'cmd'])
    const pathLike =
      pickString(params?.item, ['path', 'file']) ??
      pickString(params?.item?.target, ['path', 'file']) ??
      pickString(params?.item?.edit, ['path', 'file'])
    const out = [`Activity: ${itemType}`]
    if (command) out.push(`cmd: ${command}`)
    if (pathLike) out.push(`file: ${pathLike}`)
    return out.join(' | ')
  }

  return null
}

function simplifyCommand(raw: string): string {
  const trimmed = raw.trim()
  const m = trimmed.match(/-Command\s+'([^']+)'/i)
  const reduced = m?.[1]?.trim() || trimmed
  return reduced.length > 140 ? `${reduced.slice(0, 140)}...` : reduced
}

function describeOperationTrace(method: string, params: any): { label: string; detail?: string } | null {
  const methodLower = method.toLowerCase()
  const pathLike =
    pickString(params, ['path', 'file', 'targetPath']) ??
    pickString(params?.target, ['path', 'file']) ??
    pickString(params?.edit, ['path', 'file']) ??
    pickString(params?.item, ['path', 'file']) ??
    pickString(params?.item?.target, ['path', 'file'])
  const queryLike =
    pickString(params, ['query', 'pattern', 'text']) ??
    pickString(params?.search, ['query', 'pattern', 'text']) ??
    pickString(params?.input, ['query', 'pattern', 'text'])
  const cmdLike =
    pickString(params, ['command', 'cmd']) ??
    pickString(params?.command, ['command', 'cmd', 'raw']) ??
    pickString(params?.item, ['command', 'cmd']) ??
    pickString(params?.item?.command, ['command', 'cmd', 'raw']) ??
    pickString(params?.item?.input, ['command', 'cmd'])
  const cmdLower = (cmdLike ?? '').toLowerCase()

  if (
    methodLower.includes('readfile') ||
    methodLower.includes('read_workspace') ||
    methodLower.includes('readworkspace') ||
    methodLower.includes('openfile') ||
    (cmdLower.startsWith('readfile') && cmdLike)
  ) {
    const detail = pathLike ?? simplifyCommand(cmdLike ?? '')
    return { label: 'Read file', detail: detail || undefined }
  }
  if (
    methodLower.includes('glob') ||
    methodLower.includes('search') ||
    methodLower.includes('grep') ||
    methodLower.includes('rg') ||
    methodLower.includes('scan') ||
    (cmdLower.startsWith('rg ') && cmdLike) ||
    (cmdLower.startsWith('glob') && cmdLike)
  ) {
    return { label: 'Searched workspace', detail: truncateText(queryLike ?? pathLike ?? cmdLike ?? '', 180) || undefined }
  }
  if (
    methodLower.includes('applypatch') ||
    methodLower.includes('editfile') ||
    methodLower.includes('writefile') ||
    methodLower.includes('write_workspace') ||
    methodLower.includes('filechange')
  ) {
    return { label: 'Edited file', detail: pathLike ?? undefined }
  }
  const isCommandLikeMethod = methodLower.includes('shell') || methodLower.includes('commandexecution')
  if (isCommandLikeMethod && !cmdLike) {
    return null
  }
  if (isCommandLikeMethod || cmdLike) {
    if (cmdLower.startsWith('readfile')) {
      return { label: 'Read file', detail: simplifyCommand(cmdLike ?? '') || undefined }
    }
    if (cmdLower.startsWith('glob') || cmdLower.startsWith('rg ') || cmdLower.startsWith('grep ')) {
      return { label: 'Searched workspace', detail: simplifyCommand(cmdLike ?? '') || undefined }
    }
    if (cmdLower.startsWith('applypatch') || cmdLower.startsWith('editnotebook')) {
      return { label: 'Updated code', detail: simplifyCommand(cmdLike ?? '') || undefined }
    }
    return { label: 'Ran command', detail: cmdLike ? simplifyCommand(cmdLike) : undefined }
  }

  return null
}

function describeActivityEntry(evt: any): { label: string; detail?: string; kind: ActivityKind } | null {
  if (!evt) return null
  if (evt.type === 'assistantDelta') return null
  if (evt.type === 'usageUpdated') return null
  if (evt.type === 'planUpdated') return null
  if (evt.type === 'status') {
    return {
      label: `Status: ${String(evt.status ?? 'unknown')}`,
      detail: typeof evt.message === 'string' ? evt.message : undefined,
      kind: 'event',
    }
  }
  if (evt.type === 'thinking') {
    return {
      label: 'Thinking',
      detail: typeof evt.message === 'string' ? evt.message : undefined,
      kind: 'event',
    }
  }
  if (evt.type === 'assistantCompleted') return { label: 'Turn complete', kind: 'event' }
  if (evt.type === 'rawNotification' && typeof evt.method === 'string') {
    const method = evt.method
    const params = evt.params
    const methodLower = method.toLowerCase()
    if (method.endsWith('/requestApproval')) {
      return {
        label: 'Approval requested',
        detail: summarizeRawNotification(method, params) ?? undefined,
        kind: 'approval',
      }
    }
    const trace = describeOperationTrace(method, params)
    if (trace) {
      return {
        label: trace.label,
        detail: trace.detail,
        kind: 'operation',
      }
    }
    if (/commandExecution/i.test(method) || methodLower.includes('command')) {
      const cmd =
        pickString(params, ['command', 'cmd']) ??
        pickString(params?.command, ['command', 'cmd', 'raw']) ??
        pickString(params?.action, ['command', 'cmd'])
      if (!cmd) return null
      return { label: 'Running command', detail: simplifyCommand(cmd), kind: 'command' }
    }
    if (/reasoning/i.test(method)) {
      const detail =
        pickString(params, ['summary', 'text', 'reasoning', 'message']) ??
        pickString(params?.reasoning, ['summary', 'text']) ??
        pickString(params?.step, ['summary', 'text'])
      // Ignore opaque reasoning pings that provide no human-meaningful content.
      if (!detail) return null
      return { label: 'Reasoning update', detail: truncateText(detail, 220), kind: 'reasoning' }
    }
    if (method === 'item/completed') {
      const itemType = params?.item?.type
      if (!itemType || itemType === 'agentMessage') return null
      if (itemType === 'commandExecution') {
        const cmd =
          pickString(params?.item, ['command', 'cmd']) ??
          pickString(params?.item?.command, ['command', 'cmd', 'raw']) ??
          pickString(params?.item?.input, ['command', 'cmd'])
        const exitCode =
          typeof params?.item?.exitCode === 'number'
            ? params.item.exitCode
            : typeof params?.item?.statusCode === 'number'
              ? params.item.statusCode
              : null
        const parts = ['Command finished']
        if (cmd) parts.push(simplifyCommand(cmd))
        if (exitCode !== null) parts.push(`exit ${exitCode}`)
        return { label: parts[0], detail: parts.slice(1).join(' | ') || undefined, kind: 'command' }
      }
      if (itemType === 'fileChange') {
        const filePath =
          pickString(params?.item, ['path', 'file']) ??
          pickString(params?.item?.target, ['path', 'file']) ??
          pickString(params?.item?.edit, ['path', 'file'])
        return { label: 'Edited file', detail: filePath ?? undefined, kind: 'event' }
      }
      if (itemType === 'reasoning') {
        const detail =
          pickString(params?.item, ['summary', 'text', 'reasoning']) ??
          pickString(params?.item?.reasoning, ['summary', 'text'])
        if (!detail) return null
        return { label: 'Reasoning step', detail: truncateText(detail, 220), kind: 'reasoning' }
      }
      if (itemType === 'userMessage') return null
      return { label: `Completed ${itemType}`, kind: 'event' }
    }
    if (methodLower.includes('file') || methodLower.includes('edit')) {
      const filePath =
        pickString(params, ['path', 'file']) ??
        pickString(params?.target, ['path', 'file']) ??
        pickString(params?.edit, ['path', 'file'])
      if (filePath) return { label: 'Edited file', detail: filePath, kind: 'event' }
    }
    if (methodLower.includes('search') || methodLower.includes('scan')) {
      const query =
        pickString(params, ['query', 'pattern', 'text']) ??
        pickString(params?.search, ['query', 'pattern', 'text'])
      return { label: 'Scanning workspace', detail: query ? truncateText(query, 140) : undefined, kind: 'event' }
    }
    if (methodLower.includes('task') && methodLower.includes('complete')) {
      return { label: 'Task step complete', kind: 'event' }
    }
    if (methodLower.includes('turn') && methodLower.includes('complete')) {
      return { label: 'Turn complete', kind: 'event' }
    }
    if (methodLower.includes('agent_message')) {
      return null
    }
    return null
  }
  if (typeof evt.type === 'string') return null
  return null
}

function shouldSurfaceRawNoteInChat(method: string): boolean {
  if (method.endsWith('/requestApproval')) return true
  return false
}

function isTurnCompletionRawNotification(method: string, params: any): boolean {
  const methodLower = method.toLowerCase()
  if (method === 'item/completed' && params?.item?.type === 'agentMessage') return true
  if (methodLower.includes('turn') && methodLower.includes('complete')) return true
  if (methodLower.includes('response') && methodLower.includes('complete')) return true
  return false
}

const LIMIT_WARNING_PREFIX = 'Warning (Limits):'

function isUsageLimitMessage(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('limit reached') ||
    lower.includes('rate limit') ||
    lower.includes('quota exceeded') ||
    lower.includes('usage limit') ||
    lower.includes('too many requests') ||
    lower.includes('429') ||
    (lower.includes('exhaust') && lower.includes('limit'))
  )
}

function withLimitWarningMessage(messages: ChatMessage[], rawMessage: string): ChatMessage[] {
  const trimmed = rawMessage.trim()
  if (!trimmed || !isUsageLimitMessage(trimmed)) return messages
  const content = `${LIMIT_WARNING_PREFIX} ${trimmed}\n\nSwitch to another model/provider (for example Gemini) or wait for your limit window to reset.`
  const duplicate = messages.slice(-8).some((m) => m.role === 'system' && m.content === content)
  if (duplicate) return messages
  return [...messages, { id: newId(), role: 'system' as const, content, format: 'text' as const, createdAt: Date.now() }]
}

function formatLimitResetHint(usage: AgentPanelState['usage']) {
  const raw = usage?.primary?.resetsAt
  if (raw === null || raw === undefined) return null
  const date =
    typeof raw === 'number'
      ? new Date(raw > 1_000_000_000_000 ? raw : raw * 1000)
      : typeof raw === 'string'
        ? new Date(raw)
        : null
  if (!date || Number.isNaN(date.getTime())) return null
  return `Resets at ${date.toLocaleString()}.`
}

function getRateLimitPercent(usage: AgentPanelState['usage']) {
  const p = usage?.primary
  if (!p || typeof p.usedPercent !== 'number') return null
  return Math.max(0, Math.min(100, p.usedPercent))
}

function formatRateLimitLabel(usage: AgentPanelState['usage']) {
  const p = usage?.primary
  if (!p || typeof p.usedPercent !== 'number') return null
  const used = Math.max(0, Math.min(100, p.usedPercent))
  const left = 100 - used
  const windowMinutes = typeof p.windowMinutes === 'number' ? p.windowMinutes : null
  const windowLabel = windowMinutes === 300 ? '5h' : windowMinutes ? `${Math.round(windowMinutes / 60)}h` : null
  return `${windowLabel ? `${windowLabel} ` : ''}${left}% left`
}

function withExhaustedRateLimitWarning(messages: ChatMessage[], usage: AgentPanelState['usage']) {
  const usedPercent = getRateLimitPercent(usage)
  if (usedPercent === null || usedPercent < 99.5) return messages
  const label = formatRateLimitLabel(usage) ?? `${Math.max(0, Math.round(100 - usedPercent))}% left`
  const resetHint = formatLimitResetHint(usage)
  const content = `${LIMIT_WARNING_PREFIX} Codex usage window exhausted (${label}). ${resetHint ?? 'Wait for reset or switch model/provider.'}\n\nYour message was not sent.`
  const duplicate = messages
    .slice(-8)
    .some((m) => m.role === 'system' && m.content.startsWith(`${LIMIT_WARNING_PREFIX} Codex usage window exhausted`))
  if (duplicate) return messages
  return [...messages, { id: newId(), role: 'system' as const, content, format: 'text' as const, createdAt: Date.now() }]
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    promise
      .then((v) => {
        clearTimeout(t)
        resolve(v)
      })
      .catch((e) => {
        clearTimeout(t)
        reject(e)
      })
  })
}

function makeDefaultPanel(id: string, cwd: string, historyId = newId()): AgentPanelState {
  const startupModel = DEFAULT_MODEL
  return {
    id,
    historyId,
    title: `Agent ${id.slice(-4)}`,
    cwd,
    model: startupModel,
    interactionMode: 'agent',
    permissionMode: 'verify-first',
    sandbox: 'workspace-write',
    status: 'Not connected',
    connected: false,
    streaming: false,
    messages: [
      {
        id: newId(),
        role: 'system',
        content: `Model: ${startupModel}`,
        format: 'text',
        createdAt: Date.now(),
      },
    ],
    attachments: [],
    input: '',
    pendingInputs: [],
    fontScale: 1,
    usage: undefined,
  }
}

function withModelBanner(messages: ChatMessage[], model: string): ChatMessage[] {
  const banner = `${MODEL_BANNER_PREFIX}${model}`
  if (messages[0]?.role === 'system' && messages[0].content.startsWith(MODEL_BANNER_PREFIX)) {
    return [{ ...messages[0], content: banner, format: 'text' }, ...messages.slice(1)]
  }
  return [{ id: newId(), role: 'system', content: banner, format: 'text', createdAt: Date.now() }, ...messages]
}

function getInitialWorkspaceSettings(list: string[]): Record<string, WorkspaceSettings> {
  try {
    const raw = globalThis.localStorage?.getItem(WORKSPACE_SETTINGS_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, Partial<WorkspaceSettings>>) : {}
    const result: Record<string, WorkspaceSettings> = {}
    for (const [key, value] of Object.entries(parsed)) {
      const path = typeof value?.path === 'string' && value.path.trim() ? value.path : key
      if (!path) continue
      const hasAllowedCommandPrefixes = Array.isArray((value as Partial<WorkspaceSettings>)?.allowedCommandPrefixes)
      const hasAllowedAutoReadPrefixes = Array.isArray((value as Partial<WorkspaceSettings>)?.allowedAutoReadPrefixes)
      const hasAllowedAutoWritePrefixes = Array.isArray((value as Partial<WorkspaceSettings>)?.allowedAutoWritePrefixes)
      const hasDeniedAutoReadPrefixes = Array.isArray((value as Partial<WorkspaceSettings>)?.deniedAutoReadPrefixes)
      const hasDeniedAutoWritePrefixes = Array.isArray((value as Partial<WorkspaceSettings>)?.deniedAutoWritePrefixes)
      const allowedCommandPrefixes = normalizeAllowedCommandPrefixes((value as Partial<WorkspaceSettings>)?.allowedCommandPrefixes)
      const allowedAutoReadPrefixes = normalizeAllowedCommandPrefixes((value as Partial<WorkspaceSettings>)?.allowedAutoReadPrefixes)
      const allowedAutoWritePrefixes = normalizeAllowedCommandPrefixes((value as Partial<WorkspaceSettings>)?.allowedAutoWritePrefixes)
      const deniedAutoReadPrefixes = normalizeAllowedCommandPrefixes((value as Partial<WorkspaceSettings>)?.deniedAutoReadPrefixes)
      const deniedAutoWritePrefixes = normalizeAllowedCommandPrefixes((value as Partial<WorkspaceSettings>)?.deniedAutoWritePrefixes)
      result[path] = {
        path,
        defaultModel: typeof value?.defaultModel === 'string' && value.defaultModel ? value.defaultModel : DEFAULT_MODEL,
        permissionMode: value?.permissionMode === 'proceed-always' ? 'proceed-always' : 'verify-first',
        sandbox:
          value?.sandbox === 'read-only'
            ? value.sandbox
            : 'workspace-write',
        allowedCommandPrefixes: hasAllowedCommandPrefixes ? allowedCommandPrefixes : [...DEFAULT_WORKSPACE_ALLOWED_COMMAND_PREFIXES],
        allowedAutoReadPrefixes: hasAllowedAutoReadPrefixes ? allowedAutoReadPrefixes : [...DEFAULT_WORKSPACE_ALLOWED_AUTO_READ_PREFIXES],
        allowedAutoWritePrefixes: hasAllowedAutoWritePrefixes ? allowedAutoWritePrefixes : [...DEFAULT_WORKSPACE_ALLOWED_AUTO_WRITE_PREFIXES],
        deniedAutoReadPrefixes: hasDeniedAutoReadPrefixes ? deniedAutoReadPrefixes : [...DEFAULT_WORKSPACE_DENIED_AUTO_READ_PREFIXES],
        deniedAutoWritePrefixes: hasDeniedAutoWritePrefixes ? deniedAutoWritePrefixes : [...DEFAULT_WORKSPACE_DENIED_AUTO_WRITE_PREFIXES],
      }
    }
    for (const p of list) {
      if (!result[p]) {
        result[p] = {
          path: p,
          defaultModel: DEFAULT_MODEL,
          permissionMode: 'verify-first',
          sandbox: 'workspace-write',
          allowedCommandPrefixes: [...DEFAULT_WORKSPACE_ALLOWED_COMMAND_PREFIXES],
          allowedAutoReadPrefixes: [...DEFAULT_WORKSPACE_ALLOWED_AUTO_READ_PREFIXES],
          allowedAutoWritePrefixes: [...DEFAULT_WORKSPACE_ALLOWED_AUTO_WRITE_PREFIXES],
          deniedAutoReadPrefixes: [...DEFAULT_WORKSPACE_DENIED_AUTO_READ_PREFIXES],
          deniedAutoWritePrefixes: [...DEFAULT_WORKSPACE_DENIED_AUTO_WRITE_PREFIXES],
        }
      }
    }
    return result
  } catch {
    const result: Record<string, WorkspaceSettings> = {}
    for (const p of list) {
      result[p] = {
        path: p,
        defaultModel: DEFAULT_MODEL,
        permissionMode: 'verify-first',
        sandbox: 'workspace-write',
        allowedCommandPrefixes: [...DEFAULT_WORKSPACE_ALLOWED_COMMAND_PREFIXES],
        allowedAutoReadPrefixes: [...DEFAULT_WORKSPACE_ALLOWED_AUTO_READ_PREFIXES],
        allowedAutoWritePrefixes: [...DEFAULT_WORKSPACE_ALLOWED_AUTO_WRITE_PREFIXES],
        deniedAutoReadPrefixes: [...DEFAULT_WORKSPACE_DENIED_AUTO_READ_PREFIXES],
        deniedAutoWritePrefixes: [...DEFAULT_WORKSPACE_DENIED_AUTO_WRITE_PREFIXES],
      }
    }
    return result
  }
}

function getInitialExplorerPrefsByWorkspace(): Record<string, ExplorerPrefs> {
  try {
    const raw = globalThis.localStorage?.getItem(EXPLORER_PREFS_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, ExplorerPrefs>) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function getInitialOrchestratorSettings(): OrchestratorSettings {
  const defaults: OrchestratorSettings = {
    orchestratorModel: '',
    workerProvider: 'codex',
    workerModel: '',
    maxParallelPanels: 2,
    maxTaskAttempts: 3,
  }
  try {
    const raw = globalThis.localStorage?.getItem(ORCHESTRATOR_SETTINGS_STORAGE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<OrchestratorSettings>
    return {
      orchestratorModel: typeof parsed?.orchestratorModel === 'string' ? parsed.orchestratorModel : defaults.orchestratorModel,
      workerProvider: typeof parsed?.workerProvider === 'string' ? parsed.workerProvider : defaults.workerProvider,
      workerModel: typeof parsed?.workerModel === 'string' ? parsed.workerModel : defaults.workerModel,
      maxParallelPanels: typeof parsed?.maxParallelPanels === 'number' && parsed.maxParallelPanels >= 1 && parsed.maxParallelPanels <= 8
        ? parsed.maxParallelPanels
        : defaults.maxParallelPanels,
      maxTaskAttempts: typeof parsed?.maxTaskAttempts === 'number' && parsed.maxTaskAttempts >= 1 && parsed.maxTaskAttempts <= 10
        ? parsed.maxTaskAttempts
        : defaults.maxTaskAttempts,
    }
  } catch {
    return defaults
  }
}

export default function App() {
  const api = useMemo(() => window.agentOrchestrator ?? window.fireharness, [])

  const [workspaceRoot, setWorkspaceRoot] = useState(() => getInitialWorkspaceRoot())
  const [workspaceList, setWorkspaceList] = useState<string[]>(() => getInitialWorkspaceList())
  const [workspaceSettingsByPath, setWorkspaceSettingsByPath] = useState<Record<string, WorkspaceSettings>>(() =>
    getInitialWorkspaceSettings(getInitialWorkspaceList()),
  )
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false)
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false)
  const [workspacePickerPrompt, setWorkspacePickerPrompt] = useState<string | null>(null)
  const [workspacePickerError, setWorkspacePickerError] = useState<string | null>(null)
  const [workspacePickerOpening, setWorkspacePickerOpening] = useState<string | null>(null)
  const [showSetupWizard, setShowSetupWizard] = useState(false)
  const [setupWizardStep, setSetupWizardStep] = useState<'providers' | 'connect'>('providers')
  const [setupWizardSelection, setSetupWizardSelection] = useState<Record<ConnectivityProvider, boolean>>(() => getDefaultSetupWizardSelection())
  const [setupWizardStatus, setSetupWizardStatus] = useState<string | null>(null)
  const [setupWizardFinishing, setSetupWizardFinishing] = useState(false)
  const [workspaceModalMode, setWorkspaceModalMode] = useState<'new' | 'edit'>('edit')
  const [workspaceForm, setWorkspaceForm] = useState<WorkspaceSettings>({
    path: getInitialWorkspaceRoot(),
    defaultModel: DEFAULT_MODEL,
    permissionMode: 'verify-first',
    sandbox: 'workspace-write',
    allowedCommandPrefixes: [...DEFAULT_WORKSPACE_ALLOWED_COMMAND_PREFIXES],
    allowedAutoReadPrefixes: [...DEFAULT_WORKSPACE_ALLOWED_AUTO_READ_PREFIXES],
    allowedAutoWritePrefixes: [...DEFAULT_WORKSPACE_ALLOWED_AUTO_WRITE_PREFIXES],
    deniedAutoReadPrefixes: [...DEFAULT_WORKSPACE_DENIED_AUTO_READ_PREFIXES],
    deniedAutoWritePrefixes: [...DEFAULT_WORKSPACE_DENIED_AUTO_WRITE_PREFIXES],
  })
  const [workspaceFormTextDraft, setWorkspaceFormTextDraft] = useState<WorkspaceSettingsTextDraft>(() =>
    workspaceSettingsToTextDraft({
      path: getInitialWorkspaceRoot(),
      defaultModel: DEFAULT_MODEL,
      permissionMode: 'verify-first',
      sandbox: 'workspace-write',
      allowedCommandPrefixes: [...DEFAULT_WORKSPACE_ALLOWED_COMMAND_PREFIXES],
      allowedAutoReadPrefixes: [...DEFAULT_WORKSPACE_ALLOWED_AUTO_READ_PREFIXES],
      allowedAutoWritePrefixes: [...DEFAULT_WORKSPACE_ALLOWED_AUTO_WRITE_PREFIXES],
      deniedAutoReadPrefixes: [...DEFAULT_WORKSPACE_DENIED_AUTO_READ_PREFIXES],
      deniedAutoWritePrefixes: [...DEFAULT_WORKSPACE_DENIED_AUTO_WRITE_PREFIXES],
    }),
  )
  const [showThemeModal, setShowThemeModal] = useState(false)
  const [appSettingsView, setAppSettingsView] = useState<AppSettingsView>('connectivity')
  const [applicationSettings, setApplicationSettings] = useState<ApplicationSettings>(() => getInitialApplicationSettings())
  const [themeOverrides, setThemeOverrides] = useState<ThemeOverrides>(() => getInitialThemeOverrides())
  const [selectedThemeEditorId, setSelectedThemeEditorId] = useState<string>(() => getInitialThemeId())
  const [themeEditorDraft, setThemeEditorDraft] = useState<StandaloneTheme | null>(null)
  const [themeEditorStatus, setThemeEditorStatus] = useState<string | null>(null)
  const [diagnosticsInfo, setDiagnosticsInfo] = useState<{
    userDataPath: string
    storageDir: string
    chatHistoryPath: string
    appStatePath: string
    runtimeLogPath: string
  } | null>(null)
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null)
  const [diagnosticsActionStatus, setDiagnosticsActionStatus] = useState<string | null>(null)
  const [providerAuthByName, setProviderAuthByName] = useState<Partial<Record<string, ProviderAuthStatus>>>({})
  const [providerAuthLoadingByName, setProviderAuthLoadingByName] = useState<Record<string, boolean>>({})
  const [providerAuthActionByName, setProviderAuthActionByName] = useState<Record<string, string | null>>({})
  const [providerPanelOpenByName, setProviderPanelOpenByName] = useState<Record<string, boolean>>({})
  const [providerApiKeyDraftByName, setProviderApiKeyDraftByName] = useState<Record<string, string>>({})
  const [providerApiKeyStateByName, setProviderApiKeyStateByName] = useState<Record<string, boolean>>({})
  const [modelConfig, setModelConfig] = useState<ModelConfig>(() => getInitialModelConfig())
  const [modelCatalogRefreshStatus, setModelCatalogRefreshStatus] = useState<ModelCatalogRefreshStatus | null>(null)
  const [modelCatalogRefreshPending, setModelCatalogRefreshPending] = useState(false)
  const [modelFormStatus, setModelFormStatus] = useState<string | null>(null)
  const [providerRegistry, setProviderRegistry] = useState<ProviderRegistry>(() => getInitialProviderRegistry())
  const [editingModel, setEditingModel] = useState<ModelInterface | null>(null)
  const [showProviderSetupModal, setShowProviderSetupModal] = useState(false)
  const [editingProvider, setEditingProvider] = useState<CustomProviderConfig | null>(null)
  const [modelForm, setModelForm] = useState<ModelInterface>({
    id: '',
    displayName: '',
    provider: 'codex',
    enabled: true,
  })
  const [dockTab, setDockTab] = useState<'orchestrator' | 'explorer' | 'git' | 'settings'>('explorer')
  const [loadedPlugins, setLoadedPlugins] = useState<Array<{ pluginId: string; displayName: string; version: string; active: boolean }> | null>(null)
  const [orchestratorSettings, setOrchestratorSettings] = useState<OrchestratorSettings>(() => getInitialOrchestratorSettings())
  const [orchestratorLicenseKeyState, setOrchestratorLicenseKeyState] = useState<{ hasKey: boolean } | null>(null)
  const [orchestratorLicenseKeyDraft, setOrchestratorLicenseKeyDraft] = useState('')
  const [orchestratorInstallStatus, setOrchestratorInstallStatus] = useState<string | null>(null)
  const [repairShortcutStatus, setRepairShortcutStatus] = useState<string | null>(null)
  const [workspaceDockSide, setWorkspaceDockSide] = useState<WorkspaceDockSide>(() => getInitialWorkspaceDockSide())
  const [workspaceTree, setWorkspaceTree] = useState<WorkspaceTreeNode[]>([])
  const [workspaceTreeLoading, setWorkspaceTreeLoading] = useState(false)
  const [workspaceTreeError, setWorkspaceTreeError] = useState<string | null>(null)
  const [workspaceTreeTruncated, setWorkspaceTreeTruncated] = useState(false)
  const [expandedDirectories, setExpandedDirectories] = useState<Record<string, boolean>>({})
  const [explorerPrefsByWorkspace, setExplorerPrefsByWorkspace] = useState<Record<string, ExplorerPrefs>>(
    () => getInitialExplorerPrefsByWorkspace(),
  )
  const [showHiddenFiles, setShowHiddenFiles] = useState(false)
  const [showNodeModules, setShowNodeModules] = useState(false)
  const [gitStatus, setGitStatus] = useState<GitStatusState | null>(null)
  const [gitStatusLoading, setGitStatusLoading] = useState(false)
  const [gitStatusError, setGitStatusError] = useState<string | null>(null)
  const [gitOperationPending, setGitOperationPending] = useState<GitOperation | null>(null)
  const [gitOperationSuccess, setGitOperationSuccess] = useState<{ op: GitOperation; at: number } | null>(null)
  const [explorerContextMenu, setExplorerContextMenu] = useState<{ x: number; y: number; relativePath: string } | null>(null)
  const [gitContextMenu, setGitContextMenu] = useState<{ x: number; y: number; relativePath: string; deleted: boolean } | null>(null)
  const [selectedGitPaths, setSelectedGitPaths] = useState<string[]>([])
  const [gitSelectionAnchorPath, setGitSelectionAnchorPath] = useState<string | null>(null)
  const [selectedWorkspaceFile, setSelectedWorkspaceFile] = useState<string | null>(null)
  const [editorPanels, setEditorPanels] = useState<EditorPanelState[]>([])
  const [focusedEditorId, setFocusedEditorId] = useState<string | null>(null)
  const [panelActivityById, setPanelActivityById] = useState<Record<string, PanelActivityState>>({})
  const [activityClock, setActivityClock] = useState(() => Date.now())
  const [panelDebugById, setPanelDebugById] = useState<Record<string, PanelDebugEntry[]>>({})
  const [lastPromptDurationMsByPanel, setLastPromptDurationMsByPanel] = useState<Record<string, number>>({})
  const [panelTurnCompleteAtById, setPanelTurnCompleteAtById] = useState<Record<string, number>>({})
  const [settingsPopoverByPanel, setSettingsPopoverByPanel] = useState<Record<string, 'mode' | 'sandbox' | 'permission' | null>>({})
  const [codeBlockOpenById, setCodeBlockOpenById] = useState<Record<string, boolean>>({})
  const [timelineOpenByUnitId, setTimelineOpenByUnitId] = useState<Record<string, boolean>>({})
  const [timelinePinnedCodeByUnitId, setTimelinePinnedCodeByUnitId] = useState<Record<string, boolean>>({})
  const [chatHistory, setChatHistory] = useState<ChatHistoryEntry[]>(() => getInitialChatHistory())
  const [historyDropdownOpen, setHistoryDropdownOpen] = useState(false)
  const [deleteHistoryIdPending, setDeleteHistoryIdPending] = useState<string | null>(null)
  const [selectedHistoryId, setSelectedHistoryId] = useState<string>('')
  const [deleteAllHistoryChecked, setDeleteAllHistoryChecked] = useState(false)
  const [deleteThisAndOlderChecked, setDeleteThisAndOlderChecked] = useState(false)

  const modelList = modelConfig.interfaces.filter((m) => m.enabled).map((m) => m.id)
  const workspaceScopedHistory = useMemo(() => {
    const normalizedWorkspaceRoot = normalizeWorkspacePathForCompare(workspaceRoot || '')
    return chatHistory.filter(
      (entry) => normalizeWorkspacePathForCompare(entry.workspaceRoot || '') === normalizedWorkspaceRoot,
    )
  }, [chatHistory, workspaceRoot])
  function getModelOptions(includeCurrent?: string): string[] {
    const seen = new Set<string>()
    const base: string[] = []
    for (const id of modelList) {
      const value = String(id ?? '').trim()
      if (!value || seen.has(value)) continue
      seen.add(value)
      base.push(value)
    }
    if (includeCurrent) {
      const value = String(includeCurrent).trim()
      if (value && !seen.has(value)) base.push(value)
    }
    return base
  }

  type ModelOptionGroup = { label: string; modelIds: string[] }
  function getModelOptionsGrouped(includeCurrent?: string, enabledOnly = true): ModelOptionGroup[] {
    const ids = enabledOnly ? getModelOptions(includeCurrent) : modelConfig.interfaces.map((m) => m.id)
    const interfaces: ModelInterface[] = ids
      .map((id) => modelConfig.interfaces.find((m) => m.id === id) ?? { id, displayName: id, provider: 'codex', enabled: false })
      .filter((m): m is ModelInterface => !!m)
    const groups: ModelOptionGroup[] = []
    const codexCli: string[] = []
    const codexApi: string[] = []
    const byProvider: Record<string, string[]> = { claude: [], gemini: [], openrouter: [] }
    for (const m of interfaces) {
      if (m.provider === 'codex') {
        if (CODEX_API_MODELS.includes(m.id)) codexApi.push(m.id)
        else codexCli.push(m.id)
      } else {
        ;(byProvider[m.provider] ??= []).push(m.id)
      }
    }
    if (codexCli.length) groups.push({ label: 'OpenAI (CLI)', modelIds: codexCli })
    if (codexApi.length) groups.push({ label: 'OpenAI (API)', modelIds: codexApi })
    const providerLabels: Record<string, string> = {
      claude: 'Claude',
      gemini: 'Gemini',
      openrouter: 'OpenRouter',
    }
    for (const [provider, modelIds] of Object.entries(byProvider)) {
      if (modelIds.length) groups.push({ label: providerLabels[provider] ?? provider, modelIds })
    }
    return groups
  }

  const layoutRef = useRef<HTMLDivElement | null>(null)
  const deltaBuffers = useRef(new Map<string, string>())
  const flushTimers = useRef(new Map<string, any>())
  const autoContinueCountRef = useRef(new Map<string, number>())
  const textareaRefs = useRef(new Map<string, HTMLTextAreaElement>())
  const messageViewportRefs = useRef(new Map<string, HTMLDivElement>())
  const stickToBottomByPanelRef = useRef(new Map<string, boolean>())
  const codeBlockViewportRefs = useRef(new Map<string, HTMLPreElement>())
  const stickToBottomByCodeBlockRef = useRef(new Map<string, boolean>())
  const activityLatestRef = useRef(new Map<string, PanelActivityState>())
  const activityFlushTimers = useRef(new Map<string, any>())
  const panelsRef = useRef<AgentPanelState[]>([])
  const editorPanelsRef = useRef<EditorPanelState[]>([])
  const focusedEditorIdRef = useRef<string | null>(null)
  const activePanelIdRef = useRef<string>('default')
  const showWorkspaceWindowRef = useRef(true)
  const workspaceTreeRef = useRef<WorkspaceTreeNode[]>([])
  const showHiddenFilesRef = useRef(false)
  const showNodeModulesRef = useRef(false)
  const selectedWorkspaceFileRef = useRef<string | null>(null)
  const lastFindInPageQueryRef = useRef('')
  const lastFindInFilesQueryRef = useRef('')
  const reconnectingRef = useRef(new Set<string>())
  const activePromptStartedAtRef = useRef(new Map<string, number>())
  const zoomWheelThrottleRef = useRef(false)
  const needsContextOnNextCodexSendRef = useRef<Record<string, boolean>>({})
  const workspaceRootRef = useRef(workspaceRoot)
  const workspaceListRef = useRef(workspaceList)
  const activeWorkspaceLockRef = useRef('')
  const appStateHydratedRef = useRef(false)
  const appStateSaveTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const workspaceSnapshotsRef = useRef<Record<string, WorkspaceUiSnapshot>>({})
  const startupReadyNotifiedRef = useRef(false)
  const historyDropdownRef = useRef<HTMLDivElement>(null)
  const codeWindowSettingsHostRef = useRef<HTMLDivElement | null>(null)

  const [layoutMode, setLayoutMode] = useState<LayoutMode>('vertical')
  const [showWorkspaceWindow, setShowWorkspaceWindow] = useState(true)
  const [showCodeWindow, setShowCodeWindow] = useState(true)
  const [codeWindowTab, setCodeWindowTab] = useState<CodeWindowTab>('code')
  const [showTerminalBar, setShowTerminalBar] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(0)
  const [draggingPanelId, setDraggingPanelId] = useState<string | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)
  const [appStateHydrated, setAppStateHydrated] = useState(false)
  const [workspaceBootstrapComplete, setWorkspaceBootstrapComplete] = useState(false)
  const [pendingWorkspaceSwitch, setPendingWorkspaceSwitch] = useState<{
    targetRoot: string
    source: 'menu' | 'picker' | 'dropdown' | 'workspace-create'
  } | null>(null)

  const [panels, setPanels] = useState<AgentPanelState[]>(() => [
    makeDefaultPanel('default', getInitialWorkspaceRoot()),
  ])
  const [activePanelId, setActivePanelId] = useState<string>('default')
  const panelTimelineById = useMemo<Record<string, TimelineUnit[]>>(
    () =>
      Object.fromEntries(
        panels.map((panel) => [
          panel.id,
          buildTimelineForPanel({
            panelId: panel.id,
            messages: filterMessagesForPresentation(panel.messages, applicationSettings.responseStyle),
            activityItems: panelActivityById[panel.id]?.recent ?? [],
            streaming: panel.streaming,
            retrospectiveWindow: Number.MAX_SAFE_INTEGER,
          }),
        ]),
      ),
    [panels, panelActivityById, applicationSettings.responseStyle],
  )
  const themeCatalog = useMemo(() => applyThemeOverrides(themeOverrides), [themeOverrides])
  const effectiveThemeId = applicationSettings.themeId
  const activeTheme = useMemo(() => {
    const catalogTheme =
      themeCatalog.find((t) => t.id === effectiveThemeId)
      ?? themeCatalog.find((t) => t.id === DEFAULT_THEME_ID)
      ?? THEMES.find((t) => t.id === DEFAULT_THEME_ID)!
    if (themeEditorDraft && themeEditorDraft.id === catalogTheme.id) {
      return themeEditorDraft
    }
    return catalogTheme
  }, [effectiveThemeId, themeCatalog, themeEditorDraft])
  const effectiveTheme: Theme = activeTheme.mode

  useEffect(() => {
    localStorage.setItem(THEME_ID_STORAGE_KEY, applicationSettings.themeId)
  }, [applicationSettings.themeId])

  useEffect(() => {
    localStorage.setItem(THEME_OVERRIDES_STORAGE_KEY, JSON.stringify(themeOverrides))
  }, [themeOverrides])

  useEffect(() => {
    const selectedTheme =
      themeCatalog.find((theme) => theme.id === selectedThemeEditorId)
      ?? themeCatalog.find((theme) => theme.id === applicationSettings.themeId)
      ?? themeCatalog[0]
      ?? null
    if (!selectedTheme) return
    if (selectedThemeEditorId !== selectedTheme.id) setSelectedThemeEditorId(selectedTheme.id)
    setThemeEditorDraft((prev) => (prev && prev.id === selectedTheme.id ? prev : cloneTheme(selectedTheme)))
  }, [themeCatalog, selectedThemeEditorId, applicationSettings.themeId])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', effectiveTheme === 'dark')
    void api.setWindowTheme?.(effectiveTheme).catch(() => {})
  }, [api, effectiveTheme])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--theme-accent-500', activeTheme.accent500)
    root.style.setProperty('--theme-accent-600', activeTheme.accent600)
    root.style.setProperty('--theme-accent-700', activeTheme.accent700)
    root.style.setProperty('--theme-accent-text', activeTheme.accentText)
    root.style.setProperty('--theme-accent-soft', activeTheme.accentSoft)
    root.style.setProperty('--theme-accent-soft-dark', activeTheme.accentSoftDark)
    root.style.setProperty('--theme-dark-950', activeTheme.dark950)
    root.style.setProperty('--theme-dark-900', activeTheme.dark900)
  }, [activeTheme])

  useEffect(() => {
    workspaceRootRef.current = workspaceRoot
  }, [workspaceRoot])

  useEffect(() => {
    workspaceListRef.current = workspaceList
  }, [workspaceList])

  useEffect(() => {
    if (!historyDropdownOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (historyDropdownRef.current && !historyDropdownRef.current.contains(e.target as Node)) {
        setHistoryDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [historyDropdownOpen])

  useEffect(() => {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, workspaceRoot)
  }, [workspaceRoot])

  useEffect(() => {
    localStorage.setItem(WORKSPACE_LIST_STORAGE_KEY, JSON.stringify(workspaceList))
    api.setRecentWorkspaces?.(workspaceList)
  }, [workspaceList, api])

  useEffect(() => {
    localStorage.setItem(WORKSPACE_SETTINGS_STORAGE_KEY, JSON.stringify(workspaceSettingsByPath))
  }, [workspaceSettingsByPath])

  useEffect(() => {
    localStorage.setItem(MODEL_CONFIG_STORAGE_KEY, JSON.stringify(modelConfig))
  }, [modelConfig])

  useEffect(() => {
    localStorage.setItem(PROVIDER_REGISTRY_STORAGE_KEY, JSON.stringify(providerRegistry))
  }, [providerRegistry])

  useEffect(() => {
    localStorage.setItem(ORCHESTRATOR_SETTINGS_STORAGE_KEY, JSON.stringify(orchestratorSettings))
    void api.syncOrchestratorSettings?.(orchestratorSettings)
  }, [api, orchestratorSettings])

  useEffect(() => {
    localStorage.setItem(EXPLORER_PREFS_STORAGE_KEY, JSON.stringify(explorerPrefsByWorkspace))
  }, [explorerPrefsByWorkspace])

  useEffect(() => {
    localStorage.setItem(WORKSPACE_DOCK_SIDE_STORAGE_KEY, workspaceDockSide)
  }, [workspaceDockSide])

  useEffect(() => {
    if (draggingPanelId) {
      document.body.style.userSelect = 'none'
      return () => {
        document.body.style.userSelect = ''
      }
    }
  }, [draggingPanelId])

  useEffect(() => {
    try {
      localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(applicationSettings))
    } catch {
      // best-effort only
    }
  }, [applicationSettings])

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(chatHistory))
    } catch {
      // best-effort only
    }
  }, [chatHistory])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const loaded = await api.loadChatHistory?.()
        if (cancelled) return
        const parsed = parseChatHistoryEntries(loaded, workspaceRootRef.current || getInitialWorkspaceRoot())
        if (parsed.length === 0) return
        setChatHistory((prev) => mergeChatHistoryEntries(parsed, prev))
      } catch {
        // best-effort only
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api])

  useEffect(() => {
    void api.saveChatHistory?.(chatHistory).catch(() => {})
  }, [api, chatHistory])

  // Keep workspaceRoot in the list when it changes (e.g. manually selected)
  useEffect(() => {
    if (!workspaceRoot || workspaceList.includes(workspaceRoot)) return
    setWorkspaceList((prev) => [...new Set([workspaceRoot, ...prev])])
  }, [workspaceRoot])

  useEffect(() => {
    if (!workspaceRoot) return
    setPanels((prev) =>
      prev.map((p) =>
        normalizeWorkspacePathForCompare(p.cwd) === normalizeWorkspacePathForCompare(workspaceRoot)
          ? p
          : {
              ...p,
              cwd: workspaceRoot,
              connected: false,
              streaming: false,
              status: 'Workspace changed. Reconnect on next send.',
            },
      ),
    )
  }, [workspaceRoot])

  useEffect(() => {
    if (panels.length === 0) return
    if (!panels.some((p) => p.id === activePanelId)) {
      setActivePanelId(panels[0].id)
    }
  }, [panels, activePanelId])

  useEffect(() => {
    panelsRef.current = panels
  }, [panels])

  useEffect(() => {
    activePanelIdRef.current = activePanelId
  }, [activePanelId])

  useEffect(() => {
    if (!activePanelId) return
    stickToBottomByPanelRef.current.set(activePanelId, true)
    const viewport = messageViewportRefs.current.get(activePanelId)
    if (viewport) {
      const scrollToBottom = () => {
        viewport.scrollTop = viewport.scrollHeight
      }
      requestAnimationFrame(() => {
        scrollToBottom()
        requestAnimationFrame(scrollToBottom)
      })
    }
  }, [activePanelId])

  useEffect(() => {
    editorPanelsRef.current = editorPanels
  }, [editorPanels])

  useEffect(() => {
    focusedEditorIdRef.current = focusedEditorId
  }, [focusedEditorId])

  function setFocusedEditor(next: string | null) {
    focusedEditorIdRef.current = next
    setFocusedEditorId(next)
  }

  useEffect(() => {
    showWorkspaceWindowRef.current = showWorkspaceWindow
  }, [showWorkspaceWindow])

  useEffect(() => {
    const level = api.getZoomLevel?.()
    if (level !== undefined) setZoomLevel(level)
  }, [api])

  useEffect(() => {
    workspaceTreeRef.current = workspaceTree
  }, [workspaceTree])

  useEffect(() => {
    showHiddenFilesRef.current = showHiddenFiles
  }, [showHiddenFiles])

  useEffect(() => {
    showNodeModulesRef.current = showNodeModules
  }, [showNodeModules])

  useEffect(() => {
    selectedWorkspaceFileRef.current = selectedWorkspaceFile
  }, [selectedWorkspaceFile])

  useEffect(() => {
    api.setEditorMenuState?.(Boolean(focusedEditorId))
  }, [api, focusedEditorId])

  useEffect(() => {
    if (focusedEditorId && !editorPanels.some((p) => p.id === focusedEditorId)) {
      setFocusedEditor(null)
    }
  }, [editorPanels, focusedEditorId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!applicationSettings.restoreSessionOnStartup) {
        appStateHydratedRef.current = true
        setAppStateHydrated(true)
        return
      }
      try {
        const loaded = await api.loadAppState?.()
        if (cancelled || !loaded) return
        const restored = parsePersistedAppState(loaded, workspaceRootRef.current || getInitialWorkspaceRoot())
        if (!restored) return

        workspaceSnapshotsRef.current = restored.workspaceSnapshotsByRoot
        if (restored.workspaceList && restored.workspaceList.length > 0) {
          setWorkspaceList((prev) => {
            const merged = [...new Set([...restored.workspaceList!, ...prev])]
            return merged.length > 0 ? merged : prev
          })
        }
        if (restored.workspaceRoot) {
          setWorkspaceRoot(restored.workspaceRoot)
        }

        if (restored.panels.length > 0) {
          setPanels(restored.panels)
          const restoredActivePanelId =
            restored.activePanelId && restored.panels.some((panel) => panel.id === restored.activePanelId)
              ? restored.activePanelId
              : restored.panels[0].id
          setActivePanelId(restoredActivePanelId)
        }
        if (restored.editorPanels.length > 0) {
          setEditorPanels(restored.editorPanels)
        }
        if (typeof restored.showWorkspaceWindow === 'boolean') {
          setShowWorkspaceWindow(restored.showWorkspaceWindow)
        }
        if (typeof restored.showCodeWindow === 'boolean') {
          setShowCodeWindow(restored.showCodeWindow)
        }
        if (restored.codeWindowTab) setCodeWindowTab(restored.codeWindowTab)
        if (restored.layoutMode) setLayoutMode(restored.layoutMode)
        if (restored.dockTab) setDockTab(restored.dockTab)
        if (restored.workspaceDockSide) setWorkspaceDockSide(restored.workspaceDockSide)
        if (restored.selectedWorkspaceFile !== undefined) setSelectedWorkspaceFile(restored.selectedWorkspaceFile)
        if (restored.expandedDirectories) setExpandedDirectories(restored.expandedDirectories)
        if (restored.focusedEditorId !== undefined) {
          const editorId = restored.focusedEditorId
          const validEditorId = editorId && restored.editorPanels.some((panel) => panel.id === editorId) ? editorId : null
          setFocusedEditorId(validEditorId)
        }
      } catch {
        // best-effort only
      } finally {
        appStateHydratedRef.current = true
        setAppStateHydrated(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [api, applicationSettings.restoreSessionOnStartup])

  const modelsCatalogFetchedRef = useRef(false)
  useEffect(() => {
    if (!api.getAvailableModels || modelsCatalogFetchedRef.current) return
    modelsCatalogFetchedRef.current = true
    void (async () => {
      try {
        const available = await api.getAvailableModels()
        if (
          available.codex.length === 0 &&
          available.claude.length === 0 &&
          available.gemini.length === 0 &&
          available.openrouter.length === 0
        ) return
        setModelConfig((prev) => syncModelConfigWithCatalog(prev, available, providerRegistry))
      } catch {
        // ignore - use built-in models only
      }
    })()
  }, [api, providerRegistry])

  const resolvedProviderConfigs = useMemo(
    () => resolveProviderConfigs(providerRegistry),
    [providerRegistry],
  )
  const showDockedAppSettings = showCodeWindow && codeWindowTab === 'settings'

  useEffect(() => {
    if (!showDockedAppSettings || (appSettingsView !== 'connectivity' && appSettingsView !== 'diagnostics')) return
    setDiagnosticsError(null)
    void Promise.all(
      resolvedProviderConfigs
        .filter((config) => config.id !== 'openrouter')
        .map(async (config) => refreshProviderAuthStatus(config)),
    )
    void (async () => {
      try {
        const info = await api.getDiagnosticsInfo?.()
        if (!info) return
        setDiagnosticsInfo(info)
      } catch (err) {
        setDiagnosticsError(formatError(err))
      }
    })()
  }, [api, appSettingsView, showDockedAppSettings, resolvedProviderConfigs])

  useEffect(() => {
    if (!showDockedAppSettings || appSettingsView !== 'orchestrator') return
    void api.getOrchestratorLicenseKeyState?.().then((s) => setOrchestratorLicenseKeyState(s ?? null))
  }, [api, appSettingsView, showDockedAppSettings])

  useEffect(() => {
    setCodeBlockOpenById((prev) => {
      const keys = Object.keys(prev)
      if (keys.length === 0) return prev
      let changed = false
      const next = { ...prev }
      for (const units of Object.values(panelTimelineById)) {
        for (const unit of units) {
          if (unit.kind !== 'code' || unit.status !== 'completed' || timelinePinnedCodeByUnitId[unit.id]) continue
          const prefix = `${unit.id}:`
          for (const key of keys) {
            if (key.startsWith(prefix) && next[key]) {
              next[key] = false
              changed = true
            }
          }
        }
      }
      return changed ? next : prev
    })
  }, [panelTimelineById, timelinePinnedCodeByUnitId])

  useEffect(() => {
    if (!appStateHydratedRef.current) return
    if (!api.saveAppState) return
    if (appStateSaveTimerRef.current !== null) {
      globalThis.clearTimeout(appStateSaveTimerRef.current)
    }
    appStateSaveTimerRef.current = globalThis.setTimeout(() => {
      const snapshotsForPersist: Record<string, WorkspaceUiSnapshot> = { ...workspaceSnapshotsRef.current }
      const currentWorkspace = workspaceRootRef.current?.trim()
      if (currentWorkspace) {
        snapshotsForPersist[currentWorkspace] = buildWorkspaceSnapshot(currentWorkspace)
      }
      const payload = {
        version: 1,
        savedAt: Date.now(),
        workspaceRoot,
        workspaceList,
        workspaceSnapshotsByRoot: Object.fromEntries(
          Object.entries(snapshotsForPersist).map(([workspacePath, snapshot]) => [
            workspacePath,
            {
              layoutMode: snapshot.layoutMode,
              showWorkspaceWindow: snapshot.showWorkspaceWindow,
              showCodeWindow: snapshot.showCodeWindow,
              codeWindowTab: snapshot.codeWindowTab,
              dockTab: snapshot.dockTab,
              workspaceDockSide: snapshot.workspaceDockSide,
              panels: snapshot.panels.map((panel) => ({
                id: panel.id,
                historyId: panel.historyId,
                title: panel.title,
                cwd: panel.cwd,
                model: panel.model,
                interactionMode: panel.interactionMode,
                permissionMode: panel.permissionMode,
                sandbox: panel.sandbox,
                status: panel.status,
                messages: cloneChatMessages(panel.messages),
                attachments: panel.attachments.map((item) => ({ ...item })),
                input: panel.input,
                pendingInputs: [...panel.pendingInputs],
                fontScale: panel.fontScale,
              })),
              editorPanels: snapshot.editorPanels.map((panel) => ({
                id: panel.id,
                workspaceRoot: panel.workspaceRoot,
                relativePath: panel.relativePath,
                title: panel.title,
                fontScale: panel.fontScale,
                content: panel.content,
                size: panel.size,
                dirty: panel.dirty,
                binary: panel.binary,
                error: panel.error,
                savedAt: panel.savedAt,
              })),
              activePanelId: snapshot.activePanelId,
              focusedEditorId: snapshot.focusedEditorId,
              selectedWorkspaceFile: snapshot.selectedWorkspaceFile,
              expandedDirectories: snapshot.expandedDirectories,
            },
          ]),
        ),
        layoutMode,
        showWorkspaceWindow,
        showCodeWindow,
        codeWindowTab,
        dockTab,
        workspaceDockSide,
        activePanelId,
        focusedEditorId,
        selectedWorkspaceFile,
        expandedDirectories,
        panels: panels.map((panel) => ({
          id: panel.id,
          historyId: panel.historyId,
          title: panel.title,
          cwd: panel.cwd,
          model: panel.model,
          interactionMode: panel.interactionMode,
          permissionMode: panel.permissionMode,
          sandbox: panel.sandbox,
          status: panel.status,
          messages: cloneChatMessages(panel.messages),
          attachments: panel.attachments.map((item) => ({ ...item })),
          input: panel.input,
          pendingInputs: [...panel.pendingInputs],
          fontScale: panel.fontScale,
        })),
        editorPanels: editorPanels.map((panel) => ({
          id: panel.id,
          workspaceRoot: panel.workspaceRoot,
          relativePath: panel.relativePath,
          title: panel.title,
          fontScale: panel.fontScale,
          content: panel.content,
          size: panel.size,
          dirty: panel.dirty,
          binary: panel.binary,
          error: panel.error,
          savedAt: panel.savedAt,
          editMode: panel.editMode,
        })),
      }
      void api.saveAppState(payload).catch(() => {})
      appStateSaveTimerRef.current = null
    }, APP_STATE_AUTOSAVE_MS)

    return () => {
      if (appStateSaveTimerRef.current !== null) {
        globalThis.clearTimeout(appStateSaveTimerRef.current)
        appStateSaveTimerRef.current = null
      }
    }
  }, [
    api,
    activePanelId,
    codeWindowTab,
    dockTab,
    editorPanels,
    expandedDirectories,
    focusedEditorId,
    layoutMode,
    panels,
    selectedWorkspaceFile,
    showWorkspaceWindow,
    showCodeWindow,
    workspaceList,
    workspaceRoot,
    workspaceDockSide,
  ])

  useEffect(() => {
    const activePanelIds = new Set(panels.map((p) => p.id))
    for (const panelId of Array.from(stickToBottomByPanelRef.current.keys())) {
      if (!activePanelIds.has(panelId)) {
        stickToBottomByPanelRef.current.delete(panelId)
      }
    }
    for (const codeBlockId of Array.from(stickToBottomByCodeBlockRef.current.keys())) {
      if (!codeBlockViewportRefs.current.has(codeBlockId)) {
        stickToBottomByCodeBlockRef.current.delete(codeBlockId)
      }
    }

    const scrollStickyViewports = () => {
      for (const p of panels) {
        const viewport = messageViewportRefs.current.get(p.id)
        if (!viewport) continue
        const stickToBottom = stickToBottomByPanelRef.current.get(p.id) ?? true
        if (!stickToBottom) continue
        viewport.scrollTop = viewport.scrollHeight
      }
      for (const [codeBlockId, viewport] of codeBlockViewportRefs.current) {
        const stickToBottom = stickToBottomByCodeBlockRef.current.get(codeBlockId) ?? true
        if (!stickToBottom) continue
        viewport.scrollTop = viewport.scrollHeight
      }
    }
    let raf2: number | undefined
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        scrollStickyViewports()
        requestAnimationFrame(scrollStickyViewports)
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2 !== undefined) cancelAnimationFrame(raf2)
    }
  }, [panels])

  useEffect(() => {
    const prefs = explorerPrefsByWorkspace[workspaceRoot] ?? DEFAULT_EXPLORER_PREFS
    setShowHiddenFiles(prefs.showHiddenFiles)
    setShowNodeModules(prefs.showNodeModules)
    setExpandedDirectories({})
    setExplorerContextMenu(null)
    setGitContextMenu(null)
    setSelectedGitPaths([])
    setGitSelectionAnchorPath(null)
    setSelectedWorkspaceFile(null)
    setFocusedEditorId(null)
    void refreshWorkspaceTree(prefs)
    void refreshGitStatus()
  }, [workspaceRoot, api])

  useEffect(() => {
    const entries = gitStatus?.entries ?? []
    if (entries.length === 0) {
      if (selectedGitPaths.length > 0) setSelectedGitPaths([])
      if (gitSelectionAnchorPath) setGitSelectionAnchorPath(null)
      return
    }
    const validPaths = new Set(entries.map((entry) => entry.relativePath))
    setSelectedGitPaths((prev) => prev.filter((path) => validPaths.has(path)))
    setGitSelectionAnchorPath((prev) => (prev && validPaths.has(prev) ? prev : null))
  }, [gitStatus])

  useEffect(() => {
    if (!gitOperationSuccess) return
    const t = setTimeout(() => setGitOperationSuccess(null), 4000)
    return () => clearTimeout(t)
  }, [gitOperationSuccess])

  useEffect(() => {
    setExpandedDirectories({})
    void refreshWorkspaceTree()
  }, [showHiddenFiles, showNodeModules])

  useEffect(() => {
    const ws = workspaceSettingsByPath[workspaceRoot]
    if (!ws?.defaultModel) return
    const provider = getModelProvider(ws.defaultModel)
    void ensureProviderReady(provider, `workspace default model (${ws.defaultModel})`).catch((err) => {
      const notice = formatError(err)
      const panelId = panelsRef.current[0]?.id
      if (!panelId) return
      setPanels((prev) =>
        prev.map((p) =>
          p.id !== panelId
            ? p
            : {
                ...p,
                messages: [...p.messages, { id: newId(), role: 'system', content: notice, format: 'text', createdAt: Date.now() }],
              },
        ),
      )
    })
  }, [workspaceRoot, workspaceSettingsByPath, modelConfig])

  useEffect(() => {
    setPanels((prev) => {
      let changed = false
      const next = prev.map((panel) => {
        const clamped = clampPanelSecurityForWorkspace(panel.cwd, panel.sandbox, panel.permissionMode)
        if (clamped.sandbox === panel.sandbox && clamped.permissionMode === panel.permissionMode) return panel
        changed = true
        return {
          ...panel,
          sandbox: clamped.sandbox,
          permissionMode: clamped.permissionMode,
          connected: false,
          status: 'Workspace limits changed. Reconnect on next send.',
        }
      })
      return changed ? next : prev
    })
  }, [workspaceRoot, workspaceSettingsByPath])

  useEffect(() => {
    const t = setInterval(() => setActivityClock(Date.now()), 400)
    return () => clearInterval(t)
  }, [])

  useEffect(
    () => () => {
      for (const t of activityFlushTimers.current.values()) clearTimeout(t)
      activityFlushTimers.current.clear()
    },
    [],
  )

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (target.closest('[data-settings-popover-root="true"]')) return
      setSettingsPopoverByPanel({})
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsPopoverByPanel({})
    }
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  function formatWorkspaceClaimFailure(requestedRoot: string, result: WorkspaceLockAcquireResult) {
    if (result.ok) return ''
    if (result.reason === 'in-use') {
      const owner = result.owner
      const detail =
        owner && owner.pid
          ? `Locked by PID ${owner.pid}${owner.hostname ? ` on ${owner.hostname}` : ''} (heartbeat ${new Date(owner.heartbeatAt).toLocaleString()}).`
          : 'Another Barnaby instance is already active in this workspace.'
      return `Cannot open workspace:\n${requestedRoot}\n\n${detail}`
    }
    if (result.reason === 'invalid-workspace') {
      return `Cannot open workspace:\n${requestedRoot}\n\n${result.message}`
    }
    return `Cannot open workspace:\n${requestedRoot}\n\n${result.message || 'Unknown error.'}`
  }

  function handleWorkspacePickerFailure(requestedRoot: string, failure: WorkspaceApplyFailure) {
    const msg =
      failure.kind === 'request-error'
        ? failure.message
        : formatWorkspaceClaimFailure(requestedRoot, failure.result)
    setWorkspacePickerError(msg)
  }

  function makeWorkspaceDefaultPanel(nextWorkspaceRoot: string) {
    const ws = workspaceSettingsByPath[nextWorkspaceRoot]
    const panel = makeDefaultPanel('default', nextWorkspaceRoot)
    if (ws?.defaultModel) {
      panel.model = ws.defaultModel
      panel.messages = withModelBanner(panel.messages, ws.defaultModel)
    }
    if (ws?.permissionMode) panel.permissionMode = ws.permissionMode
    if (ws?.sandbox) panel.sandbox = ws.sandbox
    return panel
  }

  function buildWorkspaceSnapshot(nextWorkspaceRoot: string): WorkspaceUiSnapshot {
    const normalizedWorkspaceRoot = normalizeWorkspacePathForCompare(nextWorkspaceRoot)
    const workspacePanels = panelsRef.current
      .filter((panel) => normalizeWorkspacePathForCompare(panel.cwd) === normalizedWorkspaceRoot)
      .map((panel) => ({
        ...panel,
        connected: false,
        streaming: false,
        status: panel.connected || panel.streaming ? 'Disconnected after workspace switch.' : panel.status,
        messages: cloneChatMessages(panel.messages),
        attachments: panel.attachments.map((attachment) => ({ ...attachment })),
        pendingInputs: [...panel.pendingInputs],
      }))
    const workspaceEditors = editorPanelsRef.current
      .filter((panel) => normalizeWorkspacePathForCompare(panel.workspaceRoot) === normalizedWorkspaceRoot)
      .map((panel) => ({ ...panel }))
    return {
      layoutMode,
      showWorkspaceWindow,
      showCodeWindow,
      codeWindowTab,
      dockTab,
      workspaceDockSide,
      panels: workspacePanels,
      editorPanels: workspaceEditors,
      activePanelId: panelsRef.current.some((panel) => panel.id === activePanelId) ? activePanelId : workspacePanels[0]?.id ?? null,
      focusedEditorId: focusedEditorIdRef.current,
      selectedWorkspaceFile,
      expandedDirectories: { ...expandedDirectories },
    }
  }

  function applyWorkspaceSnapshot(nextWorkspaceRoot: string) {
    const snapshot = workspaceSnapshotsRef.current[nextWorkspaceRoot]
    if (!snapshot) {
      const panel = makeWorkspaceDefaultPanel(nextWorkspaceRoot)
      setLayoutMode('vertical')
      setShowWorkspaceWindow(true)
      setShowCodeWindow(true)
      setCodeWindowTab('code')
      setDockTab('explorer')
      setWorkspaceDockSide(getInitialWorkspaceDockSide())
      setExpandedDirectories({})
      setSelectedWorkspaceFile(null)
      setEditorPanels([])
      setFocusedEditorId(null)
      setPanels([panel])
      setActivePanelId(panel.id)
      return
    }
    setLayoutMode(snapshot.layoutMode)
    setShowWorkspaceWindow(snapshot.showWorkspaceWindow)
    setShowCodeWindow(snapshot.showCodeWindow)
    setCodeWindowTab(snapshot.codeWindowTab)
    setDockTab(snapshot.dockTab)
    setWorkspaceDockSide(snapshot.workspaceDockSide)
    setExpandedDirectories({ ...snapshot.expandedDirectories })
    setSelectedWorkspaceFile(snapshot.selectedWorkspaceFile)
    setEditorPanels(snapshot.editorPanels.map((panel) => ({ ...panel })))
    const restoredPanels = snapshot.panels.map((panel) => ({
      ...panel,
      cwd: nextWorkspaceRoot,
      connected: false,
      streaming: false,
      status: 'Restored for workspace.',
      messages: cloneChatMessages(panel.messages),
      attachments: panel.attachments.map((attachment) => ({ ...attachment })),
      pendingInputs: [...panel.pendingInputs],
    }))
    if (restoredPanels.length > 0) {
      setPanels(restoredPanels)
      const nextActivePanelId =
        snapshot.activePanelId && restoredPanels.some((panel) => panel.id === snapshot.activePanelId)
          ? snapshot.activePanelId
          : restoredPanels[0].id
      setActivePanelId(nextActivePanelId)
    } else {
      const panel = makeWorkspaceDefaultPanel(nextWorkspaceRoot)
      setPanels([panel])
      setActivePanelId(panel.id)
    }
    const nextFocusedEditor =
      snapshot.focusedEditorId && snapshot.editorPanels.some((panel) => panel.id === snapshot.focusedEditorId)
        ? snapshot.focusedEditorId
        : null
    setFocusedEditorId(nextFocusedEditor)
  }

  function openWorkspacePicker(prompt?: string | null) {
    const nextPrompt = typeof prompt === 'string' && prompt.trim() ? prompt.trim() : null
    setWorkspacePickerPrompt(nextPrompt)
    setWorkspacePickerError(null)
    setWorkspacePickerOpening(null)
    setShowWorkspacePicker(true)
  }

  function closeWorkspacePicker() {
    if (isLockedWorkspacePrompt(workspacePickerPrompt)) return
    setShowWorkspacePicker(false)
    setWorkspacePickerPrompt(null)
    setWorkspacePickerError(null)
    setWorkspacePickerOpening(null)
  }

  function openSetupWizard() {
    setSetupWizardStep('providers')
    setSetupWizardSelection(getDefaultSetupWizardSelection())
    setSetupWizardStatus(null)
    setShowSetupWizard(true)
  }

  async function runSetupConnectivityChecks(selected: ConnectivityProvider[]) {
    const statuses = await Promise.all(
      selected.map(async (providerId) => {
        const config = resolvedProviderConfigs.find((p) => p.id === providerId)
        if (!config) return null
        return refreshProviderAuthStatus(config)
      }),
    )
    return statuses
  }

  async function finishSetupWizard() {
    const selected = CONNECTIVITY_PROVIDERS.filter((id) => setupWizardSelection[id])
    if (selected.length === 0) {
      setSetupWizardStatus('Select at least one provider to continue.')
      return
    }
    setSetupWizardFinishing(true)
    setSetupWizardStatus('Checking selected providers...')
    try {
      const statuses = await runSetupConnectivityChecks(selected)
      const connected = statuses.some((s) => Boolean(s?.authenticated))
      if (!connected) {
        setSetupWizardStatus('No selected provider is connected yet. Complete login/API key setup for at least one provider.')
        return
      }
      setProviderRegistry((prev) => ({
        ...prev,
        overrides: {
          ...prev.overrides,
          ...Object.fromEntries(
            CONNECTIVITY_PROVIDERS.filter((id) => setupWizardSelection[id]).map((id) => [
              id,
              { ...(prev.overrides[id] ?? {}), enabled: true },
            ]),
          ),
        },
      }))
      localStorage.setItem(SETUP_WIZARD_DONE_STORAGE_KEY, '1')
      setShowSetupWizard(false)
      setSetupWizardStatus(null)
      if (!workspaceRootRef.current?.trim()) {
        openWorkspacePicker('Select or create a workspace to continue.')
      }
    } finally {
      setSetupWizardFinishing(false)
    }
  }

  async function applyWorkspaceRoot(
    nextRoot: string,
    options?: {
      showFailureAlert?: boolean
      rebindPanels?: boolean
      onFailure?: (failure: WorkspaceApplyFailure) => void
    },
  ) {
    const targetRoot = nextRoot.trim()
    if (!targetRoot) return null
    const showFailureAlert = options?.showFailureAlert ?? true
    const rebindPanels = options?.rebindPanels ?? false
    const onFailure = options?.onFailure

    let lockResult: WorkspaceLockAcquireResult
    try {
      lockResult = await api.claimWorkspace(targetRoot)
    } catch (err) {
      const message = formatError(err)
      if (showFailureAlert) {
        alert(`Cannot open workspace:\n${targetRoot}\n\n${message}`)
      }
      onFailure?.({ kind: 'request-error', message })
      return null
    }

    if (!lockResult.ok) {
      if (showFailureAlert) {
        alert(formatWorkspaceClaimFailure(targetRoot, lockResult))
      }
      onFailure?.({ kind: 'lock-denied', result: lockResult })
      return null
    }

    const resolvedRoot = lockResult.workspaceRoot
    const previousLockedRoot = activeWorkspaceLockRef.current
    activeWorkspaceLockRef.current = resolvedRoot
    if (previousLockedRoot && previousLockedRoot !== resolvedRoot) {
      void api.releaseWorkspace(previousLockedRoot).catch(() => {})
    }

    if (workspaceRootRef.current === resolvedRoot) return resolvedRoot

    setWorkspaceRoot(resolvedRoot)
    if (rebindPanels) {
      // Workspace is central: propagate to all panels and force reconnect on next send.
      setPanels((prev) =>
        prev.map((p) => ({
          ...p,
          cwd: resolvedRoot,
          connected: false,
          status: 'Workspace changed. Reconnect on next send.',
        })),
      )
    }
    return resolvedRoot
  }

  function requestWorkspaceSwitch(targetRoot: string, source: 'menu' | 'picker' | 'dropdown' | 'workspace-create') {
    const next = targetRoot.trim()
    if (!next) return
    const current = workspaceRootRef.current?.trim() ?? ''
    if (source !== 'picker' && normalizeWorkspacePathForCompare(next) === normalizeWorkspacePathForCompare(current)) return
    const fromPicker = source === 'picker'
    if (fromPicker) {
      setWorkspacePickerError(null)
      setWorkspacePickerOpening(next)
    }
    if (!current) {
      void (async () => {
        try {
          const openedRoot = await applyWorkspaceRoot(next, {
            showFailureAlert: !fromPicker,
            rebindPanels: false,
            onFailure: fromPicker ? (f) => handleWorkspacePickerFailure(next, f) : undefined,
          })
          if (!openedRoot) return
          applyWorkspaceSnapshot(openedRoot)
          if (fromPicker) closeWorkspacePicker()
          if (source === 'workspace-create') setShowWorkspaceModal(false)
        } finally {
          if (fromPicker) setWorkspacePickerOpening(null)
        }
      })()
      return
    }
    if (fromPicker) {
      void doWorkspaceSwitch(next, source)
      return
    }
    setPendingWorkspaceSwitch({ targetRoot: next, source })
  }

  async function doWorkspaceSwitch(targetRoot: string, source: 'menu' | 'picker' | 'dropdown' | 'workspace-create') {
    const currentWorkspace = workspaceRootRef.current?.trim()
    const panelIds = [...new Set(panelsRef.current.map((panel) => panel.id))]
    if (currentWorkspace) {
      workspaceSnapshotsRef.current[currentWorkspace] = buildWorkspaceSnapshot(currentWorkspace)
    }
    const fromPicker = source === 'picker'
    if (fromPicker) {
      setWorkspacePickerError(null)
      setWorkspacePickerOpening(targetRoot)
    }
    const openedRoot = await applyWorkspaceRoot(targetRoot, {
      showFailureAlert: !fromPicker,
      rebindPanels: false,
      onFailure: fromPicker ? (f) => handleWorkspacePickerFailure(targetRoot, f) : undefined,
    }).finally(() => {
      if (fromPicker) setWorkspacePickerOpening(null)
    })
    if (!openedRoot) return

    if (fromPicker) closeWorkspacePicker()
    await Promise.all(panelIds.map((id) => api.disconnect(id).catch(() => {})))

    setPanels([])
    setEditorPanels([])
    setActivePanelId('default')
    setFocusedEditorId(null)
    setSelectedHistoryId('')
    setSelectedWorkspaceFile(null)
    setExpandedDirectories({})
    applyWorkspaceSnapshot(openedRoot)
    if (source === 'workspace-create') setShowWorkspaceModal(false)
  }

  async function confirmWorkspaceSwitch() {
    const pending = pendingWorkspaceSwitch
    if (!pending) return
    setPendingWorkspaceSwitch(null)
    await doWorkspaceSwitch(pending.targetRoot, pending.source)
  }

  useEffect(() => {
    if (!appStateHydrated) return
    setWorkspaceBootstrapComplete(false)
    let disposed = false
    const bootstrapWorkspace = async () => {
      const preferredRoot = workspaceRootRef.current?.trim()
      if (!preferredRoot) {
        if (getInitialSetupWizardDone()) {
          openWorkspacePicker('Select a workspace folder to get started.')
          return
        }
        const chatHistory = await api.loadChatHistory?.()
        const appState = await api.loadAppState?.()
        const hasPriorUse =
          (Array.isArray(chatHistory) && chatHistory.length > 0) ||
          (appState != null && typeof appState === 'object')
        if (hasPriorUse) {
          localStorage.setItem(SETUP_WIZARD_DONE_STORAGE_KEY, '1')
          openWorkspacePicker('Select a workspace folder to get started.')
        } else {
          openSetupWizard()
        }
        return
      }

      const failureRef = { value: null as WorkspaceApplyFailure | null }
      const openedPreferred = await applyWorkspaceRoot(preferredRoot, {
        showFailureAlert: false,
        rebindPanels: false,
        onFailure: (f) => {
          failureRef.value = f
        },
      })
      if (disposed || openedPreferred) return
      const failure = failureRef.value
      if (failure?.kind === 'lock-denied' && !failure.result.ok && failure.result.reason === 'in-use') {
        setWorkspaceRoot('')
        openWorkspacePicker(STARTUP_LOCKED_WORKSPACE_PROMPT)
        return
      }

      for (const candidate of workspaceListRef.current) {
        const next = candidate.trim()
        if (!next || next === preferredRoot) continue
        const opened = await applyWorkspaceRoot(next, { showFailureAlert: false, rebindPanels: false })
        if (disposed) return
        if (opened) {
          applyWorkspaceSnapshot(opened)
          return
        }
      }

      if (!disposed) {
        setWorkspaceRoot('')
        openWorkspacePicker(ALL_WORKSPACES_LOCKED_PROMPT)
      }
    }

    void (async () => {
      try {
        await bootstrapWorkspace()
      } finally {
        if (!disposed) setWorkspaceBootstrapComplete(true)
      }
    })()
    return () => {
      disposed = true
    }
  }, [appStateHydrated])

  useEffect(() => {
    if (startupReadyNotifiedRef.current) return
    if (!appStateHydrated) return
    if (!workspaceBootstrapComplete) return
    if (workspaceTreeLoading || gitStatusLoading) return
    startupReadyNotifiedRef.current = true
    void api.notifyRendererReady?.().catch(() => {})
  }, [api, appStateHydrated, workspaceBootstrapComplete, workspaceTreeLoading, gitStatusLoading])

  useEffect(
    () => () => {
      const lockedRoot = activeWorkspaceLockRef.current
      if (!lockedRoot) return
      void api.releaseWorkspace(lockedRoot).catch(() => {})
      activeWorkspaceLockRef.current = ''
    },
    [api],
  )

  function upsertPanelToHistory(panel: AgentPanelState) {
    const sanitizedMessages = stripSyntheticAutoContinueMessages(panel.messages)
    const hasConversation = sanitizedMessages.some((m) => m.role === 'user' || m.role === 'assistant')
    if (!hasConversation) return
    const entryId = panel.historyId || newId()
    const title = getConversationPrecis(panel) || panel.title || 'Untitled chat'
    const entry: ChatHistoryEntry = {
      id: entryId,
      title,
      savedAt: Date.now(),
      workspaceRoot: panel.cwd || workspaceRoot,
      model: panel.model || DEFAULT_MODEL,
      permissionMode: panel.permissionMode,
      sandbox: panel.sandbox,
      fontScale: panel.fontScale,
      messages: cloneChatMessages(sanitizedMessages),
    }
    setChatHistory((prev) => [entry, ...prev.filter((item) => item.id !== entryId)].slice(0, MAX_CHAT_HISTORY_ENTRIES))
  }

  function openChatFromHistory(historyId: string) {
    const entry = workspaceScopedHistory.find((x) => x.id === historyId)
    if (!entry) return
    const existing = panelsRef.current.find((x) => x.historyId === historyId)
    if (existing) {
      setActivePanelId(existing.id)
      setHistoryDropdownOpen(false)
      setFocusedEditorId(null)
      return
    }
    if (panelsRef.current.length >= MAX_PANELS) {
      alert(`Maximum ${MAX_PANELS} panels open. Close one panel first.`)
      return
    }
    const panelId = newId()
    const restoredMessages = cloneChatMessages(stripSyntheticAutoContinueMessages(entry.messages))
    setPanels((prev) => {
      if (prev.length >= MAX_PANELS) return prev
      return [
        ...prev,
        {
          id: panelId,
          historyId: entry.id,
          title: entry.title,
          cwd: entry.workspaceRoot || workspaceRoot,
          model: entry.model || DEFAULT_MODEL,
          interactionMode: 'agent',
          permissionMode: entry.permissionMode,
          sandbox: entry.sandbox,
          status: `Loaded from history (${new Date(entry.savedAt).toLocaleString()})`,
          connected: false,
          streaming: false,
          messages: restoredMessages,
          attachments: [],
          input: '',
          pendingInputs: [],
          fontScale: entry.fontScale,
          usage: undefined,
        },
      ]
    })
    setActivePanelId(panelId)
    setHistoryDropdownOpen(false)
    setFocusedEditorId(null)
  }

  async function deleteHistoryEntry(
    historyId: string,
    opts: { deleteAll?: boolean; deleteThisAndOlder?: boolean },
  ) {
    const selected = chatHistory.find((e) => e.id === historyId)
    let idsToDelete: string[]

    if (opts.deleteAll) {
      idsToDelete = chatHistory.map((e) => e.id)
    } else if (opts.deleteThisAndOlder && selected) {
      const normalizedRoot = normalizeWorkspacePathForCompare(selected.workspaceRoot || '')
      idsToDelete = chatHistory
        .filter(
          (e) =>
            normalizeWorkspacePathForCompare(e.workspaceRoot || '') === normalizedRoot &&
            e.savedAt <= selected.savedAt,
        )
        .map((e) => e.id)
    } else {
      idsToDelete = [historyId]
    }

    for (const id of idsToDelete) {
      const panel = panelsRef.current.find((w) => w.historyId === id)
      if (panel) await closePanel(panel.id, { skipUpsertToHistory: true })
    }
    setChatHistory((prev) => prev.filter((e) => !idsToDelete.includes(e.id)))
    setDeleteHistoryIdPending(null)
    setDeleteAllHistoryChecked(false)
    setDeleteThisAndOlderChecked(false)
    setHistoryDropdownOpen(false)
  }

  function archivePanelToHistory(panel: AgentPanelState) {
    const sanitizedMessages = stripSyntheticAutoContinueMessages(panel.messages)
    const hasConversation = sanitizedMessages.some((m) => m.role === 'user' || m.role === 'assistant')
    if (!hasConversation) return
    const title = getConversationPrecis(panel) || panel.title || 'Untitled chat'
    const entry: ChatHistoryEntry = {
      id: newId(),
      title,
      savedAt: Date.now(),
      workspaceRoot: panel.cwd || workspaceRoot,
      model: panel.model || DEFAULT_MODEL,
      permissionMode: panel.permissionMode,
      sandbox: panel.sandbox,
      fontScale: panel.fontScale,
      messages: cloneChatMessages(sanitizedMessages),
    }
    setChatHistory((prev) => [entry, ...prev].slice(0, MAX_CHAT_HISTORY_ENTRIES))
  }

  function registerTextarea(panelId: string, el: HTMLTextAreaElement | null) {
    if (!el) {
      textareaRefs.current.delete(panelId)
      return
    }
    textareaRefs.current.set(panelId, el)
    queueMicrotask(() => autoResizeTextarea(panelId))
  }

  function registerMessageViewport(panelId: string, el: HTMLDivElement | null) {
    if (!el) {
      messageViewportRefs.current.delete(panelId)
      return
    }
    messageViewportRefs.current.set(panelId, el)
    // Preserve stickiness across ref callback churn (React may call ref(null) then ref(el) on rerender).
    // Initial default is "stick to bottom" so new output keeps the latest message in view.
    if (!stickToBottomByPanelRef.current.has(panelId)) {
      stickToBottomByPanelRef.current.set(panelId, true)
    }
  }

  function registerCodeBlockViewport(codeBlockId: string, el: HTMLPreElement | null) {
    if (!el) {
      codeBlockViewportRefs.current.delete(codeBlockId)
      return
    }
    codeBlockViewportRefs.current.set(codeBlockId, el)
    if (!stickToBottomByCodeBlockRef.current.has(codeBlockId)) {
      stickToBottomByCodeBlockRef.current.set(codeBlockId, isViewportNearBottom(el))
    }
  }

  function isViewportNearBottom(viewport: HTMLElement, thresholdPx = 32) {
    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
    return distanceFromBottom <= thresholdPx
  }

  function onMessageViewportScroll(panelId: string) {
    const viewport = messageViewportRefs.current.get(panelId)
    if (!viewport) return
    stickToBottomByPanelRef.current.set(panelId, isViewportNearBottom(viewport))
  }

  function onCodeBlockViewportScroll(codeBlockId: string) {
    const viewport = codeBlockViewportRefs.current.get(codeBlockId)
    if (!viewport) return
    stickToBottomByCodeBlockRef.current.set(codeBlockId, isViewportNearBottom(viewport))
  }

  function autoResizeTextarea(panelId: string) {
    const el = textareaRefs.current.get(panelId)
    if (!el) return
    el.style.height = 'auto'
    const nextHeight = Math.min(el.scrollHeight, INPUT_MAX_HEIGHT_PX)
    el.style.height = `${nextHeight}px`
    el.style.overflowY = el.scrollHeight > INPUT_MAX_HEIGHT_PX ? 'auto' : 'hidden'
  }

  function hasSelectedTextInChatHistory(container: HTMLElement) {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return false
    if (!selection.toString()) return false
    for (let idx = 0; idx < selection.rangeCount; idx += 1) {
      const range = selection.getRangeAt(idx)
      if (range.collapsed) continue
      if (
        container.contains(range.startContainer) ||
        container.contains(range.endContainer) ||
        container.contains(range.commonAncestorContainer)
      ) {
        return true
      }
    }
    return false
  }

  function onChatHistoryContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    if (!hasSelectedTextInChatHistory(e.currentTarget)) return
    e.preventDefault()
    void api.showContextMenu?.('chat-selection')
  }

  function onInputPanelContextMenu(e: React.MouseEvent<HTMLTextAreaElement>) {
    const input = e.currentTarget
    if (input.selectionStart === input.selectionEnd) return
    e.preventDefault()
    void api.showContextMenu?.('input-selection')
  }

  function zoomPanelFont(panelId: string, deltaY: number) {
    setPanels((prev) =>
      prev.map((p) =>
        p.id === panelId
          ? {
              ...p,
              fontScale: getNextFontScale(p.fontScale, deltaY),
            }
          : p,
      ),
    )
  }

  function zoomEditorFont(editorId: string, deltaY: number) {
    setEditorPanels((prev) =>
      prev.map((p) =>
        p.id === editorId
          ? {
              ...p,
              fontScale: getNextFontScale(p.fontScale, deltaY),
            }
          : p,
      ),
    )
  }

  async function browseForWorkspaceIntoForm() {
    const path = await api.openFolderDialog?.()
    if (!path) return
    setWorkspaceForm((prev) => {
      const nextForm = { ...prev, path }
      if (showWorkspaceModal) {
        const normalized = normalizeWorkspaceSettingsForm(nextForm)
        queueMicrotask(() => {
          void persistWorkspaceSettings(normalized, { requestSwitch: true })
        })
      } else if (dockTab === 'settings') {
        const normalized = normalizeWorkspaceSettingsForm(nextForm)
        queueMicrotask(() => {
          void persistWorkspaceSettings(normalized, { requestSwitch: true })
        })
      }
      return nextForm
    })
  }

  function buildWorkspaceForm(mode: 'new' | 'edit') {
    const current =
      workspaceSettingsByPath[workspaceRoot] ??
      ({
        path: workspaceRoot,
        defaultModel: DEFAULT_MODEL,
        permissionMode: 'verify-first',
        sandbox: 'workspace-write',
        allowedCommandPrefixes: [...DEFAULT_WORKSPACE_ALLOWED_COMMAND_PREFIXES],
        allowedAutoReadPrefixes: [...DEFAULT_WORKSPACE_ALLOWED_AUTO_READ_PREFIXES],
        allowedAutoWritePrefixes: [...DEFAULT_WORKSPACE_ALLOWED_AUTO_WRITE_PREFIXES],
        deniedAutoReadPrefixes: [...DEFAULT_WORKSPACE_DENIED_AUTO_READ_PREFIXES],
        deniedAutoWritePrefixes: [...DEFAULT_WORKSPACE_DENIED_AUTO_WRITE_PREFIXES],
      } as WorkspaceSettings)

    const cmdPrefixes = normalizeAllowedCommandPrefixes(current.allowedCommandPrefixes)
    const readPrefixes = normalizeAllowedCommandPrefixes(current.allowedAutoReadPrefixes)
    const writePrefixes = normalizeAllowedCommandPrefixes(current.allowedAutoWritePrefixes)
    const deniedRead = normalizeAllowedCommandPrefixes(current.deniedAutoReadPrefixes)
    const deniedWrite = normalizeAllowedCommandPrefixes(current.deniedAutoWritePrefixes)

    if (mode === 'new') {
      return {
        path: workspaceRoot,
        defaultModel: current.defaultModel ?? DEFAULT_MODEL,
        permissionMode: current.permissionMode ?? 'verify-first',
        sandbox: current.sandbox ?? 'workspace-write',
        allowedCommandPrefixes: cmdPrefixes,
        allowedAutoReadPrefixes: readPrefixes,
        allowedAutoWritePrefixes: writePrefixes,
        deniedAutoReadPrefixes: deniedRead,
        deniedAutoWritePrefixes: deniedWrite,
      } satisfies WorkspaceSettings
    }

    return {
      path: current.path || workspaceRoot,
      defaultModel: current.defaultModel ?? DEFAULT_MODEL,
      permissionMode: current.permissionMode ?? 'verify-first',
      sandbox: current.sandbox ?? 'workspace-write',
      allowedCommandPrefixes: cmdPrefixes,
      allowedAutoReadPrefixes: readPrefixes,
      allowedAutoWritePrefixes: writePrefixes,
      deniedAutoReadPrefixes: deniedRead,
      deniedAutoWritePrefixes: deniedWrite,
    } satisfies WorkspaceSettings
  }

  function normalizeWorkspaceSettingsForm(form: WorkspaceSettings): WorkspaceSettings {
    const sandbox = form.sandbox
    const permissionMode = sandbox === 'read-only' ? 'verify-first' : form.permissionMode
    return {
      path: form.path.trim(),
      defaultModel: form.defaultModel.trim() || DEFAULT_MODEL,
      permissionMode,
      sandbox,
      allowedCommandPrefixes: normalizeAllowedCommandPrefixes(form.allowedCommandPrefixes),
      allowedAutoReadPrefixes: normalizeAllowedCommandPrefixes(form.allowedAutoReadPrefixes),
      allowedAutoWritePrefixes: normalizeAllowedCommandPrefixes(form.allowedAutoWritePrefixes),
      deniedAutoReadPrefixes: normalizeAllowedCommandPrefixes(form.deniedAutoReadPrefixes),
      deniedAutoWritePrefixes: normalizeAllowedCommandPrefixes(form.deniedAutoWritePrefixes),
    }
  }

  function workspaceFormsEqual(a: WorkspaceSettings, b: WorkspaceSettings): boolean {
    const left = normalizeWorkspaceSettingsForm(a)
    const right = normalizeWorkspaceSettingsForm(b)
    return (
      left.path === right.path &&
      left.defaultModel === right.defaultModel &&
      left.permissionMode === right.permissionMode &&
      left.sandbox === right.sandbox &&
      left.allowedCommandPrefixes.join('\n') === right.allowedCommandPrefixes.join('\n') &&
      left.allowedAutoReadPrefixes.join('\n') === right.allowedAutoReadPrefixes.join('\n') &&
      left.allowedAutoWritePrefixes.join('\n') === right.allowedAutoWritePrefixes.join('\n') &&
      left.deniedAutoReadPrefixes.join('\n') === right.deniedAutoReadPrefixes.join('\n') &&
      left.deniedAutoWritePrefixes.join('\n') === right.deniedAutoWritePrefixes.join('\n')
    )
  }

  function openWorkspaceSettings(mode: 'new' | 'edit') {
    setWorkspaceModalMode(mode)
    const nextForm = buildWorkspaceForm(mode)
    setWorkspaceForm(nextForm)
    setWorkspaceFormTextDraft(workspaceSettingsToTextDraft(nextForm))
    setShowWorkspaceModal(true)
  }

  function openWorkspaceSettingsTab() {
    const nextForm = buildWorkspaceForm('edit')
    setWorkspaceForm(nextForm)
    setWorkspaceFormTextDraft(workspaceSettingsToTextDraft(nextForm))
    setShowWorkspaceModal(false)
    setDockTab('settings')
  }

  async function persistWorkspaceSettings(
    next: WorkspaceSettings,
    options?: { closeModal?: boolean; requestSwitch?: boolean },
  ) {
    if (!next.path) return

    setWorkspaceSettingsByPath((prev) => {
      const existing = prev[next.path]
      if (existing && workspaceFormsEqual(existing, next)) return prev
      return { ...prev, [next.path]: next }
    })
    setWorkspaceList((prev) => (prev.includes(next.path) ? prev : [next.path, ...prev]))
    if (options?.closeModal) setShowWorkspaceModal(false)
    if (options?.requestSwitch) {
      const normalizedCurrentRoot = normalizeWorkspacePathForCompare(workspaceRootRef.current || '')
      const normalizedNextPath = normalizeWorkspacePathForCompare(next.path)
      if (normalizedCurrentRoot !== normalizedNextPath) {
        requestWorkspaceSwitch(next.path, 'workspace-create')
      }
    }

    try {
      await api.writeWorkspaceConfig?.(next.path)
    } catch {
      // best-effort only
    }
  }

  function updateDockedWorkspaceForm(updater: (prev: WorkspaceSettings) => WorkspaceSettings) {
    setWorkspaceForm((prev) => {
      const nextForm = updater(prev)
      const normalized = normalizeWorkspaceSettingsForm(nextForm)
      queueMicrotask(() => {
        const normalizedCurrentRoot = normalizeWorkspacePathForCompare(workspaceRootRef.current || '')
        const normalizedFormPath = normalizeWorkspacePathForCompare(normalized.path)
        if (normalizedCurrentRoot !== normalizedFormPath) return
        void persistWorkspaceSettings(normalized)
      })
      return nextForm
    })
  }

  function updateWorkspaceModalForm(
    updater: (prev: WorkspaceSettings) => WorkspaceSettings,
    options?: { requestSwitch?: boolean },
  ) {
    setWorkspaceForm((prev) => {
      const nextForm = updater(prev)
      const normalized = normalizeWorkspaceSettingsForm(nextForm)
      queueMicrotask(() => {
        void persistWorkspaceSettings(normalized, options?.requestSwitch ? { requestSwitch: true } : undefined)
      })
      return nextForm
    })
  }

  function updateDockedWorkspaceTextDraft(
    field: keyof WorkspaceSettingsTextDraft,
    raw: string,
  ) {
    setWorkspaceFormTextDraft((prev) => ({ ...prev, [field]: raw }))
    setWorkspaceForm((prev) => {
      const nextForm = applyWorkspaceTextDraftField(prev, field, raw)
      const normalized = normalizeWorkspaceSettingsForm(nextForm)
      queueMicrotask(() => {
        const normalizedCurrentRoot = normalizeWorkspacePathForCompare(workspaceRootRef.current || '')
        const normalizedFormPath = normalizeWorkspacePathForCompare(normalized.path)
        if (normalizedCurrentRoot !== normalizedFormPath) return
        void persistWorkspaceSettings(normalized)
      })
      return nextForm
    })
  }

  function updateWorkspaceModalTextDraft(
    field: keyof WorkspaceSettingsTextDraft,
    raw: string,
  ) {
    setWorkspaceFormTextDraft((prev) => ({ ...prev, [field]: raw }))
    updateWorkspaceModalForm((prev) => applyWorkspaceTextDraftField(prev, field, raw))
  }

  async function deleteWorkspace(pathToDelete: string) {
    const remaining = workspaceList.filter((p) => p !== pathToDelete)
    setWorkspaceList(remaining)
    setWorkspaceSettingsByPath((prev) => {
      const next = { ...prev }
      delete next[pathToDelete]
      return next
    })

    if (activeWorkspaceLockRef.current === pathToDelete) {
      try {
        await api.releaseWorkspace(pathToDelete)
      } catch {
        // best effort only
      }
      activeWorkspaceLockRef.current = ''
    }

    if (workspaceRootRef.current === pathToDelete) {
      let switched = false
      for (const nextRoot of remaining) {
        const opened = await applyWorkspaceRoot(nextRoot, { showFailureAlert: false, rebindPanels: false })
        if (opened) {
          applyWorkspaceSnapshot(opened)
          switched = true
          break
        }
      }
      if (!switched) {
        setWorkspaceRoot('')
      }
    }
    setShowWorkspaceModal(false)
  }


  function flushWindowDelta(agentWindowId: string) {
    const buf = deltaBuffers.current.get(agentWindowId) ?? ''
    if (!buf) return
    deltaBuffers.current.set(agentWindowId, '')

    setPanels((prev) =>
      prev.map((w) => {
        if (w.id !== agentWindowId) return w
        const msgs = w.messages
        const lastAssistantIdx = msgs.map((m) => m.role).lastIndexOf('assistant')
        if (w.streaming && lastAssistantIdx >= 0) {
          const last = msgs[lastAssistantIdx]
          return {
            ...w,
            streaming: true,
            messages: [...msgs.slice(0, lastAssistantIdx), { ...last, format: 'markdown', content: last.content + buf, createdAt: last.createdAt ?? Date.now() }, ...msgs.slice(lastAssistantIdx + 1)],
          }
        }
        return {
          ...w,
          streaming: true,
          messages: [...msgs, { id: newId(), role: 'assistant', content: buf, format: 'markdown', createdAt: Date.now() }],
        }
      }),
    )
  }

  function queueDelta(agentWindowId: string, delta: string) {
    deltaBuffers.current.set(agentWindowId, (deltaBuffers.current.get(agentWindowId) ?? '') + delta)
    // Flush immediately on newline for line-by-line streaming feel.
    if (delta.includes('\n')) {
      const t = flushTimers.current.get(agentWindowId)
      if (t) clearTimeout(t)
      flushTimers.current.delete(agentWindowId)
      flushWindowDelta(agentWindowId)
      return
    }
    if (flushTimers.current.has(agentWindowId)) return
    // Shorter debounce (16ms) for smoother word-by-word feel.
    const t = setTimeout(() => {
      flushTimers.current.delete(agentWindowId)
      flushWindowDelta(agentWindowId)
    }, 16)
    flushTimers.current.set(agentWindowId, t)
  }

  function describeIncomingEvent(evt: any): string {
    if (!evt) return 'event'
    if (evt.type === 'rawNotification' && typeof evt.method === 'string') return evt.method
    if (typeof evt.type === 'string') return evt.type
    return 'event'
  }

  function appendPanelDebug(agentWindowId: string, stage: string, detail: string) {
    setPanelDebugById((prev) => {
      const nextEntry: PanelDebugEntry = {
        id: newId(),
        at: Date.now(),
        stage,
        detail: detail || '(no detail)',
      }
      const existing = prev[agentWindowId] ?? []
      const next = [nextEntry, ...existing].slice(0, 80)
      return { ...prev, [agentWindowId]: next }
    })
    const shouldMirrorToChat = new Set(['send', 'auth', 'connect', 'turn/start', 'queue', 'error', 'event:status']).has(stage)
    if (!shouldMirrorToChat) return
    if (!applicationSettings.showDebugNotesInTimeline) return
    const debugLine = `Debug (${stage}): ${detail || '(no detail)'}`
    // Defer mirroring to chat to avoid "Maximum update depth exceeded" when called
    // synchronously from send flow (onKeyDown -> sendMessage -> sendToAgent -> appendPanelDebug).
    queueMicrotask(() => {
      setPanels((prev) =>
        prev.map((p) =>
          p.id !== agentWindowId
            ? p
            : {
                ...p,
                messages: [...p.messages, { id: newId(), role: 'system', content: debugLine, format: 'text', createdAt: Date.now() }],
              },
        ),
      )
    })
  }

  function markPanelTurnComplete(agentWindowId: string) {
    setPanelTurnCompleteAtById((prev) => ({ ...prev, [agentWindowId]: Date.now() }))
  }

  function clearPanelTurnComplete(agentWindowId: string) {
    setPanelTurnCompleteAtById((prev) => {
      if (!(agentWindowId in prev)) return prev
      const next = { ...prev }
      delete next[agentWindowId]
      return next
    })
  }

  function markPanelActivity(agentWindowId: string, evt: any) {
    const prev = activityLatestRef.current.get(agentWindowId)
    const entry = describeActivityEntry(evt)
    let recent = [...(prev?.recent ?? [])]
    if (entry) {
      // If we see ongoing work after a turn completed, clear the completion notice
      // so we don't show "done" while subagents/tasks are still running.
      const isOngoing =
        entry.label &&
        (ONGOING_WORK_LABELS.has(entry.label) || (entry.label.startsWith('Completed ') && entry.label !== 'Turn complete'))
      if (isOngoing) {
        clearPanelTurnComplete(agentWindowId)
      }
      const now = Date.now()
      const top = recent[0]
      if (top && top.label === entry.label && top.detail === entry.detail && now - top.at < 4000) {
        recent[0] = { ...top, at: now, count: top.count + 1 }
      } else {
        recent.unshift({ id: newId(), label: entry.label, detail: entry.detail, kind: entry.kind, at: now, count: 1 })
      }
      recent = recent.slice(0, 10)
    }
    const next: PanelActivityState = {
      lastEventAt: Date.now(),
      lastEventLabel: entry?.label ?? describeIncomingEvent(evt),
      totalEvents: (prev?.totalEvents ?? 0) + 1,
      recent,
    }
    activityLatestRef.current.set(agentWindowId, next)
    if (activityFlushTimers.current.has(agentWindowId)) return
    const t = setTimeout(() => {
      activityFlushTimers.current.delete(agentWindowId)
      const snapshot = activityLatestRef.current.get(agentWindowId)
      if (!snapshot) return
      setPanelActivityById((prevState) => ({ ...prevState, [agentWindowId]: snapshot }))
    }, 180)
    activityFlushTimers.current.set(agentWindowId, t)
  }

  useEffect(() => {
    const unsubEvent = api.onEvent(({ agentWindowId, evt }: any) => {
      if (!agentWindowId) agentWindowId = 'default'
      if (evt?.type === 'thinking') {
        appendPanelDebug(agentWindowId, 'event:thinking', evt.message ?? '')
        markPanelActivity(agentWindowId, evt)
        const thinkingText = typeof evt.message === 'string' ? evt.message.trim() : ''
        if (thinkingText && thinkingText.includes(':')) {
          const prefixed = `\u{1F504} ${thinkingText}`
          setPanels((prev) =>
            prev.map((w) => {
              if (w.id !== agentWindowId) return w
              const last = w.messages[w.messages.length - 1]
              if (last && last.role === 'system' && last.content === prefixed) return w
              return { ...w, messages: [...w.messages, { id: newId(), role: 'system' as const, content: prefixed, format: 'text' as const, createdAt: Date.now() }] }
            }),
          )
        }
        return
      }

      markPanelActivity(agentWindowId, evt)

      if (evt?.type === 'status') {
        appendPanelDebug(agentWindowId, 'event:status', `${evt.status}${evt.message ? ` - ${evt.message}` : ''}`)
        const isRetryableError = evt.status === 'error' && typeof evt.message === 'string' &&
          /status 429|Retrying with backoff|Attempt \d+ failed(?!.*Max attempts)|Rate limited/i.test(evt.message)
        let closedAfterStreaming = false
        setPanels((prev) =>
          prev.map((w) =>
            w.id !== agentWindowId
              ? w
              : {
                  ...w,
                  status: isRetryableError ? 'Rate limited — retrying...' : (evt.message ?? evt.status),
                  connected: evt.status === 'ready',
                  streaming: isRetryableError ? w.streaming : (evt.status === 'closed' || evt.status === 'error' ? false : w.streaming),
                  ...(evt.status === 'closed' && !isRetryableError && w.streaming
                    ? (() => {
                        closedAfterStreaming = true
                        return {}
                      })()
                    : {}),
                  messages:
                    evt.status === 'error' && typeof evt.message === 'string' && !isRetryableError
                      ? (() => {
                          const withLimit = withLimitWarningMessage(w.messages, evt.message)
                          const generic = `Provider error: ${evt.message.trim()}`
                          const hasGeneric = withLimit.slice(-8).some((m) => m.role === 'system' && m.content === generic)
                          return hasGeneric
                            ? withLimit
                            : [...withLimit, { id: newId(), role: 'system' as const, content: generic, format: 'text' as const, createdAt: Date.now() }]
                        })()
                      : w.messages,
                },
          ),
        )
        if (evt.status === 'error' && !isRetryableError) {
          clearPanelTurnComplete(agentWindowId)
        } else if (evt.status === 'closed' && !isRetryableError && closedAfterStreaming) {
          markPanelTurnComplete(agentWindowId)
        }
        if ((evt.status === 'closed' || evt.status === 'error') && !isRetryableError) {
          activePromptStartedAtRef.current.delete(agentWindowId)
          queueMicrotask(() => kickQueuedMessage(agentWindowId))
        }
        return
      }

      if (evt?.type === 'assistantDelta') {
        queueDelta(agentWindowId, String(evt.delta ?? ''))
        return
      }

      if (evt?.type === 'assistantCompleted') {
        appendPanelDebug(agentWindowId, 'event:assistantCompleted', 'Assistant turn completed')
        flushWindowDelta(agentWindowId)
        let snapshotForHistory: AgentPanelState | null = null
        let shouldKeepPromptTimer = false
        setPanels((prev) =>
          prev.map((w) => {
            if (w.id !== agentWindowId) return w
            const msgs = w.messages
            const lastAssistantIdx = msgs.map((m) => m.role).lastIndexOf('assistant')
            const lastAssistant = lastAssistantIdx >= 0 ? msgs[lastAssistantIdx] : null
            if (!lastAssistant) {
              const updated = { ...w, streaming: false }
              snapshotForHistory = updated
              return updated
            }
            let pendingInputs: string[] = w.pendingInputs
            let nextMessages: ChatMessage[] = [...msgs.slice(0, lastAssistantIdx), { ...lastAssistant, format: 'markdown' as const }, ...msgs.slice(lastAssistantIdx + 1)]
            if (looksIncomplete(lastAssistant.content)) {
              const count = autoContinueCountRef.current.get(agentWindowId) ?? 0
              if (count < MAX_AUTO_CONTINUE && w.pendingInputs.length === 0) {
                autoContinueCountRef.current.set(agentWindowId, count + 1)
                pendingInputs = [...w.pendingInputs, AUTO_CONTINUE_PROMPT]
                shouldKeepPromptTimer = true
              }
            } else {
              autoContinueCountRef.current.delete(agentWindowId)
            }
            const updated = { ...w, streaming: false, pendingInputs, messages: nextMessages }
            snapshotForHistory = updated
            return updated
          }),
        )
        if (!shouldKeepPromptTimer) {
          const startedAt = activePromptStartedAtRef.current.get(agentWindowId)
          if (typeof startedAt === 'number') {
            const elapsedMs = Math.max(0, Date.now() - startedAt)
            setLastPromptDurationMsByPanel((prev) => ({ ...prev, [agentWindowId]: elapsedMs }))
          }
          activePromptStartedAtRef.current.delete(agentWindowId)
        }
        if (snapshotForHistory) upsertPanelToHistory(snapshotForHistory)
        markPanelTurnComplete(agentWindowId)
        queueMicrotask(() => kickQueuedMessage(agentWindowId))
      }

      if (evt?.type === 'usageUpdated') {
        setPanels((prev) =>
          prev.map((w) =>
            w.id === agentWindowId
              ? {
                  ...w,
                  usage: evt.usage,
                  messages:
                    getModelProvider(w.model) === 'codex'
                      ? withExhaustedRateLimitWarning(w.messages, evt.usage)
                      : w.messages,
                }
              : w,
          ),
        )
        return
      }

      if (evt?.type === 'rawNotification') {
        const method = String(evt.method ?? '')
        if (isTurnCompletionRawNotification(method, evt.params)) {
          markPanelTurnComplete(agentWindowId)
        }
        appendPanelDebug(agentWindowId, 'event:raw', method)
        const note = summarizeRawNotification(method, evt.params)
        if (!note) return
        if (!shouldSurfaceRawNoteInChat(method)) return
        setPanels((prev) =>
          prev.map((w) =>
            w.id !== agentWindowId
              ? w
              : {
                  ...w,
                  messages: [...w.messages, { id: newId(), role: 'system', content: note, format: 'text', createdAt: Date.now() }],
                },
          ),
        )
      }
    })

    const unsubMenu = api.onMenu?.((msg: { action: string; path?: string }) => {
      const { action, path: actionPath } = msg
      if (action === 'newAgentWindow') {
        createAgentPanel()
        return
      }
      if (action === 'newFile') {
        void createNewFileFromMenu()
        return
      }
      if (action === 'newWorkspace') {
        openWorkspaceSettings('new')
        return
      }
      if (action === 'openWorkspacePicker') {
        openWorkspacePicker()
        return
      }
      if (action === 'openFile') {
        void openFileFromMenu()
        return
      }
      if (action === 'openWorkspace' && typeof actionPath === 'string') {
        requestWorkspaceSwitch(actionPath, 'menu')
        closeWorkspacePicker()
        return
      }
      if (action === 'closeFocused') {
        closeFocusedFromMenu()
        return
      }
      if (action === 'closeWorkspace') {
        if (workspaceList.length <= 1) return
        void deleteWorkspace(workspaceRoot)
        return
      }
      if (action === 'findInPage') {
        findInPageFromMenu()
        return
      }
      if (action === 'findInFiles') {
        void findInFilesFromMenu()
        return
      }
      if (action === 'openThemeModal') {
        openAppSettingsInRightDock('preferences')
        return
      }
      if (action === 'openAppSettings' || action === 'openConnectivity' || action === 'openSettings') {
        openAppSettingsInRightDock('connectivity')
        return
      }
      if (action === 'openModelSetup') {
        openAppSettingsInRightDock('models')
        return
      }
      if (action === 'openPreferences') {
        openAppSettingsInRightDock('preferences')
        return
      }
      if (action === 'openAgents') {
        openAppSettingsInRightDock('agents')
        return
      }
      if (action === 'openDiagnostics') {
        openAppSettingsInRightDock('diagnostics')
        return
      }
      if (action === 'openOrchestrator') {
        openAppSettingsInRightDock('orchestrator')
        return
      }
      if (action === 'saveEditorFile') {
        const targetEditorId = focusedEditorIdRef.current
        if (targetEditorId) void saveEditorPanel(targetEditorId)
        return
      }
      if (action === 'saveEditorFileAs') {
        const targetEditorId = focusedEditorIdRef.current
        if (targetEditorId) void saveEditorPanelAs(targetEditorId)
        return
      }
      if (action === 'layoutVertical') setLayoutMode('vertical')
      if (action === 'layoutHorizontal') setLayoutMode('horizontal')
      if (action === 'layoutGrid') setLayoutMode('grid')
      if (action === 'toggleWorkspaceWindow') setShowWorkspaceWindow((prev) => !prev)
      if (action === 'toggleCodeWindow') setShowCodeWindow((prev) => !prev)
      if (action === 'zoomIn') {
        api.zoomIn?.()
        const level = api.getZoomLevel?.()
        if (level !== undefined) setZoomLevel(level)
        return
      }
      if (action === 'zoomOut') {
        api.zoomOut?.()
        const level = api.getZoomLevel?.()
        if (level !== undefined) setZoomLevel(level)
        return
      }
      if (action === 'resetZoom') {
        api.resetZoom?.()
        setZoomLevel(0)
        return
      }
    })

    return () => {
      unsubEvent?.()
      unsubMenu?.()
    }
  }, [api, workspaceList, workspaceRoot])

  useEffect(() => {
    const cleanup = registerPluginHostCallbacks({
      async createPanel(options) {
        const id = newId()
        const panelWorkspace = options.workspace || workspaceRoot
        const ws = workspaceSettingsByPath[panelWorkspace] ?? workspaceSettingsByPath[workspaceRoot]
        const p = makeDefaultPanel(id, panelWorkspace)
        if (options.model) p.model = options.model
        else if (ws?.defaultModel) p.model = ws.defaultModel
        p.messages = withModelBanner(p.messages, p.model)
        if (options.interactionMode) p.interactionMode = parseInteractionMode(options.interactionMode as any)
        if (options.permissionMode) p.permissionMode = options.permissionMode as any
        if (options.sandbox) p.sandbox = options.sandbox as any
        const clampedSecurity = clampPanelSecurityForWorkspace(panelWorkspace, p.sandbox, p.permissionMode)
        p.sandbox = clampedSecurity.sandbox
        p.permissionMode = clampedSecurity.permissionMode
        setPanels((prev) => {
          if (prev.length >= MAX_PANELS) return prev
          return [...prev, p]
        })
        return id
      },
      async closePanel(panelId) {
        const panel = panelsRef.current.find((w) => w.id === panelId)
        if (panel) upsertPanelToHistory(panel)
        setPanels((prev) => prev.filter((w) => w.id !== panelId))
        try { await api.disconnect(panelId) } catch { /* best-effort */ }
      },
      async sendMessage(panelId, message, _attachments) {
        void sendToAgent(panelId, message)
      },
      async interruptPanel(panelId) {
        try { await api.interrupt(panelId) } catch { /* best-effort */ }
      },
      async listFiles(options) {
        const tree = await api.listWorkspaceTree(workspaceRoot, { includeHidden: options.includeHidden })
        return tree
      },
    })
    return () => {
      cleanup()
      unregisterPluginHostCallbacks()
    }
  }, [workspaceRoot])

  useEffect(() => {
    const fetchPlugins = () => {
      api.getLoadedPlugins?.().then((list) => {
        setLoadedPlugins(list ?? [])
      }).catch(() => setLoadedPlugins([]))
    }
    if (dockTab === 'orchestrator') {
      fetchPlugins()
    }
    const unsub = api.onPluginsLoaded?.(fetchPlugins)
    return () => { unsub?.() }
  }, [dockTab, api])

  function estimateTokenCountFromText(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return 0
    const charBased = Math.ceil(trimmed.length / TOKEN_ESTIMATE_CHARS_PER_TOKEN)
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length
    const wordBased = Math.ceil(wordCount * TOKEN_ESTIMATE_WORDS_MULTIPLIER)
    return Math.max(charBased, wordBased)
  }

  function getKnownContextTokensForModel(model: string, provider: ModelProvider): number | null {
    const normalized = model.trim().toLowerCase()

    if (provider === 'gemini') {
      if (normalized.includes('pro')) return 2_097_152
      if (normalized.includes('flash')) return 1_048_576
      return 1_048_576
    }

    if (provider === 'claude') {
      return 200_000
    }

    if (provider === 'codex') {
      return DEFAULT_GPT_CONTEXT_TOKENS
    }

    if (provider === 'openrouter') {
      // Common minimum for modern models
      return 128_000
    }

    return null
  }

  function estimatePanelContextUsage(panel: AgentPanelState): {
    estimatedInputTokens: number
    safeInputBudgetTokens: number
    modelContextTokens: number
    outputReserveTokens: number
    usedPercent: number
  } | null {
    const provider = getModelProvider(panel.model)
    const modelContextTokens = getKnownContextTokensForModel(panel.model, provider)
    if (!modelContextTokens) return null

    let estimatedInputTokens = TOKEN_ESTIMATE_THREAD_OVERHEAD_TOKENS
    for (const message of panel.messages) {
      estimatedInputTokens += TOKEN_ESTIMATE_MESSAGE_OVERHEAD
      estimatedInputTokens += estimateTokenCountFromText(message.content)
      estimatedInputTokens += (message.attachments?.length ?? 0) * TOKEN_ESTIMATE_IMAGE_ATTACHMENT_TOKENS
    }

    for (const queued of panel.pendingInputs) {
      estimatedInputTokens += TOKEN_ESTIMATE_MESSAGE_OVERHEAD
      estimatedInputTokens += estimateTokenCountFromText(queued)
    }

    const draft = panel.input.trim()
    if (draft) {
      estimatedInputTokens += TOKEN_ESTIMATE_MESSAGE_OVERHEAD
      estimatedInputTokens += estimateTokenCountFromText(draft)
    }
    estimatedInputTokens += panel.attachments.length * TOKEN_ESTIMATE_IMAGE_ATTACHMENT_TOKENS

    const outputReserveTokens = Math.min(
      CONTEXT_MAX_OUTPUT_RESERVE_TOKENS,
      Math.max(CONTEXT_MIN_OUTPUT_RESERVE_TOKENS, Math.round(modelContextTokens * CONTEXT_OUTPUT_RESERVE_RATIO)),
    )
    const safeInputBudgetTokens = Math.max(1, modelContextTokens - outputReserveTokens)
    const usedPercent = (estimatedInputTokens / safeInputBudgetTokens) * 100

    return {
      estimatedInputTokens,
      safeInputBudgetTokens,
      modelContextTokens,
      outputReserveTokens,
      usedPercent,
    }
  }

  function sandboxModeDescription(mode: SandboxMode) {
    if (mode === 'read-only') return 'Read project files only; no file edits or shell writes.'
    return 'Can edit files and run commands inside the workspace folder.'
  }

  function getWorkspaceSecurityLimitsForPath(path: string): { sandbox: SandboxMode; permissionMode: PermissionMode } {
    const ws = workspaceSettingsByPath[path] ?? workspaceSettingsByPath[workspaceRoot]
    const sandbox: SandboxMode = ws?.sandbox === 'read-only' ? 'read-only' : 'workspace-write'
    const permissionMode: PermissionMode =
      sandbox === 'read-only'
        ? 'verify-first'
        : ws?.permissionMode === 'proceed-always'
          ? 'proceed-always'
          : 'verify-first'
    return { sandbox, permissionMode }
  }

  function clampPanelSecurityForWorkspace(
    cwd: string,
    sandbox: SandboxMode,
    permissionMode: PermissionMode,
  ): { sandbox: SandboxMode; permissionMode: PermissionMode } {
    const limits = getWorkspaceSecurityLimitsForPath(cwd)
    const nextSandbox: SandboxMode = limits.sandbox === 'read-only' ? 'read-only' : sandbox
    const nextPermissionMode: PermissionMode =
      nextSandbox === 'read-only' || limits.permissionMode === 'verify-first'
        ? 'verify-first'
        : permissionMode
    return { sandbox: nextSandbox, permissionMode: nextPermissionMode }
  }

  function getPanelSecurityState(panel: Pick<AgentPanelState, 'cwd' | 'sandbox' | 'permissionMode'>) {
    const limits = getWorkspaceSecurityLimitsForPath(panel.cwd)
    const effective = clampPanelSecurityForWorkspace(panel.cwd, panel.sandbox, panel.permissionMode)
    return {
      workspaceSandbox: limits.sandbox,
      workspacePermissionMode: limits.permissionMode,
      effectiveSandbox: effective.sandbox,
      effectivePermissionMode: effective.permissionMode,
      sandboxLockedToView: limits.sandbox === 'read-only',
      permissionLockedByReadOnlySandbox: limits.sandbox === 'read-only',
      permissionLockedToVerifyFirst: limits.sandbox !== 'read-only' && limits.permissionMode === 'verify-first',
    }
  }

  function formatError(err: unknown) {
    if (err instanceof Error && err.message) return err.message
    return String(err ?? 'Unknown error')
  }

  function openDiagnosticsTarget(
    target: 'userData' | 'storage' | 'chatHistory' | 'appState' | 'runtimeLog',
    label: string,
  ) {
    if (target === 'chatHistory' || target === 'appState' || target === 'runtimeLog') {
      openDiagnosticsFileInEditor(target, label)
      return
    }
    setDiagnosticsActionStatus(null)
    void (async () => {
      try {
        const result = await api.openDiagnosticsPath?.(target)
        if (!result?.ok) {
          setDiagnosticsActionStatus(result?.error ? `Could not open ${label}: ${result.error}` : `Could not open ${label}.`)
          return
        }
      } catch (err) {
        setDiagnosticsActionStatus(`Could not open ${label}: ${formatError(err)}`)
      }
    })()
  }

  function openDiagnosticsFileInEditor(
    target: 'chatHistory' | 'appState' | 'runtimeLog',
    label: string,
  ) {
    setDiagnosticsActionStatus(null)
    void (async () => {
      try {
        const result = await api.readDiagnosticsFile?.(target)
        if (!result?.ok || typeof result.content !== 'string') {
          setDiagnosticsActionStatus(result?.error ? `Could not open ${label}: ${result.error}` : `Could not open ${label}.`)
          return
        }
        const diagnosticsContent = result.content
        const existing = editorPanelsRef.current.find((p) => p.diagnosticsTarget === target)
        setShowCodeWindow(true)
        if (existing) {
          setEditorPanels((prev) =>
            prev.map((p) =>
              p.id !== existing.id
                ? p
                : {
                    ...p,
                    content: diagnosticsContent,
                    size: diagnosticsContent.length,
                    dirty: false,
                    diagnosticsReadOnly: result.writable === false,
                    error: undefined,
                  },
            ),
          )
          setFocusedEditor(existing.id)
          return
        }
        const panelId = `editor-${newId()}`
        const panelTitle = fileNameFromRelativePath(result.path || `${target}.txt`)
        const newPanel: EditorPanelState = {
          id: panelId,
          workspaceRoot,
          relativePath: result.path || target,
          title: panelTitle,
          fontScale: 1,
          content: diagnosticsContent,
          size: diagnosticsContent.length,
          loading: false,
          saving: false,
          dirty: false,
          binary: false,
          editMode: true,
          diagnosticsTarget: target,
          diagnosticsReadOnly: result.writable === false,
        }
        setEditorPanels((prev) => {
          if (prev.length < MAX_EDITOR_PANELS) return [...prev, newPanel]
          const oldestUneditedIdx = prev.findIndex((p) => !p.dirty)
          const next = oldestUneditedIdx >= 0 ? prev.filter((_, i) => i !== oldestUneditedIdx) : prev
          return [...next, newPanel]
        })
        setFocusedEditor(panelId)
      } catch (err) {
        setDiagnosticsActionStatus(`Could not open ${label}: ${formatError(err)}`)
      }
    })()
  }

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('Failed reading pasted image'))
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result)
        else reject(new Error('Failed reading pasted image'))
      }
      reader.readAsDataURL(file)
    })
  }

  async function handlePasteImage(panelId: string, file: File) {
    try {
      const dataUrl = await fileToDataUrl(file)
      const saved = await api.savePastedImage(dataUrl, file.type || 'image/png')
      setPanels((prev) =>
        prev.map((p) =>
          p.id !== panelId
            ? p
            : {
                ...p,
                attachments: [
                  ...p.attachments,
                  {
                    id: newId(),
                    path: saved.path,
                    label: file.name || `pasted-image.${saved.mimeType.includes('jpeg') ? 'jpg' : 'png'}`,
                    mimeType: saved.mimeType,
                  },
                ],
                status: 'Image attached',
              },
        ),
      )
    } catch (err) {
      const msg = formatError(err)
      setPanels((prev) =>
        prev.map((p) =>
          p.id !== panelId
            ? p
            : {
                ...p,
                messages: [...p.messages, { id: newId(), role: 'system', content: `Image paste failed: ${msg}`, format: 'text', createdAt: Date.now() }],
              },
        ),
      )
    }
  }

  function getModelProvider(model: string): ModelProvider {
    return modelConfig.interfaces.find((m) => m.id === model)?.provider ?? 'codex'
  }

  async function ensureProviderReady(provider: ModelProvider, reason: string) {
    const config = resolvedProviderConfigs.find((c) => c.id === provider) ?? DEFAULT_BUILTIN_PROVIDER_CONFIGS[provider as ConnectivityProvider]
    const status = (await api.getProviderAuthStatus(
      config.type === 'cli'
        ? {
            id: config.id,
            type: 'cli',
            cliCommand: config.cliCommand,
            cliPath: config.cliPath,
            authCheckCommand: config.authCheckCommand,
            loginCommand: config.loginCommand,
          }
        : {
            id: config.id,
            type: 'api',
            apiBaseUrl: config.apiBaseUrl,
            loginUrl: config.loginUrl,
          },
    )) as ProviderAuthStatus
    if (!status.installed) {
      throw new Error(`${config.displayName} CLI is not installed. ${status.detail}`.trim())
    }
    if (status.authenticated) return
    throw new Error(
      `${config.displayName} login required for ${reason}. ${status.detail}\nLogin outside the app, then send again.`,
    )
  }

  async function refreshProviderAuthStatus(config: ProviderConfig): Promise<ProviderAuthStatus | null> {
    setProviderAuthLoadingByName((prev) => ({ ...prev, [config.id]: true }))
    try {
      const status = (await api.getProviderAuthStatus(
        config.type === 'cli'
          ? {
              id: config.id,
              type: 'cli',
              cliCommand: config.cliCommand,
              cliPath: config.cliPath,
              authCheckCommand: config.authCheckCommand,
              loginCommand: config.loginCommand,
            }
          : {
              id: config.id,
              type: 'api',
              apiBaseUrl: config.apiBaseUrl,
              loginUrl: config.loginUrl,
            },
      )) as ProviderAuthStatus
      setProviderAuthByName((prev) => ({ ...prev, [config.id]: status }))
      setProviderAuthActionByName((prev) => ({ ...prev, [config.id]: null }))
      if (config.type === 'api') await refreshProviderApiKeyState(config.id)
      return status
    } catch (err) {
      setProviderAuthActionByName((prev) => ({
        ...prev,
        [config.id]: `Could not check ${config.displayName}: ${formatError(err)}`,
      }))
      return null
    } finally {
      setProviderAuthLoadingByName((prev) => ({ ...prev, [config.id]: false }))
    }
  }

  async function refreshProviderApiAuthStatus(providerId: string) {
    const apiConfig = API_CONFIG_BY_PROVIDER[providerId]
    if (!apiConfig || !api.getProviderAuthStatus) return
    setProviderAuthLoadingByName((prev) => ({ ...prev, [providerId]: true }))
    try {
      const status = (await api.getProviderAuthStatus({
        id: providerId,
        type: 'api',
        apiBaseUrl: apiConfig.apiBaseUrl,
        loginUrl: apiConfig.loginUrl,
      })) as ProviderAuthStatus
      setProviderAuthByName((prev) => ({ ...prev, [providerId]: status }))
      setProviderAuthActionByName((prev) => ({ ...prev, [providerId]: null }))
      await refreshProviderApiKeyState(providerId)
      return status
    } catch (err) {
      setProviderAuthActionByName((prev) => ({
        ...prev,
        [providerId]: `API check failed: ${formatError(err)}`,
      }))
      return null
    } finally {
      setProviderAuthLoadingByName((prev) => ({ ...prev, [providerId]: false }))
    }
  }

  async function refreshAllProviderAuthStatuses() {
    await Promise.all(
      resolvedProviderConfigs
        .filter((config) => config.id !== 'openrouter')
        .map((config) => refreshProviderAuthStatus(config)),
    )
  }

  async function refreshProviderApiKeyState(providerId: string) {
    if (!api.getProviderApiKeyState) return
    try {
      const state = await api.getProviderApiKeyState(providerId)
      setProviderApiKeyStateByName((prev) => ({ ...prev, [providerId]: Boolean(state?.hasKey) }))
    } catch {
      setProviderApiKeyStateByName((prev) => ({ ...prev, [providerId]: false }))
    }
  }

  async function saveProviderApiKey(providerId: string, explicitValue?: string) {
    if (!api.setProviderApiKey) return
    const next = typeof explicitValue === 'string' ? explicitValue : providerApiKeyDraftByName[providerId] ?? ''
    try {
      const result = await api.setProviderApiKey(providerId, next)
      setProviderApiKeyStateByName((prev) => ({ ...prev, [providerId]: Boolean(result?.hasKey) }))
      setProviderApiKeyDraftByName((prev) => ({ ...prev, [providerId]: '' }))
      setProviderAuthActionByName((prev) => ({ ...prev, [providerId]: result?.hasKey ? 'API key saved.' : 'API key cleared.' }))
      const cfg = resolvedProviderConfigs.find((p) => p.id === providerId)
      if (cfg) await refreshProviderAuthStatus(cfg)
    } catch (err) {
      setProviderAuthActionByName((prev) => ({ ...prev, [providerId]: `Could not save API key: ${formatError(err)}` }))
    }
  }

  async function clearProviderApiKey(providerId: string) {
    setProviderApiKeyDraftByName((prev) => ({ ...prev, [providerId]: '' }))
    await saveProviderApiKey(providerId, '')
  }

  async function importProviderApiKeyFromEnv(providerId: string) {
    if (!api.importProviderApiKeyFromEnv) return
    try {
      const result = await api.importProviderApiKeyFromEnv(providerId)
      setProviderApiKeyStateByName((prev) => ({ ...prev, [providerId]: Boolean(result?.hasKey) }))
      setProviderAuthActionByName((prev) => ({
        ...prev,
        [providerId]: result?.detail || (result?.ok ? 'Imported API key from environment.' : 'Could not import API key from environment.'),
      }))
      const cfg = resolvedProviderConfigs.find((p) => p.id === providerId)
      if (cfg) await refreshProviderAuthStatus(cfg)
    } catch (err) {
      setProviderAuthActionByName((prev) => ({ ...prev, [providerId]: `Could not import API key: ${formatError(err)}` }))
    }
  }

  async function startProviderLoginFlow(config: ProviderConfig) {
    setProviderAuthActionByName((prev) => ({ ...prev, [config.id]: null }))
    try {
      const result = await api.startProviderLogin(
        config.type === 'cli'
          ? {
              id: config.id,
              type: 'cli',
              cliCommand: config.cliCommand,
              cliPath: config.cliPath,
              authCheckCommand: config.authCheckCommand,
              loginCommand: config.loginCommand,
            }
          : {
              id: config.id,
              type: 'api',
              apiBaseUrl: config.apiBaseUrl,
              loginUrl: config.loginUrl,
            },
      )
      setProviderAuthActionByName((prev) => ({
        ...prev,
        [config.id]:
          result?.started
            ? `${result.detail} Complete login in the terminal, then click Re-check.`
            : `Could not start login for ${config.displayName}.`,
      }))
    } catch (err) {
      setProviderAuthActionByName((prev) => ({
        ...prev,
        [config.id]: `Could not start login for ${config.displayName}: ${formatError(err)}`,
      }))
    }
  }

  async function startProviderUpgradeFlow(config: ProviderConfig) {
    if (config.type !== 'cli') return
    if (!config.upgradeCommand && !config.upgradePackage) return
    setProviderAuthActionByName((prev) => ({ ...prev, [config.id]: null }))
    try {
      const result = await api.upgradeProviderCli({
        id: config.id,
        cliCommand: config.cliCommand,
        cliPath: config.cliPath,
        authCheckCommand: config.authCheckCommand,
        loginCommand: config.loginCommand,
        upgradeCommand: config.upgradeCommand,
        upgradePackage: config.upgradePackage,
      })
      setProviderAuthActionByName((prev) => ({
        ...prev,
        [config.id]:
          result?.started
            ? result.detail
            : result?.detail ?? `Could not upgrade ${config.displayName} CLI.`,
      }))
    } catch (err) {
      setProviderAuthActionByName((prev) => ({
        ...prev,
        [config.id]: `Could not upgrade ${config.displayName}: ${formatError(err)}`,
      }))
    }
  }

  async function refreshWorkspaceTree(prefs?: ExplorerPrefs) {
    if (!workspaceRoot) {
      setWorkspaceTree([])
      setWorkspaceTreeTruncated(false)
      setWorkspaceTreeError(null)
      return
    }
    const effectivePrefs = prefs ?? { showHiddenFiles, showNodeModules }
    setWorkspaceTreeLoading(true)
    setWorkspaceTreeError(null)
    try {
      const result = await api.listWorkspaceTree(workspaceRoot, {
        includeHidden: effectivePrefs.showHiddenFiles,
        includeNodeModules: effectivePrefs.showNodeModules,
      })
      setWorkspaceTree(result?.nodes ?? [])
      setWorkspaceTreeTruncated(Boolean(result?.truncated))
    } catch (err) {
      setWorkspaceTree([])
      setWorkspaceTreeTruncated(false)
      setWorkspaceTreeError(formatError(err))
    } finally {
      setWorkspaceTreeLoading(false)
    }
  }

  async function refreshGitStatus() {
    if (!workspaceRoot) {
      setGitStatus(null)
      setGitStatusError(null)
      return
    }
    setGitStatusLoading(true)
    setGitStatusError(null)
    try {
      const result = await api.getGitStatus(workspaceRoot)
      setGitStatus(result)
      setGitStatusError(result.ok ? null : result.error ?? 'Unable to load git status.')
    } catch (err) {
      setGitStatus(null)
      setGitStatusError(formatError(err))
    } finally {
      setGitStatusLoading(false)
    }
  }

  function resolveGitSelection(candidatePaths?: string[]) {
    const entries = gitStatus?.entries ?? []
    if (entries.length === 0) return []
    const source = candidatePaths && candidatePaths.length > 0 ? candidatePaths : selectedGitPaths
    if (source.length === 0) return []
    const valid = new Set(entries.map((entry) => entry.relativePath))
    const resolved: string[] = []
    for (const path of source) {
      if (!valid.has(path)) continue
      if (!resolved.includes(path)) resolved.push(path)
    }
    return resolved
  }

  async function runGitOperation(op: GitOperation, candidatePaths?: string[]) {
    if (!workspaceRoot || gitOperationPending) return
    const selectedPaths = resolveGitSelection(candidatePaths)
    setGitOperationPending(op)
    setGitOperationSuccess(null)
    setGitStatusError(null)
    try {
      const fn =
        op === 'commit'
          ? api.gitCommit
          : op === 'push'
            ? api.gitPush
            : op === 'deploy'
            ? api.gitDeploy
            : op === 'build'
                ? api.gitBuild
                : api.gitRelease
      const result = await fn(workspaceRoot, selectedPaths.length > 0 ? selectedPaths : undefined)
      if (result.ok) {
        setGitContextMenu(null)
        setGitOperationSuccess({ op, at: Date.now() })
        void refreshGitStatus()
      } else {
        setGitStatusError(result.error ?? `${op} failed`)
      }
    } catch (err) {
      setGitStatusError(`${op}: ${formatError(err)}`)
    } finally {
      setGitOperationPending(null)
    }
  }

  function setExplorerPrefs(next: ExplorerPrefs) {
    setShowHiddenFiles(next.showHiddenFiles)
    setShowNodeModules(next.showNodeModules)
    if (!workspaceRoot) return
    setExplorerPrefsByWorkspace((prev) => ({ ...prev, [workspaceRoot]: next }))
  }

  async function openEditorForRelativePath(relativePath: string) {
    if (!workspaceRoot || !relativePath) return
    setShowCodeWindow(true)
    const existing = editorPanelsRef.current.find((p) => p.workspaceRoot === workspaceRoot && p.relativePath === relativePath)
    if (existing) {
      setFocusedEditor(existing.id)
      return
    }

    const panels = editorPanelsRef.current
    if (panels.length >= MAX_EDITOR_PANELS) {
      const hasUnedited = panels.some((p) => !p.dirty)
      if (!hasUnedited) {
        alert(
          `Maximum ${MAX_EDITOR_PANELS} code files open. All files have unsaved changes. Save or close some files to open more.`,
        )
        return
      }
    }

    const id = `editor-${newId()}`
    const title = fileNameFromRelativePath(relativePath)
    const newPanel: EditorPanelState = {
      id,
      workspaceRoot,
      relativePath,
      title,
      fontScale: 1,
      content: '',
      size: 0,
      loading: true,
      saving: false,
      dirty: false,
      binary: false,
      editMode: true,
    }
    setEditorPanels((prev) => {
      if (prev.length < MAX_EDITOR_PANELS) return [...prev, newPanel]
      const oldestUneditedIdx = prev.findIndex((p) => !p.dirty)
      const next = oldestUneditedIdx >= 0 ? prev.filter((_, i) => i !== oldestUneditedIdx) : prev
      return [...next, newPanel]
    })
    setFocusedEditor(id)
    try {
      const result = await api.readWorkspaceTextFile(workspaceRoot, relativePath)
      if (result.size > MAX_EDITOR_FILE_SIZE_BYTES && !result.binary) {
        setEditorPanels((prev) =>
          prev.map((p) =>
            p.id !== id
              ? p
              : {
                  ...p,
                  loading: false,
                  error: `File too large (${Math.round(result.size / 1024)} KB). Maximum ${Math.round(MAX_EDITOR_FILE_SIZE_BYTES / 1024)} KB.`,
                },
          ),
        )
        return
      }
      setEditorPanels((prev) =>
        prev.map((p) =>
          p.id !== id
            ? p
            : {
                ...p,
                title: fileNameFromRelativePath(result.relativePath),
                relativePath: result.relativePath,
                content: result.content,
                size: result.size,
                binary: result.binary,
                loading: false,
                dirty: false,
                error: result.binary ? 'Binary files cannot be edited in this editor.' : undefined,
              },
        ),
      )
    } catch (err) {
      setEditorPanels((prev) =>
        prev.map((p) =>
          p.id !== id
            ? p
            : {
                ...p,
                loading: false,
                error: formatError(err),
              },
        ),
      )
    }
  }

  async function onChatLinkClick(href: string) {
    const target = String(href ?? '').trim()
    if (!target) return
    const filePath = workspaceRoot ? resolveWorkspaceRelativePathFromChatHref(workspaceRoot, target) : null
    if (filePath) {
      await openEditorForRelativePath(filePath)
      return
    }
    if (api.openExternalUrl) {
      await api.openExternalUrl(target)
      return
    }
    if (/^https?:\/\//i.test(target)) {
      window.open(target, '_blank', 'noopener,noreferrer')
    }
  }

  function updateEditorContent(editorId: string, nextContent: string) {
    setEditorPanels((prev) =>
      prev.map((p) =>
        p.id !== editorId
          ? p
          : p.diagnosticsReadOnly
            ? p
          : {
              ...p,
              content: nextContent,
              dirty: true,
              error: undefined,
            },
      ),
    )
  }

  async function saveEditorPanel(editorId: string) {
    const panel = editorPanelsRef.current.find((p) => p.id === editorId)
    if (!panel || panel.loading || panel.binary) return
    if (panel.diagnosticsReadOnly) return
    setEditorPanels((prev) => prev.map((p) => (p.id === editorId ? { ...p, saving: true, error: undefined } : p)))
    try {
      if (panel.diagnosticsTarget) {
        const result = await api.writeDiagnosticsFile?.(panel.diagnosticsTarget, panel.content)
        if (!result?.ok) throw new Error(result?.error || 'Failed to save diagnostics file')
        setEditorPanels((prev) =>
          prev.map((p) =>
            p.id !== editorId
              ? p
              : {
                  ...p,
                  size: typeof result.size === 'number' ? result.size : p.content.length,
                  saving: false,
                  dirty: false,
                  savedAt: Date.now(),
                },
          ),
        )
        return
      }
      const result = await api.writeWorkspaceFile(panel.workspaceRoot, panel.relativePath, panel.content)
      setEditorPanels((prev) =>
        prev.map((p) =>
          p.id !== editorId
            ? p
            : {
                ...p,
                relativePath: result.relativePath,
                title: fileNameFromRelativePath(result.relativePath),
                size: result.size,
                saving: false,
                dirty: false,
                savedAt: Date.now(),
              },
        ),
      )
      setSelectedWorkspaceFile(result.relativePath)
      void refreshWorkspaceTree()
    } catch (err) {
      setEditorPanels((prev) =>
        prev.map((p) =>
          p.id !== editorId
            ? p
            : {
                ...p,
                saving: false,
                error: formatError(err),
              },
        ),
      )
    }
  }

  async function saveEditorPanelAs(editorId: string) {
    const panel = editorPanelsRef.current.find((p) => p.id === editorId)
    if (!panel || panel.loading || panel.binary) return
    if (panel.diagnosticsTarget) {
      setEditorPanels((prev) =>
        prev.map((p) =>
          p.id !== editorId
            ? p
            : {
                ...p,
                error: 'Save As is not available for diagnostics files.',
              },
        ),
      )
      return
    }

    try {
      const nextRelativePath = await api.pickWorkspaceSavePath(panel.workspaceRoot, panel.relativePath)
      if (!nextRelativePath) return

      setEditorPanels((prev) => prev.map((p) => (p.id === editorId ? { ...p, saving: true, error: undefined } : p)))
      const result = await api.writeWorkspaceFile(panel.workspaceRoot, nextRelativePath, panel.content)
      setEditorPanels((prev) =>
        prev.map((p) =>
          p.id !== editorId
            ? p
            : {
                ...p,
                relativePath: result.relativePath,
                title: fileNameFromRelativePath(result.relativePath),
                size: result.size,
                saving: false,
                dirty: false,
                savedAt: Date.now(),
              },
        ),
      )
      setSelectedWorkspaceFile(result.relativePath)
      void refreshWorkspaceTree()
    } catch (err) {
      setEditorPanels((prev) =>
        prev.map((p) =>
          p.id !== editorId
            ? p
            : {
                ...p,
                saving: false,
                error: formatError(err),
              },
        ),
      )
    }
  }

  function closeEditorPanel(editorId: string) {
    const panel = editorPanelsRef.current.find((p) => p.id === editorId)
    if (!panel) return
    if (panel.dirty && !confirm(`Close "${panel.title}" without saving changes?`)) return
    const idx = editorPanels.findIndex((p) => p.id === editorId)
    setEditorPanels((prev) => prev.filter((p) => p.id !== editorId))
    if (focusedEditorId === editorId) {
      const remaining = editorPanels.filter((p) => p.id !== editorId)
      const nextIdx = Math.min(idx, Math.max(0, remaining.length - 1))
      setFocusedEditor(remaining[nextIdx]?.id ?? null)
    }
  }

  async function createNewFileFromMenu() {
    if (!workspaceRoot) return
    try {
      const relativePath = await api.pickWorkspaceSavePath(workspaceRoot, 'untitled.txt')
      if (!relativePath) return
      await api.writeWorkspaceFile(workspaceRoot, relativePath, '')
      await openEditorForRelativePath(relativePath)
      setSelectedWorkspaceFile(relativePath)
      void refreshWorkspaceTree()
    } catch (err) {
      alert(`Could not create file: ${formatError(err)}`)
    }
  }

  async function openFileFromMenu() {
    if (!workspaceRoot) return
    try {
      const relativePath = await api.pickWorkspaceOpenPath(workspaceRoot)
      if (!relativePath) return
      await openEditorForRelativePath(relativePath)
      setSelectedWorkspaceFile(relativePath)
    } catch (err) {
      alert(`Could not open file: ${formatError(err)}`)
    }
  }

  function closeFocusedFromMenu() {
    const focusedEditorId = focusedEditorIdRef.current
    if (focusedEditorId) {
      closeEditorPanel(focusedEditorId)
      return
    }

    const activeElement = document.activeElement as HTMLElement | null
    const workspaceWindowFocused = Boolean(activeElement?.closest('[data-workspace-window-root="true"]'))
    if (workspaceWindowFocused && showWorkspaceWindowRef.current) {
      setShowWorkspaceWindow(false)
      return
    }

    const activePanelId = activePanelIdRef.current
    if (activePanelId && panelsRef.current.some((p) => p.id === activePanelId)) {
      void closePanel(activePanelId)
      return
    }

    if (showWorkspaceWindowRef.current) {
      setShowWorkspaceWindow(false)
    }
  }

  function findInPageFromMenu() {
    const input = prompt('Find', lastFindInPageQueryRef.current)
    if (input === null) return
    const query = input.trim()
    if (!query) return
    lastFindInPageQueryRef.current = query
    void api.findInPage?.(query)
  }

  function collectWorkspaceFilePaths(nodes: WorkspaceTreeNode[]): string[] {
    const paths: string[] = []
    const walk = (items: WorkspaceTreeNode[]) => {
      for (const item of items) {
        if (item.type === 'file') {
          paths.push(item.relativePath)
          continue
        }
        if (item.children?.length) {
          walk(item.children)
        }
      }
    }
    walk(nodes)
    return paths
  }

  async function findInFilesFromMenu() {
    const input = prompt('Find in Files (file name contains)', lastFindInFilesQueryRef.current || selectedWorkspaceFileRef.current || '')
    if (input === null) return
    const query = input.trim()
    if (!query) return
    lastFindInFilesQueryRef.current = query

    let nodes = workspaceTreeRef.current
    if (nodes.length === 0 && workspaceRoot) {
      try {
        const result = await api.listWorkspaceTree(workspaceRoot, {
          includeHidden: showHiddenFilesRef.current,
          includeNodeModules: showNodeModulesRef.current,
        })
        nodes = result?.nodes ?? []
      } catch (err) {
        alert(`Could not scan workspace files: ${formatError(err)}`)
        return
      }
    }

    const normalized = query.toLowerCase()
    const matches = collectWorkspaceFilePaths(nodes).filter((relativePath) =>
      relativePath.toLowerCase().includes(normalized),
    )
    if (matches.length === 0) {
      alert(`No files found for "${query}".`)
      return
    }

    const first = matches[0]
    await openEditorForRelativePath(first)
    setSelectedWorkspaceFile(first)
    setDockTab('explorer')
  }

  function toggleDirectory(relativePath: string) {
    setExpandedDirectories((prev) => ({ ...prev, [relativePath]: !prev[relativePath] }))
  }

  function isDirectoryExpanded(relativePath: string, depth: number) {
    if (relativePath in expandedDirectories) return Boolean(expandedDirectories[relativePath])
    return depth < 1
  }

  function collectDirectoryPaths(nodes: WorkspaceTreeNode[]): string[] {
    const paths: string[] = []
    const walk = (items: WorkspaceTreeNode[]) => {
      for (const item of items) {
        if (item.type !== 'directory') continue
        paths.push(item.relativePath)
        if (item.children?.length) walk(item.children)
      }
    }
    walk(nodes)
    return paths
  }

  function expandAllDirectories() {
    const next: Record<string, boolean> = {}
    for (const relativePath of collectDirectoryPaths(workspaceTree)) {
      next[relativePath] = true
    }
    setExpandedDirectories(next)
  }

  function collapseAllDirectories() {
    const next: Record<string, boolean> = {}
    for (const relativePath of collectDirectoryPaths(workspaceTree)) {
      next[relativePath] = false
    }
    setExpandedDirectories(next)
  }

  function gitStatusText(entry: GitStatusEntry) {
    if (entry.untracked) return '??'
    return `${entry.indexStatus}${entry.workingTreeStatus}`
  }

  function gitEntryClass(entry: GitStatusEntry) {
    if (entry.untracked) return 'border border-amber-300 text-amber-900 dark:border-amber-800 dark:text-amber-200'
    if (entry.staged && entry.unstaged) return 'border border-purple-300 text-purple-900 dark:border-purple-800 dark:text-purple-200'
    if (entry.staged) return 'border border-green-300 text-green-900 dark:border-green-800 dark:text-green-200'
    if (entry.unstaged) return 'border border-orange-300 text-orange-900 dark:border-orange-800 dark:text-orange-200'
    return 'border border-neutral-300 text-neutral-800 dark:border-neutral-700 dark:text-neutral-100'
  }

  function isDeletedGitEntry(entry: GitStatusEntry) {
    if (entry.untracked) return false
    return entry.indexStatus === 'D' || entry.workingTreeStatus === 'D'
  }

  function selectSingleGitEntry(relativePath: string) {
    setSelectedWorkspaceFile(relativePath)
    setSelectedGitPaths([relativePath])
    setGitSelectionAnchorPath(relativePath)
  }

  function handleGitEntryClick(entry: GitStatusEntry, event: React.MouseEvent<HTMLButtonElement>) {
    const entries = gitStatus?.entries ?? []
    const clickedPath = entry.relativePath
    const additive = event.metaKey || event.ctrlKey
    setSelectedWorkspaceFile(clickedPath)

    if (event.shiftKey) {
      const anchorPath = gitSelectionAnchorPath ?? selectedGitPaths[selectedGitPaths.length - 1] ?? clickedPath
      const anchorIndex = entries.findIndex((item) => item.relativePath === anchorPath)
      const clickedIndex = entries.findIndex((item) => item.relativePath === clickedPath)
      if (anchorIndex >= 0 && clickedIndex >= 0) {
        const start = Math.min(anchorIndex, clickedIndex)
        const end = Math.max(anchorIndex, clickedIndex)
        const rangePaths = entries.slice(start, end + 1).map((item) => item.relativePath)
        setSelectedGitPaths((prev) => (additive ? [...new Set([...prev, ...rangePaths])] : rangePaths))
        setGitSelectionAnchorPath(anchorPath)
        return
      }
    }

    if (additive) {
      setSelectedGitPaths((prev) => {
        if (prev.includes(clickedPath)) return prev.filter((path) => path !== clickedPath)
        return [...prev, clickedPath]
      })
      setGitSelectionAnchorPath(clickedPath)
      return
    }

    selectSingleGitEntry(clickedPath)
  }

  function openGitContextMenu(event: React.MouseEvent<HTMLButtonElement>, entry: GitStatusEntry) {
    event.preventDefault()
    if (!selectedGitPaths.includes(entry.relativePath)) {
      selectSingleGitEntry(entry.relativePath)
    } else {
      setSelectedWorkspaceFile(entry.relativePath)
    }
    setExplorerContextMenu(null)
    setGitContextMenu({
      x: event.clientX,
      y: event.clientY,
      relativePath: entry.relativePath,
      deleted: isDeletedGitEntry(entry),
    })
  }

  function formatCheckedAt(ts?: number) {
    if (!ts) return 'Never'
    const dt = new Date(ts)
    return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function createAgentPanel(sourcePanelId?: string) {
    if (panelsRef.current.length >= MAX_PANELS) return

    const sourcePanel = sourcePanelId ? panelsRef.current.find((panel) => panel.id === sourcePanelId) : undefined
    const panelWorkspace = sourcePanel?.cwd || workspaceRoot
    const ws = workspaceSettingsByPath[panelWorkspace] ?? workspaceSettingsByPath[workspaceRoot]
    const id = newId()
    const startupModel = sourcePanel?.model ?? ws?.defaultModel ?? DEFAULT_MODEL
    const p = makeDefaultPanel(id, panelWorkspace)
    p.model = startupModel
    p.messages = withModelBanner(p.messages, startupModel)
    p.interactionMode = parseInteractionMode(sourcePanel?.interactionMode)
    p.permissionMode = sourcePanel?.permissionMode ?? ws?.permissionMode ?? p.permissionMode
    p.sandbox = sourcePanel?.sandbox ?? ws?.sandbox ?? p.sandbox
    const clampedSecurity = clampPanelSecurityForWorkspace(panelWorkspace, p.sandbox, p.permissionMode)
    p.sandbox = clampedSecurity.sandbox
    p.permissionMode = clampedSecurity.permissionMode
    p.fontScale = sourcePanel?.fontScale ?? p.fontScale
    const nextPanelCount = panelsRef.current.length + 1
    setPanels((prev) => {
      if (prev.length >= MAX_PANELS) return prev
      return [...prev, p]
    })
    if (nextPanelCount > 3) setLayoutMode('grid')
    setActivePanelId(id)
    setFocusedEditorId(null)
  }

  function splitAgentPanel(sourcePanelId: string) {
    createAgentPanel(sourcePanelId)
  }

  function reorderAgentPanel(draggedId: string, targetId: string) {
    if (draggedId === targetId) return
    setPanels((prev) => {
      const draggedIdx = prev.findIndex((p) => p.id === draggedId)
      const targetIdx = prev.findIndex((p) => p.id === targetId)
      if (draggedIdx === -1 || targetIdx === -1) return prev
      const next = [...prev]
      const [removed] = next.splice(draggedIdx, 1)
      const insertIdx = targetIdx > draggedIdx ? targetIdx - 1 : targetIdx
      next.splice(insertIdx, 0, removed)
      return next
    })
  }

  const DND_TYPE_DOCK = 'application/x-barnaby-dock-panel'
  const DND_TYPE_AGENT = 'application/x-barnaby-agent-panel'

  function handleDragStart(
    e: React.DragEvent,
    type: 'workspace' | 'code' | 'agent',
    id: string,
  ) {
    setDraggingPanelId(id)
    e.dataTransfer.setData(type === 'agent' ? DND_TYPE_AGENT : DND_TYPE_DOCK, JSON.stringify({ type, id }))
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd() {
    setDraggingPanelId(null)
    setDragOverTarget(null)
  }

  function handleDockDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOverTarget(null)
    const raw = e.dataTransfer.getData(DND_TYPE_DOCK)
    if (!raw) return
    try {
      const { type } = JSON.parse(raw) as { type: string; id: string }
      if (type === 'workspace' || type === 'code') {
        setWorkspaceDockSide((prev) => (prev === 'right' ? 'left' : 'right'))
      }
    } catch {
      // ignore
    }
  }

  function handleAgentDrop(e: React.DragEvent, targetAgentId: string) {
    e.preventDefault()
    setDragOverTarget(null)
    const raw = e.dataTransfer.getData(DND_TYPE_AGENT)
    if (!raw) return
    try {
      const { id: draggedId } = JSON.parse(raw) as { type: string; id: string }
      reorderAgentPanel(draggedId, targetAgentId)
    } catch {
      // ignore
    }
  }

  const DROP_ZONE_OVERLAY_STYLE = { backgroundColor: 'color-mix(in srgb, var(--theme-accent-500) 28%, transparent)' }

  function handleDragOver(
    e: React.DragEvent,
    opts: { acceptDock?: boolean; acceptAgent?: boolean; targetId?: string },
  ) {
    e.preventDefault()
    if (opts.acceptDock && e.dataTransfer.types.includes(DND_TYPE_DOCK) && opts.targetId) {
      e.dataTransfer.dropEffect = 'move'
      setDragOverTarget(opts.targetId)
    } else if (opts.acceptAgent && e.dataTransfer.types.includes(DND_TYPE_AGENT) && opts.targetId) {
      e.dataTransfer.dropEffect = 'move'
      setDragOverTarget(opts.targetId)
    }
  }

  function renderWorkspaceTile() {
    return (
      <div
        data-workspace-window-root="true"
        className="relative h-full min-h-0 min-w-0 flex flex-col border border-neutral-200/80 dark:border-neutral-800 rounded-lg overflow-hidden bg-neutral-50 dark:bg-neutral-900 font-mono"
        onMouseDownCapture={() => setFocusedEditorId(null)}
        onDragOver={(e) => showCodeWindow && handleDragOver(e, { acceptDock: true, targetId: 'dock-workspace' })}
        onDrop={(e) => showCodeWindow && handleDockDrop(e)}
        onWheel={(e) => {
          if (!isZoomWheelGesture(e)) return
          e.preventDefault()
          if (zoomWheelThrottleRef.current) return
          zoomWheelThrottleRef.current = true
          if (e.deltaY < 0) api.zoomIn?.()
          else if (e.deltaY > 0) api.zoomOut?.()
          const level = api.getZoomLevel?.()
          if (level !== undefined) setZoomLevel(level)
          setTimeout(() => { zoomWheelThrottleRef.current = false }, 120)
        }}
      >
        {/* workspaceTitleBar: bar with "Workspace Window" label */}
        <div
          data-workspace-title-bar="true"
          className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 shrink-0 select-none"
          draggable={showCodeWindow}
          onDragStart={(e) => showCodeWindow && handleDragStart(e, 'workspace', 'workspace-window')}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => showCodeWindow && handleDragOver(e, { acceptDock: true, targetId: 'dock-workspace' })}
          onDrop={(e) => showCodeWindow && handleDockDrop(e)}
        >
          <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Workspace Window</div>
        </div>
        {draggingPanelId && dragOverTarget === 'dock-workspace' && (
          <div className="absolute inset-0 rounded-lg pointer-events-none z-10" style={DROP_ZONE_OVERLAY_STYLE} />
        )}
        {/* workspaceDockTabBar: bar with orchestrator/explorer/git/settings tab icons */}
        <div data-workspace-dock-tab-bar="true" className="px-2.5 py-2 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center gap-1.5 bg-neutral-100 dark:bg-neutral-900/80">
          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              title="Agent Orchestrator"
              aria-label="Agent Orchestrator"
              className={`h-8 w-8 inline-flex items-center justify-center rounded-md text-xs border font-medium ${
                dockTab === 'orchestrator'
                  ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-100'
                  : 'border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
              }`}
              onClick={() => setDockTab('orchestrator')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="2.5" y="8" width="19" height="11.5" rx="5.75" stroke="currentColor" strokeWidth="1.8" />
                <path d="M5.5 8V4.5L8 8" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <circle cx="9.2" cy="13.7" r="1.5" fill="currentColor" />
                <circle cx="14.8" cy="13.7" r="1.5" fill="currentColor" />
              </svg>
            </button>
            <button
              type="button"
              title="Workspace Folder"
              aria-label="Workspace Folder"
              className={`h-8 w-8 inline-flex items-center justify-center rounded-md text-xs border font-medium ${
                dockTab === 'explorer'
                  ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-100'
                  : 'border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
              }`}
              onClick={() => setDockTab('explorer')}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2.5 4.5C2.5 3.95 2.95 3.5 3.5 3.5H6.2L7 4.5H12.5C13.05 4.5 13.5 4.95 13.5 5.5V11.5C13.5 12.05 13.05 12.5 12.5 12.5H3.5C2.95 12.5 2.5 12.05 2.5 11.5V4.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              title="Git"
              aria-label="Git"
              className={`h-8 w-8 inline-flex items-center justify-center rounded-md text-xs border font-medium ${
                dockTab === 'git'
                  ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-100'
                  : 'border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
              }`}
              onClick={() => setDockTab('git')}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="4" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                <circle cx="12" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                <circle cx="8" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M5.3 4H10.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M4.7 5.1L7.3 10.9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M11.3 5.1L8.7 10.9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              title="Workspace settings"
              aria-label="Workspace settings"
              className={`h-8 w-8 inline-flex items-center justify-center rounded-md text-xs border font-medium ${
                dockTab === 'settings'
                  ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-100'
                  : 'border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
              }`}
              onClick={openWorkspaceSettingsTab}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 2.2L9 3.1L10.4 2.8L11.2 4.1L12.6 4.4L12.5 5.9L13.6 6.8L12.8 8L13.6 9.2L12.5 10.1L12.6 11.6L11.2 11.9L10.4 13.2L9 12.9L8 13.8L7 12.9L5.6 13.2L4.8 11.9L3.4 11.6L3.5 10.1L2.4 9.2L3.2 8L2.4 6.8L3.5 5.9L3.4 4.4L4.8 4.1L5.6 2.8L7 3.1L8 2.2Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                <circle cx="8" cy="8" r="1.9" stroke="currentColor" strokeWidth="1.1" />
              </svg>
            </button>
          </div>
          <button
            type="button"
            title={`Dock workspace window to ${workspaceDockSide === 'right' ? 'left' : 'right'}`}
            aria-label={`Dock workspace window to ${workspaceDockSide === 'right' ? 'left' : 'right'}`}
            className="ml-auto h-8 w-8 inline-flex items-center justify-center rounded-md text-xs border font-medium border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200"
            onClick={() => setWorkspaceDockSide((prev) => (prev === 'right' ? 'left' : 'right'))}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="2.2" y="2.3" width="11.6" height="11.4" rx="1.2" stroke="currentColor" strokeWidth="1.1" />
              {workspaceDockSide === 'right' ? (
                <>
                  <path d="M10 3.2H13V12.8H10Z" fill="currentColor" fillOpacity="0.3" />
                  <path d="M7.7 8H4.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                  <path d="M6 6.4L4.4 8L6 9.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                </>
              ) : (
                <>
                  <path d="M3 3.2H6V12.8H3Z" fill="currentColor" fillOpacity="0.3" />
                  <path d="M8.3 8H11.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                  <path d="M10 6.4L11.6 8L10 9.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                </>
              )}
            </svg>
          </button>
          <button
            type="button"
            title="Close workspace window"
            aria-label="Close workspace window"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-xs border font-medium border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200"
            onClick={() => setShowWorkspaceWindow(false)}
          >
            <svg width="12" height="12" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0">
          {dockTab === 'orchestrator'
            ? renderAgentOrchestratorPane()
            : dockTab === 'explorer'
              ? renderExplorerPane()
              : dockTab === 'git'
                ? renderGitPane()
                : renderWorkspaceSettingsPane()}
        </div>
      </div>
    )
  }

  function setEditorTabEditMode(editorId: string, editMode: boolean) {
    setEditorPanels((prev) =>
      prev.map((p) => (p.id === editorId ? { ...p, editMode } : p)),
    )
  }

  function toggleRightDockWindow(nextTab: CodeWindowTab) {
    if (showCodeWindow && codeWindowTab === nextTab) {
      setShowCodeWindow(false)
      return
    }
    setCodeWindowTab(nextTab)
    if (!showCodeWindow) setShowCodeWindow(true)
  }

  function openAppSettingsInRightDock(view: AppSettingsView) {
    setAppSettingsView(view)
    setCodeWindowTab('settings')
    if (!showCodeWindow) setShowCodeWindow(true)
  }

  function renderCodeWindowTile() {
    const activePanel =
      (focusedEditorId ? editorPanels.find((p) => p.id === focusedEditorId) : null) ??
      editorPanels[0] ??
      null
    const hasTabs = editorPanels.length > 0
    const showingSettingsPanel = codeWindowTab === 'settings'

    return (
      <div
        className="relative h-full min-h-0 min-w-0 flex flex-col border border-neutral-200/80 dark:border-neutral-800 rounded-lg overflow-hidden bg-neutral-50 dark:bg-neutral-900 font-mono"
        onMouseDownCapture={(e) => {
          const target = e.target
          if (target instanceof HTMLElement) {
            // Avoid fighting with the dropdown/buttons; keep current selection stable.
            if (target.closest('select') || target.closest('button') || target.closest('textarea') || target.closest('.cm-editor') || target.closest('a')) return
          }
          const id = focusedEditorIdRef.current ?? editorPanelsRef.current[0]?.id ?? null
          if (id) setFocusedEditor(id)
        }}
        onDragOver={(e) => showWorkspaceWindow && handleDragOver(e, { acceptDock: true, targetId: 'dock-code' })}
        onDrop={(e) => showWorkspaceWindow && handleDockDrop(e)}
        onWheel={(e) => {
          if (!isZoomWheelGesture(e)) return
          e.preventDefault()
          if (zoomWheelThrottleRef.current) return
          zoomWheelThrottleRef.current = true
          if (e.deltaY < 0) api.zoomIn?.()
          else if (e.deltaY > 0) api.zoomOut?.()
          const level = api.getZoomLevel?.()
          if (level !== undefined) setZoomLevel(level)
          setTimeout(() => { zoomWheelThrottleRef.current = false }, 120)
        }}
      >
        <div
          className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 shrink-0 select-none"
          draggable={showWorkspaceWindow}
          onDragStart={(e) => showWorkspaceWindow && handleDragStart(e, 'code', 'code-window')}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => showWorkspaceWindow && handleDragOver(e, { acceptDock: true, targetId: 'dock-code' })}
          onDrop={(e) => showWorkspaceWindow && handleDockDrop(e)}
        >
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
              {showingSettingsPanel ? 'Settings Window' : 'Code Window'}
            </div>
            <button
              type="button"
              title={`Move dock to ${workspaceDockSide === 'right' ? 'left' : 'right'} side`}
              aria-label={`Move dock to ${workspaceDockSide === 'right' ? 'left' : 'right'} side`}
              className="ml-auto h-8 w-8 inline-flex items-center justify-center rounded-md text-xs border font-medium border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200"
              onClick={() => setWorkspaceDockSide((prev) => (prev === 'right' ? 'left' : 'right'))}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="2.2" y="2.3" width="11.6" height="11.4" rx="1.2" stroke="currentColor" strokeWidth="1.1" />
                {workspaceDockSide === 'right' ? (
                  <>
                    <path d="M10 3.2H13V12.8H10Z" fill="currentColor" fillOpacity="0.3" />
                    <path d="M7.7 8H4.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                    <path d="M6 6.4L4.4 8L6 9.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                  </>
                ) : (
                  <>
                    <path d="M3 3.2H6V12.8H3Z" fill="currentColor" fillOpacity="0.3" />
                    <path d="M8.3 8H11.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                    <path d="M10 6.4L11.6 8L10 9.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                  </>
                )}
              </svg>
            </button>
            <button
              type="button"
              title={showingSettingsPanel ? 'Close settings window' : 'Close code window'}
              aria-label={showingSettingsPanel ? 'Close settings window' : 'Close code window'}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-xs border font-medium border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200"
              onClick={() => setShowCodeWindow(false)}
            >
              <svg width="12" height="12" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        {draggingPanelId && dragOverTarget === 'dock-code' && (
          <div className="absolute inset-0 rounded-lg pointer-events-none z-10" style={DROP_ZONE_OVERLAY_STYLE} />
        )}
        {!showingSettingsPanel && hasTabs && activePanel && (
          <div className="px-2 py-2 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center gap-2 flex-wrap bg-neutral-100 dark:bg-neutral-900/80 shrink-0">
            <span className="text-xs text-neutral-600 dark:text-neutral-400">Current file:</span>
            <select
              className={`flex-1 min-w-0 max-w-[240px] text-[11px] font-mono ${UI_SELECT_CLASS} dark:border-neutral-700/80 dark:bg-neutral-800/80 dark:text-neutral-200`}
              value={focusedEditorId ?? ''}
              onChange={(e) => {
                const id = e.target.value
                if (id) setFocusedEditor(id)
              }}
              title={activePanel.relativePath}
            >
              {editorPanels.map((tab) => (
                <option key={tab.id} value={tab.id} title={tab.relativePath + (tab.dirty ? ' (unsaved)' : '')}>
                  {tab.title}{tab.dirty ? ' *' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`px-2 py-1 text-xs rounded border ${
                activePanel.editMode ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-100' : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700/80 dark:bg-transparent dark:text-neutral-300 dark:hover:bg-neutral-800/80 dark:hover:border-neutral-600'
              }`}
              onClick={() => {
                const id = focusedEditorIdRef.current ?? editorPanelsRef.current[0]?.id ?? null
                if (!id) return
                const panel = editorPanelsRef.current.find((p) => p.id === id)
                const nextMode = !(panel?.editMode ?? false)
                setEditorTabEditMode(id, nextMode)
                setFocusedEditor(id)
              }}
              disabled={activePanel.loading || activePanel.binary}
              title={activePanel.editMode ? 'Switch to view-only' : 'Enable editing'}
            >
              {activePanel.editMode ? 'View' : 'Edit'}
            </button>
            <button
              type="button"
              className={`${CODE_WINDOW_TOOLBAR_BUTTON} ${applicationSettings.editorWordWrap ? 'shadow-inner bg-neutral-200 border-neutral-400 text-neutral-800 dark:bg-neutral-700/80 dark:border-neutral-600 dark:text-neutral-100' : ''}`}
              onClick={() => setApplicationSettings((p) => ({ ...p, editorWordWrap: !p.editorWordWrap }))}
              aria-label={applicationSettings.editorWordWrap ? 'Word wrap on' : 'Word wrap off'}
              title={applicationSettings.editorWordWrap ? 'Word wrap on (click to turn off)' : 'Word wrap off (click to turn on)'}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M5 4L2 8l3 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M11 4l3 4-3 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9 6L7 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className={CODE_WINDOW_TOOLBAR_BUTTON}
              disabled={activePanel.loading || activePanel.saving || activePanel.binary || !activePanel.dirty}
              onClick={() => {
                const id = focusedEditorIdRef.current ?? editorPanelsRef.current[0]?.id ?? null
                if (!id) return
                setFocusedEditor(id)
                void saveEditorPanel(id)
              }}
              aria-label="Save"
              title="Save (Ctrl+S)"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M3 3.5C3 2.95 3.45 2.5 4 2.5H10.7L13 4.8V12.5C13 13.05 12.55 13.5 12 13.5H4C3.45 13.5 3 13.05 3 12.5V3.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M5 2.5H10V6H5V2.5Z" stroke="currentColor" strokeWidth="1.2" />
                <path d="M5.2 9.5H10.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className={CODE_WINDOW_TOOLBAR_BUTTON}
              disabled={activePanel.loading || activePanel.saving || activePanel.binary}
              onClick={() => {
                const id = focusedEditorIdRef.current ?? editorPanelsRef.current[0]?.id ?? null
                if (!id) return
                setFocusedEditor(id)
                void saveEditorPanelAs(id)
              }}
              aria-label="Save As"
              title="Save As (Ctrl+Shift+S)"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M3 3.5C3 2.95 3.45 2.5 4 2.5H10.7L13 4.8V12.5C13 13.05 12.55 13.5 12 13.5H4C3.45 13.5 3 13.05 3 12.5V3.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M5 2.5H10V6H5V2.5Z" stroke="currentColor" strokeWidth="1.2" />
                <path d="M8 8.4V12.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M6.1 10.3H9.9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className={CODE_WINDOW_TOOLBAR_BUTTON_SM}
              onClick={() => {
                const id = focusedEditorIdRef.current ?? editorPanelsRef.current[0]?.id ?? null
                if (!id) return
                setFocusedEditor(id)
                closeEditorPanel(id)
              }}
              title="Close tab"
            >
              <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-hidden bg-neutral-50 dark:bg-neutral-900">
          {showingSettingsPanel && (
            <div ref={codeWindowSettingsHostRef} className="h-full min-h-0" />
          )}
          {!showingSettingsPanel && !hasTabs && (
            <div className="h-full flex items-center justify-center text-sm text-neutral-500 dark:text-neutral-400 p-4 text-center">
              Double-click a file in the workspace to open it.
            </div>
          )}
          {!showingSettingsPanel && hasTabs && activePanel && activePanel.loading && (
            <div className="p-4 text-sm text-neutral-600 dark:text-neutral-400">Loading file...</div>
          )}
          {!showingSettingsPanel && hasTabs && activePanel && !activePanel.loading && activePanel.error && (
            <div className="p-4 text-sm text-red-600 dark:text-red-400">{activePanel.error}</div>
          )}
          {!showingSettingsPanel && hasTabs && activePanel && !activePanel.loading && !activePanel.error && activePanel.binary && (
            <div className="p-4 text-sm text-neutral-600 dark:text-neutral-400">
              Binary files are not editable in this editor.
            </div>
          )}
          {!showingSettingsPanel && hasTabs && activePanel && !activePanel.loading && !activePanel.error && !activePanel.binary && (
            <div className="h-full min-h-0 flex flex-col overflow-hidden">
              <CodeMirrorEditor
                value={activePanel.content}
                onChange={(v) => updateEditorContent(activePanel.id, v)}
                readOnly={!activePanel.editMode}
                filename={activePanel.relativePath}
                wordWrap={applicationSettings.editorWordWrap}
                fontScale={activePanel.fontScale}
                darkMode={activeTheme.mode === 'dark'}
                onSave={() => void saveEditorPanel(activePanel.id)}
                onSaveAs={() => void saveEditorPanelAs(activePanel.id)}
                onFocus={() => setFocusedEditor(activePanel.id)}
              />
            </div>
          )}
        </div>
        {!showingSettingsPanel && hasTabs && activePanel && (
          <div className="px-3 py-1.5 border-t border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center justify-between shrink-0">
            <span>{Math.round(activePanel.size / 1024)} KB</span>
            <span>
              {activePanel.saving
                ? 'Saving...'
                : activePanel.dirty
                  ? 'Unsaved changes'
                  : activePanel.savedAt
                    ? `Saved ${new Date(activePanel.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : 'Saved'}
            </span>
          </div>
        )}
      </div>
    )
  }

  function renderEditorPanel(panel: EditorPanelState) {
    const saveDisabled = panel.loading || panel.saving || panel.binary || !panel.dirty
    const saveAsDisabled = panel.loading || panel.saving || panel.binary
    const editorFontSizePx = 12 * panel.fontScale
    const editorLineHeightPx = 20 * panel.fontScale
    return (
      <div
        className={[
          'h-full min-h-0 min-w-0 flex flex-col rounded-xl border bg-white dark:bg-neutral-950 overflow-hidden outline-none shadow-sm',
          focusedEditorId === panel.id
            ? 'border-blue-400 dark:border-blue-600 ring-2 ring-blue-100 dark:ring-blue-900/40'
            : 'border-neutral-200/90 dark:border-neutral-800',
        ].join(' ')}
        tabIndex={0}
        onFocusCapture={() => setFocusedEditorId(panel.id)}
        onMouseDownCapture={() => setFocusedEditorId(panel.id)}
        onWheel={(e) => {
          if (!isZoomWheelGesture(e)) return
          e.preventDefault()
          setFocusedEditorId(panel.id)
          if (zoomWheelThrottleRef.current) return
          zoomWheelThrottleRef.current = true
          if (e.deltaY < 0) api.zoomIn?.()
          else if (e.deltaY > 0) api.zoomOut?.()
          const level = api.getZoomLevel?.()
          if (level !== undefined) setZoomLevel(level)
          setTimeout(() => { zoomWheelThrottleRef.current = false }, 120)
        }}
      >
        <div className="px-3 py-2.5 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" title={panel.relativePath}>
              {panel.title}{panel.dirty ? ' *' : ''}
            </div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono truncate" title={panel.relativePath}>
              {panel.relativePath}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={UI_TOOLBAR_ICON_BUTTON_CLASS}
              disabled={saveDisabled}
              onClick={() => void saveEditorPanel(panel.id)}
              aria-label="Save"
              title="Save (Ctrl+S)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 3.5C3 2.95 3.45 2.5 4 2.5H10.7L13 4.8V12.5C13 13.05 12.55 13.5 12 13.5H4C3.45 13.5 3 13.05 3 12.5V3.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M5 2.5H10V6H5V2.5Z" stroke="currentColor" strokeWidth="1.2" />
                <path d="M5.2 9.5H10.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className={UI_TOOLBAR_ICON_BUTTON_CLASS}
              disabled={saveAsDisabled}
              onClick={() => void saveEditorPanelAs(panel.id)}
              aria-label="Save As"
              title="Save As (Ctrl+Shift+S)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 3.5C3 2.95 3.45 2.5 4 2.5H10.7L13 4.8V12.5C13 13.05 12.55 13.5 12 13.5H4C3.45 13.5 3 13.05 3 12.5V3.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M5 2.5H10V6H5V2.5Z" stroke="currentColor" strokeWidth="1.2" />
                <path d="M8 8.4V12.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M6.1 10.3H9.9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className={UI_CLOSE_ICON_BUTTON_CLASS}
              onClick={() => closeEditorPanel(panel.id)}
              title="Close editor"
            >
              <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden bg-neutral-50 dark:bg-neutral-900">
          {panel.loading && (
            <div className="p-4 text-sm text-neutral-600 dark:text-neutral-400">Loading file...</div>
          )}
          {!panel.loading && panel.error && (
            <div className="p-4 text-sm text-red-600 dark:text-red-400">{panel.error}</div>
          )}
          {!panel.loading && !panel.error && panel.binary && (
            <div className="p-4 text-sm text-neutral-600 dark:text-neutral-400">
              Binary files are not editable in this editor.
            </div>
          )}
          {!panel.loading && !panel.error && !panel.binary && (
            <div className="h-full min-h-0 flex flex-col overflow-hidden">
              <CodeMirrorEditor
                value={panel.content}
                onChange={(v) => updateEditorContent(panel.id, v)}
                readOnly={false}
                filename={panel.relativePath}
                wordWrap={applicationSettings.editorWordWrap}
                fontScale={panel.fontScale}
                darkMode={activeTheme.mode === 'dark'}
                onSave={() => void saveEditorPanel(panel.id)}
                onSaveAs={() => void saveEditorPanelAs(panel.id)}
                onFocus={() => setFocusedEditorId(panel.id)}
              />
            </div>
          )}
        </div>
        <div className="px-3 py-1.5 border-t border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center justify-between">
          <span>{Math.round(panel.size / 1024)} KB</span>
          <span>
            {panel.saving
              ? 'Saving...'
              : panel.dirty
                ? 'Unsaved changes'
                : panel.savedAt
                  ? `Saved ${new Date(panel.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Saved'}
          </span>
        </div>
      </div>
    )
  }

  function renderLayoutPane(panelId: string) {
    if (panelId === 'workspace-window') return renderWorkspaceTile()
    if (panelId === 'code-window') return renderCodeWindowTile()
    const agentPanel = panels.find((w) => w.id === panelId)
    if (agentPanel) return renderPanelContent(agentPanel)
    return null
  }

  function renderGridLayout(layoutPaneIds: string[]) {
    const n = layoutPaneIds.length
    const cols = Math.ceil(Math.sqrt(n))
    const rows = Math.ceil(n / cols)
    const panelChunks: string[][] = []
    for (let r = 0; r < rows; r++) {
      const start = r * cols
      panelChunks.push(layoutPaneIds.slice(start, start + cols))
    }
    return (
      <Group orientation="vertical" className="flex-1 min-h-0 min-w-0" id="grid-outer">
        {panelChunks.map((rowPanels, rowIdx) => (
          <React.Fragment key={rowIdx}>
            {rowIdx > 0 && <Separator className="h-1 bg-neutral-300 dark:bg-neutral-700 hover:bg-blue-400 data-[resize-handle-active]:bg-blue-500" />}
            <Panel id={`grid-row-${rowIdx}`} defaultSize={`${100 / rows}`} minSize="10" className="min-h-0 min-w-0">
              <Group orientation="horizontal" className="h-full min-w-0" id={`grid-row-${rowIdx}-inner`}>
                {rowPanels.map((panelId, colIdx) => (
                  <React.Fragment key={panelId}>
                    {colIdx > 0 && <Separator className="w-1 bg-neutral-300 dark:bg-neutral-700 hover:bg-blue-400" />}
                    <Panel id={`panel-${panelId}`} defaultSize={`${100 / rowPanels.length}`} minSize="15" className="min-h-0 min-w-0">
                      {renderLayoutPane(panelId)}
                    </Panel>
                  </React.Fragment>
                ))}
              </Group>
            </Panel>
          </React.Fragment>
        ))}
      </Group>
    )
  }

  async function connectWindow(
    winId: string,
    model: string,
    cwd: string,
    permissionMode: PermissionMode,
    sandbox: SandboxMode,
    initialHistory?: Array<{ role: 'user' | 'assistant'; text: string }>,
    interactionMode?: AgentInteractionMode,
  ) {
    const mi = modelConfig.interfaces.find((m) => m.id === model)
    const provider = mi?.provider ?? 'codex'
    const clampedSecurity = clampPanelSecurityForWorkspace(cwd, sandbox, permissionMode)
    const allowedCommandPrefixes = workspaceSettingsByPath[cwd]?.allowedCommandPrefixes ?? []
    const allowedAutoReadPrefixes = workspaceSettingsByPath[cwd]?.allowedAutoReadPrefixes ?? []
    const allowedAutoWritePrefixes = workspaceSettingsByPath[cwd]?.allowedAutoWritePrefixes ?? []
    const deniedAutoReadPrefixes = workspaceSettingsByPath[cwd]?.deniedAutoReadPrefixes ?? []
    const deniedAutoWritePrefixes = workspaceSettingsByPath[cwd]?.deniedAutoWritePrefixes ?? []

    await withTimeout(
      api.connect(winId, {
        model,
        cwd,
        permissionMode: clampedSecurity.permissionMode,
        approvalPolicy: clampedSecurity.permissionMode === 'proceed-always' ? 'never' : 'on-request',
        sandbox: clampedSecurity.sandbox,
        interactionMode: interactionMode ?? 'agent',
        allowedCommandPrefixes,
        allowedAutoReadPrefixes,
        allowedAutoWritePrefixes,
        deniedAutoReadPrefixes,
        deniedAutoWritePrefixes,
        provider,
        modelConfig: mi?.config,
        initialHistory,
      }),
      CONNECT_TIMEOUT_MS,
      'connect',
    )
  }

  async function reconnectPanel(winId: string, reason: string) {
    if (reconnectingRef.current.has(winId)) return
    const w = panelsRef.current.find((x) => x.id === winId)
    if (!w) return
    reconnectingRef.current.add(winId)
    const provider = getModelProvider(w.model)
    if (provider === 'codex' && !CODEX_API_MODELS.includes(w.model) && w.messages.length > 0) {
      needsContextOnNextCodexSendRef.current[winId] = true
    }
    setPanels((prev) =>
      prev.map((p) =>
        p.id !== winId
          ? p
          : {
              ...p,
              connected: false,
              streaming: false,
              status: `Reconnecting: ${reason}`,
            },
      ),
    )
    try {
      const initialHistory = w.messages.length > 0 ? panelMessagesToInitialHistory(w.messages) : undefined
      await connectWindow(winId, w.model, w.cwd, w.permissionMode, w.sandbox, initialHistory, w.interactionMode)
      setPanels((prev) =>
        prev.map((p) =>
          p.id !== winId
            ? p
            : {
                ...p,
                status: 'Reconnected.',
              },
        ),
      )
      queueMicrotask(() => kickQueuedMessage(winId))
    } catch (e) {
      const errMsg = formatConnectionError(e, getModelProvider(w.model))
      setPanels((prev) =>
        prev.map((p) =>
          p.id !== winId
            ? p
            : {
                ...p,
                connected: false,
                streaming: false,
                status: 'Reconnect failed',
                messages: [...p.messages, { id: newId(), role: 'system', content: errMsg, format: 'text', createdAt: Date.now() }],
              },
        ),
      )
    } finally {
      reconnectingRef.current.delete(winId)
    }
  }

  async function connectWindowWithRetry(
    winId: string,
    model: string,
    cwd: string,
    permissionMode: PermissionMode,
    sandbox: SandboxMode,
    initialHistory?: Array<{ role: 'user' | 'assistant'; text: string }>,
    interactionMode?: AgentInteractionMode,
  ) {
    try {
      await connectWindow(winId, model, cwd, permissionMode, sandbox, initialHistory, interactionMode)
      return
    } catch {
      await connectWindow(winId, model, cwd, permissionMode, sandbox, initialHistory, interactionMode)
    }
  }

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const current = panelsRef.current
      for (const p of current) {
        if (!p.streaming) continue
        const activity = panelActivityById[p.id]
        if (!activity) continue
        if (now - activity.lastEventAt < STALL_WATCHDOG_MS) continue
        void reconnectPanel(p.id, 'turn appears stalled')
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [panelActivityById])

  function formatConnectionError(e: unknown, provider?: string): string {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('codex app-server closed') || msg.includes('codex app-server')) {
      return [
        'Codex disconnected. Common causes:',
        '- Run `codex app-server` in a terminal to check for errors',
        '- Ensure logged in: `codex login`',
        '- Try using fewer panels (each uses a separate Codex process)',
        'Send another message to reconnect.',
      ].join('\n')
    }
    if (msg.includes('timed out') && provider === 'claude') {
      return [
        'Claude turn timed out.',
        'Common causes:',
        '- No credits left: check your Claude subscription at claude.ai',
        '- Claude CLI not in PATH: run `claude --version` in a terminal',
        '- Slow network or API delay.',
        'Send another message to retry.',
      ].join('\n')
    }
    if (msg.includes('Not connected') || msg.includes('closed')) {
      return `${msg}\n\nSend another message to reconnect.`
    }
    return `Error: ${msg}`
  }

  async function sendToAgent(winId: string, text: string, imagePaths: string[] = []) {
    const w = panels.find((x) => x.id === winId)
    if (!w) return
    const interactionMode = parseInteractionMode(w.interactionMode)
    const provider = getModelProvider(w.model)

    // Resolve @file mentions (mode instructions are now in system prompt, not prepended)
    const resolvedText = await (async () => {
      const mentions = Array.from(text.matchAll(/@([^\s]+)/g))
      if (mentions.length === 0) return text

      let context = ''
      for (const match of mentions) {
        const path = match[1]
        try {
          const file = await api.readWorkspaceTextFile(workspaceRoot, path)
          context += `\n\nFile: ${path}\n\`\`\`\n${file.content}\n\`\`\``
        } catch {
          // Ignore invalid paths
        }
      }
      return text + context
    })()

    try {
      // Measure total elapsed time for a user prompt, including auth/connect delays.
      if (text.trim() !== AUTO_CONTINUE_PROMPT || !activePromptStartedAtRef.current.has(winId)) {
        activePromptStartedAtRef.current.set(winId, Date.now())
      }
      appendPanelDebug(winId, 'send', `Received user message (${text.length} chars)`)
      setPanels((prev) =>
        prev.map((x) =>
          x.id !== winId
            ? x
            : {
                ...x,
                status: `Checking ${provider} auth...`,
              },
        ),
      )
      const needContext = !w.connected && w.messages.length > 0
      const initialHistory = needContext ? panelMessagesToInitialHistory(w.messages) : undefined
      if (needContext && provider === 'codex' && !CODEX_API_MODELS.includes(w.model)) {
        needsContextOnNextCodexSendRef.current[winId] = true
      }
      if (!w.connected) {
        appendPanelDebug(winId, 'auth', `Checking provider "${provider}"`)
        await ensureProviderReady(provider, `${w.model}`)
        setPanels((prev) =>
          prev.map((x) =>
            x.id !== winId
              ? x
              : {
                  ...x,
                  status: `Connecting to ${provider}...`,
                },
          ),
        )
        appendPanelDebug(winId, 'connect', `Connecting model ${w.model} (${provider})`)
        await connectWindowWithRetry(winId, w.model, w.cwd, w.permissionMode, w.sandbox, initialHistory, interactionMode)
        appendPanelDebug(winId, 'connect', 'Connected')
      }
      setPanels((prev) =>
        prev.map((x) =>
          x.id !== winId
            ? x
            : {
                ...x,
                status: 'Sending message...',
              },
        ),
      )
      appendPanelDebug(winId, 'turn/start', 'Starting turn...')
      if (provider !== 'codex' && provider !== 'gemini' && imagePaths.length > 0) {
        throw new Error('Image attachments are supported for Codex and Gemini panels only.')
      }
      const needsPriorMessages =
        provider === 'codex' &&
        !CODEX_API_MODELS.includes(w.model) &&
        w.messages.length > 0 &&
        (needContext || needsContextOnNextCodexSendRef.current[winId])
      const priorMessagesForContext = needsPriorMessages
        ? w.messages.map((m) => ({ role: m.role, content: m.content ?? '' }))
        : undefined
      await withTimeout(
        api.sendMessage(winId, resolvedText, imagePaths, priorMessagesForContext, interactionMode),
        TURN_START_TIMEOUT_MS,
        'turn/start',
      )
      if (needsPriorMessages) {
        needsContextOnNextCodexSendRef.current[winId] = false
      }
      appendPanelDebug(winId, 'turn/start', 'Turn started')
    } catch (e: any) {
      activePromptStartedAtRef.current.delete(winId)
      clearPanelTurnComplete(winId)
      const errMsg = formatConnectionError(e, provider)
      appendPanelDebug(winId, 'error', errMsg)
      setPanels((prev) =>
        prev.map((x) =>
          x.id !== winId
            ? x
            : {
                ...x,
                streaming: false,
                connected: false,
                status: 'Disconnected',
                messages: [...x.messages, { id: newId(), role: 'system', content: errMsg, format: 'text', createdAt: Date.now() }],
              },
        ),
      )
    }
  }

  function kickQueuedMessage(winId: string) {
    let nextText = ''
    let snapshotForHistory: AgentPanelState | null = null
    setPanels((prev) =>
      prev.map((x) => {
        if (x.id !== winId) return x
        if (x.streaming || x.pendingInputs.length === 0) return x
        const [head, ...rest] = x.pendingInputs
        nextText = head
        const queuedUserMessage: ChatMessage = {
          id: newId(),
          role: 'user',
          content: head,
          format: 'text',
          createdAt: Date.now(),
        }
        const updated: AgentPanelState = {
          ...x,
          streaming: true,
          status: 'Preparing message...',
          pendingInputs: rest,
          messages: [...x.messages, queuedUserMessage],
        }
        snapshotForHistory = updated
        return updated
      }),
    )
    if (snapshotForHistory) upsertPanelToHistory(snapshotForHistory)
    if (nextText) {
      clearPanelTurnComplete(winId)
      void sendToAgent(winId, nextText)
    }
  }

  function injectQueuedMessage(winId: string, index: number) {
    let textToInject = ''
    let snapshotForHistory: AgentPanelState | null = null
    setPanels((prev) =>
      prev.map((x) => {
        if (x.id !== winId) return x
        if (index < 0 || index >= x.pendingInputs.length) return x
        textToInject = x.pendingInputs[index]
        const nextPending = x.pendingInputs.filter((_, j) => j !== index)
        const queuedUserMessage: ChatMessage = {
          id: newId(),
          role: 'user',
          content: textToInject,
          format: 'text',
          createdAt: Date.now(),
        }
        const updated: AgentPanelState = {
          ...x,
          streaming: true,
          status: x.streaming ? x.status : 'Preparing message...',
          pendingInputs: nextPending,
          messages: [...x.messages, queuedUserMessage],
        }
        snapshotForHistory = updated
        return updated
      }),
    )
    if (snapshotForHistory) upsertPanelToHistory(snapshotForHistory)
    if (!textToInject) return
    clearPanelTurnComplete(winId)
    void sendToAgent(winId, textToInject)
  }

  function sendMessage(winId: string) {
    const w = panels.find((x) => x.id === winId)
    if (!w) return
    const text = w.input.trim()
    const messageAttachments = w.attachments.map((a) => ({ ...a }))
    const imagePaths = messageAttachments.map((a) => a.path)
    if (!text && imagePaths.length === 0) return
    const hasDirtyEditor = editorPanels.some((p) => p.dirty)
    if (hasDirtyEditor) {
      const proceed = confirm(
        'You have unsaved changes in the Code Window. Agents may overwrite your edits. Save your changes first, or choose OK to continue anyway.',
      )
      if (!proceed) return
    }
    const provider = getModelProvider(w.model)
    const usedPercent = provider === 'codex' ? getRateLimitPercent(w.usage) : null
    if (usedPercent !== null && usedPercent >= 99.5) {
      setPanels((prev) =>
        prev.map((x) =>
          x.id !== winId
            ? x
            : {
                ...x,
                status: 'Codex limit reached',
                messages: withExhaustedRateLimitWarning(x.messages, x.usage),
              },
        ),
      )
      return
    }
    const isBusy = w.streaming || w.pendingInputs.length > 0
    if (isBusy && imagePaths.length > 0) {
      setPanels((prev) =>
        prev.map((x) =>
          x.id !== winId
            ? x
            : {
                ...x,
                messages: [
                  ...x.messages,
                  {
                    id: newId(),
                    role: 'system',
                    content: 'Please wait for the current turn to finish before sending image attachments.',
                    format: 'text',
                    createdAt: Date.now(),
                  },
                ],
              },
        ),
      )
      return
    }
    clearPanelTurnComplete(winId)
    let snapshotForHistory: AgentPanelState | null = null
    setPanels((prev) =>
      prev.map((x) => {
        if (x.id !== winId) return x
        if (isBusy) {
          appendPanelDebug(winId, 'queue', `Panel busy - queued message (${text.length} chars)`)
          const updated: AgentPanelState = {
            ...x,
            input: '',
            pendingInputs: [...x.pendingInputs, text],
          }
          snapshotForHistory = updated
          return updated
        }
        appendPanelDebug(winId, 'queue', 'Panel idle - sending immediately')
        const userMessage: ChatMessage = {
          id: newId(),
          role: 'user',
          content: text,
          format: 'text',
          attachments: messageAttachments.length > 0 ? messageAttachments : undefined,
          createdAt: Date.now(),
        }
        const updated: AgentPanelState = {
          ...x,
          input: '',
          attachments: [],
          streaming: true,
          status: 'Preparing message...',
          messages: [...x.messages, userMessage],
        }
        snapshotForHistory = updated
        return updated
      }),
    )
    if (snapshotForHistory) upsertPanelToHistory(snapshotForHistory)

    if (!isBusy) void sendToAgent(winId, text, imagePaths)
  }

  async function closePanel(panelId: string, opts?: { skipUpsertToHistory?: boolean }) {
    const panel = panelsRef.current.find((w) => w.id === panelId)
    if (panel && !opts?.skipUpsertToHistory) upsertPanelToHistory(panel)
    activePromptStartedAtRef.current.delete(panelId)
    clearPanelTurnComplete(panelId)
    setLastPromptDurationMsByPanel((prev) => {
      if (!(panelId in prev)) return prev
      const next = { ...prev }
      delete next[panelId]
      return next
    })
    await api.disconnect(panelId).catch(() => {})
    setPanels((prev) => prev.filter((w) => w.id !== panelId))
  }

  async function switchModel(winId: string, nextModel: string) {
    setPanels((prev) =>
      prev.map((w) =>
        w.id !== winId
          ? w
          : {
              ...w,
              model: nextModel,
              connected: false,
              status: 'Switching model...',
            },
      ),
    )
    const panel = panels.find((p) => p.id === winId)
    const permissionMode = panel?.permissionMode ?? 'verify-first'
    const sandbox = panel?.sandbox ?? 'workspace-write'
    const provider = getModelProvider(nextModel)
    try {
      await ensureProviderReady(provider, `${nextModel}`)
      await connectWindow(winId, nextModel, workspaceRoot, permissionMode, sandbox)
      setPanels((prev) =>
        prev.map((w) => {
          if (w.id !== winId) return w
          return {
            ...w,
            cwd: workspaceRoot,
            messages: withModelBanner(w.messages, nextModel),
          }
        }),
      )
    } catch (e) {
      const errMsg = formatConnectionError(e, provider)
      setPanels((prev) =>
        prev.map((w) =>
          w.id !== winId
            ? w
            : {
                ...w,
                status: 'Disconnected',
                messages: [...w.messages, { id: newId(), role: 'system' as const, content: errMsg, format: 'text' as const, createdAt: Date.now() }],
              },
        ),
      )
    }
  }

  function setInteractionMode(panelId: string, nextMode: AgentInteractionMode) {
    setPanels((prev) =>
      prev.map((p) =>
        p.id === panelId
          ? {
              ...p,
              interactionMode: nextMode,
              status: `Mode set to ${INTERACTION_MODE_META[nextMode].label}.`,
            }
          : p,
      ),
    )
  }

  function setPanelSandbox(panelId: string, next: SandboxMode) {
    setPanels((prev) =>
      prev.map((p) =>
        p.id !== panelId
          ? p
          : (() => {
              const limits = getWorkspaceSecurityLimitsForPath(p.cwd)
              if (limits.sandbox === 'read-only') {
                return {
                  ...p,
                  status: 'Sandbox is locked to View. Expand sandbox in Workspace settings.',
                }
              }

              const clamped = clampPanelSecurityForWorkspace(
                p.cwd,
                next,
                next === 'read-only' ? 'verify-first' : p.permissionMode,
              )

              const status =
                next === 'read-only'
                  ? 'Sandbox set to read-only. Permissions locked to Verify first.'
                  : limits.permissionMode === 'verify-first'
                    ? 'Sandbox set to workspace-write. Permissions remain locked to Verify first by Workspace settings.'
                    : `Sandbox set to ${next} (reconnect on next send).`

              return {
                ...p,
                sandbox: clamped.sandbox,
                permissionMode: clamped.permissionMode,
                connected: false,
                status,
              }
            })(),
      ),
    )
    setSettingsPopoverByPanel((prev) => ({ ...prev, [panelId]: null }))
  }

  function setPanelPermission(panelId: string, next: PermissionMode) {
    setPanels((prev) =>
      prev.map((p) =>
        p.id !== panelId
          ? p
          : (() => {
              const limits = getWorkspaceSecurityLimitsForPath(p.cwd)
              if (limits.sandbox === 'read-only') {
                return {
                  ...p,
                  status: 'Permissions are disabled because workspace sandbox is Read only.',
                }
              }

              if (limits.permissionMode === 'verify-first' && next === 'proceed-always') {
                return {
                  ...p,
                  permissionMode: 'verify-first',
                  status: 'Permissions are locked to Verify first by Workspace settings.',
                }
              }

              const clamped = clampPanelSecurityForWorkspace(p.cwd, p.sandbox, next)
              return {
                ...p,
                permissionMode: clamped.permissionMode,
                connected: false,
                status:
                  clamped.permissionMode === 'proceed-always'
                    ? 'Permissions set: Proceed always (reconnect on next send).'
                    : 'Permissions set: Verify first (reconnect on next send).',
              }
            })(),
      ),
    )
    setSettingsPopoverByPanel((prev) => ({ ...prev, [panelId]: null }))
  }

  function renderExplorerNode(node: WorkspaceTreeNode, depth = 0): React.ReactNode {
    const rowPadding = 8 + depth * 10
    if (node.type === 'file') {
      const selected = selectedWorkspaceFile === node.relativePath
      return (
        <button
          key={node.relativePath}
          type="button"
          role="treeitem"
          aria-selected={selected}
          className={`w-full appearance-none text-left py-1 pr-2 rounded-md text-xs font-mono flex items-center gap-2 truncate border border-transparent bg-transparent hover:bg-transparent active:bg-transparent outline-none focus-visible:ring-1 focus-visible:ring-blue-400/60 ${
            selected
              ? 'border-blue-300 text-blue-800 dark:border-blue-800 dark:text-blue-100'
              : 'text-neutral-700 hover:border-neutral-300 dark:text-neutral-300 dark:hover:border-neutral-700'
          }`}
          style={{ paddingLeft: `${rowPadding}px` }}
          onClick={() => setSelectedWorkspaceFile(node.relativePath)}
          onDoubleClick={() => void openEditorForRelativePath(node.relativePath)}
          onContextMenu={(e) => {
            e.preventDefault()
            setGitContextMenu(null)
            setExplorerContextMenu({ x: e.clientX, y: e.clientY, relativePath: node.relativePath })
          }}
          title={node.relativePath}
        >
          <span className="text-neutral-400 dark:text-neutral-500">•</span>
          <span className="truncate">{node.name}</span>
        </button>
      )
    }

    const expanded = isDirectoryExpanded(node.relativePath, depth)
    return (
      <div key={node.relativePath}>
        <button
          type="button"
          role="treeitem"
          aria-expanded={expanded}
          className="w-full appearance-none text-left py-1 pr-2 rounded-md text-xs font-mono flex items-center gap-2 truncate border border-transparent bg-transparent hover:bg-transparent active:bg-transparent outline-none focus-visible:ring-1 focus-visible:ring-blue-400/60 text-neutral-700 hover:border-neutral-300 dark:text-neutral-200 dark:hover:border-neutral-700"
          style={{ paddingLeft: `${rowPadding}px` }}
          onClick={() => toggleDirectory(node.relativePath)}
          title={node.relativePath}
        >
          <span className="w-3 text-neutral-500 dark:text-neutral-400">{expanded ? '▾' : '▸'}</span>
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && (
          <div role="group" className="ml-3 border-l border-neutral-200/70 dark:border-neutral-800/80 pl-1">
            {node.children?.map((child) => renderExplorerNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  function renderExplorerPane() {
    return (
      <div className="h-full min-h-0 flex flex-col bg-neutral-50 dark:bg-neutral-900">
        <div className="px-3 py-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-neutral-700 dark:text-neutral-300">Workspace folder</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-400">
                <input
                  type="checkbox"
                  checked={showHiddenFiles}
                  onChange={(e) =>
                    setExplorerPrefs({
                      showHiddenFiles: e.target.checked,
                      showNodeModules,
                    })
                  }
                />
                Hidden
              </label>
              <label className="inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-400">
                <input
                  type="checkbox"
                  checked={showNodeModules}
                  onChange={(e) =>
                    setExplorerPrefs({
                      showHiddenFiles,
                      showNodeModules: e.target.checked,
                    })
                  }
                />
                node_modules
              </label>
            </div>
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                className="h-7 w-7 inline-flex items-center justify-center rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                onClick={() => refreshWorkspaceTree()}
                title="Refresh workspace folder"
                aria-label="Refresh workspace folder"
              >
                <svg width="16" height="16" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M10 6A4 4 0 1 1 8.83 3.17" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M10 2.5V4.5H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                className="h-7 w-7 inline-flex items-center justify-center rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                onClick={expandAllDirectories}
                title="Expand all"
                aria-label="Expand all"
              >
                <svg width="16" height="16" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M3 2.5L6 5.5L9 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 5.5L6 8.5L9 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                className="h-7 w-7 inline-flex items-center justify-center rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                onClick={collapseAllDirectories}
                title="Collapse all"
                aria-label="Collapse all"
              >
                <svg width="16" height="16" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M3 6.5L6 3.5L9 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 9.5L6 6.5L9 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-auto px-2 pb-2">
          {workspaceTreeLoading && <p className="text-xs text-neutral-500 dark:text-neutral-400 px-1">Loading workspace folder...</p>}
          {!workspaceTreeLoading && workspaceTreeError && (
            <p className="text-xs text-red-600 dark:text-red-400 px-1">{workspaceTreeError}</p>
          )}
          {!workspaceTreeLoading && !workspaceTreeError && workspaceTree.length === 0 && (
            <div className="m-1 px-2 py-3 text-xs text-neutral-500 dark:text-neutral-400">
              No files found in this workspace.
            </div>
          )}
          {!workspaceTreeLoading && !workspaceTreeError && (
            <div role="tree" aria-label="Workspace folder">
              {workspaceTree.map((node) => renderExplorerNode(node))}
            </div>
          )}
        </div>
        {workspaceTreeTruncated && (
          <div className="px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
            File list truncated for performance. Use a smaller workspace for full tree view.
          </div>
        )}
      </div>
    )
  }

  function renderGitPane() {
    const canShowEntries = Boolean(gitStatus?.ok)
    const entries = gitStatus?.entries ?? []
    const resolvedSelectedPaths = resolveGitSelection()
    const selectedPathSet = new Set(resolvedSelectedPaths)
    const hasSelection = resolvedSelectedPaths.length > 0
    const hasChanges = Boolean(gitStatus?.ok && !gitStatus?.clean)
    const canCommit = hasSelection ? resolvedSelectedPaths.length > 0 : hasChanges
    const busy = Boolean(gitOperationPending)
    const commitTitle = hasSelection ? `Commit selected changes (${resolvedSelectedPaths.length})` : 'Commit all changes'
    const pushTitle = hasSelection ? `Push (commit selected ${resolvedSelectedPaths.length} first)` : 'Push'
    const iconBtnClass =
      'h-8 w-8 inline-flex items-center justify-center rounded-md border font-medium border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed'
    return (
      <div className="h-full min-h-0 flex flex-col bg-neutral-50 dark:bg-neutral-900">
        <div className="px-3 py-3 border-b border-neutral-200/80 dark:border-neutral-800 text-xs flex items-center justify-between gap-2">
          <span className="font-medium text-neutral-700 dark:text-neutral-300 truncate">Git</span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              className={iconBtnClass}
              title={commitTitle}
              aria-label={commitTitle}
              disabled={!canCommit || busy}
              onClick={() => void runGitOperation('commit')}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
                <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className={iconBtnClass}
              title={pushTitle}
              aria-label={pushTitle}
              disabled={busy || !gitStatus?.ok}
              onClick={() => void runGitOperation('push')}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 11V3M8 3L5 6M8 3l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className={iconBtnClass}
              title="Deploy"
              aria-label="Deploy"
              disabled={busy || !workspaceRoot}
              onClick={() => void runGitOperation('deploy')}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 2L2 6l6 4 6-4-6-4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M2 10l6 4 6-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className={iconBtnClass}
              title="Build"
              aria-label="Build"
              disabled={busy || !workspaceRoot}
              onClick={() => void runGitOperation('build')}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 4h4l2 3 2-3h4v8H3V4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M6 7v4M10 7v4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className={iconBtnClass}
              title="Release"
              aria-label="Release"
              disabled={busy || !workspaceRoot}
              onClick={() => void runGitOperation('release')}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 2l1.2 3.6 3.8.1-2.9 2.2 1.1 3.7L8 9.8l-3.2 1.8 1.1-3.7-2.9-2.2 3.8-.1L8 2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className={iconBtnClass}
              title="Refresh"
              aria-label="Refresh"
              disabled={busy}
              onClick={() => void refreshGitStatus()}
            >
              <svg width="18" height="18" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M10.5 6A4.5 4.5 0 116 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M10.5 1.5v3h-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
        {(gitOperationPending || gitOperationSuccess) && (
          <div
            className={`px-3 py-2 text-xs flex items-center gap-2 ${
              gitOperationPending
                ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 border-b border-blue-200/60 dark:border-blue-800/50'
                : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 border-b border-emerald-200/60 dark:border-emerald-800/50'
            }`}
          >
            {gitOperationPending ? (
              <>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  className="animate-spin shrink-0"
                  aria-hidden
                >
                  <circle cx="7" cy="7" r="5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
                  <path d="M7 2a5 5 0 0 1 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span>
                  {gitOperationPending === 'commit' && 'Committing…'}
                  {gitOperationPending === 'push' && 'Pushing…'}
                  {gitOperationPending === 'deploy' && 'Deploying…'}
                  {gitOperationPending === 'build' && 'Building…'}
                  {gitOperationPending === 'release' && 'Releasing…'}
                </span>
              </>
            ) : gitOperationSuccess ? (
              <>
                <svg width="18" height="18" viewBox="0 0 14 14" fill="none" className="shrink-0" aria-hidden>
                  <path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>
                  {gitOperationSuccess.op === 'commit' && 'Commit done'}
                  {gitOperationSuccess.op === 'push' && 'Push done'}
                  {gitOperationSuccess.op === 'deploy' && 'Deploy done'}
                  {gitOperationSuccess.op === 'build' && 'Build done'}
                  {gitOperationSuccess.op === 'release' && 'Release done'}
                </span>
              </>
            ) : null}
          </div>
        )}
        <div className="px-3 py-3 border-b border-neutral-200/80 dark:border-neutral-800 text-xs space-y-1.5">
          <div className="font-mono truncate" title={gitStatus?.branch ?? '(unknown)'}>
            Branch: {gitStatus?.branch ?? '(unknown)'}
          </div>
          <div className="flex flex-wrap gap-1 text-[11px]">
            <span className="px-2 py-0.5 rounded bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200">
              Staged {gitStatus?.stagedCount ?? 0}
            </span>
            <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-200">
              Changed {gitStatus?.unstagedCount ?? 0}
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
              Untracked {gitStatus?.untrackedCount ?? 0}
            </span>
          </div>
          <div className="text-neutral-500 dark:text-neutral-400">
            Ahead {gitStatus?.ahead ?? 0}, behind {gitStatus?.behind ?? 0} | Updated {formatCheckedAt(gitStatus?.checkedAt)}
          </div>
          {hasSelection && (
            <div className="text-blue-700 dark:text-blue-300">
              Selected {resolvedSelectedPaths.length} {resolvedSelectedPaths.length === 1 ? 'file' : 'files'}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-0.5">
          {gitStatusLoading && <p className="text-xs text-neutral-500 dark:text-neutral-400 px-1">Loading git status...</p>}
          {!gitStatusLoading && gitStatusError && <p className="text-xs text-red-600 dark:text-red-400 px-1">{gitStatusError}</p>}
          {!gitStatusLoading && canShowEntries && gitStatus?.clean && (
            <div className="m-1 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 px-3 py-4 text-xs text-neutral-500 dark:text-neutral-400">
              Working tree clean.
            </div>
          )}
          {!gitStatusLoading && canShowEntries && entries.map((entry) => {
            const selected = selectedPathSet.has(entry.relativePath)
            return (
              <button
                key={`${entry.relativePath}-${entry.indexStatus}-${entry.workingTreeStatus}`}
                type="button"
                aria-selected={selected}
                className={`w-full text-left px-2.5 py-1 rounded-md text-xs font-mono border text-neutral-800 dark:text-neutral-200 ${
                  selected
                    ? 'bg-blue-50/90 border-blue-300 dark:bg-blue-950/30 dark:border-blue-800'
                    : 'border-transparent bg-transparent hover:bg-blue-50/70 dark:hover:bg-blue-900/20 active:bg-blue-100/70 dark:active:bg-blue-900/40 hover:border-blue-200 dark:hover:border-blue-900/60'
                }`}
                onClick={(e) => handleGitEntryClick(entry, e)}
                onDoubleClick={() => !isDeletedGitEntry(entry) && void openEditorForRelativePath(entry.relativePath)}
                onContextMenu={(e) => openGitContextMenu(e, entry)}
                title={entry.relativePath}
              >
                <div className="flex items-start gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] shrink-0 ${gitEntryClass(entry)}`}>{gitStatusText(entry)}</span>
                  <span className={`truncate flex-1 ${isDeletedGitEntry(entry) ? 'line-through opacity-70' : ''}`}>{entry.relativePath}</span>
                </div>
                {entry.renamedFrom && (
                  <div className="pl-8 text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                    from {entry.renamedFrom}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  function renderWorkspaceSettingsPane() {
    return (
      <div className="h-full min-h-0 flex flex-col bg-neutral-50 dark:bg-neutral-900">
        <div className="px-3 py-3 border-b border-neutral-200/80 dark:border-neutral-800 text-xs">
          <span className="font-medium text-neutral-700 dark:text-neutral-300">Workspace settings</span>
        </div>
        <div className="flex-1 overflow-auto px-3 py-3">
          <div className="space-y-3 text-xs">
            <div className="space-y-1.5">
              <label className="text-neutral-600 dark:text-neutral-300">Folder location</label>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  className={`w-full ${UI_INPUT_CLASS} font-mono text-xs`}
                  value={workspaceForm.path}
                  onChange={(e) => setWorkspaceForm((prev) => ({ ...prev, path: e.target.value }))}
                  onBlur={(e) => {
                    const next = normalizeWorkspaceSettingsForm({ ...workspaceForm, path: e.target.value })
                    if (!next.path) return
                    void persistWorkspaceSettings(next, { requestSwitch: true })
                  }}
                />
                <button
                  type="button"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  onClick={browseForWorkspaceIntoForm}
                  title="Browse for workspace folder"
                  aria-label="Browse for workspace folder"
                >
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M2.5 4.5H6.2L7.4 5.7H13.5V11.8C13.5 12.4 13.1 12.8 12.5 12.8H3.5C2.9 12.8 2.5 12.4 2.5 11.8V4.5Z" stroke="currentColor" strokeWidth="1.1" />
                    <path d="M2.5 6.2H13.5" stroke="currentColor" strokeWidth="1.1" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-neutral-600 dark:text-neutral-300">Default model</label>
              <select
                className={`w-full ${UI_SELECT_CLASS}`}
                value={workspaceForm.defaultModel}
                onChange={(e) =>
                  updateDockedWorkspaceForm((prev) => ({ ...prev, defaultModel: e.target.value }))
                }
              >
                {getModelOptions(workspaceForm.defaultModel).map((id) => {
                  const mi = modelConfig.interfaces.find((m) => m.id === id)
                  return (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  )
                })}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-neutral-600 dark:text-neutral-300">Sandbox</label>
              <select
                className={`w-full ${UI_SELECT_CLASS}`}
                value={workspaceForm.sandbox}
                onChange={(e) =>
                  updateDockedWorkspaceForm((prev) => {
                    const nextSandbox = e.target.value as SandboxMode
                    return {
                      ...prev,
                      sandbox: nextSandbox,
                      permissionMode: nextSandbox === 'read-only' ? 'verify-first' : prev.permissionMode,
                    }
                  })
                }
              >
                <option value="read-only">Read only</option>
                <option value="workspace-write">Workspace write</option>
              </select>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {sandboxModeDescription(workspaceForm.sandbox)}
              </p>
            </div>
            {workspaceForm.sandbox !== 'read-only' && (
              <div className="space-y-1.5">
                <label className="text-neutral-600 dark:text-neutral-300">Permissions</label>
                <select
                  className={`w-full ${UI_SELECT_CLASS}`}
                  value={workspaceForm.permissionMode}
                  onChange={(e) =>
                    updateDockedWorkspaceForm((prev) => ({
                      ...prev,
                      permissionMode: e.target.value as PermissionMode,
                    }))
                  }
                >
                  <option value="verify-first">Verify first (safer)</option>
                  <option value="proceed-always">Proceed always (autonomous)</option>
                </select>
              </div>
            )}
            {workspaceForm.sandbox !== 'read-only' && workspaceForm.permissionMode === 'proceed-always' && (
              <>
              <div className="space-y-1.5">
                <label className="text-neutral-600 dark:text-neutral-300">Allowed command prefixes</label>
                  <textarea
                    className={`w-full min-h-[96px] ${UI_INPUT_CLASS} font-mono text-xs`}
                    value={workspaceFormTextDraft.allowedCommandPrefixes}
                    onChange={(e) =>
                      updateDockedWorkspaceTextDraft('allowedCommandPrefixes', e.target.value)
                    }
                    placeholder={'npm run build:dist:raw\nnpx vite build'}
                  />
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    One prefix per line. Leave blank to allow all commands in Proceed always mode.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-neutral-600 dark:text-neutral-300">Allowed auto-read paths</label>
                  <textarea
                    className={`w-full min-h-[64px] ${UI_INPUT_CLASS} font-mono text-xs`}
                    value={workspaceFormTextDraft.allowedAutoReadPrefixes}
                    onChange={(e) =>
                      updateDockedWorkspaceTextDraft('allowedAutoReadPrefixes', e.target.value)
                    }
                    placeholder={'src/\npackage.json'}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-neutral-600 dark:text-neutral-300">Allowed auto-write paths</label>
                  <textarea
                    className={`w-full min-h-[64px] ${UI_INPUT_CLASS} font-mono text-xs`}
                    value={workspaceFormTextDraft.allowedAutoWritePrefixes}
                    onChange={(e) =>
                      updateDockedWorkspaceTextDraft('allowedAutoWritePrefixes', e.target.value)
                    }
                    placeholder={'src/\npackage.json'}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-neutral-600 dark:text-neutral-300">Denied auto-read paths</label>
                  <textarea
                    className={`w-full min-h-[64px] ${UI_INPUT_CLASS} font-mono text-xs`}
                    value={workspaceFormTextDraft.deniedAutoReadPrefixes}
                    onChange={(e) =>
                      updateDockedWorkspaceTextDraft('deniedAutoReadPrefixes', e.target.value)
                    }
                    placeholder={'../\n.env'}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-neutral-600 dark:text-neutral-300">Denied auto-write paths</label>
                  <textarea
                    className={`w-full min-h-[64px] ${UI_INPUT_CLASS} font-mono text-xs`}
                    value={workspaceFormTextDraft.deniedAutoWritePrefixes}
                    onChange={(e) =>
                      updateDockedWorkspaceTextDraft('deniedAutoWritePrefixes', e.target.value)
                    }
                  placeholder={'../\n.env'}
                />
              </div>
            </>
            )}
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Changes in this panel are saved immediately.
            </p>
          </div>
        </div>
      </div>
    )
  }

  function renderAgentOrchestratorPane() {
    const orchestratorPlugin = loadedPlugins?.find((p) => p.pluginId === 'orchestrator')
    const pluginInstalled = Boolean(orchestratorPlugin?.active)
    return (
      <div className="h-full min-h-0 flex flex-col bg-neutral-50 dark:bg-neutral-900">
        <div className="px-3 py-3 border-b border-neutral-200/80 dark:border-neutral-800 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium text-neutral-700 dark:text-neutral-300">Agent Orchestrator</div>
            <button
              type="button"
              className={UI_TOOLBAR_ICON_BUTTON_CLASS}
              title="Orchestrator settings"
              aria-label="Orchestrator settings"
              onClick={() => openAppSettingsInRightDock('orchestrator')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
          <p className="mt-1.5 text-neutral-500 dark:text-neutral-400 leading-relaxed">
            Persistent goal-driven orchestration for multi-agent workflows. Install the orchestrator plugin to enable.
          </p>
          <div className="mt-2.5 flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                  pluginInstalled ? 'bg-green-500 dark:bg-green-600' : 'bg-neutral-300 dark:bg-neutral-600'
                }`}
              />
              <span className="text-neutral-500 dark:text-neutral-400">
                {pluginInstalled
                  ? `Plugin: ${orchestratorPlugin?.displayName ?? 'Orchestrator'} v${orchestratorPlugin?.version ?? '?'}`
                  : 'Plugin: not installed'}
              </span>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2 py-1 text-[11px] text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              onClick={() => window.open('https://barnaby.build/orchestrator.html', '_blank', 'noopener,noreferrer')}
            >
              Learn more
            </button>
          </div>
        </div>
      </div>
    )
  }

  const gitContextSelectedCount = gitContextMenu
    ? Math.max(1, resolveGitSelection().length)
    : 0
  const gitContextFileCountLabel = `${gitContextSelectedCount} ${gitContextSelectedCount === 1 ? 'file' : 'files'}`
  const headerDockToggleButtonClass = (isActive: boolean) =>
    `h-9 w-9 inline-flex items-center justify-center rounded-lg border shrink-0 ${
      isActive
        ? 'shadow-inner bg-neutral-200 border-neutral-400 text-neutral-800 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-100'
        : 'border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
    }`
  const workspaceDockButtonOnLeft = workspaceDockSide === 'left'
  const toolsDockButtonsOnLeft = workspaceDockSide === 'right'

  const workspaceDockToggleButton = (
    <button
      type="button"
      className={headerDockToggleButtonClass(showWorkspaceWindow)}
      onClick={() => setShowWorkspaceWindow((prev) => !prev)}
      title={showWorkspaceWindow ? 'Hide workspace window' : 'Show workspace window'}
      aria-label={showWorkspaceWindow ? 'Hide workspace window' : 'Show workspace window'}
    >
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M2.5 5.1c0-.6.5-1.1 1.1-1.1h3.2l1.2 1.2h4.9c.6 0 1.1.5 1.1 1.1v6.2c0 .6-.5 1.1-1.1 1.1H3.6c-.6 0-1.1-.5-1.1-1.1V5.1Z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path d="M2.5 6.2h11.0" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    </button>
  )

  const codeDockToggleButton = (
    <button
      type="button"
      className={headerDockToggleButtonClass(showCodeWindow && codeWindowTab === 'code')}
      onClick={() => toggleRightDockWindow('code')}
      title={showCodeWindow && codeWindowTab === 'code' ? 'Hide code window' : 'Show code window'}
      aria-label={showCodeWindow && codeWindowTab === 'code' ? 'Hide code window' : 'Show code window'}
    >
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M6 5L3.5 8 6 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 5L12.5 8 10 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 5.7L7 10.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </button>
  )

  const settingsDockToggleButton = (
    <button
      type="button"
      className={headerDockToggleButtonClass(showCodeWindow && codeWindowTab === 'settings')}
      onClick={() => toggleRightDockWindow('settings')}
      title={showCodeWindow && codeWindowTab === 'settings' ? 'Hide settings window' : 'Show settings window'}
      aria-label={showCodeWindow && codeWindowTab === 'settings' ? 'Hide settings window' : 'Show settings window'}
    >
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 5.8A2.2 2.2 0 1 1 8 10.2A2.2 2.2 0 0 1 8 5.8Z" stroke="currentColor" strokeWidth="1.2" />
        <path d="M13.1 8.7V7.3L11.8 6.9C11.7 6.6 11.6 6.4 11.4 6.1L12 4.9L11.1 4L9.9 4.6C9.6 4.4 9.4 4.3 9.1 4.2L8.7 2.9H7.3L6.9 4.2C6.6 4.3 6.4 4.4 6.1 4.6L4.9 4L4 4.9L4.6 6.1C4.4 6.4 4.3 6.6 4.2 6.9L2.9 7.3V8.7L4.2 9.1C4.3 9.4 4.4 9.6 4.6 9.9L4 11.1L4.9 12L6.1 11.4C6.4 11.6 6.6 11.7 6.9 11.8L7.3 13.1H8.7L9.1 11.8C9.4 11.7 9.6 11.6 9.9 11.4L11.1 12L12 11.1L11.4 9.9C11.6 9.6 11.7 9.4 11.8 9.1L13.1 8.7Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      </svg>
    </button>
  )

  return (
    <div className="theme-preset h-screen w-full min-w-0 max-w-full overflow-y-auto overflow-x-hidden flex flex-col bg-neutral-100 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
      <style>{`
        .theme-preset .bg-blue-600 { background-color: var(--theme-accent-600) !important; }
        .theme-preset .hover\\:bg-blue-500:hover { background-color: var(--theme-accent-500) !important; }
        .theme-preset .border-blue-500 { border-color: var(--theme-accent-600) !important; }
        .theme-preset .text-blue-700,
        .theme-preset .text-blue-800,
        .theme-preset .text-blue-900 { color: var(--theme-accent-700) !important; }
        .theme-preset .bg-blue-50,
        .theme-preset .bg-blue-100,
        .theme-preset .bg-blue-50\\/90,
        .theme-preset .bg-blue-50\\/70 { background-color: var(--theme-accent-soft) !important; }
        .theme-preset .border-blue-200,
        .theme-preset .border-blue-300 { border-color: color-mix(in srgb, var(--theme-accent-500) 40%, white) !important; }
        .theme-preset .text-blue-950 { color: var(--theme-accent-700) !important; }
        .dark .theme-preset .dark\\:bg-blue-950,
        .dark .theme-preset .dark\\:bg-blue-950\\/20,
        .dark .theme-preset .dark\\:bg-blue-950\\/25,
        .dark .theme-preset .dark\\:bg-blue-950\\/30,
        .dark .theme-preset .dark\\:bg-blue-950\\/40,
        .dark .theme-preset .dark\\:bg-blue-950\\/50,
        .dark .theme-preset .dark\\:bg-blue-900\\/40 { background-color: var(--theme-accent-soft-dark) !important; }
        .dark .theme-preset .dark\\:text-blue-100,
        .dark .theme-preset .dark\\:text-blue-200,
        .dark .theme-preset .dark\\:text-blue-300 { color: var(--theme-accent-text) !important; }
        .dark .theme-preset .dark\\:border-blue-900,
        .dark .theme-preset .dark\\:border-blue-800,
        .dark .theme-preset .dark\\:border-blue-900\\/60,
        .dark .theme-preset .dark\\:border-blue-900\\/70 { border-color: color-mix(in srgb, var(--theme-accent-500) 50%, black) !important; }
        .dark .theme-preset .dark\\:bg-neutral-950 { background-color: var(--theme-dark-950) !important; }
        .dark .theme-preset .dark\\:bg-neutral-900 { background-color: var(--theme-dark-900) !important; }
        .dark .theme-preset .dark\\:bg-neutral-800 { background-color: color-mix(in srgb, var(--theme-dark-900) 84%, white) !important; }
        .dark .theme-preset .dark\\:border-neutral-800 { border-color: color-mix(in srgb, var(--theme-dark-950) 78%, white) !important; }
        .dark .theme-preset .dark\\:border-neutral-700 { border-color: color-mix(in srgb, var(--theme-dark-900) 74%, white) !important; }
        .dark .theme-preset .dark\\:border-neutral-600 { border-color: color-mix(in srgb, var(--theme-dark-900) 65%, white) !important; }
        .dark .theme-preset .dark\\:text-neutral-300 { color: color-mix(in srgb, #ffffff 82%, var(--theme-dark-900)) !important; }
        .dark .theme-preset .dark\\:text-neutral-200,
        .dark .theme-preset .dark\\:text-neutral-100 { color: color-mix(in srgb, #ffffff 90%, var(--theme-dark-900)) !important; }
        .theme-preset .hover\\:bg-blue-50:hover { background-color: var(--theme-accent-soft) !important; }
        .dark .theme-preset .dark\\:hover\\:bg-blue-900\\/40:hover,
        .dark .theme-preset .dark\\:hover\\:bg-blue-900\\/20:hover { background-color: var(--theme-accent-soft-dark) !important; }
        .theme-preset .hover\\:bg-blue-100:hover { background-color: var(--theme-accent-soft) !important; }
        .theme-preset .focus-visible\\:ring-blue-400\\/60:focus-visible,
        .theme-preset .focus\\:ring-blue-100:focus,
        .theme-preset .ring-blue-100 { box-shadow: 0 0 0 1px color-mix(in srgb, var(--theme-accent-500) 25%, white) !important; }
        .theme-preset .focus\\:border-blue-400:focus { border-color: var(--theme-accent-600) !important; }
        .dark .theme-preset .dark\\:focus\\:ring-blue-900\\/40:focus { box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-accent-500) 35%, black) !important; }
        .dark .theme-preset .dark\\:focus\\:border-blue-700:focus { border-color: var(--theme-accent-600) !important; }
        .theme-preset .border-blue-400,
        .theme-preset .dark\\:border-blue-600 { border-color: var(--theme-accent-600) !important; }
        .dark .theme-preset .dark\\:hover\\:bg-neutral-700:hover { background-color: color-mix(in srgb, var(--theme-dark-900) 74%, white) !important; }
        .dark .theme-preset .dark\\:hover\\:bg-neutral-800:hover { background-color: color-mix(in srgb, var(--theme-dark-900) 84%, white) !important; }
        .theme-preset .hover\\:border-blue-200:hover,
        .theme-preset .dark\\:hover\\:border-blue-900\\/60:hover { border-color: color-mix(in srgb, var(--theme-accent-500) 40%, white) !important; }
        .dark .theme-preset .dark\\:hover\\:border-blue-900\\/60:hover { border-color: color-mix(in srgb, var(--theme-accent-500) 50%, black) !important; }
        .theme-preset .hover\\:text-blue-700:hover { color: var(--theme-accent-700) !important; }
        .dark .theme-preset .dark\\:hover\\:text-blue-300:hover { color: var(--theme-accent-text) !important; }

        .theme-preset * {
          scrollbar-width: thin;
          scrollbar-color: rgba(115, 115, 115, 0.55) rgba(229, 229, 229, 0.45);
        }
        .theme-preset *::-webkit-scrollbar { width: 10px; height: 10px; }
        .theme-preset *::-webkit-scrollbar-track { background: rgba(229, 229, 229, 0.45); }
        .theme-preset *::-webkit-scrollbar-thumb {
          background: rgba(115, 115, 115, 0.55);
          border-radius: 999px;
          border: 2px solid rgba(229, 229, 229, 0.45);
        }
        .dark .theme-preset * { scrollbar-color: color-mix(in srgb, var(--theme-dark-900) 65%, white) var(--theme-dark-950); }
        .dark .theme-preset *::-webkit-scrollbar-track { background: var(--theme-dark-950); }
        .dark .theme-preset *::-webkit-scrollbar-thumb {
          background: color-mix(in srgb, var(--theme-dark-900) 65%, white);
          border-color: var(--theme-dark-950);
        }
      `}</style>
      {/* appHeaderBar: main top bar with Workspace/History dropdowns and layout toggles */}
      <div data-app-header-bar="true" className="shrink-0 border-b border-neutral-200/80 dark:border-neutral-800 px-4 py-3 bg-white dark:bg-neutral-950">
        <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Left sidebar | Bottom terminal | Right sidebar */}
            <div className="flex items-center gap-0.5 shrink-0">
              {workspaceDockButtonOnLeft && workspaceDockToggleButton}
              <button
                type="button"
                className={headerDockToggleButtonClass(showTerminalBar)}
                onClick={() => setShowTerminalBar((prev) => !prev)}
                title={showTerminalBar ? 'Hide terminal' : 'Show terminal'}
                aria-label={showTerminalBar ? 'Hide terminal' : 'Show terminal'}
              >
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <rect x="2" y="2" width="12" height="12" rx="1" />
                  <rect x="2" y="9" width="12" height="5" rx="0.5" fill="currentColor" fillOpacity="0.6" />
                </svg>
              </button>
              {toolsDockButtonsOnLeft && codeDockToggleButton}
              {toolsDockButtonsOnLeft && settingsDockToggleButton}
            </div>
            <div className="mx-1.5 h-6 w-px bg-neutral-300/80 dark:bg-neutral-700/80" />
            <span className="text-neutral-600 dark:text-neutral-300">Workspace</span>
            <select
              className={`h-9 px-3 rounded-lg font-mono shadow-sm w-[34vw] max-w-[440px] min-w-[220px] ${UI_INPUT_CLASS}`}
              value={workspaceList.includes(workspaceRoot) ? workspaceRoot : workspaceList[0] ?? ''}
              onChange={(e) => {
                requestWorkspaceSwitch(e.target.value, 'dropdown')
              }}
            >
              {workspaceList.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`${UI_ICON_BUTTON_CLASS} shrink-0`}
              onClick={() => openWorkspaceSettings('new')}
              title="New workspace"
            >
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className={`${UI_ICON_BUTTON_CLASS} shrink-0`}
              onClick={() => openWorkspaceSettings('edit')}
              title="Edit selected workspace"
            >
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                <path d="M3 11.5L3.6 9.2L10.6 2.2L12.8 4.4L5.8 11.4L3 12Z" stroke="currentColor" strokeWidth="1.2" />
                <path d="M8.5 3.9L11.1 6.5" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
            <div className="mx-2 h-6 w-px bg-neutral-300/80 dark:bg-neutral-700/80" />
            <span className="text-neutral-600 dark:text-neutral-300">History</span>
            <div ref={historyDropdownRef} className="relative shrink-0">
              <button
                type="button"
                className={`h-9 px-3 rounded-lg shadow-sm w-[45vw] max-w-[540px] min-w-[270px] text-left flex items-center justify-between gap-2 ${UI_INPUT_CLASS}`}
                onClick={() => setHistoryDropdownOpen((o) => !o)}
              >
                <span className="truncate">Open chat...</span>
                <svg width="12" height="12" viewBox="0 0 10 10" className={`shrink-0 transition-transform ${historyDropdownOpen ? 'rotate-180' : ''}`}>
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </button>
              {historyDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg z-50 max-h-64 overflow-auto min-w-[270px]">
                  {workspaceScopedHistory.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-neutral-500 dark:text-neutral-400">No conversations yet</div>
                  ) : (
                    workspaceScopedHistory.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center gap-1.5 group px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer text-sm"
                        onClick={() => openChatFromHistory(entry.id)}
                      >
                        <span className="flex-1 min-w-0 truncate text-neutral-800 dark:text-neutral-200">
                          {formatHistoryOptionLabel(entry)}
                        </span>
                        <button
                          type="button"
                          className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-md border border-blue-200 bg-blue-50/70 text-blue-700 hover:bg-red-100 hover:border-red-300 hover:text-red-700 dark:border-blue-900/70 dark:bg-blue-950/25 dark:text-blue-300 dark:hover:bg-red-950/40 dark:hover:border-red-900 dark:hover:text-red-300"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteHistoryIdPending(entry.id)
                            setHistoryDropdownOpen(false)
                          }}
                          title="Delete conversation"
                          aria-label="Delete conversation"
                        >
                          <svg width="11" height="11" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                            <path d="M2 2L8 8M8 2L2 8" />
                          </svg>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              className={`${UI_ICON_BUTTON_CLASS} shrink-0`}
              onClick={() => createAgentPanel()}
              title="New chat"
              aria-label="New chat"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-0.5 shrink-0">
              {!workspaceDockButtonOnLeft && workspaceDockToggleButton}
              {!toolsDockButtonsOnLeft && codeDockToggleButton}
              {!toolsDockButtonsOnLeft && settingsDockToggleButton}
            </div>
            {/* layoutToolbar: Tile V/H/Grid */}
            <div data-layout-toolbar="true" className="flex items-center gap-1">
              <button
                className={`h-9 w-9 inline-flex items-center justify-center rounded-lg border shadow-sm ${
                  layoutMode === 'vertical' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200' : 'border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
                }`}
                onClick={() => setLayoutMode('vertical')}
                title="Tile Vertical"
                aria-label="Tile Vertical"
              >
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                  <rect x="2.5" y="3" width="5.5" height="10" rx="1" stroke="currentColor" />
                  <rect x="8" y="3" width="5.5" height="10" rx="1" stroke="currentColor" />
                </svg>
              </button>
              <button
                className={`h-9 w-9 inline-flex items-center justify-center rounded-lg border shadow-sm ${
                  layoutMode === 'horizontal' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200' : 'border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
                }`}
                onClick={() => setLayoutMode('horizontal')}
                title="Tile Horizontal"
                aria-label="Tile Horizontal"
              >
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                  <rect x="2.5" y="3" width="11" height="5" rx="1" stroke="currentColor" />
                  <rect x="2.5" y="8" width="11" height="5" rx="1" stroke="currentColor" />
                </svg>
              </button>
              <button
                className={`h-9 w-9 inline-flex items-center justify-center rounded-lg border shadow-sm ${
                  layoutMode === 'grid' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200' : 'border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
                }`}
                onClick={() => setLayoutMode('grid')}
                title="Tile Grid"
                aria-label="Tile Grid"
              >
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                  <rect x="2.5" y="2.5" width="5" height="5" rx="1" stroke="currentColor" />
                  <rect x="8.5" y="2.5" width="5" height="5" rx="1" stroke="currentColor" />
                  <rect x="2.5" y="8.5" width="5" height="5" rx="1" stroke="currentColor" />
                  <rect x="8.5" y="8.5" width="5" height="5" rx="1" stroke="currentColor" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <div className="relative flex-1 min-h-0 min-w-0 bg-gradient-to-b from-neutral-100/90 to-neutral-100/60 dark:from-neutral-900 dark:to-neutral-950">
          <div ref={layoutRef} className="h-full flex flex-col min-h-0 min-w-0">
          {(() => {
            const contentPaneIds = panels.map((p) => p.id)
            const layoutPaneIds = [
              ...(showWorkspaceWindow && workspaceDockSide === 'left' ? ['workspace-window'] : []),
              ...(showCodeWindow && workspaceDockSide === 'right' ? ['code-window'] : []),
              ...contentPaneIds,
              ...(showCodeWindow && workspaceDockSide === 'left' ? ['code-window'] : []),
              ...(showWorkspaceWindow && workspaceDockSide === 'right' ? ['workspace-window'] : []),
            ]
            if (layoutPaneIds.length === 1) {
              const id = layoutPaneIds[0]
              if (id === 'workspace-window' || id === 'code-window') {
                return (
                  <div className="flex-1 min-h-0 min-w-0 overflow-hidden px-3 py-3">
                    <div className="h-full min-h-0 max-w-full" style={{ width: '20%' }}>
                      {renderLayoutPane(id)}
                    </div>
                  </div>
                )
              }
              return <div className="flex-1 min-h-0 min-w-0 overflow-hidden">{renderLayoutPane(id)}</div>
            }
            // Tile vertical, horizontal, and grid: sidebars honour workspaceDockSide; only agent panels are tiled.
            const leftPaneId =
              (showWorkspaceWindow && workspaceDockSide === 'left' ? 'workspace-window' : null) ||
              (showCodeWindow && workspaceDockSide === 'right' ? 'code-window' : null)
            const rightPaneId =
              (showCodeWindow && workspaceDockSide === 'left' ? 'code-window' : null) ||
              (showWorkspaceWindow && workspaceDockSide === 'right' ? 'workspace-window' : null)
            const paneFlowOrientation = layoutMode === 'horizontal' ? 'vertical' : 'horizontal'
            const layoutGroupKey = `${layoutMode}:${leftPaneId ?? 'x'}:${rightPaneId ?? 'x'}:${contentPaneIds.join('|')}`
            const contentPane =
              contentPaneIds.length === 0 ? null : contentPaneIds.length === 1 ? (
                <div className="h-full min-h-0 overflow-hidden">{renderLayoutPane(contentPaneIds[0])}</div>
              ) : layoutMode === 'grid' ? (
                renderGridLayout(contentPaneIds as string[])
              ) : (
                <Group orientation={paneFlowOrientation} className="h-full min-h-0 min-w-0" id="content-tiles">
                  {(contentPaneIds as string[]).map((panelId, idx) => (
                    <React.Fragment key={panelId}>
                      {idx > 0 && (
                        <Separator
                          className={
                            paneFlowOrientation === 'horizontal'
                              ? 'w-1 min-w-1 bg-neutral-300/80 dark:bg-neutral-700 hover:bg-blue-400 dark:hover:bg-blue-600 data-[resize-handle-active]:bg-blue-500'
                              : 'h-1 min-h-1 bg-neutral-300/80 dark:bg-neutral-700 hover:bg-blue-400 dark:hover:bg-blue-600 data-[resize-handle-active]:bg-blue-500'
                          }
                        />
                      )}
                      <Panel
                        id={`panel-${panelId}`}
                        defaultSize={`${100 / contentPaneIds.length}`}
                        minSize="15"
                        className="min-h-0 min-w-0"
                      >
                        {renderLayoutPane(panelId)}
                      </Panel>
                    </React.Fragment>
                  ))}
                </Group>
              )
            return (
              <Group key={layoutGroupKey} orientation="horizontal" className="flex-1 min-h-0 min-w-0" id="main-layout">
                {leftPaneId && (
                  <>
                    <Panel
                      id={`panel-${leftPaneId}`}
                      defaultSize="20"
                      minSize="15"
                      maxSize="50"
                      className="min-h-0 min-w-0"
                    >
                      {renderLayoutPane(leftPaneId)}
                    </Panel>
                    <Separator className="w-1 min-w-1 bg-neutral-300/80 dark:bg-neutral-700 hover:bg-blue-400 dark:hover:bg-blue-600 data-[resize-handle-active]:bg-blue-500" />
                  </>
                )}
                <Panel id="panel-content-tiled" defaultSize={leftPaneId && rightPaneId ? '60' : leftPaneId || rightPaneId ? '80' : '100'} minSize="20" className="min-h-0 min-w-0">
                  {contentPane}
                </Panel>
                {rightPaneId && (
                  <>
                    <Separator className="w-1 min-w-1 bg-neutral-300/80 dark:bg-neutral-700 hover:bg-blue-400 dark:hover:bg-blue-600 data-[resize-handle-active]:bg-blue-500" />
                    <Panel
                      id={`panel-${rightPaneId}`}
                      defaultSize="20"
                      minSize="15"
                      maxSize="50"
                      className="min-h-0 min-w-0"
                    >
                      {renderLayoutPane(rightPaneId)}
                    </Panel>
                  </>
                )}
              </Group>
            )
          })()}
          </div>
        </div>

        {showTerminalBar && (
          <div className="shrink-0 flex flex-col border-t border-neutral-200 dark:border-neutral-800 bg-neutral-900 dark:bg-neutral-950" style={{ height: 220 }}>
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-neutral-700 shrink-0">
              <span className="text-xs font-semibold text-neutral-300">
                Terminal{workspaceRoot?.trim() ? ` (${workspaceRoot.split(/[/\\]/).pop() || workspaceRoot})` : ''}
              </span>
              <button
                type="button"
                className="h-7 w-7 inline-flex items-center justify-center rounded border border-neutral-600 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"
                onClick={() => setShowTerminalBar(false)}
                title="Close terminal"
                aria-label="Close terminal"
              >
                <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden p-1">
              {api && typeof api.terminalSpawn === 'function' ? (
                <EmbeddedTerminal workspaceRoot={workspaceRoot?.trim() || ''} api={api} />
              ) : (
                <div className="h-full flex items-center justify-center text-neutral-500 text-sm">
                  Terminal requires Electron
                </div>
              )}
            </div>
          </div>
        )}

        <footer className="shrink-0 px-4 py-2 border-t border-neutral-200/80 dark:border-neutral-800 bg-white/85 dark:bg-neutral-950 text-xs text-neutral-600 dark:text-neutral-400 flex items-center gap-4 backdrop-blur">
          <span className="font-mono truncate max-w-[40ch]" title={workspaceRoot}>
            {workspaceRoot.split(/[/\\]/).pop() || workspaceRoot}
          </span>
          <span>{panels.length} agent{panels.length !== 1 ? 's' : ''}</span>
          <span>Zoom: {100 + zoomLevel * 20}%</span>
        </footer>
      </div>

      {gitContextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            aria-hidden
            onClick={() => setGitContextMenu(null)}
          />
          <div
            className="fixed z-50 py-1 min-w-[170px] rounded-lg border border-blue-200 dark:border-blue-900/70 bg-neutral-100 dark:bg-neutral-900 shadow-lg"
            style={{ left: gitContextMenu.x, top: gitContextMenu.y }}
          >
            {!gitContextMenu.deleted && (
              <>
                <button
                  type="button"
                  className="w-full border-0 bg-neutral-100 dark:bg-neutral-900 px-3 py-1.5 text-left text-xs text-neutral-700 dark:text-neutral-200 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-700 dark:hover:text-blue-300 focus:outline-none focus:bg-blue-100 dark:focus:bg-blue-900/40"
                  onClick={() => {
                    void openEditorForRelativePath(gitContextMenu.relativePath)
                    setGitContextMenu(null)
                  }}
                >
                  Open ({gitContextFileCountLabel})
                </button>
                <div className="mx-2 my-1 h-px bg-neutral-200 dark:bg-neutral-700" />
              </>
            )}
            <button
              type="button"
              className="w-full border-0 bg-neutral-100 dark:bg-neutral-900 px-3 py-1.5 text-left text-xs text-neutral-700 dark:text-neutral-200 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-700 dark:hover:text-blue-300 focus:outline-none focus:bg-blue-100 dark:focus:bg-blue-900/40"
              onClick={() => {
                setGitContextMenu(null)
                void runGitOperation('commit')
              }}
            >
              Commit ({gitContextFileCountLabel})
            </button>
            <button
              type="button"
              className="w-full border-0 bg-neutral-100 dark:bg-neutral-900 px-3 py-1.5 text-left text-xs text-neutral-700 dark:text-neutral-200 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-700 dark:hover:text-blue-300 focus:outline-none focus:bg-blue-100 dark:focus:bg-blue-900/40"
              onClick={() => {
                setGitContextMenu(null)
                void runGitOperation('push')
              }}
            >
              Push ({gitContextFileCountLabel})
            </button>
            <button
              type="button"
              className="w-full border-0 bg-neutral-100 dark:bg-neutral-900 px-3 py-1.5 text-left text-xs text-neutral-700 dark:text-neutral-200 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-700 dark:hover:text-blue-300 focus:outline-none focus:bg-blue-100 dark:focus:bg-blue-900/40"
              onClick={() => {
                setGitContextMenu(null)
                void runGitOperation('deploy')
              }}
            >
              Deploy
            </button>
            <button
              type="button"
              className="w-full border-0 bg-neutral-100 dark:bg-neutral-900 px-3 py-1.5 text-left text-xs text-neutral-700 dark:text-neutral-200 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-700 dark:hover:text-blue-300 focus:outline-none focus:bg-blue-100 dark:focus:bg-blue-900/40"
              onClick={() => {
                setGitContextMenu(null)
                void runGitOperation('build')
              }}
            >
              Build
            </button>
            <button
              type="button"
              className="w-full border-0 bg-neutral-100 dark:bg-neutral-900 px-3 py-1.5 text-left text-xs text-neutral-700 dark:text-neutral-200 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-700 dark:hover:text-blue-300 focus:outline-none focus:bg-blue-100 dark:focus:bg-blue-900/40"
              onClick={() => {
                setGitContextMenu(null)
                void runGitOperation('release')
              }}
            >
              Release
            </button>
          </div>
        </>
      )}

      {explorerContextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            aria-hidden
            onClick={() => setExplorerContextMenu(null)}
          />
          <div
            className="fixed z-50 py-1 min-w-[120px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-lg"
            style={{ left: explorerContextMenu.x, top: explorerContextMenu.y }}
          >
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-xs text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              onClick={() => {
                void openEditorForRelativePath(explorerContextMenu.relativePath)
                setExplorerContextMenu(null)
              }}
            >
              Open
            </button>
          </div>
        </>
      )}

      {showThemeModal && (
        <div className={MODAL_BACKDROP_CLASS}>
          <div className={`w-full max-w-md ${MODAL_CARD_CLASS}`}>
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div className="font-medium">Theme</div>
              <button
                className={UI_CLOSE_ICON_BUTTON_CLASS}
                onClick={() => setShowThemeModal(false)}
                title="Close"
              >
                <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-2 text-sm max-h-72 overflow-y-auto">
              {themeCatalog.map((t) => (
                <label key={t.id} className="flex items-center gap-2 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800/50 rounded px-2 py-1 -mx-2 -my-0.5">
                  <input
                    type="radio"
                    name="theme"
                    checked={applicationSettings.themeId === t.id}
                    onChange={() => {
                      setApplicationSettings((prev) => ({
                        ...prev,
                        themeId: t.id,
                      }))
                      setSelectedThemeEditorId(t.id)
                      setThemeEditorDraft(cloneTheme(t))
                      setThemeEditorStatus(null)
                    }}
                  />
                  <span>{t.name}</span>
                </label>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-end">
              <button
                className={UI_BUTTON_PRIMARY_CLASS}
                onClick={() => setShowThemeModal(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {(() => {
        const closeAppSettings = () => {
          if (showDockedAppSettings) setCodeWindowTab('code')
        }
        const settingsCard = (
          <div
            className="h-full min-h-0 flex flex-col bg-white dark:bg-neutral-950 text-neutral-950 dark:text-neutral-100"
          >
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0">
              <div className="font-medium">Settings</div>
              <button
                className={UI_CLOSE_ICON_BUTTON_CLASS}
                onClick={() => closeAppSettings()}
                title="Close"
              >
                <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2 shrink-0 flex-wrap">
              {APP_SETTINGS_VIEWS.map((view) => (
                <button
                  key={view}
                  type="button"
                  className={`px-3 py-1.5 rounded-md text-xs border ${
                    appSettingsView === view
                      ? 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100'
                      : 'border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
                  }`}
                  onClick={() => setAppSettingsView(view)}
                >
                  {view === 'connectivity' && 'Connectivity'}
                  {view === 'models' && 'Models'}
                  {view === 'preferences' && 'Preferences'}
                  {view === 'agents' && 'Agents'}
                  {view === 'orchestrator' && 'Orchestrator'}
                  {view === 'diagnostics' && 'Diagnostics'}
                </button>
              ))}
            </div>
            <div className="p-4 overflow-auto flex-1 space-y-5">
              {appSettingsView === 'models' && (
                <>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Add and configure model interfaces. Panel routing supports Codex, Claude, and Gemini.
              </p>
              {api.getAvailableModels && (
                <div className="flex items-center gap-2 mb-4">
                  <button
                    type="button"
                    className={`px-2.5 py-1.5 rounded-md border text-xs inline-flex items-center gap-2 ${
                      modelCatalogRefreshPending
                        ? 'border-blue-400 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                        : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700'
                    }`}
                    onClick={async () => {
                      setModelCatalogRefreshPending(true)
                      setModelCatalogRefreshStatus(null)
                      try {
                        const available = await api.getAvailableModels()
                        if (available.codex.length === 0 && available.claude.length === 0 && available.gemini.length === 0) {
                          setModelCatalogRefreshStatus({ kind: 'error', message: 'Provider refresh failed: no models were returned.' })
                          return
                        }
                        setModelConfig((prev) => syncModelConfigWithCatalog(prev, available, providerRegistry))
                        setModelCatalogRefreshStatus({ kind: 'success', message: 'Models refreshed from providers.' })
                      } catch (err) {
                        setModelCatalogRefreshStatus({ kind: 'error', message: `Provider refresh failed: ${formatError(err)}` })
                      } finally {
                        setModelCatalogRefreshPending(false)
                      }
                    }}
                    disabled={modelCatalogRefreshPending}
                  >
                    {modelCatalogRefreshPending && (
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.6" />
                        <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    )}
                    {modelCatalogRefreshPending ? 'Refreshing models...' : 'Refresh models from providers'}
                  </button>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    {modelCatalogRefreshPending ? 'Querying provider CLIs/APIs now...' : 'Queries local provider CLIs/APIs'}
                  </span>
                  {modelCatalogRefreshStatus && (
                    <span
                      className={`text-xs ${
                        modelCatalogRefreshStatus.kind === 'error'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {modelCatalogRefreshStatus.message}
                    </span>
                  )}
                </div>
              )}
              {editingModel ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-[120px_1fr] items-center gap-2 text-sm">
                    <span className="text-neutral-600 dark:text-neutral-300">ID</span>
                    <input
                      className={`${UI_INPUT_CLASS} font-mono text-sm`}
                      value={modelForm.id}
                      onChange={(e) => setModelForm((p) => ({ ...p, id: e.target.value }))}
                      placeholder="e.g. gemini-2.0-flash"
                    />
                    <span className="text-neutral-600 dark:text-neutral-300">Display name</span>
                    <input
                      className={UI_INPUT_CLASS}
                      value={modelForm.displayName}
                      onChange={(e) => setModelForm((p) => ({ ...p, displayName: e.target.value }))}
                      placeholder="e.g. Gemini 2.0 Flash"
                    />
                    <span className="text-neutral-600 dark:text-neutral-400">Provider</span>
                    <select
                      className={UI_SELECT_CLASS}
                      value={modelForm.provider}
                      onChange={(e) => setModelForm((p) => ({ ...p, provider: e.target.value as ModelProvider }))}
                    >
                      <option value="codex">OpenAI (Codex CLI / OpenAI API)</option>
                      <option value="claude">Claude (CLI subscription)</option>
                      <option value="gemini">Gemini (CLI subscription)</option>
                      <option value="openrouter">OpenRouter (API)</option>
                    </select>
                    <span className="text-neutral-600 dark:text-neutral-400">Enabled</span>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={modelForm.enabled}
                        onChange={(e) => setModelForm((p) => ({ ...p, enabled: e.target.checked }))}
                      />
                      Show in model selector
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className={UI_BUTTON_PRIMARY_CLASS}
                      onClick={() => {
                        const nextId = modelForm.id.trim()
                        if (!nextId) {
                          setModelFormStatus('Model ID is required.')
                          return
                        }
                        const duplicate = modelConfig.interfaces.find(
                          (m) => m.id === nextId && m.id !== editingModel.id,
                        )
                        if (duplicate) {
                          setModelFormStatus(`Model ID "${nextId}" already exists.`)
                          return
                        }
                        const nextModel: ModelInterface = {
                          ...modelForm,
                          id: nextId,
                          displayName: modelForm.displayName.trim() || nextId,
                        }
                        const idx = modelConfig.interfaces.findIndex((m) => m.id === editingModel.id)
                        const next = [...modelConfig.interfaces]
                        if (idx >= 0) next[idx] = nextModel
                        else next.push(nextModel)
                        setModelConfig({ interfaces: next })
                        setModelFormStatus('Saved.')
                        setEditingModel(null)
                      }}
                    >
                      Save
                    </button>
                    <button
                      className="px-3 py-1.5 text-sm rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                      onClick={() => {
                        setModelFormStatus(null)
                        setEditingModel(null)
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  {modelFormStatus && (
                    <div className="text-xs text-neutral-600 dark:text-neutral-400">{modelFormStatus}</div>
                  )}
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {getModelOptionsGrouped(undefined, false).flatMap((grp) =>
                      grp.modelIds.map((id) => {
                        const m = modelConfig.interfaces.find((x) => x.id === id)
                        if (!m) return null
                        return (
                          <div
                            key={m.id}
                            className="flex items-center justify-between px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                          >
                            <div className="min-w-0">
                              <span className="font-medium break-all">{m.id}</span>
                              <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-2">{grp.label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <label
                                className="inline-flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-300"
                                title="Show this model in agent window model selectors"
                              >
                                <input
                                  type="checkbox"
                                  checked={m.enabled}
                                  onChange={(e) => {
                                    const nextEnabled = e.target.checked
                                    setModelConfig((prev) => ({
                                      interfaces: prev.interfaces.map((x) =>
                                        x.id === m.id ? { ...x, enabled: nextEnabled } : x,
                                      ),
                                    }))
                                  }}
                                />
                                Visible
                              </label>
                              <button
                                className="h-7 w-7 inline-flex items-center justify-center rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                title="Edit model"
                                aria-label={`Edit ${m.id}`}
                                onClick={() => {
                                  setModelFormStatus(null)
                                  setModelForm({ ...m })
                                  setEditingModel(m)
                                }}
                              >
                                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                                  <path
                                    d="M2 11.5V14h2.5l6.7-6.7-2.5-2.5L2 11.5ZM12.7 5.2a.8.8 0 0 0 0-1.1L11 2.3a.8.8 0 0 0-1.1 0L8.8 3.4l2.5 2.5 1.4-1.4Z"
                                    fill="currentColor"
                                  />
                                </svg>
                              </button>
                              <button
                                className="h-7 w-7 inline-flex items-center justify-center rounded border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                                title="Remove model"
                                aria-label={`Remove ${m.id}`}
                                onClick={() => {
                                  setModelConfig({
                                    interfaces: modelConfig.interfaces.filter((x) => x.id !== m.id),
                                  })
                                }}
                              >
                                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                                  <path
                                    d="M6 2.5h4L10.5 4H13v1H3V4h2.5L6 2.5ZM4.5 6h7l-.5 7h-6l-.5-7Z"
                                    fill="currentColor"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>
                        )
                      }),
                    )}
                  </div>
                  <button
                    className="mt-4 px-3 py-1.5 text-sm rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                    onClick={() => {
                      setModelFormStatus(null)
                      setModelForm({
                        id: '',
                        displayName: '',
                        provider: 'gemini',
                        enabled: true,
                      })
                      setEditingModel({ id: '_new', displayName: '', provider: 'gemini', enabled: true })
                    }}
                  >
                    + Add model
                  </button>
                </>
              )}
                </>
              )}

              {appSettingsView === 'preferences' && (
                <>
              {typeof navigator !== 'undefined' && /Win/i.test(navigator.userAgent) && (
              <section className="space-y-2">
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Windows shortcut</div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  Repair or recreate the Start menu shortcut (with icon). Pin the shortcut to taskbar for the correct icon—do not pin the running window.
                </p>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  onClick={async () => {
                    try {
                      const result = await api.repairStartMenuShortcut?.()
                      if (result?.ok) {
                        setRepairShortcutStatus('Shortcut repaired.')
                      } else {
                        setRepairShortcutStatus(result?.error ?? 'Failed')
                      }
                    } catch (e) {
                      setRepairShortcutStatus(String(e))
                    }
                    setTimeout(() => setRepairShortcutStatus(null), 4000)
                  }}
                >
                  Repair Start menu shortcut
                </button>
                {repairShortcutStatus && (
                  <div className="text-xs text-neutral-600 dark:text-neutral-400">{repairShortcutStatus}</div>
                )}
              </section>
              )}
              <section className="space-y-2">
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Startup</div>
                <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    checked={applicationSettings.restoreSessionOnStartup}
                    onChange={(e) =>
                      setApplicationSettings((prev) => ({
                        ...prev,
                        restoreSessionOnStartup: e.target.checked,
                      }))
                    }
                  />
                  Restore windows, layout, chats, and editor tabs after restart or crash
                </label>
              </section>

              <section className="space-y-2">
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Chat</div>
                <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    checked={Boolean(applicationSettings.showResponseDurationAfterPrompt)}
                    onChange={(e) =>
                      setApplicationSettings((prev) => ({
                        ...prev,
                        showResponseDurationAfterPrompt: e.target.checked,
                      }))
                    }
                  />
                  Display response duration in seconds after each prompt completes
                </label>
              </section>

              <section className="space-y-3">
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Appearance</div>
                <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
                  <div className="text-xs text-neutral-600 dark:text-neutral-400 mb-2">Theme</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                    {themeCatalog.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setApplicationSettings((prev) => ({
                            ...prev,
                            themeId: t.id,
                          }))
                          setSelectedThemeEditorId(t.id)
                          setThemeEditorDraft(cloneTheme(t))
                          setThemeEditorStatus(null)
                        }}
                        className={`px-3 py-2 rounded-md border text-left text-sm ${
                          applicationSettings.themeId === t.id
                            ? 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100'
                            : 'border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
                        }`}
                      >
                        <span>{t.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
                    <div className="text-xs text-neutral-600 dark:text-neutral-400">
                      Theme fields
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      Click a theme above to populate editable color fields, then save changes back to that theme.
                    </div>
                    {themeEditorDraft ? (
                      <>
                        <div className="text-xs text-neutral-600 dark:text-neutral-400">
                          Editing <span className="font-medium text-neutral-800 dark:text-neutral-200">{themeEditorDraft.name}</span> ({themeEditorDraft.id})
                        </div>
                        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                          {(() => {
                            const groups = new Map<string, typeof THEME_EDITABLE_FIELDS>()
                            for (const field of THEME_EDITABLE_FIELDS) {
                              const g = field.group ?? 'Other'
                              if (!groups.has(g)) groups.set(g, [])
                              groups.get(g)!.push(field)
                            }
                            return Array.from(groups.entries()).map(([groupName, fields]) => (
                              <div key={groupName} className="space-y-2">
                                <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                                  {groupName}
                                </div>
                                {fields.map((field) => (
                                  <div key={field.key} className="grid grid-cols-[220px_44px_1fr] items-center gap-2">
                                    <span className="text-xs text-neutral-600 dark:text-neutral-300">{field.label}</span>
                                    <input
                                      type="color"
                                      className="h-8 w-11 rounded border border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800"
                                      value={extractHexColor(themeEditorDraft[field.key]) ?? '#000000'}
                                      onChange={(e) =>
                                        setThemeEditorDraft((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                [field.key]: e.target.value,
                                              }
                                            : prev,
                                        )
                                      }
                                    />
                                    <input
                                      className={`${UI_INPUT_CLASS} text-xs font-mono`}
                                      value={themeEditorDraft[field.key]}
                                      onChange={(e) =>
                                        setThemeEditorDraft((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                [field.key]: e.target.value,
                                              }
                                            : prev,
                                        )
                                      }
                                      placeholder="#000000 or rgba(...)"
                                    />
                                  </div>
                                ))}
                              </div>
                            ))
                          })()}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            className={UI_BUTTON_PRIMARY_CLASS}
                            onClick={() => {
                              const baseTheme = THEMES.find((theme) => theme.id === themeEditorDraft.id)
                              if (!baseTheme) {
                                setThemeEditorStatus('Selected theme is unavailable.')
                                return
                              }
                              const nextOverride: ThemeOverrideValues = {}
                              for (const field of THEME_EDITABLE_FIELDS) {
                                const nextValue = String(themeEditorDraft[field.key] ?? '').trim()
                                if (nextValue && nextValue !== baseTheme[field.key]) {
                                  nextOverride[field.key] = nextValue
                                }
                              }
                              setThemeOverrides((prev) => {
                                const next = { ...prev }
                                if (Object.keys(nextOverride).length === 0) delete next[themeEditorDraft.id]
                                else next[themeEditorDraft.id] = nextOverride
                                return next
                              })
                              setThemeEditorStatus(`Saved changes to ${themeEditorDraft.name}.`)
                            }}
                          >
                            Save theme
                          </button>
                          <button
                            type="button"
                            className="px-3 py-1.5 text-sm rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                            onClick={() => {
                              const baseTheme = THEMES.find((theme) => theme.id === themeEditorDraft.id)
                              if (!baseTheme) return
                              setThemeEditorDraft(cloneTheme(baseTheme))
                              setThemeOverrides((prev) => {
                                if (!prev[themeEditorDraft.id]) return prev
                                const next = { ...prev }
                                delete next[themeEditorDraft.id]
                                return next
                              })
                              setThemeEditorStatus(`Reset ${themeEditorDraft.name} to defaults.`)
                            }}
                          >
                            Reset theme
                          </button>
                          {themeEditorStatus && (
                            <span className="text-xs text-neutral-600 dark:text-neutral-400">{themeEditorStatus}</span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">Select a theme to edit its fields.</div>
                    )}
                  </div>
                </div>
              </section>
                </>
              )}

              {appSettingsView === 'connectivity' && (
                <>
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Provider Connectivity</div>
                  <button
                    type="button"
                    className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                    onClick={() => void refreshAllProviderAuthStatuses()}
                  >
                    Re-check all
                  </button>
                </div>
                <div className="text-xs text-neutral-600 dark:text-neutral-400">
                  Barnaby supports both local CLI providers and API providers. These checks run when opened (OpenRouter is excluded to avoid rate limits). Use Re-check on a provider to validate it.
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 italic">
                  Fallback connectivity is used only when the primary method has reached its usage limits.
                </p>
                <div className="flex flex-col gap-4">
                  {resolvedProviderConfigs.map((config) => {
                    const status = providerAuthByName[config.id]
                    const loading = providerAuthLoadingByName[config.id]
                    const action = providerAuthActionByName[config.id]
                    const isDual = PROVIDERS_WITH_DUAL_MODE.includes(config.id as ConnectivityProvider)
                    const primary = providerRegistry.overrides[config.id]?.primary ?? 'cli'
                    const fallbackEnabled = providerRegistry.overrides[config.id]?.fallbackEnabled ?? false
                    const fallback = providerRegistry.overrides[config.id]?.fallback ?? (primary === 'cli' ? 'api' : 'cli')
                    const needsCli = !isDual
                      ? config.type === 'cli'
                      : primary === 'cli' || (fallbackEnabled && fallback === 'cli')
                    const needsApi = !isDual
                      ? config.type === 'api'
                      : primary === 'api' || (fallbackEnabled && fallback === 'api')
                    const providerEnabled = Boolean(config.enabled)
                    const statusLabel = !providerEnabled
                      ? 'Disabled'
                      : !status
                        ? 'Unknown'
                        : !status.installed
                          ? 'Not installed'
                          : status.authenticated
                            ? 'Connected'
                            : 'Login required'
                    const rawStatusDetail = status?.detail?.trim() ?? ''
                    const detailLooksLikeConnected = /^connected[.!]?$/i.test(rawStatusDetail)
                    const statusDetail = !providerEnabled
                      ? 'Provider disabled.'
                      : rawStatusDetail && !detailLooksLikeConnected
                        ? rawStatusDetail
                        : (needsApi && !needsCli ? 'Click Test API to validate.' : 'No status yet.')
                    const statusClass = !providerEnabled
                      ? 'border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400'
                      : !status
                        ? 'border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300'
                        : !status.installed
                          ? 'border-red-300 text-red-700 dark:border-red-800 dark:text-red-300'
                          : status.authenticated
                            ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300'
                            : 'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300'
                    const isBuiltIn = config.isBuiltIn ?? CONNECTIVITY_PROVIDERS.includes(config.id as ConnectivityProvider)
                    const override = providerRegistry.overrides[config.id]
                    const panelOpen = providerPanelOpenByName[config.id] ?? false
                    return (
                      <details
                        key={config.id}
                        open={panelOpen}
                        onToggle={(e) => {
                          const next = e.currentTarget.open
                          setProviderPanelOpenByName((prev) => (prev[config.id] === next ? prev : { ...prev, [config.id]: next }))
                        }}
                        className={`group rounded-lg border border-neutral-300 dark:border-neutral-700 p-3 bg-neutral-100 dark:bg-neutral-900/60 shadow-sm ${!config.enabled ? 'opacity-60' : ''}`}
                      >
                        <summary className="list-none cursor-pointer flex items-center justify-between gap-3 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/80 hover:bg-neutral-50 dark:hover:bg-neutral-800 px-2.5 py-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-medium text-sm text-neutral-800 dark:text-neutral-200 truncate">
                              {config.displayName}
                              {!isBuiltIn && (
                                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 ml-1">(custom)</span>
                              )}
                            </span>
                            <div className={`px-2 py-0.5 rounded-full text-[11px] border ${statusClass}`}>{statusLabel}</div>
                          </div>
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 12 12"
                            fill="none"
                            className="text-neutral-500 dark:text-neutral-400 transition-transform group-open:rotate-180"
                            aria-hidden
                          >
                            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </summary>
                        <div className="mt-2 pt-2 border-t border-neutral-200 dark:border-neutral-700 space-y-2 rounded-md bg-white/80 dark:bg-neutral-950/60 px-2.5 pb-2">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-3 flex-wrap">
                            <label className="flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                checked={config.enabled}
                                onChange={(e) => {
                                  const id = config.id
                                  if (isBuiltIn) {
                                    setProviderRegistry((prev: ProviderRegistry) => ({
                                      ...prev,
                                      overrides: {
                                        ...prev.overrides,
                                        [id]: { ...prev.overrides[id], enabled: e.target.checked },
                                      },
                                    }))
                                  } else {
                                    setProviderRegistry((prev: ProviderRegistry) => ({
                                      ...prev,
                                      customProviders: prev.customProviders.map((p: CustomProviderConfig) =>
                                        p.id === id ? { ...p, enabled: e.target.checked } : p,
                                      ),
                                    }))
                                  }
                                }}
                                className="rounded border-neutral-300"
                              />
                              <span className="text-sm text-neutral-700 dark:text-neutral-300">Enabled</span>
                            </label>
                          </div>
                          {!isBuiltIn && (
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className="px-2 py-1 text-xs rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                onClick={() => {
                                  setEditingProvider(config as CustomProviderConfig)
                                  setShowProviderSetupModal(true)
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="px-2 py-1 text-xs rounded border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                                onClick={() => {
                                  setProviderRegistry((prev: ProviderRegistry) => ({
                                    ...prev,
                                    customProviders: prev.customProviders.filter((p: CustomProviderConfig) => p.id !== config.id),
                                  }))
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                        {isBuiltIn && (
                          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 items-center text-xs">
                            <span className="text-neutral-500 dark:text-neutral-400">Display name</span>
                            <input
                              type="text"
                              className={`${UI_INPUT_CLASS} text-sm`}
                              value={override?.displayName ?? ''}
                              onChange={(e) =>
                                setProviderRegistry((prev: ProviderRegistry) => ({
                                  ...prev,
                                  overrides: {
                                    ...prev.overrides,
                                    [config.id]: { ...prev.overrides[config.id], displayName: e.target.value || undefined },
                                  },
                                }))
                              }
                              placeholder={
                                CONNECTIVITY_PROVIDERS.includes(config.id as ConnectivityProvider)
                                  ? DEFAULT_BUILTIN_PROVIDER_CONFIGS[config.id as ConnectivityProvider].displayName
                                  : config.displayName
                              }
                            />
                            {/* Primary / Fallback connectivity mode — shown for all built-in providers */}
                            <span className="text-neutral-500 dark:text-neutral-400">Primary</span>
                            <select
                              className={`${UI_SELECT_CLASS} text-sm`}
                              value={
                                PROVIDERS_API_ONLY.includes(config.id as ConnectivityProvider)
                                  ? 'api'
                                  : (override?.primary ?? 'cli')
                              }
                              onChange={(e) => {
                                if (!PROVIDERS_WITH_DUAL_MODE.includes(config.id as ConnectivityProvider)) return
                                setProviderRegistry((prev: ProviderRegistry) => ({
                                  ...prev,
                                  overrides: {
                                    ...prev.overrides,
                                    [config.id]: {
                                      ...prev.overrides[config.id],
                                      primary: e.target.value as ConnectivityMode,
                                      fallback: (e.target.value as ConnectivityMode) === (override?.fallback ?? 'api')
                                        ? (e.target.value === 'cli' ? 'api' : 'cli')
                                        : override?.fallback,
                                    },
                                  },
                                }))
                              }}
                              disabled={PROVIDERS_CLI_ONLY.includes(config.id as ConnectivityProvider) || PROVIDERS_API_ONLY.includes(config.id as ConnectivityProvider)}
                            >
                              {!PROVIDERS_API_ONLY.includes(config.id as ConnectivityProvider) && <option value="cli">CLI</option>}
                              {!PROVIDERS_CLI_ONLY.includes(config.id as ConnectivityProvider) && <option value="api">API</option>}
                            </select>
                            {PROVIDERS_WITH_DUAL_MODE.includes(config.id as ConnectivityProvider) && (
                              <>
                                <span className="text-neutral-500 dark:text-neutral-400 col-span-2">
                                  <label className="inline-flex items-center gap-1.5">
                                    <input
                                      type="checkbox"
                                      checked={override?.fallbackEnabled ?? false}
                                      onChange={(e) =>
                                        setProviderRegistry((prev: ProviderRegistry) => ({
                                          ...prev,
                                          overrides: {
                                            ...prev.overrides,
                                            [config.id]: { ...prev.overrides[config.id], fallbackEnabled: e.target.checked },
                                          },
                                        }))
                                      }
                                      className="rounded border-neutral-300"
                                    />
                                    Fallback
                                  </label>
                                </span>
                                {override?.fallbackEnabled && (
                                  <>
                                    <span className="text-neutral-500 dark:text-neutral-400">Fallback mode</span>
                                    <select
                                      className={`${UI_SELECT_CLASS} text-sm`}
                                      value={
                                        (() => {
                                          const p = override?.primary ?? 'cli'
                                          const f = override?.fallback ?? (p === 'cli' ? 'api' : 'cli')
                                          return f === p ? (p === 'cli' ? 'api' : 'cli') : f
                                        })()
                                      }
                                      onChange={(e) =>
                                        setProviderRegistry((prev: ProviderRegistry) => ({
                                          ...prev,
                                          overrides: {
                                            ...prev.overrides,
                                            [config.id]: { ...prev.overrides[config.id], fallback: e.target.value as ConnectivityMode },
                                          },
                                        }))
                                      }
                                    >
                                      {(override?.primary ?? 'cli') !== 'cli' && <option value="cli">CLI</option>}
                                      {(override?.primary ?? 'cli') !== 'api' && <option value="api">API</option>}
                                    </select>
                                  </>
                                )}
                              </>
                            )}
                            {(() => {
                              const isDual = PROVIDERS_WITH_DUAL_MODE.includes(config.id as ConnectivityProvider)
                              const primary = override?.primary ?? 'cli'
                              const fallbackEnabled = override?.fallbackEnabled ?? false
                              const fallback = override?.fallback ?? (primary === 'cli' ? 'api' : 'cli')
                              const needsCli = !isDual ? config.type === 'cli' : primary === 'cli' || (fallbackEnabled && fallback === 'cli')
                              const needsApi = !isDual ? config.type === 'api' : primary === 'api' || (fallbackEnabled && fallback === 'api')
                              return needsCli ? (
                                <>
                                  <span className="text-neutral-500 dark:text-neutral-400">CLI path</span>
                                  <input
                                    type="text"
                                    className={`${UI_INPUT_CLASS} text-sm font-mono`}
                                    value={override?.cliPath ?? ''}
                                    onChange={(e) =>
                                      setProviderRegistry((prev: ProviderRegistry) => ({
                                        ...prev,
                                        overrides: {
                                          ...prev.overrides,
                                          [config.id]: { ...prev.overrides[config.id], cliPath: e.target.value || undefined },
                                        },
                                      }))
                                    }
                                    placeholder="Use system PATH"
                                  />
                                </>
                              ) : null
                            })()}
                            {(() => {
                              const isDual = PROVIDERS_WITH_DUAL_MODE.includes(config.id as ConnectivityProvider)
                              const primary = override?.primary ?? 'cli'
                              const fallbackEnabled = override?.fallbackEnabled ?? false
                              const fallback = override?.fallback ?? (primary === 'cli' ? 'api' : 'cli')
                              const needsApi = !isDual ? config.type === 'api' : primary === 'api' || (fallbackEnabled && fallback === 'api')
                              return needsApi ? (
                                <>
                                  <span className="text-neutral-500 dark:text-neutral-400">API base URL</span>
                                  <input
                                    type="text"
                                    className={`${UI_INPUT_CLASS} text-sm font-mono`}
                                    value={override?.apiBaseUrl ?? ''}
                                    onChange={(e) =>
                                      setProviderRegistry((prev: ProviderRegistry) => ({
                                        ...prev,
                                        overrides: {
                                          ...prev.overrides,
                                          [config.id]: { ...prev.overrides[config.id], apiBaseUrl: e.target.value || undefined },
                                        },
                                      }))
                                    }
                                    placeholder={'apiBaseUrl' in config ? config.apiBaseUrl : (override?.apiBaseUrl || 'https://...')}
                                  />
                                  <span className="text-neutral-500 dark:text-neutral-400">API key</span>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="password"
                                      className={`${UI_INPUT_CLASS} text-sm font-mono w-full`}
                                      value={providerApiKeyDraftByName[config.id] ?? ''}
                                      onChange={(e) =>
                                        setProviderApiKeyDraftByName((prev) => ({ ...prev, [config.id]: e.target.value }))
                                      }
                                      placeholder={providerApiKeyStateByName[config.id] ? 'Key saved (enter to replace)' : (config.id === 'openrouter' ? 'sk-or-v1-...' : config.id === 'codex' ? 'sk-...' : 'API key')}
                                    />
                                    <button
                                      type="button"
                                      className="px-2 py-1 text-xs rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                      onClick={() => void saveProviderApiKey(config.id)}
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      className="px-2 py-1 text-xs rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                      onClick={() => void importProviderApiKeyFromEnv(config.id)}
                                      title={`Import ${config.id.toUpperCase()}_API_KEY from environment`}
                                    >
                                      Import Env
                                    </button>
                                    <button
                                      type="button"
                                      className="px-2 py-1 text-xs rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                      onClick={() => void clearProviderApiKey(config.id)}
                                    >
                                      Clear
                                    </button>
                                  </div>
                                </>
                              ) : null
                            })()}
                          </div>
                        )}
                        {(needsCli || needsApi) && (
                          <>
                            <div className="text-xs text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap break-words">
                              {loading ? `Checking ${config.displayName}...` : statusDetail}
                            </div>
                            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                              Checked: {status?.checkedAt ? formatCheckedAt(status.checkedAt) : 'Never'}
                            </div>
                          </>
                        )}
                        {config.enabled && (needsCli || needsApi) && (
                          <div className="flex items-center gap-2 flex-wrap">
                            {needsCli && (
                              <>
                                <button
                                  type="button"
                                  className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 text-xs disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                  disabled={loading}
                                  onClick={() => void refreshProviderAuthStatus(config)}
                                >
                                  {loading ? 'Checking...' : 'Re-check'}
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 text-xs disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                  disabled={loading}
                                  onClick={() => void startProviderLoginFlow(config)}
                                >
                                  {status?.authenticated ? 'Re-authenticate' : 'Open login'}
                                </button>
                                {config.type === 'cli' &&
                                  ((config as ProviderConfigCli).upgradeCommand || (config as ProviderConfigCli).upgradePackage) && (
                                  <button
                                    type="button"
                                    className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 text-xs disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                    disabled={loading}
                                    onClick={() => void startProviderUpgradeFlow(config)}
                                    title={
                                      (config as ProviderConfigCli).upgradePackage
                                        ? `Clean reinstall: npm uninstall -g ${(config as ProviderConfigCli).upgradePackage}; npm install -g ${(config as ProviderConfigCli).upgradePackage}@latest`
                                        : (config as ProviderConfigCli).upgradeCommand
                                    }
                                  >
                                    Upgrade CLI
                                  </button>
                                )}
                              </>
                            )}
                            {needsApi && (
                              <>
                                <button
                                  type="button"
                                  className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 text-xs disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                  disabled={loading}
                                  onClick={() => void refreshProviderApiAuthStatus(config.id)}
                                >
                                  {loading ? 'Checking...' : 'Test API'}
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 text-xs disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                  onClick={() =>
                                    void startProviderLoginFlow(
                                      API_CONFIG_BY_PROVIDER[config.id]
                                        ? {
                                            id: config.id,
                                            displayName: config.displayName,
                                            enabled: config.enabled,
                                            type: 'api' as const,
                                            apiBaseUrl: API_CONFIG_BY_PROVIDER[config.id].apiBaseUrl,
                                            loginUrl: API_CONFIG_BY_PROVIDER[config.id].loginUrl,
                                          }
                                        : config,
                                    )
                                  }
                                >
                                  Open keys page
                                </button>
                              </>
                            )}
                            {PROVIDER_SUBSCRIPTION_URLS[config.id] && (
                              <button
                                type="button"
                                className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 text-xs disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                title="View subscription limits and purchase credits"
                                onClick={() => void api.openExternalUrl?.(PROVIDER_SUBSCRIPTION_URLS[config.id])}
                              >
                                View limits
                              </button>
                            )}
                            {action && <span className="text-xs text-neutral-600 dark:text-neutral-400">{action}</span>}
                          </div>
                        )}
                        </div>
                      </details>
                    )
                  })}
                </div>
                <button
                  type="button"
                  className="mt-2 px-3 py-1.5 text-sm rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  onClick={() => {
                    setEditingProvider({
                      id: '',
                      displayName: '',
                      enabled: true,
                      type: 'cli',
                      cliCommand: '',
                      authCheckCommand: '--version',
                    })
                    setShowProviderSetupModal(true)
                  }}
                >
                  + Add provider
                </button>
              </section>
                </>
              )}

              {appSettingsView === 'agents' && (
                <>
              <section className="space-y-3">
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Agents</div>
                <div className="space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="response-style"
                      checked={applicationSettings.responseStyle === 'concise'}
                      onChange={() =>
                        setApplicationSettings((prev) => ({
                          ...prev,
                          responseStyle: 'concise',
                        }))
                      }
                    />
                    <span>
                      <span className="font-medium">Concise</span>
                      <span className="block text-xs text-neutral-500 dark:text-neutral-400">Show direct answers only; hide progress traces.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="response-style"
                      checked={applicationSettings.responseStyle === 'standard'}
                      onChange={() =>
                        setApplicationSettings((prev) => ({
                          ...prev,
                          responseStyle: 'standard',
                        }))
                      }
                    />
                    <span>
                      <span className="font-medium">Standard</span>
                      <span className="block text-xs text-neutral-500 dark:text-neutral-400">Hide repetitive progress; keep useful in-turn context.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="response-style"
                      checked={applicationSettings.responseStyle === 'detailed'}
                      onChange={() =>
                        setApplicationSettings((prev) => ({
                          ...prev,
                          responseStyle: 'detailed',
                        }))
                      }
                    />
                    <span>
                      <span className="font-medium">Detailed</span>
                      <span className="block text-xs text-neutral-500 dark:text-neutral-400">Show all progress and intermediary reasoning updates.</span>
                    </span>
                  </label>
                </div>
              </section>
                </>
              )}

              {appSettingsView === 'orchestrator' && (
                <>
              <section className="space-y-3">
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Installation</div>
                <div className="space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                        loadedPlugins?.some((p) => p.pluginId === 'orchestrator' && p.active)
                          ? 'bg-green-500 dark:bg-green-600'
                          : 'bg-neutral-300 dark:bg-neutral-600'
                      }`}
                    />
                    <span className="text-neutral-500 dark:text-neutral-400">
                      {loadedPlugins?.some((p) => p.pluginId === 'orchestrator' && p.active)
                        ? `Plugin: ${loadedPlugins.find((p) => p.pluginId === 'orchestrator')?.displayName ?? 'Orchestrator'} v${loadedPlugins.find((p) => p.pluginId === 'orchestrator')?.version ?? '?'}`
                        : 'Plugin: not installed'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                      onClick={async () => {
                        setOrchestratorInstallStatus('Installing...')
                        try {
                          const result = await api.installOrchestratorPlugin?.()
                          setOrchestratorInstallStatus(result?.ok ? 'Installed successfully' : result?.error ?? 'Install failed')
                        } catch (e) {
                          setOrchestratorInstallStatus(String(e))
                        }
                        setTimeout(() => setOrchestratorInstallStatus(null), 4000)
                      }}
                    >
                      Install from npm
                    </button>
                    {loadedPlugins?.some((p) => p.pluginId === 'orchestrator' && p.active) && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                      onClick={async () => {
                        setOrchestratorInstallStatus('Uninstalling...')
                        try {
                          const result = await api.uninstallOrchestratorPlugin?.()
                          setOrchestratorInstallStatus(result?.ok ? 'Uninstalled' : result?.error ?? 'Uninstall failed')
                        } catch (e) {
                          setOrchestratorInstallStatus(String(e))
                        }
                        setTimeout(() => setOrchestratorInstallStatus(null), 4000)
                      }}
                    >
                      Uninstall
                    </button>
                    )}
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                      onClick={async () => {
                        const result = await api.openPluginsFolder?.()
                        if (!result?.ok && result?.error) {
                          setOrchestratorInstallStatus(result.error)
                          setTimeout(() => setOrchestratorInstallStatus(null), 4000)
                        }
                      }}
                    >
                      Open plugins folder
                    </button>
                  </div>
                  {orchestratorInstallStatus && (
                    <div className="text-xs text-neutral-600 dark:text-neutral-400">{orchestratorInstallStatus}</div>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">License</div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  The Orchestrator is a paid add-on. Enter your license code to enable it.
                </p>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">License code</label>
                  <input
                    type="password"
                    className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                    placeholder={orchestratorLicenseKeyState?.hasKey ? '****************' : 'Enter license code'}
                    value={orchestratorLicenseKeyDraft}
                    onChange={(e) => setOrchestratorLicenseKeyDraft(e.target.value)}
                    onBlur={async () => {
                      if (orchestratorLicenseKeyDraft.trim()) {
                        await api.setOrchestratorLicenseKey?.(orchestratorLicenseKeyDraft.trim())
                        setOrchestratorLicenseKeyState({ hasKey: true })
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={UI_BUTTON_PRIMARY_CLASS}
                    onClick={async () => {
                      await api.setOrchestratorLicenseKey?.(orchestratorLicenseKeyDraft.trim())
                      const state = await api.getOrchestratorLicenseKeyState?.()
                      setOrchestratorLicenseKeyState(state ?? null)
                    }}
                  >
                    Save license
                  </button>
                </div>
              </section>

              <section className="space-y-3">
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Models</div>
                <div className="space-y-2 text-sm">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Orchestrator model</label>
                    <select
                      className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                      value={orchestratorSettings.orchestratorModel}
                      onChange={(e) => setOrchestratorSettings((p) => ({ ...p, orchestratorModel: e.target.value }))}
                    >
                      <option value="">Default</option>
                      {getModelOptions().map((id) => (
                        <option key={id} value={id}>{id}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Worker provider</label>
                    <select
                      className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                      value={orchestratorSettings.workerProvider}
                      onChange={(e) => setOrchestratorSettings((p) => ({ ...p, workerProvider: e.target.value }))}
                    >
                      <option value="codex">Codex</option>
                      <option value="claude">Claude</option>
                      <option value="gemini">Gemini</option>
                      <option value="openrouter">OpenRouter</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Worker model</label>
                    <select
                      className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                      value={orchestratorSettings.workerModel}
                      onChange={(e) => setOrchestratorSettings((p) => ({ ...p, workerModel: e.target.value }))}
                    >
                      <option value="">Default</option>
                      {getModelOptions().map((id) => (
                        <option key={id} value={id}>{id}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Execution</div>
                <div className="space-y-2 text-sm">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Max parallel panels (1–8)</label>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                      value={orchestratorSettings.maxParallelPanels}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10)
                        if (!Number.isNaN(v) && v >= 1 && v <= 8) {
                          setOrchestratorSettings((p) => ({ ...p, maxParallelPanels: v }))
                        }
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Max task attempts (1–10)</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                      value={orchestratorSettings.maxTaskAttempts}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10)
                        if (!Number.isNaN(v) && v >= 1 && v <= 10) {
                          setOrchestratorSettings((p) => ({ ...p, maxTaskAttempts: v }))
                        }
                      }}
                    />
                  </div>
                </div>
              </section>
                </>
              )}

              {appSettingsView === 'diagnostics' && (
                <>
              <section className="space-y-3">
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Chat timeline</div>
                <div className="space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(applicationSettings.verboseDiagnostics)}
                      onChange={(e) =>
                        setApplicationSettings((prev) => ({
                          ...prev,
                          verboseDiagnostics: e.target.checked,
                        }))
                      }
                    />
                    Verbose diagnostics
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">(show all activity, reasoning, and operation events)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(applicationSettings.showDebugNotesInTimeline)}
                      onChange={(e) =>
                        setApplicationSettings((prev) => ({
                          ...prev,
                          showDebugNotesInTimeline: e.target.checked,
                        }))
                      }
                    />
                    Inject debug notes into chat timeline
                  </label>
                </div>
                <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3 dark:border-neutral-700 dark:bg-neutral-900/50">
                  <div className="text-xs text-neutral-600 dark:text-neutral-400">
                    Diagnostics message colors are now configured per theme in <span className="font-medium">Preferences → Appearance → Theme fields</span>.
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Diagnostics</div>
                <div className="text-xs text-neutral-600 dark:text-neutral-400">
                  Runtime logs and persisted state are stored in your Barnaby user data folder.
                </div>
                {diagnosticsActionStatus && (
                  <div className="text-xs text-neutral-600 dark:text-neutral-400">{diagnosticsActionStatus}</div>
                )}

                <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
                  <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Danger Zone</div>
                  <button
                    type="button"
                    className="px-2.5 py-1.5 rounded-md border border-red-200 bg-red-50 hover:bg-red-100 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:hover:bg-red-900/40 dark:text-red-400"
                    onClick={() => {
                      if (confirm('Are you sure you want to reset all application settings and data? This will clear your chat history, preferences, and local state, then restart the application as a fresh install. This action cannot be undone.')) {
                        try {
                          window.localStorage.clear()
                          void api.resetApplicationData?.()
                        } catch (err) {
                          alert(`Failed to reset: ${err}`)
                        }
                      }
                    }}
                  >
                    Reset application to factory defaults
                  </button>
                </div>

                {diagnosticsError && (
                  <div className="text-xs text-red-600 dark:text-red-400">{diagnosticsError}</div>
                )}
                {diagnosticsInfo && (
                  <div className="space-y-1 text-xs font-mono text-neutral-700 dark:text-neutral-300">
                    <div><span className="font-semibold">userData</span>: <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300 break-all text-left" onClick={() => openDiagnosticsTarget('userData', 'userData folder')}>{diagnosticsInfo.userDataPath}</button></div>
                    <div><span className="font-semibold">storage</span>: <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300 break-all text-left" onClick={() => openDiagnosticsTarget('storage', 'storage folder')}>{diagnosticsInfo.storageDir}</button></div>
                    <div><span className="font-semibold">runtime log</span>: <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300 break-all text-left" onClick={() => openDiagnosticsTarget('runtimeLog', 'runtime log')}>{diagnosticsInfo.runtimeLogPath}</button></div>
                    <div><span className="font-semibold">app state</span>: <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300 break-all text-left" onClick={() => openDiagnosticsTarget('appState', 'app state')}>{diagnosticsInfo.appStatePath}</button></div>
                    <div><span className="font-semibold">chat history</span>: <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300 break-all text-left" onClick={() => openDiagnosticsTarget('chatHistory', 'chat history')}>{diagnosticsInfo.chatHistoryPath}</button></div>
                  </div>
                )}
              </section>
                </>
              )}
            </div>
          </div>
        )

        return showDockedAppSettings && codeWindowSettingsHostRef.current
          ? createPortal(settingsCard, codeWindowSettingsHostRef.current)
          : null
      })()}

      {showProviderSetupModal && editingProvider && (
        <div className={MODAL_BACKDROP_CLASS}>
          <div className={`w-full max-w-lg ${MODAL_CARD_CLASS}`}>
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div className="font-medium">{editingProvider.id ? 'Edit provider' : 'Add provider'}</div>
              <button
                className={UI_CLOSE_ICON_BUTTON_CLASS}
                onClick={() => {
                  setShowProviderSetupModal(false)
                  setEditingProvider(null)
                }}
                title="Close"
              >
                <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4 text-sm">
              <p className="text-neutral-600 dark:text-neutral-400">
                Add a custom CLI provider. The CLI must be installed on your system. Auth check runs the command with the given args; success means connected.
              </p>
              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <span className="text-neutral-600 dark:text-neutral-300">ID</span>
                <input
                  className={`${UI_INPUT_CLASS} font-mono`}
                  value={editingProvider.id}
                  onChange={(e) => setEditingProvider((p) => (p ? { ...p, id: e.target.value } : p))}
                  placeholder="e.g. ollama"
                  disabled={!!providerRegistry.customProviders.find((p) => p.id === editingProvider.id)}
                />
                <span className="text-neutral-600 dark:text-neutral-300">Display name</span>
                <input
                  className={UI_INPUT_CLASS}
                  value={editingProvider.displayName}
                  onChange={(e) => setEditingProvider((p) => (p ? { ...p, displayName: e.target.value } : p))}
                  placeholder="e.g. Ollama"
                />
                <span className="text-neutral-600 dark:text-neutral-300">CLI command</span>
                <input
                  className={`${UI_INPUT_CLASS} font-mono`}
                  value={editingProvider.cliCommand}
                  onChange={(e) => setEditingProvider((p) => (p ? { ...p, cliCommand: e.target.value } : p))}
                  placeholder="e.g. ollama"
                />
                <span className="text-neutral-600 dark:text-neutral-300">CLI path</span>
                <input
                  className={`${UI_INPUT_CLASS} font-mono`}
                  value={editingProvider.cliPath ?? ''}
                  onChange={(e) => setEditingProvider((p) => (p ? { ...p, cliPath: e.target.value || undefined } : p))}
                  placeholder="Optional; uses PATH if empty"
                />
                <span className="text-neutral-600 dark:text-neutral-300">Auth check args</span>
                <input
                  className={`${UI_INPUT_CLASS} font-mono`}
                  value={editingProvider.authCheckCommand ?? ''}
                  onChange={(e) => setEditingProvider((p) => (p ? { ...p, authCheckCommand: e.target.value || undefined } : p))}
                  placeholder="e.g. list or --version"
                />
                <span className="text-neutral-600 dark:text-neutral-300">Login command</span>
                <input
                  className={`${UI_INPUT_CLASS} font-mono`}
                  value={editingProvider.loginCommand ?? ''}
                  onChange={(e) => setEditingProvider((p) => (p ? { ...p, loginCommand: e.target.value || undefined } : p))}
                  placeholder="e.g. ollama serve"
                />
                <span className="text-neutral-600 dark:text-neutral-400">Enabled</span>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editingProvider.enabled}
                    onChange={(e) => setEditingProvider((p) => (p ? { ...p, enabled: e.target.checked } : p))}
                  />
                  Show in connectivity
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  className={UI_BUTTON_PRIMARY_CLASS}
                  onClick={() => {
                    if (!editingProvider.id.trim() || !editingProvider.cliCommand.trim()) return
                    const existingIdx = providerRegistry.customProviders.findIndex((p: CustomProviderConfig) => p.id === editingProvider.id)
                    const next: CustomProviderConfig = {
                      ...editingProvider,
                      id: editingProvider.id.trim(),
                      displayName: editingProvider.displayName.trim() || editingProvider.id,
                      cliCommand: editingProvider.cliCommand.trim(),
                      loginCommand: editingProvider.loginCommand?.trim() || editingProvider.cliCommand.trim(),
                    }
                    if (existingIdx >= 0) {
                      setProviderRegistry((prev: ProviderRegistry) => ({
                        ...prev,
                        customProviders: prev.customProviders.map((p: CustomProviderConfig, i: number) => (i === existingIdx ? next : p)),
                      }))
                    } else if (!providerRegistry.customProviders.some((p: CustomProviderConfig) => p.id === next.id)) {
                      setProviderRegistry((prev: ProviderRegistry) => ({
                        ...prev,
                        customProviders: [...prev.customProviders, next],
                      }))
                    }
                    setShowProviderSetupModal(false)
                    setEditingProvider(null)
                  }}
                >
                  Save
                </button>
                <button
                  className={UI_BUTTON_SECONDARY_CLASS}
                  onClick={() => {
                    setShowProviderSetupModal(false)
                    setEditingProvider(null)
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSetupWizard && (
        <div className={MODAL_BACKDROP_CLASS}>
          <div className={`w-full max-w-2xl ${MODAL_CARD_CLASS}`}>
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div className="font-medium">Welcome Setup</div>
              <button
                className={UI_CLOSE_ICON_BUTTON_CLASS}
                onClick={() => {
                  setShowSetupWizard(false)
                  openWorkspacePicker('Select a workspace folder to get started.')
                }}
                title="Skip setup"
              >
                <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="text-sm text-neutral-700 dark:text-neutral-300">
                {setupWizardStep === 'providers'
                  ? 'Choose which providers you want to use. You can change this later in Settings.'
                  : 'Set up connectivity for the selected providers. Finish is enabled once at least one provider is connected.'}
              </div>
              {setupWizardStep === 'providers' ? (
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: 'codex', label: 'OpenAI' },
                    { id: 'claude', label: 'Claude' },
                    { id: 'gemini', label: 'Gemini' },
                    { id: 'openrouter', label: 'OpenRouter (Free Models)' },
                  ] as Array<{ id: ConnectivityProvider; label: string }>).map((item) => (
                    <label key={item.id} className="flex items-center gap-2 rounded border border-neutral-200 dark:border-neutral-800 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={setupWizardSelection[item.id]}
                        onChange={(e) =>
                          setSetupWizardSelection((prev) => ({
                            ...prev,
                            [item.id]: e.target.checked,
                          }))
                        }
                      />
                      <span className="text-sm text-neutral-800 dark:text-neutral-200">{item.label}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="space-y-2 max-h-[50vh] overflow-auto">
                  {CONNECTIVITY_PROVIDERS.filter((id) => setupWizardSelection[id]).map((providerId) => {
                    const config = resolvedProviderConfigs.find((c) => c.id === providerId)
                    if (!config) return null
                    const status = providerAuthByName[providerId]
                    const loading = providerAuthLoadingByName[providerId]
                    const providerEnabled = Boolean(config.enabled)
                    const statusText = !providerEnabled
                      ? 'Disabled'
                      : !status
                      ? 'Unknown'
                      : !status.installed
                        ? 'Not installed'
                        : status.authenticated
                          ? 'Connected'
                          : 'Setup required'
                    const rawStatusDetail = status?.detail?.trim() ?? ''
                    const statusDetail = !providerEnabled
                      ? 'Provider disabled.'
                      : /^connected[.!]?$/i.test(rawStatusDetail)
                        ? 'Ready.'
                        : (rawStatusDetail || 'No status yet.')
                    return (
                      <div key={providerId} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-sm text-neutral-800 dark:text-neutral-200">
                            {providerId === 'openrouter' ? 'OpenRouter (Free Models)' : config.displayName}
                          </div>
                          <div className="text-xs text-neutral-600 dark:text-neutral-400">{statusText}</div>
                        </div>
                        {config.type === 'api' && (
                          <div className="flex items-center gap-2">
                            <input
                              type="password"
                              className={`${UI_INPUT_CLASS} text-sm font-mono flex-1`}
                              value={providerApiKeyDraftByName[providerId] ?? ''}
                              onChange={(e) =>
                                setProviderApiKeyDraftByName((prev) => ({ ...prev, [providerId]: e.target.value }))
                              }
                              placeholder={providerApiKeyStateByName[providerId] ? 'Key saved (enter to replace)' : (providerId === 'codex' ? 'sk-...' : 'sk-or-v1-...')}
                            />
                            <button className={UI_BUTTON_SECONDARY_CLASS} onClick={() => void saveProviderApiKey(providerId)}>Save</button>
                            <button className={UI_BUTTON_SECONDARY_CLASS} onClick={() => void importProviderApiKeyFromEnv(providerId)}>Import Env</button>
                          </div>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            className={UI_BUTTON_SECONDARY_CLASS}
                            disabled={loading}
                            onClick={() => void refreshProviderAuthStatus(config)}
                          >
                            {loading ? 'Checking...' : 'Re-check'}
                          </button>
                          <button
                            className={UI_BUTTON_SECONDARY_CLASS}
                            disabled={loading}
                            onClick={() => void startProviderLoginFlow(config)}
                          >
                            {config.type === 'api' ? 'Open keys page' : status?.authenticated ? 'Re-authenticate' : 'Open login'}
                          </button>
                          {PROVIDER_SUBSCRIPTION_URLS[providerId] && (
                            <button
                              className={UI_BUTTON_SECONDARY_CLASS}
                              title="View subscription limits and purchase credits"
                              onClick={() => void api.openExternalUrl?.(PROVIDER_SUBSCRIPTION_URLS[providerId])}
                            >
                              View limits
                            </button>
                          )}
                        </div>
                        <div className="text-xs text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap">{statusDetail}</div>
                      </div>
                    )
                  })}
                </div>
              )}
              {setupWizardStatus && (
                <div className="text-xs rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100">
                  {setupWizardStatus}
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <button
                type="button"
                className={UI_BUTTON_SECONDARY_CLASS}
                onClick={() => {
                  setShowSetupWizard(false)
                  localStorage.setItem(SETUP_WIZARD_DONE_STORAGE_KEY, '1')
                  openWorkspacePicker('Select a workspace folder to get started.')
                }}
              >
                Skip for now
              </button>
              <div className="flex items-center gap-2">
                {setupWizardStep === 'connect' && (
                  <button
                    type="button"
                    className={UI_BUTTON_SECONDARY_CLASS}
                    onClick={() => setSetupWizardStep('providers')}
                    disabled={setupWizardFinishing}
                  >
                    Back
                  </button>
                )}
                {setupWizardStep === 'providers' ? (
                  <button
                    type="button"
                    className={UI_BUTTON_PRIMARY_CLASS}
                    onClick={() => {
                      const selected = CONNECTIVITY_PROVIDERS.filter((id) => setupWizardSelection[id])
                      if (selected.length === 0) {
                        setSetupWizardStatus('Select at least one provider to continue.')
                        return
                      }
                      setSetupWizardStatus(null)
                      setSetupWizardStep('connect')
                      void runSetupConnectivityChecks(selected)
                    }}
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    type="button"
                    className={UI_BUTTON_PRIMARY_CLASS}
                    onClick={() => void finishSetupWizard()}
                    disabled={setupWizardFinishing}
                  >
                    {setupWizardFinishing ? 'Finishing...' : 'Finish setup'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteHistoryIdPending && (
        <div className={MODAL_BACKDROP_CLASS}>
          <div className={`w-full max-w-md ${MODAL_CARD_CLASS}`}>
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div className="font-medium">Delete conversation</div>
              <button
                className={UI_CLOSE_ICON_BUTTON_CLASS}
                onClick={() => {
                  setDeleteHistoryIdPending(null)
                  setDeleteAllHistoryChecked(false)
                  setDeleteThisAndOlderChecked(false)
                }}
                title="Close"
              >
                <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="p-4 text-sm text-neutral-700 dark:text-neutral-300 space-y-3">
              <p>This conversation will be permanently deleted. Continue?</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteAllHistoryChecked}
                  onChange={(e) => setDeleteAllHistoryChecked(e.target.checked)}
                />
                <span>Delete all conversation history</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteThisAndOlderChecked}
                  onChange={(e) => setDeleteThisAndOlderChecked(e.target.checked)}
                />
                <span>Delete this and old conversations</span>
              </label>
            </div>
            <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-end gap-2">
              <button
                type="button"
                className={UI_BUTTON_SECONDARY_CLASS}
                onClick={() => {
                  setDeleteHistoryIdPending(null)
                  setDeleteAllHistoryChecked(false)
                  setDeleteThisAndOlderChecked(false)
                }}
              >
                No
              </button>
              <button
                type="button"
                className={UI_BUTTON_PRIMARY_CLASS}
                onClick={() =>
                  deleteHistoryEntry(deleteHistoryIdPending, {
                    deleteAll: deleteAllHistoryChecked,
                    deleteThisAndOlder: deleteThisAndOlderChecked,
                  })
                }
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingWorkspaceSwitch && (
        <div className={MODAL_BACKDROP_CLASS}>
          <div className={`w-full max-w-lg ${MODAL_CARD_CLASS}`}>
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div className="font-medium">Switch workspace?</div>
              <button
                className={UI_CLOSE_ICON_BUTTON_CLASS}
                onClick={() => setPendingWorkspaceSwitch(null)}
                title="Close"
              >
                <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="text-neutral-700 dark:text-neutral-300">
                This will close current windows for this workspace and load the saved layout + chat history for:
              </div>
              <div className="font-mono text-xs rounded-md border border-neutral-300 dark:border-neutral-700 px-3 py-2 break-all">
                {pendingWorkspaceSwitch.targetRoot}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-end gap-2">
              <button
                type="button"
                className={UI_BUTTON_SECONDARY_CLASS}
                onClick={() => setPendingWorkspaceSwitch(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={UI_BUTTON_PRIMARY_CLASS}
                onClick={() => void confirmWorkspaceSwitch()}
              >
                Switch workspace
              </button>
            </div>
          </div>
        </div>
      )}

      {showWorkspacePicker && (
        <div className={MODAL_BACKDROP_CLASS}>
          <div className={`w-full max-w-xl max-h-[90vh] flex flex-col ${MODAL_CARD_CLASS}`}>
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0 bg-white dark:bg-neutral-950">
              <div className="font-medium text-neutral-900 dark:text-neutral-100">Open workspace</div>
              {!isLockedWorkspacePrompt(workspacePickerPrompt) && (
                <button
                  className={UI_CLOSE_ICON_BUTTON_CLASS}
                  onClick={closeWorkspacePicker}
                  title="Close"
                >
                  <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                    <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
            <div className="p-4 min-h-0 flex-1 overflow-auto">
              {workspacePickerPrompt && (
                <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100">
                  {workspacePickerPrompt}
                </div>
              )}
              {workspacePickerError && (
                <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-100 whitespace-pre-wrap">
                  {workspacePickerError}
                </div>
              )}
              <div className="space-y-1">
                {workspaceList.map((p) => (
                  (() => {
                    const isCurrent =
                      normalizeWorkspacePathForCompare(p) === normalizeWorkspacePathForCompare(workspaceRoot)
                    const isOpening = workspacePickerOpening === p
                    return (
                      <button
                        key={p}
                        type="button"
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded text-sm font-mono border ${
                          isCurrent
                            ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-100'
                            : 'border-neutral-300 bg-neutral-50 text-neutral-900 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900/70 dark:text-neutral-100 dark:hover:bg-neutral-800/80'
                        } ${workspacePickerOpening ? 'disabled:opacity-70 disabled:cursor-not-allowed' : ''}`}
                        onClick={() => {
                          requestWorkspaceSwitch(p, 'picker')
                        }}
                        disabled={Boolean(workspacePickerOpening)}
                        aria-busy={isOpening || undefined}
                      >
                        <span className="truncate text-left">{p}</span>
                        {isOpening && <span className="shrink-0 text-[10px] uppercase tracking-wide">Opening...</span>}
                      </button>
                    )
                  })()
                ))}
              </div>
              <button
                type="button"
                className="mt-3 w-full rounded-md border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 hover:bg-neutral-100 disabled:opacity-70 disabled:cursor-not-allowed dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                onClick={async () => {
                  if (workspacePickerOpening) return
                  const selected = await api.openFolderDialog?.()
                  if (!selected) return
                  setWorkspaceList((prev) => (prev.includes(selected) ? prev : [selected, ...prev]))
                  setWorkspaceSettingsByPath((prev) => ({
                    ...prev,
                    [selected]: {
                      path: selected,
                      defaultModel: DEFAULT_MODEL,
                      permissionMode: 'verify-first',
                      sandbox: 'workspace-write',
                      allowedCommandPrefixes: [...DEFAULT_WORKSPACE_ALLOWED_COMMAND_PREFIXES],
                      allowedAutoReadPrefixes: [...DEFAULT_WORKSPACE_ALLOWED_AUTO_READ_PREFIXES],
                      allowedAutoWritePrefixes: [...DEFAULT_WORKSPACE_ALLOWED_AUTO_WRITE_PREFIXES],
                      deniedAutoReadPrefixes: [...DEFAULT_WORKSPACE_DENIED_AUTO_READ_PREFIXES],
                      deniedAutoWritePrefixes: [...DEFAULT_WORKSPACE_DENIED_AUTO_WRITE_PREFIXES],
                    },
                  }))
                  requestWorkspaceSwitch(selected, 'picker')
                  try {
                    await api.writeWorkspaceConfig?.(selected)
                  } catch {}
                }}
                disabled={Boolean(workspacePickerOpening)}
              >
                + Select folder...
              </button>
            </div>
          </div>
        </div>
      )}

      {showWorkspaceModal && (
        <div className={MODAL_BACKDROP_CLASS}>
          <div className={`w-full max-w-2xl ${MODAL_CARD_CLASS}`}>
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div className="font-medium">
                {workspaceModalMode === 'new' ? 'New workspace settings' : 'Edit workspace settings'}
              </div>
              <button
                className={UI_CLOSE_ICON_BUTTON_CLASS}
                onClick={() => setShowWorkspaceModal(false)}
                title="Close"
              >
                <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4 text-sm">
              <div className="grid grid-cols-[140px_1fr_auto] items-center gap-2">
                <span className="text-neutral-600 dark:text-neutral-300">Folder location</span>
                <input
                  className={`w-full ${UI_INPUT_CLASS} font-mono`}
                  value={workspaceForm.path}
                  onChange={(e) => setWorkspaceForm((prev) => ({ ...prev, path: e.target.value }))}
                  onBlur={(e) => {
                    const next = normalizeWorkspaceSettingsForm({ ...workspaceForm, path: e.target.value })
                    if (!next.path) return
                    void persistWorkspaceSettings(next, { requestSwitch: true })
                  }}
                />
                <button
                  type="button"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  onClick={browseForWorkspaceIntoForm}
                  title="Browse for workspace folder"
                  aria-label="Browse for workspace folder"
                >
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M2.5 4.5H6.2L7.4 5.7H13.5V11.8C13.5 12.4 13.1 12.8 12.5 12.8H3.5C2.9 12.8 2.5 12.4 2.5 11.8V4.5Z" stroke="currentColor" strokeWidth="1.1" />
                    <path d="M2.5 6.2H13.5" stroke="currentColor" strokeWidth="1.1" />
                  </svg>
                </button>
              </div>
              <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                <span className="text-neutral-600 dark:text-neutral-300">Default model</span>
                <select
                  className={UI_SELECT_CLASS}
                  value={workspaceForm.defaultModel}
                  onChange={(e) =>
                    updateWorkspaceModalForm((prev) => ({ ...prev, defaultModel: e.target.value }))
                  }
                >
                  {getModelOptions(workspaceForm.defaultModel).map((id) => {
                    const mi = modelConfig.interfaces.find((m) => m.id === id)
                    return (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                <span className="text-neutral-600 dark:text-neutral-300">Sandbox</span>
                <div className="space-y-1">
                  <select
                    className={`w-full ${UI_SELECT_CLASS}`}
                    value={workspaceForm.sandbox}
                    onChange={(e) =>
                      updateWorkspaceModalForm((prev) => {
                        const nextSandbox = e.target.value as SandboxMode
                        return {
                          ...prev,
                          sandbox: nextSandbox,
                          // In read-only mode, approval policy is irrelevant; keep safest mode persisted.
                          permissionMode: nextSandbox === 'read-only' ? 'verify-first' : prev.permissionMode,
                        }
                      })
                    }
                  >
                    <option value="read-only">Read only</option>
                    <option value="workspace-write">Workspace write</option>
                  </select>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    {sandboxModeDescription(workspaceForm.sandbox)}
                  </p>
                </div>
              </div>
              {workspaceForm.sandbox !== 'read-only' && (
                <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                  <span className="text-neutral-600 dark:text-neutral-300">Permissions</span>
                  <select
                    className={UI_SELECT_CLASS}
                    value={workspaceForm.permissionMode}
                    onChange={(e) =>
                      updateWorkspaceModalForm((prev) => ({
                        ...prev,
                        permissionMode: e.target.value as PermissionMode,
                      }))
                    }
                  >
                    <option value="verify-first">Verify first (safer)</option>
                    <option value="proceed-always">Proceed always (autonomous)</option>
                  </select>
                </div>
              )}
              {workspaceForm.sandbox !== 'read-only' && workspaceForm.permissionMode === 'proceed-always' && (
                <div className="grid grid-cols-[140px_1fr] items-start gap-2">
                  <span className="text-neutral-600 dark:text-neutral-300 pt-1">Allowed prefixes</span>
                  <div className="space-y-1">
                    <textarea
                      className={`w-full min-h-[96px] ${UI_INPUT_CLASS} font-mono text-xs`}
                      value={workspaceFormTextDraft.allowedCommandPrefixes}
                      onChange={(e) => updateWorkspaceModalTextDraft('allowedCommandPrefixes', e.target.value)}
                      placeholder={'npm run build:dist:raw\nnpx vite build'}
                    />
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      One prefix per line. Leave blank to allow all commands.
                    </p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <span className="text-neutral-600 dark:text-neutral-300">Timeline controls</span>
                <div className="col-start-2 text-xs text-neutral-500 dark:text-neutral-400">
                  Debug and trace visibility is now configured in Application Settings.
                </div>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2">
              <div>
                {workspaceModalMode === 'edit' && workspaceList.includes(workspaceForm.path) && (
                  <button
                    className="px-3 py-1.5 text-sm rounded border border-red-300 bg-white text-red-600 hover:bg-red-50 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/30"
                    onClick={() => {
                      if (confirm(`Delete workspace "${workspaceForm.path}"?`)) {
                        void deleteWorkspace(workspaceForm.path)
                      }
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400">Changes save automatically.</span>
                <button
                  className="px-3 py-1.5 text-sm rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  onClick={() => setShowWorkspaceModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  function renderPanelContent(w: AgentPanelState) {
    const hasInput = Boolean(w.input.trim()) || w.attachments.length > 0
    const isBusy = w.streaming
    const queueCount = w.pendingInputs.length
    const panelFontSizePx = 14 * w.fontScale
    const panelLineHeightPx = 24 * w.fontScale
    const panelTextStyle = { fontSize: `${panelFontSizePx}px`, lineHeight: `${panelLineHeightPx}px` }
    const activity = panelActivityById[w.id]
    const timelineUnits = panelTimelineById[w.id] ?? []
    const msSinceLastActivity = activity ? activityClock - activity.lastEventAt : Number.POSITIVE_INFINITY
    const isRunning = isBusy
    const isQueued = !isRunning && queueCount > 0
    const completionNoticeAt = panelTurnCompleteAtById[w.id]
    const completionNoticeAgeMs =
      typeof completionNoticeAt === 'number' ? Math.max(0, activityClock - completionNoticeAt) : Number.POSITIVE_INFINITY
    const showCompletionNotice = Number.isFinite(completionNoticeAgeMs) && completionNoticeAgeMs < PANEL_COMPLETION_NOTICE_MS
    const isFinalComplete =
      !isRunning && !isQueued && (activity?.lastEventLabel === 'Turn complete' || showCompletionNotice)
    const hasRecentActivity = msSinceLastActivity < 4000
    const activityDotClass = isRunning
      ? 'bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.15)]'
      : isQueued
        ? 'bg-amber-500'
        : isFinalComplete
          ? 'bg-emerald-500'
      : hasRecentActivity
        ? 'bg-sky-500/90'
        : 'bg-neutral-300 dark:bg-neutral-700'
    const activityLabel = isRunning ? 'running' : isQueued ? 'queued' : isFinalComplete ? 'done' : hasRecentActivity ? 'recent' : 'idle'
    const sendTitle = isBusy
      ? hasInput
        ? `Queue message${queueCount > 0 ? ` (${queueCount} queued)` : ''}`
        : 'Busy'
      : isFinalComplete && !hasInput
        ? 'Done'
        : 'Send'
    const secondsAgo = Number.isFinite(msSinceLastActivity) ? Math.max(0, Math.floor(msSinceLastActivity / 1000)) : null
    const activityTitle = activity
      ? `Activity: ${activityLabel}\nLast event: ${activity.lastEventLabel}\n${secondsAgo}s ago\nEvents seen: ${activity.totalEvents}\nTimeline units: ${timelineUnits.length}`
      : `Activity: idle\nNo events seen yet for this panel.\nTimeline units: ${timelineUnits.length}`
    const lastPromptDurationMs = lastPromptDurationMsByPanel[w.id]
    const formatDurationLabel = (durationMs: number) => `${(durationMs / 1000).toFixed(1).replace(/\.0$/, '')}s`
    const activePromptStartedAt = activePromptStartedAtRef.current.get(w.id)
    const livePromptDurationLabel =
      applicationSettings.showResponseDurationAfterPrompt && isRunning && typeof activePromptStartedAt === 'number'
        ? formatDurationLabel(Math.max(0, activityClock - activePromptStartedAt))
        : null
    const completedPromptDurationLabel =
      applicationSettings.showResponseDurationAfterPrompt && !isRunning && !isQueued && typeof lastPromptDurationMs === 'number'
        ? formatDurationLabel(lastPromptDurationMs)
        : null
    const lastAgentTimelineUnitId = completedPromptDurationLabel
      ? [...timelineUnits]
          .reverse()
          .find((unit) => unit.kind === 'assistant' || unit.kind === 'code' || unit.kind === 'thinking')
          ?.id ?? null
        : null
    const verbose = Boolean(applicationSettings.verboseDiagnostics)
    const showActivityUpdates = verbose || DEFAULT_DIAGNOSTICS_VISIBILITY.showActivityUpdates
    const showReasoningUpdates = verbose || DEFAULT_DIAGNOSTICS_VISIBILITY.showReasoningUpdates
    const showOperationTrace = verbose || DEFAULT_DIAGNOSTICS_VISIBILITY.showOperationTrace
    const debugNoteColor = activeTheme.debugNotes
    const activityUpdateColor = activeTheme.activityUpdates
    const reasoningUpdateColor = activeTheme.reasoningUpdates
    const operationTraceColor = activeTheme.operationTrace
    const timelineMessageColor = activeTheme.thinkingProgress
    const settingsPopover = settingsPopoverByPanel[w.id] ?? null
    const interactionMode = parseInteractionMode(w.interactionMode)
    const panelSecurity = getPanelSecurityState(w)
    const effectiveSandbox = panelSecurity.effectiveSandbox
    const effectivePermissionMode = panelSecurity.effectivePermissionMode
    const sandboxLockedToView = panelSecurity.sandboxLockedToView
    const permissionDisabledByReadOnlySandbox = panelSecurity.permissionLockedByReadOnlySandbox
    const permissionLockedToVerifyFirst = panelSecurity.permissionLockedToVerifyFirst
    const contextUsage = estimatePanelContextUsage(w)
    const contextUsagePercent = contextUsage ? Math.max(0, Number(contextUsage.usedPercent.toFixed(1))) : null
    const contextUsageBarClass =
      contextUsagePercent === null
        ? ''
        : contextUsagePercent >= 95
          ? 'bg-red-600'
          : contextUsagePercent >= 85
            ? 'bg-amber-500'
            : 'bg-emerald-600'

    return (
      <div
        className={[
          'h-full min-h-0 min-w-0 flex flex-col rounded-xl border bg-white dark:bg-neutral-950 overflow-hidden outline-none shadow-sm',
          activePanelId === w.id
            ? 'border-blue-400 dark:border-blue-600 ring-2 ring-blue-100 dark:ring-blue-900/40'
            : 'border-neutral-200/90 dark:border-neutral-800',
        ].join(' ')}
        tabIndex={0}
        onFocusCapture={() => {
          setActivePanelId(w.id)
          setFocusedEditorId(null)
        }}
        onMouseDownCapture={() => {
          setActivePanelId(w.id)
          setFocusedEditorId(null)
        }}
        onWheel={(e) => {
          if (!isZoomWheelGesture(e)) return
          e.preventDefault()
          setActivePanelId(w.id)
          setFocusedEditorId(null)
          if (zoomWheelThrottleRef.current) return
          zoomWheelThrottleRef.current = true
          if (e.deltaY < 0) api.zoomIn?.()
          else if (e.deltaY > 0) api.zoomOut?.()
          const level = api.getZoomLevel?.()
          if (level !== undefined) setZoomLevel(level)
          setTimeout(() => { zoomWheelThrottleRef.current = false }, 120)
        }}
      >
        <div
          data-agent-panel-header="true"
          className="relative flex items-center justify-between gap-2 min-w-0 px-3 py-2.5 border-b border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-950 shrink-0"
          onDragOver={(e) => panels.length > 1 && handleDragOver(e, { acceptAgent: true, targetId: `agent-${w.id}` })}
          onDrop={(e) => panels.length > 1 && handleAgentDrop(e, w.id)}
        >
          {draggingPanelId && draggingPanelId !== w.id && dragOverTarget === `agent-${w.id}` && (
            <div className="absolute inset-0 rounded-none pointer-events-none z-10" style={DROP_ZONE_OVERLAY_STYLE} />
          )}
          <div
            className="flex-1 min-w-0 flex items-center gap-2 select-none"
            title={panels.length > 1 ? `${w.title} — drag to reorder` : w.title}
            draggable={panels.length > 1}
            onDragStart={(e) => panels.length > 1 && handleDragStart(e, 'agent', w.id)}
            onDragEnd={handleDragEnd}
          >
            {panels.length > 1 && (
              <span className="shrink-0 flex text-neutral-400 dark:text-neutral-500 touch-none" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 12 12" fill="currentColor">
                  <circle cx="4" cy="3" r="1" /><circle cx="8" cy="3" r="1" />
                  <circle cx="4" cy="6" r="1" /><circle cx="8" cy="6" r="1" />
                  <circle cx="4" cy="9" r="1" /><circle cx="8" cy="9" r="1" />
                </svg>
              </span>
            )}
            <span className="text-sm font-semibold tracking-tight truncate">{getConversationPrecis(w)}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0 cursor-default">
            <button
              className={[
                'h-8 w-9 shrink-0 inline-flex items-center justify-center rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                'border-neutral-300 bg-white text-neutral-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700',
                'dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-blue-950/50 dark:hover:text-blue-300 dark:hover:border-blue-900/60',
              ].join(' ')}
              onClick={() => splitAgentPanel(w.id)}
              disabled={panels.length >= MAX_PANELS}
              title={panels.length >= MAX_PANELS ? `Maximum ${MAX_PANELS} panels` : 'Split panel'}
              aria-label="Split panel"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="8.25" y="2" width="1.5" height="14" rx="0.75" fill="currentColor" />
                <path d="M6 9L2.5 6.5V11.5L6 9Z" fill="currentColor" />
                <path d="M12 9L15.5 6.5V11.5L12 9Z" fill="currentColor" />
              </svg>
            </button>
            <button
              className={[
                'h-8 w-9 shrink-0 inline-flex items-center justify-center rounded-md border transition-colors',
                'border-neutral-300 bg-white text-neutral-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700',
                'dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-red-950/50 dark:hover:text-red-300 dark:hover:border-red-900/60',
              ].join(' ')}
              onClick={() => closePanel(w.id)}
              title="Close"
            >
              <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div
          ref={(el) => registerMessageViewport(w.id, el)}
          onScroll={() => onMessageViewportScroll(w.id)}
          onContextMenu={onChatHistoryContextMenu}
          className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-2.5 bg-neutral-50 dark:bg-neutral-950 min-h-0"
          style={panelTextStyle}
        >
          {timelineUnits.length === 0 && (
            <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-dashed border-neutral-300 bg-white/90 px-5 py-5 text-sm shadow-sm dark:border-neutral-700 dark:bg-neutral-900/70">
              <div className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                Start a new agent turn
              </div>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                Ask for a plan, implementation, review, or debugging help in this workspace.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full border border-neutral-300 bg-neutral-50 px-2 py-0.5 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  Enter to send
                </span>
                <span className="rounded-full border border-neutral-300 bg-neutral-50 px-2 py-0.5 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  Shift+Enter for new line
                </span>
                <span className="rounded-full border border-neutral-300 bg-neutral-50 px-2 py-0.5 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  Ctrl+Mousewheel to zoom text
                </span>
              </div>
            </div>
          )}
          {(() => {
            type Row = { type: 'single'; unit: TimelineUnit } | { type: 'operationBatch'; units: TimelineUnit[] } | { type: 'thinkingBatch'; units: TimelineUnit[] }
            const isToolThinking = (u: TimelineUnit) => u.kind === 'thinking' && u.body.startsWith('\u{1F504} ')
            const rows: Row[] = []
            let i = 0
            while (i < timelineUnits.length) {
              const unit = timelineUnits[i]
              const isOp = unit.kind === 'activity' && unit.activityKind === 'operation'
              if (isOp && showOperationTrace) {
                const batch: TimelineUnit[] = []
                while (i < timelineUnits.length && timelineUnits[i].kind === 'activity' && timelineUnits[i].activityKind === 'operation') {
                  batch.push(timelineUnits[i])
                  i += 1
                }
                rows.push({ type: 'operationBatch', units: batch })
                continue
              }
              if (isToolThinking(unit)) {
                const batch: TimelineUnit[] = []
                while (i < timelineUnits.length && isToolThinking(timelineUnits[i])) {
                  batch.push(timelineUnits[i])
                  i += 1
                }
                rows.push({ type: 'thinkingBatch', units: batch })
                continue
              }
              rows.push({ type: 'single', unit })
              i += 1
            }
            return rows.map((row) => {
              if (row.type === 'operationBatch') {
                return (
                  <div key={`op-batch-${row.units.map((u) => u.id).join('-')}`} className="w-full space-y-0 -my-0.5">
                    {row.units.map((unit) => {
                      const traceText = unit.body.replace(/\s*\n+\s*/g, ' | ').trim()
                      return (
                        <div key={unit.id} className="px-1 py-0">
                          <div
                            className="rounded px-2 py-0 text-[11px] leading-[1.2] transition-opacity duration-300"
                            style={{
                              color: operationTraceColor,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                            title={unit.body}
                          >
                            {traceText}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              }
              if (row.type === 'thinkingBatch') {
                const THINKING_FOLD_THRESHOLD = 5
                const items = row.units
                const batchKey = `think-batch-${items.map((u) => u.id).join('-')}`
                const lastInProgress = items[items.length - 1]?.status === 'in_progress'
                const renderLine = (u: TimelineUnit) => {
                  const label = u.body.replace(/^\u{1F504}\s*/u, '').trim()
                  return (
                    <div key={u.id} className="px-1 py-0">
                      <div
                        className={`text-[11px] leading-[1.4] truncate ${u.status === 'in_progress' ? 'animate-pulse motion-reduce:animate-none' : ''}`}
                        style={{ color: timelineMessageColor }}
                        title={label}
                      >
                        {label}
                      </div>
                    </div>
                  )
                }
                if (items.length <= THINKING_FOLD_THRESHOLD) {
                  return (
                    <div key={batchKey} className="w-full space-y-0">
                      {items.map(renderLine)}
                    </div>
                  )
                }
                const batchOpen = timelineOpenByUnitId[batchKey] ?? lastInProgress
                return (
                  <div key={batchKey} className="w-full">
                    <button
                      type="button"
                      className={`w-full text-left cursor-pointer py-1 px-1 text-[11px] flex items-center gap-1.5 select-none hover:opacity-80 bg-transparent border-0 outline-none ${lastInProgress ? 'animate-pulse motion-reduce:animate-none' : ''}`}
                      style={{ color: timelineMessageColor }}
                      onClick={() => setTimelineOpenByUnitId((prev) => ({ ...prev, [batchKey]: !batchOpen }))}
                    >
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className={`shrink-0 transition-transform ${batchOpen ? 'rotate-90' : ''}`} aria-hidden>
                        <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>{items.length} tool steps</span>
                    </button>
                    {batchOpen && (
                      <div className="space-y-0 pl-3">
                        {items.map(renderLine)}
                      </div>
                    )}
                  </div>
                )
              }
              const unit = row.unit
              if (unit.kind === 'activity') {
                const isReasoningActivity = unit.activityKind === 'reasoning'
                const isOperationTrace = unit.activityKind === 'operation'
                if (isOperationTrace) return null
                if (isReasoningActivity && !showReasoningUpdates) return null
                if (!isReasoningActivity && !showActivityUpdates) return null
              const isOpen = timelineOpenByUnitId[unit.id] ?? unit.defaultOpen
              const activitySummary = unit.title || unit.body.trim().split(/\r?\n/)[0]?.slice(0, 80) || 'Activity'
              return (
                <div key={unit.id} className="w-full py-1">
                  <details
                    open={isOpen}
                    onToggle={(e) => {
                      const next = e.currentTarget.open
                      setTimelineOpenByUnitId((prev) => (prev[unit.id] === next ? prev : { ...prev, [unit.id]: next }))
                    }}
                    className="group"
                  >
                    <summary
                      className="list-none cursor-pointer py-0.5 text-[10.5px] flex items-center justify-between gap-2 [&_*]:text-current"
                      style={{ color: timelineMessageColor }}
                    >
                      <span>{activitySummary}</span>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        className="transition-transform group-open:rotate-180"
                        aria-hidden
                      >
                        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </summary>
                    <div className="mt-1 pl-0 py-1 text-[12px] leading-5 [&_*]:!text-current" style={{ color: timelineMessageColor }}>
                      {unit.body}
                    </div>
                  </details>
                </div>
              )
            }
            const m = {
              id: unit.id,
              role: (unit.kind === 'user' ? 'user' : unit.kind === 'system' ? 'system' : 'assistant') as ChatRole,
              content: unit.body,
              format: (unit.markdown ? 'markdown' : 'text') as MessageFormat,
              attachments: unit.attachments,
            }
            const isDebugSystemNote = m.role === 'system' && /^Debug \(/.test(m.content)
            const isLimitSystemWarning = m.role === 'system' && m.content.startsWith(LIMIT_WARNING_PREFIX)
            const codeUnitPinned = Boolean(timelinePinnedCodeByUnitId[unit.id])
            const isCodeLifecycleUnit = unit.kind === 'code'
            const hasFencedCodeBlocks = m.content.includes('```')
            let codeBlockIndex = 0
            const shouldCollapseThinking = unit.kind === 'thinking'
            const thinkingOpen = timelineOpenByUnitId[unit.id] ?? unit.defaultOpen
            const thinkingInProgress = unit.status === 'in_progress'
            const thinkingSummary = m.content.trim().split(/\r?\n/)[0]?.trim().slice(0, 80) || 'Progress update'
            const messageContainerStyle = !shouldCollapseThinking && isDebugSystemNote ? { color: debugNoteColor } : undefined
            const showCompletedDurationOnMessage = Boolean(
              completedPromptDurationLabel && lastAgentTimelineUnitId === unit.id,
            )
            return (
            <div key={m.id} className="w-full">
              <div
                className={[
                  'w-full',
                  shouldCollapseThinking
                    ? 'py-1'
                    : [
                        'rounded-2xl px-3.5 py-2.5 border shadow-sm',
                        m.role === 'user'
                          ? 'bg-blue-50/90 border-blue-200 text-blue-950 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-100'
                          : 'bg-white border-neutral-200/90 text-neutral-900 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-100',
                        m.role === 'system'
                          ? 'bg-neutral-50 border-neutral-200 text-neutral-700 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-300'
                          : '',
                        isLimitSystemWarning
                          ? 'bg-amber-50/95 border-amber-300 text-amber-900 dark:bg-amber-950/35 dark:border-amber-800 dark:text-amber-200'
                          : '',
                        isDebugSystemNote
                          ? 'bg-red-50/90 border-red-200 text-red-900 dark:bg-red-950/35 dark:border-red-900 dark:text-red-200'
                          : '',
                      ].join(' '),
                ].filter(Boolean).join(' ')}
                style={messageContainerStyle}
              >
                {isCodeLifecycleUnit && hasFencedCodeBlocks && (
                  <div className="mb-2 flex justify-end">
                    <button
                      type="button"
                      className="text-[11px] px-2 py-1 rounded border border-neutral-300 bg-white/80 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                      onClick={() =>
                        setTimelinePinnedCodeByUnitId((prev) => ({
                          ...prev,
                          [unit.id]: !codeUnitPinned,
                        }))
                      }
                      title={codeUnitPinned ? 'Unpin code blocks' : 'Keep code blocks open after completion'}
                    >
                      {codeUnitPinned ? 'Pinned open' : 'Pin open'}
                    </button>
                  </div>
                )}
                {shouldCollapseThinking ? (
                  <details
                    open={thinkingOpen}
                    onToggle={(e) => {
                      const next = e.currentTarget.open
                      setTimelineOpenByUnitId((prev) =>
                        prev[unit.id] === next ? prev : { ...prev, [unit.id]: next },
                      )
                    }}
                    className="group"
                  >
                    <summary
                      className={`list-none cursor-pointer py-0.5 text-[10.5px] flex items-center justify-between gap-2 ${thinkingInProgress ? 'animate-pulse motion-reduce:animate-none' : ''}`}
                      style={{ color: timelineMessageColor }}
                    >
                      <span>{thinkingSummary}</span>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        className="transition-transform group-open:rotate-180"
                        aria-hidden
                      >
                        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </summary>
                    <div className="mt-1 pl-0 py-1 text-[12px] leading-5 [&_*]:!text-current" style={{ color: timelineMessageColor }}>
                      {m.role === 'assistant' && m.format === 'markdown' ? (
                        <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none break-words [overflow-wrap:anywhere] prose-p:my-1 prose-headings:my-1 prose-code:text-[currentColor]">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              pre(props) {
                                const first = React.Children.toArray(props.children)[0] as any
                                const codeClass = typeof first?.props?.className === 'string' ? first.props.className : ''
                                const rawChildren = first?.props?.children
                                const codeText = Array.isArray(rawChildren) ? rawChildren.join('') : String(rawChildren ?? '')
                                const normalized = codeText.replace(/\n$/, '')
                                const lineCount = normalized ? normalized.split('\n').length : 0
                                const lang = codeClass.startsWith('language-') ? codeClass.slice('language-'.length) : 'code'
                                const isDiff = lang === 'diff' || looksLikeDiff(normalized)
                                const diffLines = normalized.split('\n')
                                const openByDefault = isCodeLifecycleUnit
                                  ? unit.status === 'in_progress' || codeUnitPinned
                                  : lineCount <= COLLAPSIBLE_CODE_MIN_LINES
                                const codeBlockId = `${m.id}:${codeBlockIndex++}`
                                const isOpen = codeBlockOpenById[codeBlockId] ?? openByDefault
                                return (
                                  <div className="group my-2 rounded-lg border border-neutral-300/80 dark:border-neutral-700/80 bg-neutral-100/80 dark:bg-neutral-900/65">
                                    <button
                                      type="button"
                                      className="w-full text-left cursor-pointer px-3 py-1.5 text-[11px] font-medium text-neutral-700 dark:text-neutral-200 flex items-center justify-between gap-2 bg-transparent border-0 outline-none hover:opacity-80"
                                      onClick={() => setCodeBlockOpenById((prev) => ({ ...prev, [codeBlockId]: !isOpen }))}
                                    >
                                      <span className="inline-flex items-center gap-1.5">
                                        <span>{lang} - {lineCount} lines</span>
                                        {isDiff && (
                                          <span className="rounded border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 text-[10px] leading-none text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
                                            DIFF
                                          </span>
                                        )}
                                      </span>
                                      <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 12 12"
                                        fill="none"
                                        className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                        aria-hidden
                                      >
                                        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                    </button>
                                    {isOpen && (
                                    <div className="rounded-b-lg overflow-hidden border-t border-neutral-300/70 dark:border-neutral-700/80">
                                      {isDiff ? (
                                        <div className="p-3 overflow-auto max-h-80 whitespace-pre bg-white/80 dark:bg-neutral-950/80">
                                          <code className={`${codeClass} block text-[12px] leading-5 font-mono text-blue-950 dark:text-blue-100`}>
                                            {diffLines.map((line, idx) => (
                                              <div
                                                key={idx}
                                                className={[
                                                  line.startsWith('+') ? 'bg-emerald-100/80 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200' : '',
                                                  line.startsWith('-') ? 'bg-rose-100/80 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200' : '',
                                                ].join(' ')}
                                              >
                                                {line}
                                              </div>
                                            ))}
                                          </code>
                                        </div>
                                      ) : (
                                        <SyntaxHighlighter
                                          language={lang}
                                          style={activeTheme.mode === 'dark' ? oneDark : oneLight}
                                          customStyle={{ margin: 0, padding: '0.75rem', maxHeight: '20rem', fontSize: '12px', background: activeTheme.mode === 'dark' ? 'rgba(10, 10, 10, 0.5)' : 'rgba(255, 255, 255, 0.5)' }}
                                          showLineNumbers={true}
                                          wrapLines={false}
                                        >
                                          {normalized}
                                        </SyntaxHighlighter>
                                      )}
                                    </div>
                                    )}
                                  </div>
                                )
                              },
                              code(props) {
                                const { children, className } = props as any
                                const isBlock = typeof className === 'string' && className.includes('language-')
                                if (isBlock) return <code className={className}>{children}</code>
                                return (
                                  <code className="px-1 py-0.5 rounded bg-blue-100 text-blue-900 dark:bg-blue-950/50 dark:text-blue-200">
                                    {children}
                                  </code>
                                )
                              },
                              a(props) {
                                const { href, children } = props as any
                                const target = typeof href === 'string' ? href : ''
                                return (
                                  <a
                                    href={target || undefined}
                                    title={target || undefined}
                                    className="text-blue-700 underline underline-offset-2 decoration-blue-400 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                                    onClick={(e) => {
                                      if (!target) return
                                      e.preventDefault()
                                      void onChatLinkClick(target)
                                    }}
                                  >
                                    {children}
                                  </a>
                                )
                              },
                            }}
                          >
                            {m.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div
                          className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[12px] ${
                            isDebugSystemNote
                              ? 'italic'
                              : isLimitSystemWarning
                                ? 'font-semibold text-amber-900 dark:text-amber-200'
                              : 'text-neutral-700 dark:text-neutral-300'
                          }`}
                          style={isDebugSystemNote ? { color: debugNoteColor } : undefined}
                        >
                          {m.content}
                        </div>
                      )}
                    </div>
                  </details>
                ) : m.role === 'assistant' && m.format === 'markdown' ? (
                  <div className="prose prose-neutral dark:prose-invert max-w-none break-words [overflow-wrap:anywhere] prose-code:text-blue-800 dark:prose-code:text-blue-300">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        pre(props) {
                          const first = React.Children.toArray(props.children)[0] as any
                          const codeClass = typeof first?.props?.className === 'string' ? first.props.className : ''
                          const rawChildren = first?.props?.children
                          const codeText = Array.isArray(rawChildren) ? rawChildren.join('') : String(rawChildren ?? '')
                          const normalized = codeText.replace(/\n$/, '')
                          const lineCount = normalized ? normalized.split('\n').length : 0
                          const lang = codeClass.startsWith('language-') ? codeClass.slice('language-'.length) : 'code'
                          const isDiff = lang === 'diff' || looksLikeDiff(normalized)
                          const diffLines = normalized.split('\n')
                          const openByDefault = isCodeLifecycleUnit
                            ? unit.status === 'in_progress' || codeUnitPinned
                            : lineCount <= COLLAPSIBLE_CODE_MIN_LINES
                          const codeBlockId = `${m.id}:${codeBlockIndex++}`
                          const isOpen = codeBlockOpenById[codeBlockId] ?? openByDefault
                          return (
                            <div className="group my-2 rounded-lg border border-neutral-300/80 dark:border-neutral-700/80 bg-neutral-100/80 dark:bg-neutral-900/65">
                              <button
                                type="button"
                                className="w-full text-left cursor-pointer px-3 py-1.5 text-[11px] font-medium text-neutral-700 dark:text-neutral-200 flex items-center justify-between gap-2 bg-transparent border-0 outline-none hover:opacity-80"
                                onClick={() => setCodeBlockOpenById((prev) => ({ ...prev, [codeBlockId]: !isOpen }))}
                              >
                                <span className="inline-flex items-center gap-1.5">
                                  <span>{lang} - {lineCount} lines</span>
                                  {isDiff && (
                                    <span className="rounded border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 text-[10px] leading-none text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
                                      DIFF
                                    </span>
                                  )}
                                </span>
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 12 12"
                                  fill="none"
                                  className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                  aria-hidden
                                >
                                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                              {isOpen && (
                                    <div className="rounded-b-lg overflow-hidden border-t border-neutral-300/70 dark:border-neutral-700/80">
                                      {isDiff ? (
                                        <div className="p-3 overflow-auto max-h-80 whitespace-pre bg-white/80 dark:bg-neutral-950/80">
                                          <code className={`${codeClass} block text-[12px] leading-5 font-mono text-blue-950 dark:text-blue-100`}>
                                            {diffLines.map((line, idx) => (
                                              <div
                                                key={idx}
                                                className={[
                                                  line.startsWith('+') ? 'bg-emerald-100/80 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200' : '',
                                                  line.startsWith('-') ? 'bg-rose-100/80 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200' : '',
                                                ].join(' ')}
                                              >
                                                {line}
                                              </div>
                                            ))}
                                          </code>
                                        </div>
                                      ) : (
                                        <SyntaxHighlighter
                                          language={lang}
                                          style={activeTheme.mode === 'dark' ? oneDark : oneLight}
                                          customStyle={{ margin: 0, padding: '0.75rem', maxHeight: '20rem', fontSize: '12px', background: activeTheme.mode === 'dark' ? 'rgba(10, 10, 10, 0.5)' : 'rgba(255, 255, 255, 0.5)' }}
                                          showLineNumbers={true}
                                          wrapLines={false}
                                        >
                                          {normalized}
                                        </SyntaxHighlighter>
                                      )}
                                    </div>
                              )}
                            </div>
                          )
                        },
                        code(props) {
                          const { children, className } = props as any
                          const isBlock = typeof className === 'string' && className.includes('language-')
                          if (isBlock) return <code className={className}>{children}</code>
                          return (
                            <code className="px-1 py-0.5 rounded bg-blue-100 text-blue-900 dark:bg-blue-950/50 dark:text-blue-200">
                              {children}
                            </code>
                          )
                        },
                        a(props) {
                          const { href, children } = props as any
                          const target = typeof href === 'string' ? href : ''
                          return (
                            <a
                              href={target || undefined}
                              title={target || undefined}
                              className="text-blue-700 underline underline-offset-2 decoration-blue-400 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                              onClick={(e) => {
                                if (!target) return
                                e.preventDefault()
                                void onChatLinkClick(target)
                              }}
                            >
                              {children}
                            </a>
                          )
                        },
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </div>
                ) : m.content ? (
                  <div
                    className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
                      isDebugSystemNote ? 'italic text-red-800 dark:text-red-200' : ''
                    }`}
                  >
                    {m.content}
                  </div>
                ) : null}
                {m.attachments && m.attachments.length > 0 && (
                  <div className={`${m.content ? 'mt-2' : ''} flex flex-wrap gap-2`}>
                    {m.attachments.map((attachment) => (
                      (() => {
                        const src = toLocalFileUrl(attachment.path)
                        const blocksLocalFileUrl = src.startsWith('file://') && /^https?:$/i.test(window.location.protocol)
                        if (blocksLocalFileUrl) {
                          return (
                            <span
                              key={attachment.id}
                              className="inline-flex max-w-[220px] items-center rounded-md border border-blue-200/80 bg-blue-50 px-2 py-1 text-[11px] text-blue-900 dark:border-blue-900/70 dark:bg-blue-950/20 dark:text-blue-200"
                              title={attachment.path}
                            >
                              {attachment.label || 'Local image'}
                            </span>
                          )
                        }
                        return (
                          <img
                            key={attachment.id}
                            src={src}
                            alt={attachment.label || 'Image attachment'}
                            title={attachment.path}
                            className="h-20 w-20 rounded-md border border-blue-200/80 object-cover bg-blue-50 dark:border-blue-900/70 dark:bg-blue-950/20"
                            loading="lazy"
                          />
                        )
                      })()
                    ))}
                  </div>
                )}
                {showCompletedDurationOnMessage && (
                  <div className="mt-2 flex justify-end">
                    <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400" title="Response duration">
                      t+{completedPromptDurationLabel}
                    </span>
                  </div>
                )}
              </div>
            </div>
            )
          })})()}
          {queueCount > 0 && (
            <div className="mt-4 pt-3 border-t border-amber-200/60 dark:border-amber-800/50 space-y-2">
              <div className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                {queueCount} queued - will run after current turn
              </div>
              {w.pendingInputs.map((text, i) => {
                const preview = text.length > 80 ? text.slice(0, 80) + '...' : text
                return (
                  <div
                    key={`queued-${i}-${text.slice(0, 20)}`}
                    className="flex items-start gap-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/90 dark:bg-amber-950/30 px-3 py-2"
                  >
                    <span className="flex-1 min-w-0 text-sm text-amber-950 dark:text-amber-100 whitespace-pre-wrap break-words">
                      {preview}
                    </span>
                    <div className="shrink-0 flex items-center gap-0.5">
                      <button
                        type="button"
                        className="h-6 w-6 inline-flex items-center justify-center rounded border border-amber-400 bg-white/80 text-amber-700 hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-700 dark:border-amber-600 dark:bg-amber-900/50 dark:text-amber-200 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
                        title="Inject now - send to agent immediately"
                        aria-label="Inject now"
                        onClick={() => injectQueuedMessage(w.id, i)}
                      >
                        <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                          <path d="M6 10V2M2.5 5.5L6 2l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="h-6 w-6 inline-flex items-center justify-center rounded border border-amber-400 bg-white/80 text-amber-700 hover:bg-red-50 hover:border-red-300 hover:text-red-700 dark:border-amber-600 dark:bg-amber-900/50 dark:text-amber-200 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                        title="Remove from queue"
                        aria-label="Remove from queue"
                        onClick={() => {
                          setPanels((prev) =>
                            prev.map((x) => {
                              if (x.id !== w.id) return x
                              const nextPending = x.pendingInputs.filter((_, j) => j !== i)
                              return { ...x, pendingInputs: nextPending }
                            }),
                          )
                        }}
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="relative z-10 border-t border-neutral-200/80 dark:border-neutral-800 p-2.5 bg-white dark:bg-neutral-950">
          {w.attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {w.attachments.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                  <span className="truncate max-w-[200px]" title={a.path}>{a.label}</span>
                  <button
                    type="button"
                    className="rounded px-1 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                    title="Remove attachment"
                    onClick={() =>
                      setPanels((prev) =>
                        prev.map((p) =>
                          p.id !== w.id ? p : { ...p, attachments: p.attachments.filter((x) => x.id !== a.id) },
                        ),
                      )
                    }
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="mb-1 px-0.5 min-w-0 text-[11px]" style={{ color: timelineMessageColor }}>
            <span className="break-words [overflow-wrap:anywhere]">{w.status}</span>
          </div>
          <div className="mb-1.5 px-0.5 flex items-center gap-3 flex-wrap min-w-0">
            {contextUsage && contextUsagePercent !== null && (
              <div
                className="inline-flex items-center gap-2"
                title={`${contextUsagePercent.toFixed(1)}% used
Estimated context usage
Model window: ${contextUsage.modelContextTokens.toLocaleString()} tokens
Reserved output: ${contextUsage.outputReserveTokens.toLocaleString()} tokens
Safe input budget: ${contextUsage.safeInputBudgetTokens.toLocaleString()} tokens
Estimated input: ${contextUsage.estimatedInputTokens.toLocaleString()} tokens`}
              >
                <span className="h-1.5 w-20 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                  <span
                    className={`block h-full ${contextUsageBarClass}`}
                    style={{ width: `${Math.max(0, Math.min(100, contextUsagePercent))}%` }}
                  />
                </span>
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400">{contextUsagePercent.toFixed(1)}%</span>
              </div>
            )}
            <span
              className="inline-flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-300"
              title={activityTitle}
              aria-label={`Panel activity ${activityLabel}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${activityDotClass} ${isRunning ? 'animate-pulse' : ''}`}
                aria-hidden
              />
              {activityLabel}
            </span>
            {showCompletionNotice && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200"
                aria-live="polite"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                complete
              </span>
            )}
            {livePromptDurationLabel && (
              <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400" title="Response duration">
                t+{livePromptDurationLabel}
              </span>
            )}
          </div>
          <div className="flex items-end gap-2 min-w-0">
            <textarea
              ref={(el) => registerTextarea(w.id, el)}
              className="flex-1 min-w-0 resize-none rounded-xl bg-white border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 placeholder:text-neutral-500 dark:bg-neutral-800 dark:border-neutral-600 dark:text-neutral-100 dark:placeholder:text-neutral-400 dark:focus:border-blue-700 dark:focus:ring-blue-900/40"
              style={{ fontSize: `${panelFontSizePx}px`, lineHeight: `${panelLineHeightPx}px` }}
              placeholder="Message the agent..."
              rows={1}
              value={w.input}
              onFocus={() => setActivePanelId(w.id)}
              onChange={(e) => {
                const next = e.target.value
                setPanels((prev) => prev.map((x) => (x.id === w.id ? { ...x, input: next } : x)))
                queueMicrotask(() => autoResizeTextarea(w.id))
              }}
              onPaste={(e) => {
                const items = Array.from(e.clipboardData?.items ?? []).filter((it) => it.type.startsWith('image/'))
                if (items.length === 0) return
                e.preventDefault()
                for (const item of items) {
                  const file = item.getAsFile()
                  if (file) void handlePasteImage(w.id, file)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage(w.id)
                }
              }}
              onContextMenu={onInputPanelContextMenu}
            />
            <button
              className={[
                'h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                isBusy
                  ? hasInput
                    ? 'border-neutral-400 bg-neutral-200 text-neutral-700 hover:bg-neutral-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600'
                    : 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60'
                  : !hasInput && isFinalComplete
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                  : hasInput
                    ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-500 shadow-sm'
                    : 'border-neutral-300 bg-neutral-100 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-600',
              ].join(' ')}
              onClick={() => sendMessage(w.id)}
              disabled={!hasInput}
              title={sendTitle}
            >
              {isBusy && !hasInput ? (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 20 20"
                  fill="none"
                  className="animate-spin motion-reduce:animate-none"
                >
                  <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeOpacity="0.28" strokeWidth="2" />
                  <path d="M10 3.5a6.5 6.5 0 0 1 6.5 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : !hasInput && isFinalComplete ? (
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <path d="M5.2 10.2L8.5 13.5L14.8 7.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <path d="M10 4V13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M6.5 7.5L10 4l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 16h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="relative z-20 border-t border-neutral-200/80 dark:border-neutral-800 px-3 py-2 text-xs min-w-0 overflow-visible bg-white/90 dark:bg-neutral-950">
          <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
            <div className="min-w-0 flex-1 text-neutral-600 dark:text-neutral-300">
              {(() => {
                const pct = getRateLimitPercent(w.usage)
                const label = formatRateLimitLabel(w.usage)
                if (pct === null || !label) {
                  return null
                }
                return (
                  <div className="inline-flex items-center gap-2">
                    <span className="h-1.5 w-20 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                      <span className="block h-full bg-blue-600" style={{ width: `${100 - pct}%` }} />
                    </span>
                    <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
                  </div>
                )
              })()}
            </div>
            <div className="min-w-0 flex flex-wrap items-center justify-end gap-1.5">
              <div className="relative" data-settings-popover-root="true">
                <button
                  type="button"
                  className={[
                    'h-7 w-7 inline-flex items-center justify-center rounded-md border transition-colors',
                    settingsPopover === 'mode'
                      ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200'
                      : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700',
                  ].join(' ')}
                  title={`Mode: ${INTERACTION_MODE_META[interactionMode].label}`}
                  onClick={() =>
                    setSettingsPopoverByPanel((prev) => ({
                      ...prev,
                      [w.id]: settingsPopover === 'mode' ? null : 'mode',
                    }))
                  }
                >
                  {renderInteractionModeSymbol(interactionMode)}
                </button>
                {settingsPopover === 'mode' && (
                  <div className="absolute right-0 bottom-[calc(100%+6px)] w-48 rounded-lg border border-neutral-200/90 bg-white/95 p-1.5 shadow-xl ring-1 ring-black/5 backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95 dark:ring-white/10 z-20">
                    {PANEL_INTERACTION_MODES.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={[
                          'w-full appearance-none border-0 text-left text-[11px] px-2 py-1.5 rounded',
                          interactionMode === mode
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                            : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
                        ].join(' ')}
                        title={INTERACTION_MODE_META[mode].hint}
                        onClick={() => {
                          setInteractionMode(w.id, mode)
                          setSettingsPopoverByPanel((prev) => ({ ...prev, [w.id]: null }))
                        }}
                      >
                        {INTERACTION_MODE_META[mode].label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative" data-settings-popover-root="true">
                <button
                  type="button"
                  className={[
                    'h-7 w-7 inline-flex items-center justify-center rounded-md border transition-colors',
                    settingsPopover === 'sandbox'
                      ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200'
                      : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700',
                  ].join(' ')}
                  title={
                    sandboxLockedToView
                      ? 'Sandbox: View only (locked by Workspace settings)'
                      : `Sandbox: ${effectiveSandbox}`
                  }
                  onClick={() => {
                    if (sandboxLockedToView) {
                      setPanels((prev) =>
                        prev.map((p) =>
                          p.id !== w.id
                            ? p
                            : {
                                ...p,
                                status: 'Sandbox is locked to View. Expand sandbox in Workspace settings.',
                              },
                        ),
                      )
                    }
                    setSettingsPopoverByPanel((prev) => ({
                      ...prev,
                      [w.id]: settingsPopover === 'sandbox' ? null : 'sandbox',
                    }))
                  }}
                >
                  {renderSandboxSymbol(effectiveSandbox)}
                </button>
                {settingsPopover === 'sandbox' && (
                  <div className="absolute right-0 bottom-[calc(100%+6px)] w-48 rounded-lg border border-neutral-200/90 bg-white/95 p-1.5 shadow-xl ring-1 ring-black/5 backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95 dark:ring-white/10 z-20">
                    {sandboxLockedToView ? (
                      <>
                        <div className="w-full text-left text-[11px] px-2 py-1.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                          View
                        </div>
                        <div className="px-2 pt-1 pb-1 text-[10px] text-neutral-500 dark:text-neutral-400">
                          Expand sandbox in Workspace settings.
                        </div>
                      </>
                    ) : (
                      ([
                        ['read-only', 'Read only'],
                        ['workspace-write', 'Workspace write'],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={[
                            'w-full appearance-none border-0 text-left text-[11px] px-2 py-1.5 rounded',
                            effectiveSandbox === value
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                              : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
                          ].join(' ')}
                          onClick={() => setPanelSandbox(w.id, value)}
                        >
                          {label}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div className="relative" data-settings-popover-root="true">
                <button
                  type="button"
                  className={[
                    'h-7 w-7 inline-flex items-center justify-center rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                    settingsPopover === 'permission'
                      ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200'
                      : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700',
                  ].join(' ')}
                  title={
                    permissionDisabledByReadOnlySandbox
                      ? 'Permissions disabled while workspace sandbox is Read only'
                      : permissionLockedToVerifyFirst
                        ? 'Permissions: Verify first (locked by Workspace settings)'
                        : `Permissions: ${effectivePermissionMode}`
                  }
                  disabled={permissionDisabledByReadOnlySandbox}
                  onClick={() =>
                    setSettingsPopoverByPanel((prev) => ({
                      ...prev,
                      [w.id]: settingsPopover === 'permission' ? null : 'permission',
                    }))
                  }
                >
                  {renderPermissionSymbol(effectivePermissionMode)}
                </button>
                {settingsPopover === 'permission' && !permissionDisabledByReadOnlySandbox && (
                  <div className="absolute right-0 bottom-[calc(100%+6px)] w-52 rounded-lg border border-neutral-200/90 bg-white/95 p-1.5 shadow-xl ring-1 ring-black/5 backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95 dark:ring-white/10 z-20">
                    {permissionLockedToVerifyFirst ? (
                      <>
                        <div className="w-full text-left text-[11px] px-2 py-1.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                          Verify first
                        </div>
                        <div className="px-2 pt-1 pb-1 text-[10px] text-neutral-500 dark:text-neutral-400">
                          Locked by Workspace settings.
                        </div>
                      </>
                    ) : (
                      ([
                        ['verify-first', 'Verify first'],
                        ['proceed-always', 'Proceed always'],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={[
                            'w-full appearance-none border-0 text-left text-[11px] px-2 py-1.5 rounded',
                            effectivePermissionMode === value
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                              : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
                          ].join(' ')}
                          onClick={() => setPanelPermission(w.id, value)}
                        >
                          {label}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div className="rounded-md border border-neutral-200/70 bg-neutral-50/75 px-1.5 py-1 dark:border-neutral-800 dark:bg-neutral-900/60">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-neutral-600 dark:text-neutral-400">Model</span>
                  <select
                    className="h-7 max-w-full text-[11px] rounded border border-neutral-300 bg-white text-neutral-900 px-1.5 py-0.5 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                    value={w.model}
                    onChange={(e) => switchModel(w.id, e.target.value)}
                  >
                    {getModelOptions(w.model).map((id) => {
                      const mi = modelConfig.interfaces.find((m) => m.id === id)
                      return (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      )
                    })}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }
}

