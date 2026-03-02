/**
 * Shared constants for the Barnaby app.
 */

import type {
  AgentInteractionMode,
  AppSettingsView,
  ConnectivityProvider,
  DiagnosticsMessageColors,
  DockLayoutState,
  DockPanelId,
  DockZoneId,
  ExplorerPrefs,
  ModelInterface,
  ProviderConfig,
  ThemeEditableField,
} from '../types'

export const DEFAULT_MODEL = 'gpt-5.3-codex'
export const MODEL_BANNER_PREFIX = 'Model: '
export const AUTO_CONTINUE_PROMPT = 'Please continue from where you left off. Complete the task fully.'
export const STARTUP_LOCKED_WORKSPACE_PROMPT =
  'The workspace being opened is locked by another Barnaby. Select another workspace or try again.'
export const ALL_WORKSPACES_LOCKED_PROMPT =
  'No workspace is available right now. Another Barnaby instance is already using each saved workspace.'

export const CODEX_API_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo']
export const DEFAULT_MODEL_INTERFACES: ModelInterface[] = []
export const MAX_PANELS = 5
export const MAX_EDITOR_PANELS = 20
export const MAX_EDITOR_FILE_SIZE_BYTES = 2 * 1024 * 1024
export const MAX_AUTO_CONTINUE = 3

export const MODAL_BACKDROP_CLASS = 'fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] flex items-center justify-center p-4'
export const MODAL_CARD_CLASS = 'rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white/95 dark:bg-neutral-950 shadow-2xl'
export const UI_BUTTON_SECONDARY_CLASS = 'px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
export const UI_BUTTON_PRIMARY_CLASS = 'px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-500'
export const UI_ICON_BUTTON_CLASS = 'h-9 w-9 inline-flex items-center justify-center rounded-md border-0 bg-transparent text-neutral-700 transition-colors focus:outline-none hover:bg-neutral-200/80 active:bg-neutral-300/80 dark:text-neutral-200 dark:hover:bg-neutral-700/80 dark:active:bg-neutral-600/80'
export const UI_CLOSE_ICON_BUTTON_CLASS = 'h-7 w-9 inline-flex items-center justify-center rounded-md border-0 bg-transparent text-neutral-700 transition-colors focus:outline-none hover:bg-neutral-200/80 active:bg-neutral-300/80 dark:text-neutral-300 dark:hover:bg-neutral-700/80 dark:active:bg-neutral-600/80'
export const UI_TOOLBAR_ICON_BUTTON_CLASS = 'h-7 w-7 inline-flex items-center justify-center rounded-md border-0 bg-transparent text-neutral-700 transition-colors focus:outline-none hover:bg-neutral-200/80 active:bg-neutral-300/80 disabled:opacity-50 disabled:cursor-not-allowed dark:text-neutral-200 dark:hover:bg-neutral-700/80 dark:active:bg-neutral-600/80'
export const CODE_WINDOW_TOOLBAR_BUTTON = 'h-7 w-7 inline-flex items-center justify-center rounded-md border-0 bg-transparent text-neutral-700 transition-colors focus:outline-none hover:bg-neutral-200/80 active:bg-neutral-300/80 disabled:opacity-50 disabled:cursor-not-allowed dark:text-neutral-300 dark:hover:bg-neutral-700/80 dark:active:bg-neutral-600/80'
export const CODE_WINDOW_TOOLBAR_BUTTON_SM = 'h-7 w-9 inline-flex items-center justify-center rounded-md border-0 bg-transparent text-neutral-700 transition-colors focus:outline-none hover:bg-neutral-200/80 active:bg-neutral-300/80 dark:text-neutral-300 dark:hover:bg-neutral-700/80 dark:active:bg-neutral-600/80'
export const UI_INPUT_CLASS = 'px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400'
export const UI_SELECT_CLASS = 'px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100'
export const STATUS_SYMBOL_ICON_CLASS = 'h-4 w-4 text-neutral-600 dark:text-neutral-300'

export const PROVIDERS_WITH_DUAL_MODE: ConnectivityProvider[] = ['gemini', 'claude', 'codex']
export const PROVIDERS_CLI_ONLY: ConnectivityProvider[] = []
export const PROVIDERS_API_ONLY: ConnectivityProvider[] = ['openrouter']

export const API_CONFIG_BY_PROVIDER: Record<string, { apiBaseUrl: string; loginUrl: string }> = {
  codex: { apiBaseUrl: 'https://api.openai.com/v1', loginUrl: 'https://platform.openai.com/api-keys' },
  claude: { apiBaseUrl: 'https://api.anthropic.com/v1', loginUrl: 'https://console.anthropic.com/' },
  gemini: { apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta', loginUrl: 'https://aistudio.google.com/' },
}

export const PROVIDER_SUBSCRIPTION_URLS: Record<string, string> = {
  codex: 'https://chatgpt.com/codex/settings/usage',
  claude: 'https://claude.ai/settings/usage',
  gemini: 'https://aistudio.google.com/',
  openrouter: 'https://openrouter.ai/credits',
}

export const PANEL_INTERACTION_MODES: AgentInteractionMode[] = ['agent', 'plan', 'debug', 'ask']
export const CONNECTIVITY_PROVIDERS: ConnectivityProvider[] = ['codex', 'claude', 'gemini', 'openrouter']
export const APP_SETTINGS_VIEWS: AppSettingsView[] = ['connectivity', 'preferences', 'agents', 'orchestrator', 'mcp-servers', 'diagnostics']

export const DOCK_PANEL_LABELS: Record<DockPanelId, string> = {
  orchestrator: 'Orchestrator',
  'workspace-folder': 'Workspace Folder',
  'workspace-settings': 'Workspace Settings',
  'application-settings': 'Application Settings',
  'source-control': 'Source Control',
  terminal: 'Terminal',
  'debug-output': 'Debug Output',
}

export const DEFAULT_DOCK_LAYOUT: DockLayoutState = {
  zones: {
    'left-top': ['orchestrator'],
    'left-bottom': ['workspace-folder', 'workspace-settings'],
    right: ['application-settings', 'source-control'],
    bottom: ['terminal', 'debug-output'],
  },
  activeTab: {
    'left-top': 'orchestrator',
    'left-bottom': 'workspace-folder',
    right: 'application-settings',
    bottom: 'terminal',
  },
}

/** All dock zone IDs for iteration. */
export const DOCK_ZONE_IDS: DockZoneId[] = [
  'left', 'left-top', 'left-bottom',
  'right', 'right-top', 'right-bottom',
  'bottom', 'bottom-left', 'bottom-right',
]

export const PANEL_COMPLETION_NOTICE_MS = 15000
export const LAST_USER_RECALL_EXPIRY_MS = 10000

export const ONGOING_WORK_LABELS = new Set([
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
  'Compacting context',
  'Context compacted',
])

export const DEFAULT_DIAGNOSTICS_MESSAGE_COLORS: DiagnosticsMessageColors = {
  debugNotes: '#b91c1c',
  activityUpdates: '#b45309',
  reasoningUpdates: '#047857',
  operationTrace: '#5b6a95',
  thinkingProgress: '#737373',
  errorStatus: '#fce7f3',
}

export const DEFAULT_DIAGNOSTICS_VISIBILITY = {
  showActivityUpdates: false,
  showReasoningUpdates: false,
  showOperationTrace: true,
  showThinkingProgress: true,
}

export const DEFAULT_EXPLORER_PREFS: ExplorerPrefs = { showHiddenFiles: false, showNodeModules: false }

export const DEFAULT_BUILTIN_PROVIDER_CONFIGS: Record<ConnectivityProvider, ProviderConfig> = {
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
    authCheckCommand: 'auth status',
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

export const WORKSPACE_STORAGE_KEY = 'agentorchestrator.workspaceRoot'
export const WORKSPACE_LIST_STORAGE_KEY = 'agentorchestrator.workspaceList'
export const WORKSPACE_SETTINGS_STORAGE_KEY = 'agentorchestrator.workspaceSettings'
export const WORKSPACE_DOCK_SIDE_STORAGE_KEY = 'agentorchestrator.workspaceDockSide'
export const MODEL_CONFIG_STORAGE_KEY = 'agentorchestrator.modelConfig'
export const PROVIDER_REGISTRY_STORAGE_KEY = 'agentorchestrator.providerRegistry'
export const SETUP_WIZARD_DONE_STORAGE_KEY = 'agentorchestrator.setupWizardDone'
export const EXPLORER_PREFS_STORAGE_KEY = 'agentorchestrator.explorerPrefsByWorkspace'
export const CHAT_HISTORY_STORAGE_KEY = 'agentorchestrator.chatHistory'
export const APP_SETTINGS_STORAGE_KEY = 'agentorchestrator.appSettings'
export const ORCHESTRATOR_SETTINGS_STORAGE_KEY = 'agentorchestrator.orchestratorSettings'
export const THEME_ID_STORAGE_KEY = 'agentorchestrator.themeId'
export const THEME_OVERRIDES_STORAGE_KEY = 'agentorchestrator.themeOverrides'

export const MIN_FONT_SCALE = 0.75
export const MAX_FONT_SCALE = 1.5
export const FONT_SCALE_STEP = 0.05
export const INPUT_MAX_HEIGHT_PX = 220
export const CONNECT_TIMEOUT_MS = 30000
export const TURN_START_TIMEOUT_MS = 300000
export const STALL_WATCHDOG_MS = 120000
export const COLLAPSIBLE_CODE_MIN_LINES = 14
export const MAX_CHAT_HISTORY_ENTRIES = 80
export const DEFAULT_GPT_CONTEXT_TOKENS = 200_000
export const CONTEXT_OUTPUT_RESERVE_RATIO = 0.2
export const CONTEXT_MIN_OUTPUT_RESERVE_TOKENS = 4_096
export const CONTEXT_MAX_OUTPUT_RESERVE_TOKENS = 32_768
export const TOKEN_ESTIMATE_CHARS_PER_TOKEN = 4
export const TOKEN_ESTIMATE_WORDS_MULTIPLIER = 1.35
export const TOKEN_ESTIMATE_MESSAGE_OVERHEAD = 8
export const TOKEN_ESTIMATE_IMAGE_ATTACHMENT_TOKENS = 850
export const TOKEN_ESTIMATE_THREAD_OVERHEAD_TOKENS = 700
export const APP_STATE_AUTOSAVE_MS = 800
export const DEFAULT_THEME_ID = 'default-dark'
export const DEFAULT_FONT_FAMILY = 'inter'
export const DEFAULT_FONT_CODE = 'consolas'
export const DEFAULT_FONT_THINKING = 'inter'
export const DEFAULT_FONT_EDITOR = 'consolas'

/** Font options for chat, thinking, and general UI prose. Cursor uses Segoe UI on Windows, system UI elsewhere. */
export const FONT_OPTIONS: Array<{ id: string; label: string; fontStack: string }> = [
  { id: 'inter', label: 'Inter', fontStack: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif' },
  { id: 'system', label: 'System default', fontStack: 'system-ui, -apple-system, Avenir, Helvetica, Arial, sans-serif' },
  { id: 'segoe', label: 'Segoe UI (Cursor-style on Windows)', fontStack: '"Segoe UI", system-ui, Avenir, Helvetica, Arial, sans-serif' },
  { id: 'georgia', label: 'Georgia', fontStack: 'Georgia, "Times New Roman", serif' },
  { id: 'source-sans', label: 'Source Sans 3', fontStack: '"Source Sans 3", system-ui, sans-serif' },
]

/** Monospace font options for code blocks, editor, terminal. Cursor uses Consolas (Win), Menlo (Mac), JetBrains Mono. */
export const MONO_FONT_OPTIONS: Array<{ id: string; label: string; fontStack: string }> = [
  { id: 'consolas', label: 'Consolas (Cursor default on Windows)', fontStack: 'Consolas, "Courier New", monospace' },
  { id: 'jetbrains', label: 'JetBrains Mono', fontStack: '"JetBrains Mono", Consolas, "Courier New", monospace' },
  { id: 'fira', label: 'Fira Code', fontStack: '"Fira Code", Consolas, "Courier New", monospace' },
  { id: 'cascadia', label: 'Cascadia Code', fontStack: '"Cascadia Code", "Cascadia Mono", Consolas, monospace' },
  { id: 'source-code', label: 'Source Code Pro', fontStack: '"Source Code Pro", Consolas, monospace' },
  { id: 'menlo', label: 'Menlo (Cursor default on macOS)', fontStack: 'Menlo, Monaco, "Courier New", monospace' },
]
export const FONT_SIZE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 11, label: '11' },
  { value: 12, label: '12' },
  { value: 13, label: '13' },
  { value: 14, label: '14' },
  { value: 15, label: '15' },
  { value: 16, label: '16' },
  { value: 17, label: '17' },
  { value: 18, label: '18' },
]

export const THINKING_MAX_CHARS = 180

export const DEFAULT_WORKSPACE_ALLOWED_COMMAND_PREFIXES = [
  'npm',
  'npx',
  'tsc',
  'git',
  'node',
  'electron-builder',
]
export const DEFAULT_WORKSPACE_ALLOWED_AUTO_READ_PREFIXES = []
export const DEFAULT_WORKSPACE_ALLOWED_AUTO_WRITE_PREFIXES = []
export const DEFAULT_WORKSPACE_DENIED_AUTO_READ_PREFIXES = ['../', '.env']
export const DEFAULT_WORKSPACE_DENIED_AUTO_WRITE_PREFIXES = ['../', '.env']
export const DEFAULT_WORKSPACE_CURSOR_ALLOW_BUILDS = false

export const THEME_EDITABLE_FIELDS: Array<{ key: ThemeEditableField; label: string; group?: string }> = [
  { key: 'accent', label: 'Primary interactive color', group: 'Accent' },
  { key: 'accentStrong', label: 'Primary solid color', group: 'Accent' },
  { key: 'accentMuted', label: 'Accent text on surfaces', group: 'Accent' },
  { key: 'accentOnPrimary', label: 'Text on accent backgrounds', group: 'Accent' },
  { key: 'accentTint', label: 'Accent tint background', group: 'Accent' },
  { key: 'bgBase', label: 'Main background', group: 'Surfaces' },
  { key: 'bgSurface', label: 'Panel background', group: 'Surfaces' },
  { key: 'bgElevated', label: 'Elevated/hover surface', group: 'Surfaces' },
  { key: 'textPrimary', label: 'Primary text', group: 'Text' },
  { key: 'textSecondary', label: 'Secondary text', group: 'Text' },
  { key: 'textTertiary', label: 'Tertiary text', group: 'Text' },
  { key: 'borderDefault', label: 'Default border', group: 'Borders' },
  { key: 'borderStrong', label: 'Strong border', group: 'Borders' },
  { key: 'assistantBubbleBg', label: 'Assistant bubble background', group: 'Chat' },
  { key: 'scrollbarThumb', label: 'Scrollbar thumb', group: 'Scrollbars' },
  { key: 'scrollbarTrack', label: 'Scrollbar track', group: 'Scrollbars' },
  { key: 'debugNotes', label: 'Debug notes', group: 'Diagnostics' },
  { key: 'activityUpdates', label: 'Activity updates', group: 'Diagnostics' },
  { key: 'reasoningUpdates', label: 'Reasoning updates', group: 'Diagnostics' },
  { key: 'operationTrace', label: 'Operation trace', group: 'Diagnostics' },
  { key: 'thinkingProgress', label: 'Thinking progress', group: 'Diagnostics' },
  { key: 'errorStatus', label: 'Error status', group: 'Diagnostics' },
]

export const INTERACTION_MODE_META: Record<AgentInteractionMode, { label: string; promptPrefix: string; hint: string }> = {
  agent: { label: 'Agent', promptPrefix: '', hint: 'Default mode: implement directly.' },
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

export const LEGACY_PRESET_TO_THEME_ID: Record<string, { light: string; dark: string }> = {
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
