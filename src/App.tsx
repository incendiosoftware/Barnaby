import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Group, Panel, Separator } from 'react-resizable-panels'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { buildTimelineForPanel } from './chat/timelineParser'
import type { TimelineUnit } from './chat/timelineTypes'

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
type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'
type AgentInteractionMode = 'agent' | 'plan' | 'debug' | 'ask'

type LayoutMode = 'vertical' | 'horizontal' | 'grid'
type WorkspaceDockSide = 'left' | 'right'

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
  themeId: string
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

type FilePreviewState = {
  relativePath: string
  size: number
  truncated: boolean
  binary: boolean
  content: string
  loading: boolean
  error?: string
}

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

type DiagnosticsMessageColorKey = 'debugNote' | 'activityUpdate' | 'reasoningUpdate' | 'operationTrace' | 'timelineMessage'

type DiagnosticsMessageColors = Record<DiagnosticsMessageColorKey, string>

type ApplicationSettings = {
  restoreSessionOnStartup: boolean
  themeId: string
  responseStyle: 'concise' | 'standard' | 'detailed'
  showDebugNotesInTimeline: boolean
  showActivityUpdates: boolean
  showReasoningUpdates: boolean
  showOperationTrace: boolean
  diagnosticsMessageColors: DiagnosticsMessageColors
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
  selectedWorkspaceFile: string | null | undefined
  activePanelId: string | null
  focusedEditorId: string | null | undefined
  showWorkspaceWindow: boolean | undefined
  expandedDirectories: Record<string, boolean> | undefined
}

type WorkspaceUiSnapshot = {
  layoutMode: LayoutMode
  showWorkspaceWindow: boolean
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

const DEFAULT_WORKSPACE_ROOT = 'E:\\Retirement\\FIREMe'
const DEFAULT_MODEL = 'gpt-5.3-codex'
const MODEL_BANNER_PREFIX = 'Model: '
const STARTUP_READY_MESSAGE = 'I am ready'
const AUTO_CONTINUE_PROMPT = 'Please continue from where you left off. Complete the task fully.'
const STARTUP_LOCKED_WORKSPACE_PROMPT =
  'The workspace being opened is locked by another Barnaby. Select another workspace or try again.'

type ModelProvider = 'codex' | 'claude' | 'gemini'
type ConnectivityProvider = 'codex' | 'claude' | 'gemini'

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
}

type AppSettingsView = 'connectivity' | 'models' | 'preferences' | 'agents' | 'diagnostics'

type ModelCatalogRefreshStatus = {
  kind: 'success' | 'error'
  message: string
}

type ProviderConfig = {
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

type CustomProviderConfig = Omit<ProviderConfig, 'isBuiltIn'>

type ProviderRegistry = {
  overrides: Record<string, { displayName?: string; enabled?: boolean; cliPath?: string }>
  customProviders: CustomProviderConfig[]
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

const DEFAULT_MODEL_INTERFACES: ModelInterface[] = [
  { id: 'gpt-5.3-codex', displayName: 'GPT 5.3 (Codex)', provider: 'codex', enabled: true },
  { id: 'gpt-5.2-codex', displayName: 'GPT 5.2 (Codex)', provider: 'codex', enabled: true },
  { id: 'gpt-5.1-codex', displayName: 'GPT 5.1 (Codex)', provider: 'codex', enabled: true },
  { id: 'sonnet', displayName: 'Claude Sonnet', provider: 'claude', enabled: true },
  { id: 'opus', displayName: 'Claude Opus', provider: 'claude', enabled: true },
  { id: 'haiku', displayName: 'Claude Haiku', provider: 'claude', enabled: true },
  { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', provider: 'gemini', enabled: true },
  { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', provider: 'gemini', enabled: true },
  { id: 'gemini-3-pro-preview', displayName: 'Gemini 3 Pro (Preview)', provider: 'gemini', enabled: true },
]

const MAX_PANELS = 5
const MAX_AUTO_CONTINUE = 3
const MODAL_BACKDROP_CLASS = 'fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] flex items-center justify-center p-4'
const MODAL_CARD_CLASS = 'rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white/95 dark:bg-neutral-950 shadow-2xl'
const UI_BUTTON_SECONDARY_CLASS = 'px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
const UI_BUTTON_PRIMARY_CLASS = 'px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-500'
const UI_ICON_BUTTON_CLASS = 'h-9 w-9 inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 shadow-sm text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
const UI_CLOSE_ICON_BUTTON_CLASS = 'h-7 w-9 inline-flex items-center justify-center rounded-md hover:bg-neutral-100 text-neutral-700 dark:hover:bg-neutral-700 dark:text-neutral-200'
const UI_TOOLBAR_ICON_BUTTON_CLASS = 'h-7 w-7 inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
const UI_INPUT_CLASS = 'px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400'
const UI_SELECT_CLASS = 'px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100'
const PANEL_INTERACTION_MODES: AgentInteractionMode[] = ['agent', 'plan', 'debug', 'ask']
const STATUS_SYMBOL_ICON_CLASS = 'h-[13px] w-[13px] text-neutral-600 dark:text-neutral-300'
const CONNECTIVITY_PROVIDERS: ConnectivityProvider[] = ['codex', 'claude', 'gemini']
const APP_SETTINGS_VIEWS: AppSettingsView[] = ['connectivity', 'models', 'preferences', 'agents', 'diagnostics']
const OPERATION_TRACE_VISIBLE_MS = 1200
const OPERATION_TRACE_FADE_MS = 2600
const OPERATION_TRACE_MIN_OPACITY = 0.4
const DEFAULT_DIAGNOSTICS_MESSAGE_COLORS: DiagnosticsMessageColors = {
  debugNote: '#b91c1c',
  activityUpdate: '#b45309',
  reasoningUpdate: '#047857',
  operationTrace: '#1e3a8a',
  timelineMessage: '#737373',
}
const DIAGNOSTICS_MESSAGE_COLOR_FIELDS: Array<{ key: DiagnosticsMessageColorKey; label: string }> = [
  { key: 'debugNote', label: 'Debug notes' },
  { key: 'activityUpdate', label: 'Activity updates' },
  { key: 'reasoningUpdate', label: 'Reasoning updates' },
  { key: 'operationTrace', label: 'Operation trace' },
  { key: 'timelineMessage', label: 'Thinking/progress messages' },
]

const DEFAULT_BUILTIN_PROVIDER_CONFIGS: Record<ConnectivityProvider, ProviderConfig> = {
  codex: {
    id: 'codex',
    displayName: 'Codex',
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
    upgradeCommand: 'npm update -g @anthropic-ai/claude',
    upgradePackage: '@anthropic-ai/claude',
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
}

function syncModelConfigWithCatalog(prev: ModelConfig, available: AvailableCatalogModels): ModelConfig {
  const catalogIdsByProvider: Record<ModelProvider, Set<string>> = {
    codex: new Set(available.codex.map((m) => m.id)),
    claude: new Set(available.claude.map((m) => m.id)),
    gemini: new Set(available.gemini.map((m) => m.id)),
  }
  const catalogModelsByProvider: Record<ModelProvider, { id: string; displayName: string }[]> = {
    codex: available.codex,
    claude: available.claude,
    gemini: available.gemini,
  }
  const kept = prev.interfaces.filter((m) => {
    const catalogIds = catalogIdsByProvider[m.provider]
    return catalogIds.size === 0 || catalogIds.has(m.id)
  })
  const existingIds = new Set(kept.map((m) => m.id))
  const nextInterfaces = [...kept]
  for (const provider of CONNECTIVITY_PROVIDERS) {
    for (const model of catalogModelsByProvider[provider]) {
      if (existingIds.has(model.id)) continue
      nextInterfaces.push({ id: model.id, displayName: model.displayName, provider, enabled: true })
      existingIds.add(model.id)
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
  if (mode === 'workspace-write') {
    return (
      <svg className={STATUS_SYMBOL_ICON_CLASS} viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M2 4.8H6L7.2 6H14V12.8H2V4.8Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M2 6H14" stroke="currentColor" strokeWidth="1.1" />
      </svg>
    )
  }
  return (
    <svg className={STATUS_SYMBOL_ICON_CLASS} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 2.2L14 13H2L8 2.2Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M8 5.8V9.3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="8" cy="11.2" r="0.8" fill="currentColor" />
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
const EXPLORER_PREFS_STORAGE_KEY = 'agentorchestrator.explorerPrefsByWorkspace'
const CHAT_HISTORY_STORAGE_KEY = 'agentorchestrator.chatHistory'
const APP_SETTINGS_STORAGE_KEY = 'agentorchestrator.appSettings'
const MIN_FONT_SCALE = 0.75
const MAX_FONT_SCALE = 1.5
const FONT_SCALE_STEP = 0.05
const INPUT_MAX_HEIGHT_PX = 220
const DEFAULT_EXPLORER_PREFS: ExplorerPrefs = { showHiddenFiles: false, showNodeModules: false }
const CONNECT_TIMEOUT_MS = 15000
const TURN_START_TIMEOUT_MS = 15000
const STALL_WATCHDOG_MS = 30000
const COLLAPSIBLE_CODE_MIN_LINES = 14
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
const WORKSPACE_THEME_INHERIT = 'application'

const THEMES: StandaloneTheme[] = [
  { id: 'default-light', name: 'Default Light', mode: 'light', accent500: '#3b82f6', accent600: '#2563eb', accent700: '#1d4ed8', accentText: '#dbeafe', accentSoft: '#eff6ff', accentSoftDark: 'rgba(30,58,138,0.28)', dark950: '#0a0a0a', dark900: '#171717' },
  { id: 'default-dark', name: 'Default Dark', mode: 'dark', accent500: '#88c0d0', accent600: '#5e81ac', accent700: '#4c6a91', accentText: '#d8e9f0', accentSoft: '#e5f2f7', accentSoftDark: 'rgba(94,129,172,0.28)', dark950: '#32363d', dark900: '#3f444d' },
  { id: 'obsidian-black', name: 'Obsidian Black', mode: 'dark', accent500: '#7c3aed', accent600: '#6d28d9', accent700: '#5b21b6', accentText: '#ddd6fe', accentSoft: '#ede9fe', accentSoftDark: 'rgba(124,58,237,0.24)', dark950: '#000000', dark900: '#0a0a0a' },
  { id: 'dracula', name: 'Dracula', mode: 'dark', accent500: '#bd93f9', accent600: '#a87ef5', accent700: '#8f62ea', accentText: '#f3e8ff', accentSoft: '#f5f3ff', accentSoftDark: 'rgba(189,147,249,0.25)', dark950: '#191a21', dark900: '#232533' },
  { id: 'nord-light', name: 'Nord Light', mode: 'light', accent500: '#88c0d0', accent600: '#5e81ac', accent700: '#4c6a91', accentText: '#d8e9f0', accentSoft: '#e5f2f7', accentSoftDark: 'rgba(94,129,172,0.28)', dark950: '#2e3440', dark900: '#3b4252' },
  { id: 'nord-dark', name: 'Nord Dark', mode: 'dark', accent500: '#88c0d0', accent600: '#5e81ac', accent700: '#4c6a91', accentText: '#d8e9f0', accentSoft: '#e5f2f7', accentSoftDark: 'rgba(94,129,172,0.28)', dark950: '#2e3440', dark900: '#3b4252' },
  { id: 'solarized-light', name: 'Solarized Light', mode: 'light', accent500: '#2aa198', accent600: '#268e87', accent700: '#1f7a74', accentText: '#d1fae5', accentSoft: '#dcfce7', accentSoftDark: 'rgba(42,161,152,0.26)', dark950: '#002b36', dark900: '#073642' },
  { id: 'solarized-dark', name: 'Solarized Dark', mode: 'dark', accent500: '#2aa198', accent600: '#268e87', accent700: '#1f7a74', accentText: '#d1fae5', accentSoft: '#dcfce7', accentSoftDark: 'rgba(42,161,152,0.26)', dark950: '#002b36', dark900: '#073642' },
  { id: 'gruvbox-light', name: 'Gruvbox Light', mode: 'light', accent500: '#d79921', accent600: '#b57614', accent700: '#9a5f10', accentText: '#fef3c7', accentSoft: '#fffbeb', accentSoftDark: 'rgba(215,153,33,0.26)', dark950: '#1d2021', dark900: '#282828' },
  { id: 'gruvbox-dark', name: 'Gruvbox Dark', mode: 'dark', accent500: '#d79921', accent600: '#b57614', accent700: '#9a5f10', accentText: '#fef3c7', accentSoft: '#fffbeb', accentSoftDark: 'rgba(215,153,33,0.26)', dark950: '#1d2021', dark900: '#282828' },
  { id: 'tokyo-night-light', name: 'Tokyo Night Light', mode: 'light', accent500: '#7aa2f7', accent600: '#5f88e8', accent700: '#4c74d0', accentText: '#dbeafe', accentSoft: '#eff6ff', accentSoftDark: 'rgba(122,162,247,0.26)', dark950: '#1a1b26', dark900: '#24283b' },
  { id: 'tokyo-night-dark', name: 'Tokyo Night Dark', mode: 'dark', accent500: '#7aa2f7', accent600: '#5f88e8', accent700: '#4c74d0', accentText: '#dbeafe', accentSoft: '#eff6ff', accentSoftDark: 'rgba(122,162,247,0.26)', dark950: '#1a1b26', dark900: '#24283b' },
  { id: 'catppuccin-mocha', name: 'Catppuccin Mocha', mode: 'dark', accent500: '#cba6f7', accent600: '#b68cf0', accent700: '#9f73e3', accentText: '#f5e8ff', accentSoft: '#faf5ff', accentSoftDark: 'rgba(203,166,247,0.26)', dark950: '#1e1e2e', dark900: '#313244' },
  { id: 'github-dark', name: 'GitHub Dark', mode: 'dark', accent500: '#58a6ff', accent600: '#3b82d6', accent700: '#2f6fb8', accentText: '#dbeafe', accentSoft: '#eff6ff', accentSoftDark: 'rgba(88,166,255,0.26)', dark950: '#0d1117', dark900: '#161b22' },
  { id: 'monokai', name: 'Monokai', mode: 'dark', accent500: '#a6e22e', accent600: '#84cc16', accent700: '#65a30d', accentText: '#ecfccb', accentSoft: '#f7fee7', accentSoftDark: 'rgba(166,226,46,0.22)', dark950: '#1f1f1f', dark900: '#272822' },
  { id: 'one-dark', name: 'One Dark', mode: 'dark', accent500: '#61afef', accent600: '#3d8fd9', accent700: '#2f75ba', accentText: '#dbeafe', accentSoft: '#eff6ff', accentSoftDark: 'rgba(97,175,239,0.26)', dark950: '#1e2127', dark900: '#282c34' },
  { id: 'ayu-mirage', name: 'Ayu Mirage', mode: 'dark', accent500: '#ffb454', accent600: '#f59e0b', accent700: '#d97706', accentText: '#ffedd5', accentSoft: '#fff7ed', accentSoftDark: 'rgba(255,180,84,0.24)', dark950: '#1f2430', dark900: '#242936' },
  { id: 'material-ocean', name: 'Material Ocean', mode: 'dark', accent500: '#82aaff', accent600: '#5d8bef', accent700: '#4a74d1', accentText: '#dbeafe', accentSoft: '#eff6ff', accentSoftDark: 'rgba(130,170,255,0.26)', dark950: '#0f111a', dark900: '#1a1c25' },
  { id: 'synthwave-84', name: 'Synthwave 84', mode: 'dark', accent500: '#ff7edb', accent600: '#ec4899', accent700: '#be185d', accentText: '#fce7f3', accentSoft: '#fdf2f8', accentSoftDark: 'rgba(255,126,219,0.26)', dark950: '#241b2f', dark900: '#2b213a' },
]

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

function normalizeWorkspaceThemeId(value: unknown): string {
  if (value === WORKSPACE_THEME_INHERIT) return WORKSPACE_THEME_INHERIT
  if (typeof value !== 'string' || !value.trim()) return WORKSPACE_THEME_INHERIT
  return THEMES.some((t) => t.id === value) ? value : WORKSPACE_THEME_INHERIT
}

function getInitialWorkspaceRoot() {
  return globalThis.localStorage?.getItem(WORKSPACE_STORAGE_KEY) ?? DEFAULT_WORKSPACE_ROOT
}

function getInitialWorkspaceDockSide(): WorkspaceDockSide {
  const stored = (globalThis.localStorage?.getItem(WORKSPACE_DOCK_SIDE_STORAGE_KEY) ?? '').toLowerCase()
  return stored === 'left' ? 'left' : 'right'
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
    result.push({
      ...builtIn,
      ...(override && {
        displayName: override.displayName ?? builtIn.displayName,
        enabled: override.enabled ?? builtIn.enabled,
        cliPath: override.cliPath,
      }),
    })
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
    if (!stored) return [root]
    const list = JSON.parse(stored) as string[]
    if (!Array.isArray(list)) return [root]
    const deduped = [...new Set([root, ...list])]
    return deduped.filter(Boolean)
  } catch {
    return [root]
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
      record.sandbox === 'read-only' || record.sandbox === 'workspace-write' || record.sandbox === 'danger-full-access'
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

function normalizeColorHex(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized
  const short = normalized.match(/^#([0-9a-f]{3})$/)
  if (!short) return fallback
  const [, raw] = short
  return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`
}

function parseDiagnosticsMessageColors(raw: unknown): DiagnosticsMessageColors {
  const source =
    raw && typeof raw === 'object'
      ? (raw as Partial<Record<DiagnosticsMessageColorKey, unknown>>)
      : {}
  return {
    debugNote: normalizeColorHex(source.debugNote, DEFAULT_DIAGNOSTICS_MESSAGE_COLORS.debugNote),
    activityUpdate: normalizeColorHex(source.activityUpdate, DEFAULT_DIAGNOSTICS_MESSAGE_COLORS.activityUpdate),
    reasoningUpdate: normalizeColorHex(source.reasoningUpdate, DEFAULT_DIAGNOSTICS_MESSAGE_COLORS.reasoningUpdate),
    operationTrace: normalizeColorHex(source.operationTrace, DEFAULT_DIAGNOSTICS_MESSAGE_COLORS.operationTrace),
    timelineMessage: normalizeColorHex(source.timelineMessage, DEFAULT_DIAGNOSTICS_MESSAGE_COLORS.timelineMessage),
  }
}

function getInitialApplicationSettings(): ApplicationSettings {
  try {
    const raw = globalThis.localStorage?.getItem(APP_SETTINGS_STORAGE_KEY)
    if (!raw) {
      return {
        restoreSessionOnStartup: true,
        themeId: DEFAULT_THEME_ID,
        responseStyle: 'standard',
        showDebugNotesInTimeline: false,
        showActivityUpdates: false,
        showReasoningUpdates: false,
        showOperationTrace: true,
        diagnosticsMessageColors: { ...DEFAULT_DIAGNOSTICS_MESSAGE_COLORS },
      }
    }
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
      showActivityUpdates: Boolean(parsed?.showActivityUpdates),
      showReasoningUpdates: Boolean(parsed?.showReasoningUpdates),
      showOperationTrace: parsed?.showOperationTrace !== false,
      diagnosticsMessageColors: parseDiagnosticsMessageColors(parsed?.diagnosticsMessageColors),
    }
  } catch {
    return {
      restoreSessionOnStartup: true,
      themeId: DEFAULT_THEME_ID,
      responseStyle: 'standard',
      showDebugNotesInTimeline: false,
      showActivityUpdates: false,
      showReasoningUpdates: false,
      showOperationTrace: true,
      diagnosticsMessageColors: { ...DEFAULT_DIAGNOSTICS_MESSAGE_COLORS },
    }
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

function parsePersistedAgentPanel(raw: unknown, fallbackWorkspaceRoot: string): AgentPanelState | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as PersistedAgentPanelState
  const messages = parseHistoryMessages(rec.messages)
  if (messages.length === 0) return null
  const id = typeof rec.id === 'string' && rec.id ? rec.id : newId()
  const title = typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim() : `Agent ${id.slice(-4)}`
  const permissionMode: PermissionMode = rec.permissionMode === 'proceed-always' ? 'proceed-always' : 'verify-first'
  const sandbox: SandboxMode =
    rec.sandbox === 'read-only' || rec.sandbox === 'workspace-write' || rec.sandbox === 'danger-full-access'
      ? rec.sandbox
      : 'workspace-write'
  const cwd =
    typeof rec.cwd === 'string' && rec.cwd.trim()
      ? rec.cwd
      : fallbackWorkspaceRoot || getInitialWorkspaceRoot()
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
        : fallbackWorkspaceRoot || getInitialWorkspaceRoot(),
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
    layoutMode,
    workspaceDockSide,
    selectedWorkspaceFile,
    activePanelId,
    focusedEditorId,
    showWorkspaceWindow: typeof rec.showWorkspaceWindow === 'boolean' ? rec.showWorkspaceWindow : undefined,
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
      {
        id: newId(),
        role: 'assistant',
        content: STARTUP_READY_MESSAGE,
        format: 'text',
        createdAt: Date.now() + 1,
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

function withReadyAck(messages: ChatMessage[]): ChatMessage[] {
  const last = messages[messages.length - 1]
  if (last?.role === 'assistant' && last.content.trim() === STARTUP_READY_MESSAGE) return messages
  return [...messages, { id: newId(), role: 'assistant', content: STARTUP_READY_MESSAGE, format: 'text', createdAt: Date.now() }]
}

function getInitialWorkspaceSettings(list: string[]): Record<string, WorkspaceSettings> {
  try {
    const raw = globalThis.localStorage?.getItem(WORKSPACE_SETTINGS_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, Partial<WorkspaceSettings>>) : {}
    const result: Record<string, WorkspaceSettings> = {}
    for (const [key, value] of Object.entries(parsed)) {
      const path = typeof value?.path === 'string' && value.path.trim() ? value.path : key
      if (!path) continue
      result[path] = {
        path,
        defaultModel: typeof value?.defaultModel === 'string' && value.defaultModel ? value.defaultModel : DEFAULT_MODEL,
        permissionMode: value?.permissionMode === 'proceed-always' ? 'proceed-always' : 'verify-first',
        sandbox:
          value?.sandbox === 'read-only' || value?.sandbox === 'danger-full-access'
            ? value.sandbox
            : 'workspace-write',
        themeId: (() => {
          const v = value as Partial<WorkspaceSettings> & { themeMode?: string; themePresetId?: string }
          if (v?.themeId && THEMES.some((t) => t.id === v.themeId)) return v.themeId
          const legacyMode = v?.themeMode === 'light' || v?.themeMode === 'dark' ? v.themeMode : 'dark'
          const legacyPreset = typeof v?.themePresetId === 'string' ? v.themePresetId : null
          const mapping = legacyPreset && LEGACY_PRESET_TO_THEME_ID[legacyPreset]
          if (mapping) return legacyMode === 'light' ? mapping.light : mapping.dark
          if (legacyPreset && THEMES.some((t) => t.id === legacyPreset)) return legacyPreset
          return WORKSPACE_THEME_INHERIT
        })(),
      }
    }
    for (const p of list) {
      if (!result[p]) {
        result[p] = {
          path: p,
          defaultModel: DEFAULT_MODEL,
          permissionMode: 'verify-first',
          sandbox: 'workspace-write',
          themeId: WORKSPACE_THEME_INHERIT,
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
        themeId: WORKSPACE_THEME_INHERIT,
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
  const [workspaceModalMode, setWorkspaceModalMode] = useState<'new' | 'edit'>('edit')
  const [workspaceForm, setWorkspaceForm] = useState<WorkspaceSettings>({
    path: getInitialWorkspaceRoot(),
    defaultModel: DEFAULT_MODEL,
    permissionMode: 'verify-first',
    sandbox: 'workspace-write',
    themeId: WORKSPACE_THEME_INHERIT,
  })
  const [showThemeModal, setShowThemeModal] = useState(false)
  const [showAppSettingsModal, setShowAppSettingsModal] = useState(false)
  const [appSettingsView, setAppSettingsView] = useState<AppSettingsView>('connectivity')
  const [applicationSettings, setApplicationSettings] = useState<ApplicationSettings>(() => getInitialApplicationSettings())
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
  const [modelConfig, setModelConfig] = useState<ModelConfig>(() => getInitialModelConfig())
  const [modelCatalogRefreshStatus, setModelCatalogRefreshStatus] = useState<ModelCatalogRefreshStatus | null>(null)
  const [modelCatalogRefreshPending, setModelCatalogRefreshPending] = useState(false)
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
  const [filePreview, setFilePreview] = useState<FilePreviewState | null>(null)
  const [selectedWorkspaceFile, setSelectedWorkspaceFile] = useState<string | null>(null)
  const [editorPanels, setEditorPanels] = useState<EditorPanelState[]>([])
  const [focusedEditorId, setFocusedEditorId] = useState<string | null>(null)
  const [panelActivityById, setPanelActivityById] = useState<Record<string, PanelActivityState>>({})
  const [activityClock, setActivityClock] = useState(() => Date.now())
  const [panelDebugById, setPanelDebugById] = useState<Record<string, PanelDebugEntry[]>>({})
  const [settingsPopoverByPanel, setSettingsPopoverByPanel] = useState<Record<string, 'mode' | 'sandbox' | 'permission' | null>>({})
  const [codeBlockOpenById, setCodeBlockOpenById] = useState<Record<string, boolean>>({})
  const [timelineOpenByUnitId, setTimelineOpenByUnitId] = useState<Record<string, boolean>>({})
  const [timelinePinnedCodeByUnitId, setTimelinePinnedCodeByUnitId] = useState<Record<string, boolean>>({})
  const [chatHistory, setChatHistory] = useState<ChatHistoryEntry[]>(() => getInitialChatHistory())
  const [selectedHistoryId, setSelectedHistoryId] = useState('')

  const modelList = modelConfig.interfaces.filter((m) => m.enabled).map((m) => m.id)
  const workspaceScopedHistory = useMemo(() => {
    const normalizedWorkspaceRoot = normalizeWorkspacePathForCompare(workspaceRoot || '')
    return chatHistory.filter(
      (entry) => normalizeWorkspacePathForCompare(entry.workspaceRoot || '') === normalizedWorkspaceRoot,
    )
  }, [chatHistory, workspaceRoot])
  function getModelOptions(includeCurrent?: string): string[] {
    const base = [...modelList]
    if (includeCurrent && !base.includes(includeCurrent)) base.push(includeCurrent)
    return base
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
  const needsContextOnNextCodexSendRef = useRef<Record<string, boolean>>({})
  const workspaceRootRef = useRef(workspaceRoot)
  const workspaceListRef = useRef(workspaceList)
  const activeWorkspaceLockRef = useRef('')
  const appStateHydratedRef = useRef(false)
  const appStateSaveTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const workspaceSnapshotsRef = useRef<Record<string, WorkspaceUiSnapshot>>({})
  const startupReadyNotifiedRef = useRef(false)

  const [layoutMode, setLayoutMode] = useState<LayoutMode>('vertical')
  const [showWorkspaceWindow, setShowWorkspaceWindow] = useState(true)
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
  const activeWorkspaceSettings = useMemo(
    () => workspaceSettingsByPath[workspaceRoot],
    [workspaceRoot, workspaceSettingsByPath],
  )
  const workspaceFormThemePreviewId = useMemo(() => {
    if (workspaceForm.path.trim() !== workspaceRoot) return null
    const previewThemeId = normalizeWorkspaceThemeId(workspaceForm.themeId)
    return previewThemeId !== WORKSPACE_THEME_INHERIT ? previewThemeId : null
  }, [workspaceForm.path, workspaceForm.themeId, workspaceRoot])
  const effectiveThemeId = useMemo(() => {
    if (workspaceFormThemePreviewId) return workspaceFormThemePreviewId
    const wsThemeId = activeWorkspaceSettings?.themeId
    if (wsThemeId && wsThemeId !== WORKSPACE_THEME_INHERIT) return wsThemeId
    return applicationSettings.themeId
  }, [workspaceFormThemePreviewId, activeWorkspaceSettings, applicationSettings.themeId])
  const activeTheme = useMemo(
    () => THEMES.find((t) => t.id === effectiveThemeId) ?? THEMES.find((t) => t.id === DEFAULT_THEME_ID)!,
    [effectiveThemeId],
  )
  const effectiveTheme: Theme = activeTheme.mode

  useEffect(() => {
    localStorage.setItem(THEME_ID_STORAGE_KEY, applicationSettings.themeId)
  }, [applicationSettings.themeId])

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
    localStorage.setItem(EXPLORER_PREFS_STORAGE_KEY, JSON.stringify(explorerPrefsByWorkspace))
  }, [explorerPrefsByWorkspace])

  useEffect(() => {
    localStorage.setItem(WORKSPACE_DOCK_SIDE_STORAGE_KEY, workspaceDockSide)
  }, [workspaceDockSide])

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
    editorPanelsRef.current = editorPanels
  }, [editorPanels])

  useEffect(() => {
    focusedEditorIdRef.current = focusedEditorId
  }, [focusedEditorId])

  useEffect(() => {
    showWorkspaceWindowRef.current = showWorkspaceWindow
  }, [showWorkspaceWindow])

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
      setFocusedEditorId(null)
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
        if (available.codex.length === 0 && available.claude.length === 0 && available.gemini.length === 0) return
        setModelConfig((prev) => syncModelConfigWithCatalog(prev, available))
      } catch {
        // ignore - use built-in models only
      }
    })()
  }, [api])

  const resolvedProviderConfigs = useMemo(
    () => resolveProviderConfigs(providerRegistry),
    [providerRegistry],
  )

  useEffect(() => {
    if (!showAppSettingsModal || (appSettingsView !== 'connectivity' && appSettingsView !== 'diagnostics')) return
    setDiagnosticsError(null)
    void Promise.all(
      resolvedProviderConfigs.map(async (config) => {
        setProviderAuthLoadingByName((prev) => ({ ...prev, [config.id]: true }))
        try {
          const status = (await api.getProviderAuthStatus({
            id: config.id,
            cliCommand: config.cliCommand,
            cliPath: config.cliPath,
            authCheckCommand: config.authCheckCommand,
            loginCommand: config.loginCommand,
          })) as ProviderAuthStatus
          setProviderAuthByName((prev) => ({ ...prev, [config.id]: status }))
          setProviderAuthActionByName((prev) => ({ ...prev, [config.id]: null }))
        } catch (err) {
          setProviderAuthActionByName((prev) => ({
            ...prev,
            [config.id]: `Could not check ${config.displayName}: ${formatError(err)}`,
          }))
        } finally {
          setProviderAuthLoadingByName((prev) => ({ ...prev, [config.id]: false }))
        }
      }),
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
  }, [api, appSettingsView, showAppSettingsModal, resolvedProviderConfigs])

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
    dockTab,
    editorPanels,
    expandedDirectories,
    focusedEditorId,
    layoutMode,
    panels,
    selectedWorkspaceFile,
    showWorkspaceWindow,
    workspaceList,
    workspaceRoot,
    workspaceDockSide,
  ])

  useEffect(() => {
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
  }, [panels])

  useEffect(() => {
    const prefs = explorerPrefsByWorkspace[workspaceRoot] ?? DEFAULT_EXPLORER_PREFS
    setShowHiddenFiles(prefs.showHiddenFiles)
    setShowNodeModules(prefs.showNodeModules)
    setExpandedDirectories({})
    setFilePreview(null)
    setSelectedWorkspaceFile(null)
    setFocusedEditorId(null)
    void refreshWorkspaceTree(prefs)
    void refreshGitStatus()
  }, [workspaceRoot, api])

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
    setShowWorkspacePicker(true)
  }

  function closeWorkspacePicker() {
    setShowWorkspacePicker(false)
    setWorkspacePickerPrompt(null)
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
    if (normalizeWorkspacePathForCompare(next) === normalizeWorkspacePathForCompare(current)) return
    if (!current) {
      void (async () => {
        const openedRoot = await applyWorkspaceRoot(next, { showFailureAlert: true, rebindPanels: false })
        if (!openedRoot) return
        applyWorkspaceSnapshot(openedRoot)
        if (source === 'picker') closeWorkspacePicker()
        if (source === 'workspace-create') setShowWorkspaceModal(false)
      })()
      return
    }
    if (source === 'picker') closeWorkspacePicker()
    setPendingWorkspaceSwitch({ targetRoot: next, source })
  }

  async function confirmWorkspaceSwitch() {
    const pending = pendingWorkspaceSwitch
    if (!pending) return
    setPendingWorkspaceSwitch(null)

    const currentWorkspace = workspaceRootRef.current?.trim()
    const panelIds = [...new Set(panelsRef.current.map((panel) => panel.id))]
    if (currentWorkspace) {
      workspaceSnapshotsRef.current[currentWorkspace] = buildWorkspaceSnapshot(currentWorkspace)
    }

    const openedRoot = await applyWorkspaceRoot(pending.targetRoot, { showFailureAlert: true, rebindPanels: false })
    if (!openedRoot) return

    await Promise.all(panelIds.map((id) => api.disconnect(id).catch(() => {})))

    setPanels([])
    setEditorPanels([])
    setActivePanelId('default')
    setFocusedEditorId(null)
    setSelectedHistoryId('')
    setSelectedWorkspaceFile(null)
    setExpandedDirectories({})
    applyWorkspaceSnapshot(openedRoot)
    if (pending.source === 'picker') closeWorkspacePicker()
    if (pending.source === 'workspace-create') setShowWorkspaceModal(false)
  }

  useEffect(() => {
    if (!appStateHydrated) return
    setWorkspaceBootstrapComplete(false)
    let disposed = false
    const bootstrapWorkspace = async () => {
      const preferredRoot = workspaceRootRef.current?.trim()
      if (!preferredRoot) return

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
        alert('No workspace is available right now. Another Barnaby instance is already using each saved workspace.')
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
    const hasConversation = sanitizedMessages.some(
      (m) => m.role === 'user' || (m.role === 'assistant' && m.content.trim() !== STARTUP_READY_MESSAGE),
    )
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
    setFocusedEditorId(null)
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
      stickToBottomByPanelRef.current.delete(panelId)
      return
    }
    messageViewportRefs.current.set(panelId, el)
    stickToBottomByPanelRef.current.set(panelId, isViewportNearBottom(el))
  }

  function registerCodeBlockViewport(codeBlockId: string, el: HTMLPreElement | null) {
    if (!el) {
      codeBlockViewportRefs.current.delete(codeBlockId)
      stickToBottomByCodeBlockRef.current.delete(codeBlockId)
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
    setWorkspaceForm((prev) => ({ ...prev, path }))
  }

  function buildWorkspaceForm(mode: 'new' | 'edit') {
    const current =
      workspaceSettingsByPath[workspaceRoot] ??
      ({
        path: workspaceRoot,
        defaultModel: DEFAULT_MODEL,
        permissionMode: 'verify-first',
        sandbox: 'workspace-write',
        themeId: WORKSPACE_THEME_INHERIT,
      } as WorkspaceSettings)

    if (mode === 'new') {
      return {
        path: workspaceRoot,
        defaultModel: current.defaultModel ?? DEFAULT_MODEL,
        permissionMode: current.permissionMode ?? 'verify-first',
        sandbox: current.sandbox ?? 'workspace-write',
        themeId: normalizeWorkspaceThemeId(current.themeId ?? (current as any).themePresetId),
      } satisfies WorkspaceSettings
    }

    return {
      path: current.path || workspaceRoot,
      defaultModel: current.defaultModel ?? DEFAULT_MODEL,
      permissionMode: current.permissionMode ?? 'verify-first',
      sandbox: current.sandbox ?? 'workspace-write',
      themeId: normalizeWorkspaceThemeId(current.themeId ?? (current as any).themePresetId),
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
      themeId: normalizeWorkspaceThemeId((form as any).themeId ?? (form as any).themePresetId),
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
      left.themeId === right.themeId
    )
  }

  function openWorkspaceSettings(mode: 'new' | 'edit') {
    setWorkspaceModalMode(mode)
    setWorkspaceForm(buildWorkspaceForm(mode))
    setShowWorkspaceModal(true)
  }

  function openWorkspaceSettingsTab() {
    setWorkspaceForm(buildWorkspaceForm('edit'))
    setShowWorkspaceModal(false)
    setDockTab('settings')
  }

  async function saveWorkspaceSettings() {
    const next = normalizeWorkspaceSettingsForm(workspaceForm)
    if (!next.path) return

    try {
      await api.writeWorkspaceConfig?.(next.path)
    } catch {
      // best-effort only
    }

    setWorkspaceSettingsByPath((prev) => ({ ...prev, [next.path]: next }))
    setWorkspaceList((prev) => (prev.includes(next.path) ? prev : [next.path, ...prev]))
    setShowWorkspaceModal(false)
    requestWorkspaceSwitch(next.path, 'workspace-create')
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
        const last = msgs[msgs.length - 1]
        // Append only while this panel is actively streaming; otherwise start a fresh assistant message.
        if (w.streaming && last && last.role === 'assistant') {
          return {
            ...w,
            streaming: true,
            messages: [...msgs.slice(0, -1), { ...last, format: 'markdown', content: last.content + buf, createdAt: last.createdAt ?? Date.now() }],
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
  }

  function markPanelActivity(agentWindowId: string, evt: any) {
    const prev = activityLatestRef.current.get(agentWindowId)
    const entry = describeActivityEntry(evt)
    let recent = [...(prev?.recent ?? [])]
    if (entry) {
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
      markPanelActivity(agentWindowId, evt)

      if (evt?.type === 'status') {
        appendPanelDebug(agentWindowId, 'event:status', `${evt.status}${evt.message ? ` - ${evt.message}` : ''}`)
        setPanels((prev) =>
          prev.map((w) =>
            w.id !== agentWindowId
              ? w
              : {
                  ...w,
                  status: evt.message ?? evt.status,
                  connected: evt.status === 'ready',
                  streaming: evt.status === 'closed' ? false : w.streaming,
                  messages:
                    evt.status === 'error' && typeof evt.message === 'string'
                      ? withLimitWarningMessage(w.messages, evt.message)
                      : w.messages,
                },
          ),
        )
        if (evt.status === 'closed') {
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
        setPanels((prev) =>
          prev.map((w) => {
            if (w.id !== agentWindowId) return w
            const msgs = w.messages
            const last = msgs[msgs.length - 1]
            if (!last || last.role !== 'assistant') {
              const updated = { ...w, streaming: false }
              snapshotForHistory = updated
              return updated
            }
            let pendingInputs: string[] = w.pendingInputs
            let nextMessages: ChatMessage[] = [...msgs.slice(0, -1), { ...last, format: 'markdown' as const }]
            if (looksIncomplete(last.content)) {
              const count = autoContinueCountRef.current.get(agentWindowId) ?? 0
              if (count < MAX_AUTO_CONTINUE && w.pendingInputs.length === 0) {
                autoContinueCountRef.current.set(agentWindowId, count + 1)
                pendingInputs = [...w.pendingInputs, AUTO_CONTINUE_PROMPT]
              }
            } else {
              autoContinueCountRef.current.delete(agentWindowId)
            }
            const updated = { ...w, streaming: false, pendingInputs, messages: nextMessages }
            snapshotForHistory = updated
            return updated
          }),
        )
        if (snapshotForHistory) upsertPanelToHistory(snapshotForHistory)
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
        setAppSettingsView('preferences')
        setShowAppSettingsModal(true)
        return
      }
      if (action === 'openAppSettings' || action === 'openConnectivity' || action === 'openSettings') {
        setAppSettingsView('connectivity')
        setShowAppSettingsModal(true)
        return
      }
      if (action === 'openModelSetup') {
        setAppSettingsView('models')
        setShowAppSettingsModal(true)
        return
      }
      if (action === 'openPreferences') {
        setAppSettingsView('preferences')
        setShowAppSettingsModal(true)
        return
      }
      if (action === 'openAgents') {
        setAppSettingsView('agents')
        setShowAppSettingsModal(true)
        return
      }
      if (action === 'openDiagnostics') {
        setAppSettingsView('diagnostics')
        setShowAppSettingsModal(true)
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
    })

    return () => {
      unsubEvent?.()
      unsubMenu?.()
    }
  }, [api, workspaceList, workspaceRoot])

  function estimateTokenCountFromText(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return 0
    const charBased = Math.ceil(trimmed.length / TOKEN_ESTIMATE_CHARS_PER_TOKEN)
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length
    const wordBased = Math.ceil(wordCount * TOKEN_ESTIMATE_WORDS_MULTIPLIER)
    return Math.max(charBased, wordBased)
  }

  function getKnownContextTokensForModel(model: string, provider: ModelProvider): number | null {
    if (provider !== 'codex') return null
    const normalized = model.trim().toLowerCase()
    if (!normalized.startsWith('gpt-')) return null
    if (normalized.startsWith('gpt-5')) return DEFAULT_GPT_CONTEXT_TOKENS
    return DEFAULT_GPT_CONTEXT_TOKENS
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
    if (mode === 'workspace-write') return 'Can edit files and run commands inside the workspace folder.'
    return 'Full access to your machine. Use only when necessary.'
  }

  function formatError(err: unknown) {
    if (err instanceof Error && err.message) return err.message
    return String(err ?? 'Unknown error')
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
    const status = (await api.getProviderAuthStatus({
      id: config.id,
      cliCommand: config.cliCommand,
      cliPath: config.cliPath,
      authCheckCommand: config.authCheckCommand,
      loginCommand: config.loginCommand,
    })) as ProviderAuthStatus
    if (!status.installed) {
      throw new Error(`${config.displayName} CLI is not installed. ${status.detail}`.trim())
    }
    if (status.authenticated) return
    throw new Error(
      `${config.displayName} login required for ${reason}. ${status.detail}\nLogin outside the app, then send again.`,
    )
  }

  async function refreshProviderAuthStatus(config: ProviderConfig) {
    setProviderAuthLoadingByName((prev) => ({ ...prev, [config.id]: true }))
    try {
      const status = (await api.getProviderAuthStatus({
        id: config.id,
        cliCommand: config.cliCommand,
        cliPath: config.cliPath,
        authCheckCommand: config.authCheckCommand,
        loginCommand: config.loginCommand,
      })) as ProviderAuthStatus
      setProviderAuthByName((prev) => ({ ...prev, [config.id]: status }))
      setProviderAuthActionByName((prev) => ({ ...prev, [config.id]: null }))
    } catch (err) {
      setProviderAuthActionByName((prev) => ({
        ...prev,
        [config.id]: `Could not check ${config.displayName}: ${formatError(err)}`,
      }))
    } finally {
      setProviderAuthLoadingByName((prev) => ({ ...prev, [config.id]: false }))
    }
  }

  async function refreshAllProviderAuthStatuses() {
    await Promise.all(resolvedProviderConfigs.map((config) => refreshProviderAuthStatus(config)))
  }

  async function startProviderLoginFlow(config: ProviderConfig) {
    setProviderAuthActionByName((prev) => ({ ...prev, [config.id]: null }))
    try {
      const result = await api.startProviderLogin({
        id: config.id,
        cliCommand: config.cliCommand,
        cliPath: config.cliPath,
        authCheckCommand: config.authCheckCommand,
        loginCommand: config.loginCommand,
      })
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

  function setExplorerPrefs(next: ExplorerPrefs) {
    setShowHiddenFiles(next.showHiddenFiles)
    setShowNodeModules(next.showNodeModules)
    if (!workspaceRoot) return
    setExplorerPrefsByWorkspace((prev) => ({ ...prev, [workspaceRoot]: next }))
  }

  async function openFilePreview(relativePath: string) {
    setSelectedWorkspaceFile(relativePath)
    setFilePreview({
      relativePath,
      size: 0,
      truncated: false,
      binary: false,
      content: '',
      loading: true,
    })
    try {
      const result = await api.readWorkspaceFile(workspaceRoot, relativePath)
      setFilePreview({
        relativePath: result.relativePath,
        size: result.size,
        truncated: result.truncated,
        binary: result.binary,
        content: result.content,
        loading: false,
      })
    } catch (err) {
      setFilePreview({
        relativePath,
        size: 0,
        truncated: false,
        binary: false,
        content: '',
        loading: false,
        error: formatError(err),
      })
    }
  }

  async function openEditorForRelativePath(relativePath: string) {
    if (!workspaceRoot || !relativePath) return
    const existing = editorPanelsRef.current.find((p) => p.workspaceRoot === workspaceRoot && p.relativePath === relativePath)
    if (existing) {
      setFocusedEditorId(existing.id)
      return
    }

    const id = `editor-${newId()}`
    const title = fileNameFromRelativePath(relativePath)
    setEditorPanels((prev) => [
      ...prev,
      {
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
      },
    ])
    setFocusedEditorId(id)
    try {
      const result = await api.readWorkspaceTextFile(workspaceRoot, relativePath)
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
    setEditorPanels((prev) => prev.map((p) => (p.id === editorId ? { ...p, saving: true, error: undefined } : p)))
    try {
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
    setEditorPanels((prev) => prev.filter((p) => p.id !== editorId))
    if (focusedEditorId === editorId) setFocusedEditorId(null)
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

  function renderWorkspaceTile() {
    return (
      <div
        data-workspace-window-root="true"
        className="h-full min-h-0 min-w-0 flex flex-col border border-neutral-200/80 dark:border-neutral-800 rounded-lg overflow-hidden bg-neutral-50 dark:bg-neutral-900 font-mono"
        onMouseDownCapture={() => setFocusedEditorId(null)}
      >
        <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
          <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Workspace Window</div>
        </div>
        <div className="px-2.5 py-2 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center gap-1.5 bg-neutral-100 dark:bg-neutral-900/80">
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
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="2.5" y="2.5" width="11" height="11" rx="1.8" stroke="currentColor" strokeWidth="1.1" />
                <circle cx="6" cy="6" r="1.2" fill="currentColor" />
                <circle cx="10" cy="6" r="1.2" fill="currentColor" />
                <circle cx="8" cy="10" r="1.2" fill="currentColor" />
                <path d="M7 6H9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                <path d="M6.7 6.8L7.6 9.2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                <path d="M9.3 6.8L8.4 9.2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
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
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
          zoomEditorFont(panel.id, e.deltaY)
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
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
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
            <textarea
              className="h-full w-full resize-none border-0 outline-none p-4 m-0 text-[12px] leading-5 font-mono whitespace-pre bg-white dark:bg-neutral-950 text-blue-950 dark:text-blue-100"
              style={{ fontSize: `${editorFontSizePx}px`, lineHeight: `${editorLineHeightPx}px` }}
              value={panel.content}
              onFocus={() => setFocusedEditorId(panel.id)}
              onChange={(e) => updateEditorContent(panel.id, e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                  e.preventDefault()
                  if (e.shiftKey) void saveEditorPanelAs(panel.id)
                  else void saveEditorPanel(panel.id)
                }
              }}
              spellCheck={false}
            />
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
    const agentPanel = panels.find((w) => w.id === panelId)
    if (agentPanel) return renderPanelContent(agentPanel)
    const editorPanel = editorPanels.find((w) => w.id === panelId)
    if (editorPanel) return renderEditorPanel(editorPanel)
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
            <Panel id={`grid-row-${rowIdx}`} defaultSize={100 / rows} minSize={10} className="min-h-0 min-w-0">
              <Group orientation="horizontal" className="h-full min-w-0" id={`grid-row-${rowIdx}-inner`}>
                {rowPanels.map((panelId, colIdx) => (
                  <React.Fragment key={panelId}>
                    {colIdx > 0 && <Separator className="w-1 bg-neutral-300 dark:bg-neutral-700 hover:bg-blue-400" />}
                    <Panel id={`panel-${panelId}`} defaultSize={100 / rowPanels.length} minSize={15} className="min-h-0 min-w-0">
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
  ) {
    const mi = modelConfig.interfaces.find((m) => m.id === model)
    await withTimeout(
      api.connect(winId, {
        model,
        cwd,
        permissionMode,
        approvalPolicy: permissionMode === 'proceed-always' ? 'never' : 'on-request',
        sandbox,
        provider: mi?.provider ?? 'codex',
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
    if (provider === 'codex' && w.messages.length > 0) {
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
      await connectWindow(winId, w.model, w.cwd, w.permissionMode, w.sandbox, initialHistory)
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
  ) {
    try {
      await connectWindow(winId, model, cwd, permissionMode, sandbox, initialHistory)
      return
    } catch {
      await connectWindow(winId, model, cwd, permissionMode, sandbox, initialHistory)
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
    const modePrompt = INTERACTION_MODE_META[interactionMode].promptPrefix
    const outgoingText = modePrompt ? `${modePrompt}\n\n${text}` : text

    // Resolve @file mentions
    const resolvedText = await (async () => {
      const mentions = Array.from(text.matchAll(/@([^\s]+)/g))
      if (mentions.length === 0) return outgoingText
      
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
      return outgoingText + context
    })()

    try {
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
      if (needContext && provider === 'codex') {
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
        await connectWindowWithRetry(winId, w.model, w.cwd, w.permissionMode, w.sandbox, initialHistory)
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
        w.messages.length > 0 &&
        (needContext || needsContextOnNextCodexSendRef.current[winId])
      const priorMessagesForContext = needsPriorMessages
        ? w.messages.map((m) => ({ role: m.role, content: m.content ?? '' }))
        : undefined
      await withTimeout(
        api.sendMessage(winId, resolvedText, imagePaths, priorMessagesForContext),
        TURN_START_TIMEOUT_MS,
        'turn/start',
      )
      if (needsPriorMessages) {
        needsContextOnNextCodexSendRef.current[winId] = false
      }
      appendPanelDebug(winId, 'turn/start', 'Turn started')
    } catch (e: any) {
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
    setPanels((prev) =>
      prev.map((x) => {
        if (x.id !== winId) return x
        if (x.streaming || x.pendingInputs.length === 0) return x
        const [head, ...rest] = x.pendingInputs
        nextText = head
        return { ...x, streaming: true, pendingInputs: rest }
      }),
    )
    if (nextText) void sendToAgent(winId, nextText)
  }

  function sendMessage(winId: string) {
    const w = panels.find((x) => x.id === winId)
    if (!w) return
    const text = w.input.trim()
    const messageAttachments = w.attachments.map((a) => ({ ...a }))
    const imagePaths = messageAttachments.map((a) => a.path)
    if (!text && imagePaths.length === 0) return
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
    let snapshotForHistory: AgentPanelState | null = null
    setPanels((prev) =>
      prev.map((x) => {
        if (x.id !== winId) return x
        if (isBusy) {
          appendPanelDebug(winId, 'queue', `Panel busy - queued message (${text.length} chars)`)
          const queuedMessage: ChatMessage = { id: newId(), role: 'user', content: text, format: 'text', createdAt: Date.now() }
          const updated: AgentPanelState = {
            ...x,
            input: '',
            pendingInputs: [...x.pendingInputs, text],
            messages: [...x.messages, queuedMessage],
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

  async function closePanel(panelId: string) {
    const panel = panelsRef.current.find((w) => w.id === panelId)
    if (panel) upsertPanelToHistory(panel)
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
            messages: withReadyAck(withModelBanner(w.messages, nextModel)),
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
        p.id === panelId
          ? {
              ...p,
              sandbox: next,
              permissionMode: next === 'read-only' ? 'verify-first' : p.permissionMode,
              connected: false,
              status:
                next === 'read-only'
                  ? 'Sandbox set to read-only. Permissions locked to Verify first.'
                  : `Sandbox set to ${next} (reconnect on next send).`,
            }
          : p,
      ),
    )
    setSettingsPopoverByPanel((prev) => ({ ...prev, [panelId]: null }))
  }

  function setPanelPermission(panelId: string, next: PermissionMode) {
    setPanels((prev) =>
      prev.map((p) =>
        p.id === panelId
          ? {
              ...p,
              permissionMode: next,
              connected: false,
              status:
                next === 'proceed-always'
                  ? 'Permissions set: Proceed always (reconnect on next send).'
                  : 'Permissions set: Verify first (reconnect on next send).',
            }
          : p,
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
          onClick={() => openFilePreview(node.relativePath)}
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
                className="h-7 w-7 inline-flex items-center justify-center rounded border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                onClick={() => refreshWorkspaceTree()}
                title="Refresh workspace folder"
                aria-label="Refresh workspace folder"
              >
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M10 6A4 4 0 1 1 8.83 3.17" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M10 2.5V4.5H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                className="h-7 w-7 inline-flex items-center justify-center rounded border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                onClick={expandAllDirectories}
                title="Expand all"
                aria-label="Expand all"
              >
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M3 2.5L6 5.5L9 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 5.5L6 8.5L9 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                className="h-7 w-7 inline-flex items-center justify-center rounded border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                onClick={collapseAllDirectories}
                title="Collapse all"
                aria-label="Collapse all"
              >
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
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
    return (
      <div className="h-full min-h-0 flex flex-col bg-neutral-50 dark:bg-neutral-900">
        <div className="px-3 py-3 border-b border-neutral-200/80 dark:border-neutral-800 text-xs flex items-center justify-between">
          <span className="font-medium text-neutral-700 dark:text-neutral-300">Git status (view only)</span>
          <button
            type="button"
            className={UI_BUTTON_SECONDARY_CLASS}
            onClick={refreshGitStatus}
          >
            Refresh
          </button>
        </div>
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
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-0.5">
          {gitStatusLoading && <p className="text-xs text-neutral-500 dark:text-neutral-400 px-1">Loading git status...</p>}
          {!gitStatusLoading && gitStatusError && <p className="text-xs text-red-600 dark:text-red-400 px-1">{gitStatusError}</p>}
          {!gitStatusLoading && canShowEntries && gitStatus?.clean && (
            <div className="m-1 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 px-3 py-4 text-xs text-neutral-500 dark:text-neutral-400">
              Working tree clean.
            </div>
          )}
          {!gitStatusLoading && canShowEntries && gitStatus?.entries.map((entry) => (
            <button
              key={`${entry.relativePath}-${entry.indexStatus}-${entry.workingTreeStatus}`}
              type="button"
              className="w-full text-left px-2.5 py-1 rounded-md text-xs font-mono border border-transparent bg-transparent hover:bg-neutral-100/80 dark:hover:bg-neutral-800/60 active:bg-neutral-200/60 dark:active:bg-neutral-700/60 hover:border-neutral-300 dark:hover:border-neutral-600 text-neutral-800 dark:text-neutral-200"
              onClick={() => openFilePreview(entry.relativePath)}
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
          ))}
        </div>
      </div>
    )
  }

  function renderWorkspaceSettingsPane() {
    const baselineForm = buildWorkspaceForm('edit')
    const isWorkspaceSettingsDirty = !workspaceFormsEqual(workspaceForm, baselineForm)
    const canSaveWorkspaceSettings = isWorkspaceSettingsDirty && Boolean(workspaceForm.path.trim())
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
                />
                <button
                  type="button"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  onClick={browseForWorkspaceIntoForm}
                  title="Browse for workspace folder"
                  aria-label="Browse for workspace folder"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
                  setWorkspaceForm((prev) => ({ ...prev, defaultModel: e.target.value }))
                }
              >
                {getModelOptions(workspaceForm.defaultModel).map((id) => {
                  const mi = modelConfig.interfaces.find((m) => m.id === id)
                  return (
                    <option key={id} value={id}>
                      {mi?.displayName ?? id}
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
                  setWorkspaceForm((prev) => {
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
                <option value="danger-full-access">Danger full access</option>
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
                    setWorkspaceForm((prev) => ({
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
            <div className="space-y-1.5">
              <label className="text-neutral-600 dark:text-neutral-300">Theme</label>
              <select
                className={`w-full ${UI_SELECT_CLASS}`}
                value={workspaceForm.themeId}
                onChange={(e) =>
                  setWorkspaceForm((prev) => ({
                    ...prev,
                    themeId: normalizeWorkspaceThemeId(e.target.value),
                  }))
                }
              >
                <option value={WORKSPACE_THEME_INHERIT}>Use application setting</option>
                {THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <span className="text-neutral-600 dark:text-neutral-300">Timeline controls</span>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Debug and trace visibility is now global.
              </div>
              <button
                type="button"
                className="h-7 px-2 inline-flex items-center rounded-md border border-neutral-300 bg-white text-xs text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                onClick={() => {
                  setShowWorkspaceModal(false)
                  setAppSettingsView('connectivity')
                  setShowAppSettingsModal(true)
                }}
              >
                Open Application Settings
              </button>
              <div className="pt-1 flex items-center gap-1.5">
                <button
                  type="button"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  onClick={() => void saveWorkspaceSettings()}
                  disabled={!canSaveWorkspaceSettings}
                  title="Save workspace settings"
                  aria-label="Save workspace settings"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3 3.2H11.6L13 4.6V12.8H3V3.2Z" stroke="currentColor" strokeWidth="1.1" />
                    <path d="M5 3.2V6.6H10.7V3.2" stroke="currentColor" strokeWidth="1.1" />
                    <rect x="5" y="9.2" width="6" height="2.6" stroke="currentColor" strokeWidth="1.1" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  onClick={() => setWorkspaceForm(baselineForm)}
                  disabled={!isWorkspaceSettingsDirty}
                  title="Revert unsaved changes"
                  aria-label="Revert unsaved changes"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M5.2 5.1H2.8V2.7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M2.8 5.1C3.8 3.8 5.3 3 7 3C9.9 3 12.2 5.3 12.2 8.2C12.2 11.1 9.9 13.4 7 13.4C5.4 13.4 4 12.7 3.1 11.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  function renderAgentOrchestratorPane() {
    return (
      <div className="h-full min-h-0 flex flex-col bg-neutral-50 dark:bg-neutral-900">
        <div className="px-3 py-3 border-b border-neutral-200/80 dark:border-neutral-800 text-xs">
          <div className="font-medium text-neutral-700 dark:text-neutral-300">Agent Orchestrator</div>
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2 py-1 text-[11px] text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            onClick={() => window.open('https://barnaby.build/orchestrator', '_blank', 'noopener,noreferrer')}
          >
            More Informatin
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="theme-preset h-screen w-full min-w-0 max-w-full overflow-hidden flex flex-col bg-neutral-100 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
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
      <div className="shrink-0 border-b border-neutral-200/80 dark:border-neutral-800 px-4 py-3 bg-white dark:bg-neutral-950">
        <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
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
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className={`${UI_ICON_BUTTON_CLASS} shrink-0`}
              onClick={() => openWorkspaceSettings('edit')}
              title="Edit selected workspace"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 11.5L3.6 9.2L10.6 2.2L12.8 4.4L5.8 11.4L3 12Z" stroke="currentColor" strokeWidth="1.2" />
                <path d="M8.5 3.9L11.1 6.5" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
            <div className="mx-2 h-6 w-px bg-neutral-300/80 dark:bg-neutral-700/80" />
            <span className="text-neutral-600 dark:text-neutral-300">History</span>
            <select
              className={`h-9 px-3 rounded-lg shadow-sm w-[30vw] max-w-[360px] min-w-[180px] ${UI_INPUT_CLASS}`}
              value={selectedHistoryId}
              onChange={(e) => {
                const historyId = e.target.value
                setSelectedHistoryId(historyId)
                if (!historyId) return
                openChatFromHistory(historyId)
                setSelectedHistoryId('')
              }}
            >
              <option value="">Open chat...</option>
              {workspaceScopedHistory.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {formatHistoryOptionLabel(entry)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`${UI_ICON_BUTTON_CLASS} shrink-0 disabled:opacity-50 disabled:cursor-not-allowed`}
              onClick={() => createAgentPanel()}
              title={panels.length >= MAX_PANELS ? `Maximum ${MAX_PANELS} chats open` : 'New chat'}
              aria-label="New chat"
              disabled={panels.length >= MAX_PANELS}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              className={`h-9 w-9 inline-flex items-center justify-center rounded-lg border shadow-sm ${
                layoutMode === 'horizontal' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200' : 'border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
              }`}
              onClick={() => setLayoutMode('horizontal')}
              title="Split horizontal (H)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2.5" y="3" width="11" height="5" rx="1" stroke="currentColor" />
                <rect x="2.5" y="8" width="11" height="5" rx="1" stroke="currentColor" />
              </svg>
            </button>
            <button
              className={`h-9 w-9 inline-flex items-center justify-center rounded-lg border shadow-sm ${
                layoutMode === 'vertical' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200' : 'border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
              }`}
              onClick={() => setLayoutMode('vertical')}
              title="Split vertical (V)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2.5" y="3" width="5.5" height="10" rx="1" stroke="currentColor" />
                <rect x="8" y="3" width="5.5" height="10" rx="1" stroke="currentColor" />
              </svg>
            </button>
            <button
              className={`h-9 w-9 inline-flex items-center justify-center rounded-lg border shadow-sm ${
                layoutMode === 'grid' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200' : 'border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
              }`}
              onClick={() => setLayoutMode('grid')}
              title="Tile / Grid"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="3" y="3" width="4.5" height="4.5" rx="1" stroke="currentColor" />
                <rect x="8.5" y="3" width="4.5" height="4.5" rx="1" stroke="currentColor" />
                <rect x="3" y="8.5" width="4.5" height="4.5" rx="1" stroke="currentColor" />
                <rect x="8.5" y="8.5" width="4.5" height="4.5" rx="1" stroke="currentColor" />
              </svg>
            </button>
            <button
              className={UI_ICON_BUTTON_CLASS}
              onClick={() => setShowWorkspaceWindow((prev) => !prev)}
              title={showWorkspaceWindow ? 'Hide workspace window' : 'Show workspace window'}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2.2" y="2.5" width="11.6" height="11" rx="1.2" stroke="currentColor" strokeWidth="1.1" />
                <path
                  d="M10 3.3H13V12.7H10Z"
                  fill="currentColor"
                  fillOpacity={showWorkspaceWindow ? 0.38 : 0.2}
                />
                <path d="M10 3.2V12.8" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 min-w-0 bg-gradient-to-b from-neutral-100/90 to-neutral-100/60 dark:from-neutral-900 dark:to-neutral-950">
        <div ref={layoutRef} className="h-full flex flex-col min-h-0 min-w-0">
          {(() => {
            const contentPaneIds = [...panels.map((p) => p.id), ...editorPanels.map((p) => p.id)]
            const layoutPaneIds = showWorkspaceWindow
              ? workspaceDockSide === 'left'
                ? ['workspace-window', ...contentPaneIds]
                : [...contentPaneIds, 'workspace-window']
              : contentPaneIds
            if (layoutPaneIds.length === 1) {
              const id = layoutPaneIds[0]
              if (id === 'workspace-window') {
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
            if (layoutMode === 'grid') {
              return renderGridLayout(layoutPaneIds as string[])
            }
            return (
              (() => {
                // UX naming:
                // - "Horizontal" means a horizontal split line (stacked panes, top/bottom)
                // - "Vertical" means a vertical split line (side-by-side panes, left/right)
                // react-resizable-panels uses orientation as the pane flow direction, so we map accordingly.
                const paneFlowOrientation = layoutMode === 'horizontal' ? 'vertical' : 'horizontal'
                const contentPaneCount = panels.length + editorPanels.length
                const layoutGroupKey = `${paneFlowOrientation}:${workspaceDockSide}:${showWorkspaceWindow ? '1' : '0'}:${layoutPaneIds.join('|')}`
                return (
                  <Group key={layoutGroupKey} orientation={paneFlowOrientation} className="flex-1 min-h-0 min-w-0" id="main-layout">
                    {(layoutPaneIds as string[]).map((panelId, idx) => (
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
                          defaultSize={
                            paneFlowOrientation === 'horizontal' && showWorkspaceWindow
                              ? panelId === 'workspace-window'
                                ? 20
                                : 80 / Math.max(1, contentPaneCount)
                              : 100 / layoutPaneIds.length
                          }
                          minSize={15}
                          className="min-h-0 min-w-0"
                        >
                          {renderLayoutPane(panelId)}
                        </Panel>
                      </React.Fragment>
                    ))}
                  </Group>
                )
              })()
            )
          })()}
        </div>
      </div>

      <footer className="shrink-0 px-4 py-2 border-t border-neutral-200/80 dark:border-neutral-800 bg-white/85 dark:bg-neutral-950 text-xs text-neutral-600 dark:text-neutral-400 flex items-center gap-4 backdrop-blur">
        <span className="font-mono truncate max-w-[40ch]" title={workspaceRoot}>
          {workspaceRoot.split(/[/\\]/).pop() || workspaceRoot}
        </span>
        <span>{panels.length} agent{panels.length !== 1 ? 's' : ''}</span>
        {(() => {
          const withUsage = panels.filter((p) => getRateLimitPercent(p.usage) !== null)
          if (withUsage.length === 0) return null
          const worst = withUsage.reduce((a, p) => {
            const pct = getRateLimitPercent(p.usage) ?? 0
            return pct > (getRateLimitPercent(a.usage) ?? 0) ? p : a
          })
          const label = formatRateLimitLabel(worst.usage)
          return label ? <span>Usage: {label}</span> : null
        })()}
      </footer>

      {filePreview && (
        <div
          className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => setFilePreview(null)}
        >
          <div
            className="w-[72vw] h-[72vh] min-w-[520px] min-h-[320px] max-w-[90vw] max-h-[90vh] resize overflow-hidden rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white/95 dark:bg-neutral-950 shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0 flex-1 text-xs font-mono truncate" title={filePreview.relativePath}>
                {filePreview.relativePath}
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <button
                  type="button"
                  className="px-2 py-1 text-xs rounded border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 disabled:opacity-50"
                  disabled={filePreview.loading || Boolean(filePreview.error) || filePreview.binary}
                  onClick={() => {
                    void openEditorForRelativePath(filePreview.relativePath)
                    setFilePreview(null)
                  }}
                >
                  Open in Editor
                </button>
                <button
                  type="button"
                  className="px-2 py-1 text-xs rounded border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 disabled:opacity-50"
                  disabled={filePreview.loading}
                  onClick={() => openFilePreview(filePreview.relativePath)}
                >
                  Refresh
                </button>
                <button
                  type="button"
                  className={UI_CLOSE_ICON_BUTTON_CLASS}
                  onClick={() => setFilePreview(null)}
                  title="Close preview"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto bg-neutral-50 dark:bg-neutral-900">
              {filePreview.loading && (
                <div className="p-4 text-sm text-neutral-600 dark:text-neutral-400">Loading file preview...</div>
              )}
              {!filePreview.loading && filePreview.error && (
                <div className="p-4 text-sm text-red-600 dark:text-red-400">{filePreview.error}</div>
              )}
              {!filePreview.loading && !filePreview.error && filePreview.binary && (
                <div className="p-4 text-sm text-neutral-600 dark:text-neutral-400">
                  Binary file preview is not supported.
                </div>
              )}
              {!filePreview.loading && !filePreview.error && !filePreview.binary && (
                <pre className="p-4 m-0 text-[12px] leading-5 font-mono whitespace-pre overflow-auto text-blue-950 dark:text-blue-100 bg-blue-50/60 dark:bg-blue-950/20">
                  {filePreview.content}
                </pre>
              )}
            </div>
            <div className="px-3 py-1.5 border-t border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center justify-between">
              <span>{Math.round(filePreview.size / 1024)} KB</span>
              <span>{filePreview.truncated ? 'Preview truncated at 1 MB.' : 'Read-only preview.'}</span>
            </div>
          </div>
        </div>
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
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-2 text-sm max-h-72 overflow-y-auto">
              {THEMES.map((t) => (
                <label key={t.id} className="flex items-center gap-2 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800/50 rounded px-2 py-1 -mx-2 -my-0.5">
                  <input
                    type="radio"
                    name="theme"
                    checked={applicationSettings.themeId === t.id}
                    onChange={() =>
                      setApplicationSettings((prev) => ({
                        ...prev,
                        themeId: t.id,
                      }))
                    }
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

      {showAppSettingsModal && (
        <div className={MODAL_BACKDROP_CLASS}>
          <div className={`w-full max-w-2xl ${MODAL_CARD_CLASS} max-h-[90vh] flex flex-col`}>
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0">
              <div className="font-medium">Settings</div>
              <button
                className={UI_CLOSE_ICON_BUTTON_CLASS}
                onClick={() => setShowAppSettingsModal(false)}
                title="Close"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
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
                  {view === 'connectivity' && 'CLI Connectivity'}
                  {view === 'models' && 'Models'}
                  {view === 'preferences' && 'Preferences'}
                  {view === 'agents' && 'Agents'}
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
                    className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                    onClick={async () => {
                      setModelCatalogRefreshPending(true)
                      setModelCatalogRefreshStatus(null)
                      try {
                        const available = await api.getAvailableModels()
                        if (available.codex.length === 0 && available.claude.length === 0 && available.gemini.length === 0) {
                          setModelCatalogRefreshStatus({ kind: 'error', message: 'Catalog refresh failed: no models were returned.' })
                          return
                        }
                        setModelConfig((prev) => syncModelConfigWithCatalog(prev, available))
                        setModelCatalogRefreshStatus({ kind: 'success', message: 'Models refreshed from catalog.' })
                      } catch (err) {
                        setModelCatalogRefreshStatus({ kind: 'error', message: `Catalog refresh failed: ${formatError(err)}` })
                      } finally {
                        setModelCatalogRefreshPending(false)
                      }
                    }}
                    disabled={modelCatalogRefreshPending}
                  >
                    {modelCatalogRefreshPending ? 'Refreshing models...' : 'Refresh models from catalog'}
                  </button>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">Fetches from barnaby.build</span>
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
                      <option value="codex">Codex (ChatGPT)</option>
                      <option value="claude">Claude (CLI subscription)</option>
                      <option value="gemini">Gemini (CLI subscription)</option>
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
                        const idx = modelConfig.interfaces.findIndex((m) => m.id === editingModel.id)
                        const next = [...modelConfig.interfaces]
                        if (idx >= 0) next[idx] = modelForm
                        else next.push(modelForm)
                        setModelConfig({ interfaces: next })
                        setEditingModel(null)
                      }}
                    >
                      Save
                    </button>
                    <button
                      className="px-3 py-1.5 text-sm rounded border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                      onClick={() => setEditingModel(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {modelConfig.interfaces.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                      >
                        <div>
                          <span className="font-medium">{m.displayName || m.id}</span>
                          <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-2">
                            {m.provider} {!m.enabled && '(disabled)'}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            className="px-2 py-1 text-xs rounded border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                            onClick={() => {
                              setModelForm({ ...m })
                              setEditingModel(m)
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="px-2 py-1 text-xs rounded border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                            onClick={() => {
                              setModelConfig({
                                interfaces: modelConfig.interfaces.filter((x) => x.id !== m.id),
                              })
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    className="mt-4 px-3 py-1.5 text-sm rounded border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                    onClick={() => {
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

              <section className="space-y-3">
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Appearance</div>
                <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
                  <div className="text-xs text-neutral-600 dark:text-neutral-400 mb-2">Theme</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                    {THEMES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() =>
                          setApplicationSettings((prev) => ({
                            ...prev,
                            themeId: t.id,
                          }))
                        }
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
                </div>
              </section>
                </>
              )}

              {appSettingsView === 'connectivity' && (
                <>
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">CLI Connectivity</div>
                  <button
                    type="button"
                    className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                    onClick={() => void refreshAllProviderAuthStatuses()}
                  >
                    Re-check all
                  </button>
                </div>
                <div className="text-xs text-neutral-600 dark:text-neutral-400">
                  Barnaby uses your locally installed CLI sessions. These checks run automatically when this dialog opens and do not enable providers;
                  they only read local install/login state.
                </div>
                <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 space-y-2 bg-white/60 dark:bg-neutral-950/40">
                  <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
                    Provider coverage
                  </div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400">
                    CODEX: full support (connectivity checks + model routing in panels).
                  </div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400">
                    CLAUDE: full support (connectivity checks + model routing in panels).
                  </div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400">
                    GEMINI: full support (connectivity checks + model routing in panels).
                  </div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400">
                    Other CLIs: possible if they support non-interactive prompt execution, but adapters are not implemented in this build.
                  </div>
                </div>
                <div className="space-y-2">
                  {resolvedProviderConfigs.map((config) => {
                    const status = providerAuthByName[config.id]
                    const loading = providerAuthLoadingByName[config.id]
                    const action = providerAuthActionByName[config.id]
                    const statusLabel = !status
                      ? 'Unknown'
                      : !status.installed
                        ? 'Not installed'
                        : status.authenticated
                          ? 'Connected'
                          : 'Login required'
                    const statusClass = !status
                      ? 'border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300'
                      : !status.installed
                        ? 'border-red-300 text-red-700 dark:border-red-800 dark:text-red-300'
                        : status.authenticated
                          ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300'
                          : 'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300'
                    const isBuiltIn = config.isBuiltIn ?? CONNECTIVITY_PROVIDERS.includes(config.id as ConnectivityProvider)
                    const override = providerRegistry.overrides[config.id]
                    return (
                      <div
                        key={config.id}
                        className={`rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 space-y-2 bg-white/60 dark:bg-neutral-950/40 ${!config.enabled ? 'opacity-60' : ''}`}
                      >
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
                              <span className="font-medium text-sm text-neutral-800 dark:text-neutral-200">
                                {config.displayName}
                                {!isBuiltIn && (
                                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400 ml-1">(custom)</span>
                                )}
                              </span>
                            </label>
                            <div className={`px-2 py-0.5 rounded-full text-[11px] border ${statusClass}`}>{statusLabel}</div>
                          </div>
                          {!isBuiltIn && (
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className="px-2 py-1 text-xs rounded border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                                onClick={() => {
                                  setEditingProvider(config)
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
                          </div>
                        )}
                        <div className="text-xs text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap break-words">
                          {loading ? `Checking ${config.displayName}...` : status?.detail || 'No status yet.'}
                        </div>
                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          Checked: {status?.checkedAt ? formatCheckedAt(status.checkedAt) : 'Never'}
                        </div>
                        {config.enabled && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-xs disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                              disabled={loading}
                              onClick={() => void refreshProviderAuthStatus(config)}
                            >
                              {loading ? 'Checking...' : 'Re-check'}
                            </button>
                            <button
                              type="button"
                              className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-xs disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                              disabled={loading}
                              onClick={() => void startProviderLoginFlow(config)}
                            >
                              {status?.authenticated ? 'Re-authenticate' : 'Open login'}
                            </button>
                            {(config.upgradeCommand || config.upgradePackage) && (
                              <button
                                type="button"
                                className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-xs disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                                disabled={loading}
                                onClick={() => void startProviderUpgradeFlow(config)}
                                title={
                                  config.upgradePackage
                                    ? `Clean reinstall: npm uninstall -g ${config.upgradePackage}; npm install -g ${config.upgradePackage}@latest`
                                    : config.upgradeCommand
                                }
                              >
                                Upgrade CLI
                              </button>
                            )}
                            {action && <span className="text-xs text-neutral-600 dark:text-neutral-400">{action}</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <button
                  type="button"
                  className="mt-2 px-3 py-1.5 text-sm rounded border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700"
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

              {appSettingsView === 'diagnostics' && (
                <>
              <section className="space-y-3">
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Chat timeline</div>
                <div className="space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
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
                    <span style={{ color: applicationSettings.diagnosticsMessageColors.debugNote }}>
                      Inject debug notes into chat timeline
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(applicationSettings.showActivityUpdates)}
                      onChange={(e) =>
                        setApplicationSettings((prev) => ({
                          ...prev,
                          showActivityUpdates: e.target.checked,
                        }))
                      }
                    />
                    <span style={{ color: applicationSettings.diagnosticsMessageColors.activityUpdate }}>
                      Show activity updates in chat timeline
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(applicationSettings.showReasoningUpdates)}
                      onChange={(e) =>
                        setApplicationSettings((prev) => ({
                          ...prev,
                          showReasoningUpdates: e.target.checked,
                        }))
                      }
                    />
                    <span style={{ color: applicationSettings.diagnosticsMessageColors.reasoningUpdate }}>
                      Show reasoning updates in chat timeline
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(applicationSettings.showOperationTrace)}
                      onChange={(e) =>
                        setApplicationSettings((prev) => ({
                          ...prev,
                          showOperationTrace: e.target.checked,
                        }))
                      }
                    />
                    <span style={{ color: applicationSettings.diagnosticsMessageColors.operationTrace }}>
                      Show operation trace in chat timeline
                    </span>
                  </label>
                </div>
                <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3 dark:border-neutral-700 dark:bg-neutral-900/50">
                  <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Message colors</div>
                  <div className="mt-2 space-y-2">
                    {DIAGNOSTICS_MESSAGE_COLOR_FIELDS.map((field) => {
                      const value = applicationSettings.diagnosticsMessageColors[field.key]
                      return (
                        <label key={field.key} className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-neutral-700 dark:text-neutral-300">{field.label}</span>
                          <span className="inline-flex items-center gap-2">
                            <input
                              type="color"
                              value={value}
                              onChange={(e) =>
                                setApplicationSettings((prev) => ({
                                  ...prev,
                                  diagnosticsMessageColors: {
                                    ...prev.diagnosticsMessageColors,
                                    [field.key]: e.target.value,
                                  },
                                }))
                              }
                              className="h-7 w-10 cursor-pointer rounded border border-neutral-300 bg-white p-0.5 dark:border-neutral-600 dark:bg-neutral-800"
                              title={`${field.label} color`}
                            />
                            <code className="w-16 text-right font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                              {value}
                            </code>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Diagnostics</div>
                <div className="text-xs text-neutral-600 dark:text-neutral-400">
                  Runtime logs and persisted state are stored in your Barnaby user data folder.
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                    onClick={() => {
                      setDiagnosticsActionStatus(null)
                      void (async () => {
                        try {
                          const result = await api.openRuntimeLog?.()
                          if (!result?.ok) {
                            setDiagnosticsActionStatus(result?.error ? `Could not open runtime log: ${result.error}` : 'Could not open runtime log.')
                            return
                          }
                          setDiagnosticsActionStatus('Opened runtime log.')
                        } catch (err) {
                          setDiagnosticsActionStatus(`Could not open runtime log: ${formatError(err)}`)
                        }
                      })()
                    }}
                  >
                    Open runtime log
                  </button>
                  {diagnosticsActionStatus && (
                    <span className="text-xs text-neutral-600 dark:text-neutral-400">{diagnosticsActionStatus}</span>
                  )}
                </div>
                {diagnosticsError && (
                  <div className="text-xs text-red-600 dark:text-red-400">{diagnosticsError}</div>
                )}
                {diagnosticsInfo && (
                  <div className="space-y-1 text-xs font-mono text-neutral-700 dark:text-neutral-300">
                    <div><span className="font-semibold">userData</span>: {diagnosticsInfo.userDataPath}</div>
                    <div><span className="font-semibold">storage</span>: {diagnosticsInfo.storageDir}</div>
                    <div><span className="font-semibold">runtime log</span>: {diagnosticsInfo.runtimeLogPath}</div>
                    <div><span className="font-semibold">app state</span>: {diagnosticsInfo.appStatePath}</div>
                    <div><span className="font-semibold">chat history</span>: {diagnosticsInfo.chatHistoryPath}</div>
                  </div>
                )}
              </section>
                </>
              )}
            </div>
            <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-end">
              <button
                className={UI_BUTTON_PRIMARY_CLASS}
                onClick={() => setShowAppSettingsModal(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

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
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
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
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
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
          <div className={`w-full max-w-xl ${MODAL_CARD_CLASS}`}>
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div className="font-medium">Open workspace</div>
              <button
                className={UI_CLOSE_ICON_BUTTON_CLASS}
                onClick={closeWorkspacePicker}
                title="Close"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-auto">
              {workspacePickerPrompt && (
                <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100">
                  {workspacePickerPrompt}
                </div>
              )}
              <div className="space-y-1">
                {workspaceList.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`w-full text-left px-3 py-2 rounded text-sm font-mono truncate ${
                      p === workspaceRoot
                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100'
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                    onClick={() => {
                      requestWorkspaceSwitch(p, 'picker')
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="mt-3 w-full px-3 py-2 rounded border border-dashed border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900 text-sm text-neutral-600 dark:text-neutral-400"
                onClick={async () => {
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
                      themeId: WORKSPACE_THEME_INHERIT,
                    },
                  }))
                  requestWorkspaceSwitch(selected, 'picker')
                  try {
                    await api.writeWorkspaceConfig?.(selected)
                  } catch {}
                }}
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
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
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
                />
                <button
                  type="button"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  onClick={browseForWorkspaceIntoForm}
                  title="Browse for workspace folder"
                  aria-label="Browse for workspace folder"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
                    setWorkspaceForm((prev) => ({ ...prev, defaultModel: e.target.value }))
                  }
                >
                  {getModelOptions(workspaceForm.defaultModel).map((id) => {
                    const mi = modelConfig.interfaces.find((m) => m.id === id)
                    return (
                      <option key={id} value={id}>
                        {mi?.displayName ?? id}
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
                      setWorkspaceForm((prev) => {
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
                    <option value="danger-full-access">Danger full access</option>
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
                      setWorkspaceForm((prev) => ({
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
              <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                <span className="text-neutral-600 dark:text-neutral-300">Theme</span>
                <select
                  className={UI_SELECT_CLASS}
                  value={workspaceForm.themeId}
                  onChange={(e) =>
                    setWorkspaceForm((prev) => ({
                      ...prev,
                      themeId: normalizeWorkspaceThemeId(e.target.value),
                    }))
                  }
                >
                  <option value={WORKSPACE_THEME_INHERIT}>Use application setting</option>
                  {THEMES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <span className="text-neutral-600 dark:text-neutral-300">Timeline controls</span>
                <div className="col-start-2 text-xs text-neutral-500 dark:text-neutral-400">
                  Debug and trace visibility is now configured in Application Settings.
                </div>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-between">
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
              <div className="flex gap-2">
                <button
                  className="px-3 py-1.5 text-sm rounded border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                  onClick={() => setShowWorkspaceModal(false)}
                >
                  Cancel
                </button>
                <button
                  className={UI_BUTTON_PRIMARY_CLASS}
                  onClick={saveWorkspaceSettings}
                >
                  Save
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
    const isFinalComplete = !isRunning && !isQueued && activity?.lastEventLabel === 'Turn complete'
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
    const showActivityUpdates = Boolean(applicationSettings.showActivityUpdates)
    const showReasoningUpdates = Boolean(applicationSettings.showReasoningUpdates)
    const showOperationTrace = applicationSettings.showOperationTrace !== false
    const diagnosticsMessageColors = applicationSettings.diagnosticsMessageColors
    const debugNoteColor = diagnosticsMessageColors.debugNote
    const activityUpdateColor = diagnosticsMessageColors.activityUpdate
    const reasoningUpdateColor = diagnosticsMessageColors.reasoningUpdate
    const operationTraceColor = diagnosticsMessageColors.operationTrace
    const timelineMessageColor = diagnosticsMessageColors.timelineMessage
    const settingsPopover = settingsPopoverByPanel[w.id] ?? null
    const interactionMode = parseInteractionMode(w.interactionMode)
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
          zoomPanelFont(w.id, e.deltaY)
        }}
      >
        <div className="flex items-center justify-between gap-2 min-w-0 px-3 py-2.5 border-b border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-950 shrink-0">
          <div className="flex-1 min-w-0 text-sm font-semibold tracking-tight truncate" title={w.title}>{getConversationPrecis(w)}</div>
          <div className="flex items-center gap-1">
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
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="2.5" y="3" width="5.2" height="10" rx="1" stroke="currentColor" />
                <rect x="8.3" y="3" width="5.2" height="10" rx="1" stroke="currentColor" />
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
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
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
            type Row = { type: 'single'; unit: TimelineUnit } | { type: 'operationBatch'; units: TimelineUnit[] }
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
              rows.push({ type: 'single', unit })
              i += 1
            }
            return rows.map((row) => {
              if (row.type === 'operationBatch') {
                return (
                  <div key={`op-batch-${row.units.map((u) => u.id).join('-')}`} className="w-full space-y-0 -my-0.5">
                    {row.units.map((unit) => {
                      const ageMs = Math.max(0, activityClock - unit.updatedAt)
                      const fadeProgress = Math.min(1, Math.max(0, (ageMs - OPERATION_TRACE_VISIBLE_MS) / OPERATION_TRACE_FADE_MS))
                      const traceText = unit.body.replace(/\s*\n+\s*/g, ' | ').trim()
                      const fadedOpacity = Math.max(OPERATION_TRACE_MIN_OPACITY, 1 - fadeProgress)
                      return (
                        <div key={unit.id} className="px-1 py-0">
                          <div
                            className="rounded px-2 py-0 text-[11px] leading-[1.2] transition-opacity duration-300"
                            style={{
                              color: operationTraceColor,
                              opacity: fadedOpacity,
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
                      className="text-[11px] px-2 py-1 rounded border border-neutral-300 bg-white/80 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700"
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
                                const isDiff = lang === 'diff'
                                const diffLines = normalized.split('\n')
                                const openByDefault = isCodeLifecycleUnit
                                  ? unit.status === 'in_progress' || codeUnitPinned
                                  : lineCount <= COLLAPSIBLE_CODE_MIN_LINES
                                const codeBlockId = `${m.id}:${codeBlockIndex++}`
                                const isOpen = codeBlockOpenById[codeBlockId] ?? openByDefault
                                return (
                                  <details
                                    open={isOpen}
                                    onToggle={(e) => {
                                      const next = e.currentTarget.open
                                      setCodeBlockOpenById((prev) =>
                                        prev[codeBlockId] === next ? prev : { ...prev, [codeBlockId]: next },
                                      )
                                    }}
                                    className="group my-2 rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/25"
                                  >
                                    <summary className="list-none cursor-pointer px-3 py-1.5 text-[11px] font-medium text-blue-800 dark:text-blue-200 flex items-center justify-between">
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
                                        className="transition-transform group-open:rotate-180"
                                        aria-hidden
                                      >
                                        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                    </summary>
                                    <pre
                                      ref={(el) => registerCodeBlockViewport(codeBlockId, el)}
                                      onScroll={() => onCodeBlockViewportScroll(codeBlockId)}
                                      className="m-0 rounded-t-none border-t border-blue-200 dark:border-blue-900/60 p-3 overflow-auto max-h-80 whitespace-pre bg-white/80 dark:bg-neutral-950/80"
                                    >
                                      {isDiff ? (
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
                                      ) : (
                                        <code className={`${codeClass} block text-[12px] leading-5 font-mono text-blue-950 dark:text-blue-100`}>{rawChildren}</code>
                                      )}
                                    </pre>
                                  </details>
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
                          const isDiff = lang === 'diff'
                          const diffLines = normalized.split('\n')
                          const openByDefault = isCodeLifecycleUnit
                            ? unit.status === 'in_progress' || codeUnitPinned
                            : lineCount <= COLLAPSIBLE_CODE_MIN_LINES
                          const codeBlockId = `${m.id}:${codeBlockIndex++}`
                          const isOpen = codeBlockOpenById[codeBlockId] ?? openByDefault
                          return (
                            <details
                              open={isOpen}
                              onToggle={(e) => {
                                const next = e.currentTarget.open
                                setCodeBlockOpenById((prev) =>
                                  prev[codeBlockId] === next ? prev : { ...prev, [codeBlockId]: next },
                                )
                              }}
                              className="group my-2 rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/25"
                            >
                              <summary className="list-none cursor-pointer px-3 py-1.5 text-[11px] font-medium text-blue-800 dark:text-blue-200 flex items-center justify-between">
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
                                className="transition-transform group-open:rotate-180"
                                aria-hidden
                              >
                                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              </summary>
                              <pre
                                ref={(el) => registerCodeBlockViewport(codeBlockId, el)}
                                onScroll={() => onCodeBlockViewportScroll(codeBlockId)}
                                className="m-0 rounded-t-none border-t border-blue-200 dark:border-blue-900/60 p-3 overflow-auto max-h-80 whitespace-pre bg-white/80 dark:bg-neutral-950/80"
                              >
                              {isDiff ? (
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
                              ) : (
                                <code className={`${codeClass} block text-[12px] leading-5 font-mono text-blue-950 dark:text-blue-100`}>{rawChildren}</code>
                              )}
                              </pre>
                            </details>
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
                      <img
                        key={attachment.id}
                        src={toLocalFileUrl(attachment.path)}
                        alt={attachment.label || 'Image attachment'}
                        title={attachment.path}
                        className="h-20 w-20 rounded-md border border-blue-200/80 object-cover bg-blue-50 dark:border-blue-900/70 dark:bg-blue-950/20"
                        loading="lazy"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
            )
          })})()}
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
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
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
                    : 'border-neutral-300 bg-neutral-200 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400'
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
                  width="14"
                  height="14"
                  viewBox="0 0 20 20"
                  fill="none"
                  className="animate-spin motion-reduce:animate-none"
                >
                  <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeOpacity="0.28" strokeWidth="2" />
                  <path d="M10 3.5a6.5 6.5 0 0 1 6.5 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : !hasInput && isFinalComplete ? (
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <path d="M5.2 10.2L8.5 13.5L14.8 7.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <path d="M10 4V13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M6.5 7.5L10 4l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 16h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </div>
          {queueCount > 0 && (
            <div className="px-1 pt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
              {queueCount} queued
            </div>
          )}
        </div>

        <div className="relative z-20 border-t border-neutral-200/80 dark:border-neutral-800 px-3 py-2 text-xs min-w-0 overflow-visible bg-white/90 dark:bg-neutral-950">
          <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
            <div className="min-w-0 flex-1 text-neutral-600 dark:text-neutral-300 flex items-center gap-2 flex-wrap">
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
              <span className="break-words [overflow-wrap:anywhere]">{w.status}</span>
              {contextUsage && contextUsagePercent !== null && (
                <span
                  className="inline-flex items-center gap-2"
                  title={`${contextUsagePercent.toFixed(1)}% used
Estimated GPT context usage
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
                </span>
              )}
              {(() => {
                const pct = getRateLimitPercent(w.usage)
                const label = formatRateLimitLabel(w.usage)
                if (pct === null || !label) return null
                return (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-1.5 w-20 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                      <span className="block h-full bg-blue-600" style={{ width: `${100 - pct}%` }} />
                    </span>
                    <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
                  </span>
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
                  title={`Sandbox: ${w.sandbox}`}
                  onClick={() =>
                    setSettingsPopoverByPanel((prev) => ({
                      ...prev,
                      [w.id]: settingsPopover === 'sandbox' ? null : 'sandbox',
                    }))
                  }
                >
                  {renderSandboxSymbol(w.sandbox)}
                </button>
                {settingsPopover === 'sandbox' && (
                  <div className="absolute right-0 bottom-[calc(100%+6px)] w-48 rounded-lg border border-neutral-200/90 bg-white/95 p-1.5 shadow-xl ring-1 ring-black/5 backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95 dark:ring-white/10 z-20">
                    {([
                      ['read-only', 'Read only'],
                      ['workspace-write', 'Workspace write'],
                      ['danger-full-access', 'Danger full access'],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={[
                          'w-full appearance-none border-0 text-left text-[11px] px-2 py-1.5 rounded',
                          w.sandbox === value
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                            : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
                        ].join(' ')}
                        onClick={() => setPanelSandbox(w.id, value)}
                      >
                        {label}
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
                    settingsPopover === 'permission'
                      ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200'
                      : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700',
                  ].join(' ')}
                  title={`Permissions: ${w.permissionMode}`}
                  onClick={() =>
                    setSettingsPopoverByPanel((prev) => ({
                      ...prev,
                      [w.id]: settingsPopover === 'permission' ? null : 'permission',
                    }))
                  }
                >
                  {renderPermissionSymbol(w.permissionMode)}
                </button>
                {settingsPopover === 'permission' && (
                  <div className="absolute right-0 bottom-[calc(100%+6px)] w-52 rounded-lg border border-neutral-200/90 bg-white/95 p-1.5 shadow-xl ring-1 ring-black/5 backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95 dark:ring-white/10 z-20">
                    {([
                      ['verify-first', 'Verify first'],
                      ['proceed-always', 'Proceed always'],
                    ] as const).map(([value, label]) => {
                      const disabled = w.sandbox === 'read-only' && value === 'proceed-always'
                      return (
                        <button
                          key={value}
                          type="button"
                          disabled={disabled}
                          className={[
                            'w-full appearance-none border-0 text-left text-[11px] px-2 py-1.5 rounded',
                            w.permissionMode === value
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                              : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
                            disabled ? 'opacity-50 cursor-not-allowed' : '',
                          ].join(' ')}
                          onClick={() => setPanelPermission(w.id, value)}
                        >
                          {label}
                        </button>
                      )
                    })}
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
                          {mi?.displayName ?? id}
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

