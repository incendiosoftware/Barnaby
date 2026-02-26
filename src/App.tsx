import { Group, Panel, Separator } from 'react-resizable-panels'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { buildTimelineForPanel } from './chat/timelineParser'
import type { TimelineUnit } from './chat/timelineTypes'
import {
  BuildIcon,
  CollapseAllIcon,
  CommitIcon,
  DeployIcon,
  ExpandAllIcon,
  PanelLeftIcon,
  PanelRightIcon,
  PushIcon,
  RefreshIcon,
  ReleaseIcon,
  SendIcon,
  SpinnerIcon,
  StopIcon,
} from './components/icons'
import { EmbeddedTerminal } from './components/Terminal'
import { CodeMirrorEditor } from './components/CodeMirrorEditor'
import { registerPluginHostCallbacks, unregisterPluginHostCallbacks } from './pluginHostRenderer'
import type {
  ActivityFeedItem,
  ActivityKind,
  AgentInteractionMode,
  AgentPanelState,
  AppSettingsView,
  ApplicationSettings,
  ChatHistoryEntry,
  ChatMessage,
  ChatRole,
  CodeWindowTab,
  ConnectivityMode,
  ConnectivityProvider,
  CustomProviderConfig,
  DiagnosticsMessageColors,
  EditorPanelState,
  ExplorerPrefs,
  GitOperation,
  GitStatusEntry,
  GitStatusState,
  LayoutMode,
  MessageFormat,
  ModelCatalogRefreshStatus,
  ModelConfig,
  ModelInterface,
  ModelProvider,
  OrchestratorSettings,
  PanelActivityState,
  PanelDebugEntry,
  ParsedAppState,
  PastedImageAttachment,
  PermissionMode,
  PersistedAgentPanelState,
  PersistedAppState,
  PersistedEditorPanelState,
  ProviderAuthStatus,
  ProviderConfig,
  ProviderConfigCli,
  ProviderRegistry,
  SandboxMode,
  StandaloneTheme,
  Theme,
  ThemeEditableField,
  ThemeOverrideValues,
  ThemeOverrides,
  WorkspaceDockSide,
  WorkspaceSettings,
  WorkspaceSettingsTextDraft,
  WorkspaceApplyFailure,
  WorkspaceTreeNode,
  WorkspaceUiSnapshot,
  AvailableCatalogModels,
} from './types'
import {
  ALL_WORKSPACES_LOCKED_PROMPT,
  APP_STATE_AUTOSAVE_MS,
  APP_SETTINGS_VIEWS,
  AUTO_CONTINUE_PROMPT,
  CODEX_API_MODELS,
  CODE_WINDOW_TOOLBAR_BUTTON,
  CODE_WINDOW_TOOLBAR_BUTTON_SM,
  CONTEXT_MAX_OUTPUT_RESERVE_TOKENS,
  CONTEXT_MIN_OUTPUT_RESERVE_TOKENS,
  CONTEXT_OUTPUT_RESERVE_RATIO,
  CONNECTIVITY_PROVIDERS,
  DEFAULT_BUILTIN_PROVIDER_CONFIGS,
  DEFAULT_DIAGNOSTICS_MESSAGE_COLORS,
  DEFAULT_DIAGNOSTICS_VISIBILITY,
  DEFAULT_EXPLORER_PREFS,
  DEFAULT_GPT_CONTEXT_TOKENS,
  DEFAULT_MODEL,
  DEFAULT_MODEL_INTERFACES,
  DEFAULT_THEME_ID,
  FONT_OPTIONS,
  MONO_FONT_OPTIONS,
  DEFAULT_WORKSPACE_ALLOWED_AUTO_READ_PREFIXES,
  DEFAULT_WORKSPACE_ALLOWED_AUTO_WRITE_PREFIXES,
  DEFAULT_WORKSPACE_ALLOWED_COMMAND_PREFIXES,
  DEFAULT_WORKSPACE_DENIED_AUTO_READ_PREFIXES,
  DEFAULT_WORKSPACE_DENIED_AUTO_WRITE_PREFIXES,
  FONT_SCALE_STEP,
  INPUT_MAX_HEIGHT_PX,
  LEGACY_PRESET_TO_THEME_ID,
  MAX_AUTO_CONTINUE,
  MAX_EDITOR_FILE_SIZE_BYTES,
  MAX_EDITOR_PANELS,
  MAX_FONT_SCALE,
  MAX_CHAT_HISTORY_ENTRIES,
  MAX_PANELS,
  MIN_FONT_SCALE,
  MODAL_BACKDROP_CLASS,
  MODAL_CARD_CLASS,
  ONGOING_WORK_LABELS,
  INTERACTION_MODE_META,
  PANEL_COMPLETION_NOTICE_MS,
  SETUP_WIZARD_DONE_STORAGE_KEY,
  STARTUP_LOCKED_WORKSPACE_PROMPT,
  THEME_EDITABLE_FIELDS,
  THINKING_MAX_CHARS,
  TOKEN_ESTIMATE_CHARS_PER_TOKEN,
  TOKEN_ESTIMATE_IMAGE_ATTACHMENT_TOKENS,
  TOKEN_ESTIMATE_MESSAGE_OVERHEAD,
  TOKEN_ESTIMATE_THREAD_OVERHEAD_TOKENS,
  TOKEN_ESTIMATE_WORDS_MULTIPLIER,
  STALL_WATCHDOG_MS,
  UI_BUTTON_PRIMARY_CLASS,
  UI_BUTTON_SECONDARY_CLASS,
  UI_CLOSE_ICON_BUTTON_CLASS,
  UI_ICON_BUTTON_CLASS,
  UI_INPUT_CLASS,
  UI_SELECT_CLASS,
  UI_TOOLBAR_ICON_BUTTON_CLASS,
  API_CONFIG_BY_PROVIDER,
  PROVIDER_SUBSCRIPTION_URLS,
  PROVIDERS_WITH_DUAL_MODE,
  PROVIDERS_CLI_ONLY,
  PROVIDERS_API_ONLY,
} from './constants'
import { THEMES } from './constants/themes'
import { THEME_PRESET_CSS } from './constants/themeStyles'
import { ExplorerPane } from './components/ExplorerPane'
import { GitPane } from './components/GitPane'
import { WorkspaceSettingsPane } from './components/WorkspaceSettingsPane'
import { ChatInputSection } from './components/chat/ChatInputSection'
import { AgentPanelMessageViewport } from './components/chat/AgentPanelMessageViewport'
import { ChatTimeline } from './components/chat/timeline'
import { createEditorFileController } from './controllers/editorFileController'
import { createPanelLifecycleController } from './controllers/panelLifecycleController'
import { createPanelInputController } from './controllers/panelInputController'
import { createAgentPipelineController } from './controllers/agentPipelineController'
import { useLocalStoragePersistence } from './hooks/useLocalStoragePersistence'
import { useAppRuntimeEvents } from './hooks/useAppRuntimeEvents'
import { createProviderConnectivityController, PROVIDERS_WITH_DEDICATED_PING } from './controllers/providerConnectivityController'
import { createDiagnosticsImageController } from './controllers/diagnosticsImageController'
import { createPanelLayoutController } from './controllers/panelLayoutController'
import { createExplorerWorkflowController } from './controllers/explorerWorkflowController'
import { createGitWorkflowController } from './controllers/gitWorkflowController'
import { createWorkspaceSettingsController } from './controllers/workspaceSettingsController'
import { createWorkspaceLifecycleController } from './controllers/workspaceLifecycleController'
import { AgentPanelHeader } from './components/panels/AgentPanelHeader'
import { EditorPanel } from './components/panels/EditorPanel'
import { WorkspaceTile } from './components/workspace/WorkspaceTile'
import { AgentPanelShell } from './components/panels/AgentPanelShell'
import { CodeWindowTile } from './components/panels/CodeWindowTile'
import { PanelContentRenderer } from './components/panels/PanelContentRenderer'
import { AppHeaderBar } from './components/layout/AppHeaderBar'
import { DockedAppSettings } from './components/settings/DockedAppSettings'
import { AppModals } from './components/modals/AppModals'
import {
  applyThemeOverrides,
  applyWorkspaceTextDraftField,
  clampFontScale,
  cloneChatMessages,
  cloneTheme,
  decodeUriComponentSafe,
  describeActivityEntry,
  describeOperationTrace,
  extractHexColor,
  filterMessagesForPresentation,
  formatError,
  formatHistoryOptionLabel,
  formatLimitResetHint,
  formatRateLimitLabel,
  formatToolTrace,
  getConversationPrecis,
  getDefaultSetupWizardSelection,
  getInitialApplicationSettings,
  getInitialChatHistory,
  getInitialExplorerPrefsByWorkspace,
  getInitialModelConfig,
  getInitialOrchestratorSettings,
  getInitialProviderRegistry,
  getInitialThemeId,
  getInitialThemeOverrides,
  getInitialWorkspaceDockSide,
  getInitialWorkspaceList,
  getInitialWorkspaceRoot,
  getInitialWorkspaceSettings,
  getInitialSetupWizardDone,
  getModelPingKey,
  getNextFontScale,
  getRateLimitPercent,
  isLockedWorkspacePrompt,
  isLikelyThinkingUpdate,
  isTurnCompletionRawNotification,
  isUsageLimitMessage,
  isZoomWheelGesture,
  looksIncomplete,
  makeDefaultPanel,
  mergeChatHistoryEntries,
  newId,
  normalizeAllowedCommandPrefixes,
  normalizeWorkspacePathForCompare,
  normalizeWorkspaceRelativePath,
  panelMessagesToInitialHistory,
  parseAllowedCommandPrefixesInput,
  parseApplicationSettings,
  parseChatHistoryEntries,
  parseHistoryMessages,
  parseInteractionMode,
  parsePanelAttachments,
  parsePersistedAgentPanel,
  parsePersistedAppState,
  parsePersistedEditorPanel,
  pickString,
  resolveProviderConfigs,
  resolveWorkspaceRelativePathFromChatHref,
  sanitizeThemeOverrides,
  shouldSurfaceRawNoteInChat,
  simplifyCommand,
  stripFileLineAndColumnSuffix,
  stripLinkQueryAndHash,
  stripSyntheticAutoContinueMessages,
  summarizeRawNotification,
  syncModelConfigWithCatalog,
  toShortJson,
  toWorkspaceRelativePathIfInsideRoot,
  truncateText,
  withExhaustedRateLimitWarning,
  withLimitWarningMessage,
  withModelBanner,
  workspaceSettingsToTextDraft,
  fileNameFromRelativePath,
  formatCheckedAt,
  toLocalFileUrl,
} from './utils/appCore'
import {
  estimatePanelContextUsage as estimatePanelContextUsageUtil,
  sandboxModeDescription as describeSandboxMode,
  getWorkspaceSecurityLimitsForPath as getWorkspaceSecurityLimitsForPathUtil,
  clampPanelSecurityForWorkspace as clampPanelSecurityForWorkspaceUtil,
  getPanelSecurityState as getPanelSecurityStateUtil,
} from './utils/panelContext'

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
  const [providerVerifiedByName, setProviderVerifiedByName] = useState<Record<string, boolean>>({})
  const [providerPingDurationByName, setProviderPingDurationByName] = useState<Record<string, number | null>>({})
  const [providerPanelOpenByName, setProviderPanelOpenByName] = useState<Record<string, boolean>>({})
  const [providerApiKeyDraftByName, setProviderApiKeyDraftByName] = useState<Record<string, string>>({})
  const [providerApiKeyStateByName, setProviderApiKeyStateByName] = useState<Record<string, boolean>>({})
  const [modelConfig, setModelConfig] = useState<ModelConfig>(() => getInitialModelConfig())
  const [modelCatalogRefreshStatus, setModelCatalogRefreshStatus] = useState<ModelCatalogRefreshStatus | null>(null)
  const [modelCatalogRefreshPending, setModelCatalogRefreshPending] = useState(false)
  const [modelPingResults, setModelPingResults] = useState<Record<string, { ok: boolean; durationMs: number; error?: string }>>({})
  const [modelPingPending, setModelPingPending] = useState<Set<string>>(new Set())
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
  const [mcpServers, setMcpServers] = useState<Array<{
    name: string
    config: { command: string; args?: string[]; env?: Record<string, string>; enabled?: boolean }
    connected: boolean
    error?: string
    toolCount: number
    tools: Array<{ name: string; description?: string }>
  }>>([])
  const [mcpPanelOpenByName, setMcpPanelOpenByName] = useState<Record<string, boolean>>({})
  const [mcpEditingServer, setMcpEditingServer] = useState<string | null>(null)
  const [mcpJsonDraft, setMcpJsonDraft] = useState('')
  const [mcpJsonError, setMcpJsonError] = useState<string | null>(null)
  const [mcpAddMode, setMcpAddMode] = useState(false)
  const [repairShortcutStatus, setRepairShortcutStatus] = useState<string | null>(null)
  const [workspaceDockSide, setWorkspaceDockSide] = useState<WorkspaceDockSide>(() => getInitialWorkspaceDockSide())
  const [gitDockSide, setGitDockSide] = useState<WorkspaceDockSide>('left')
  const [settingsDockSide, setSettingsDockSide] = useState<WorkspaceDockSide>('right')
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
  type InputDraftEditState = { kind: 'queued'; index: number } | { kind: 'recalled' }
  const [settingsPopoverByPanel, setSettingsPopoverByPanel] = useState<Record<string, 'mode' | 'sandbox' | 'permission' | null>>({})
  const [inputDraftEditByPanel, setInputDraftEditByPanel] = useState<Record<string, InputDraftEditState | null>>({})
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
  const autoCollapsedCompletedCodeUnitIdsRef = useRef(new Set<string>())
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
  const lastScrollToUserMessageRef = useRef<{ panelId: string; messageId: string } | null>(null)

  const [layoutMode, setLayoutMode] = useState<LayoutMode>('vertical')
  const [showWorkspaceWindow, setShowWorkspaceWindow] = useState(true)
  const [showGitWindow, setShowGitWindow] = useState(false)
  const [showSettingsWindow, setShowSettingsWindow] = useState(false)
  const showCodeWindow = showSettingsWindow
  const setShowCodeWindow = setShowSettingsWindow
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

  // ── localStorage persistence (delegated to hook) ───────────────────
  useLocalStoragePersistence({
    applicationSettings,
    themeOverrides,
    workspaceRoot,
    workspaceList,
    workspaceSettingsByPath,
    explorerPrefsByWorkspace,
    workspaceDockSide,
    modelConfig,
    providerRegistry,
    orchestratorSettings,
    chatHistory,
  })

  // ── Theme DOM + API side-effects ──────────────────────────────────
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
    root.style.setProperty('--theme-assistant-bubble-bg-light', activeTheme.assistantBubbleBgLight)
    root.style.setProperty('--theme-assistant-bubble-bg-dark', activeTheme.assistantBubbleBgDark)
    root.style.setProperty('--theme-dark-950', activeTheme.dark950)
    root.style.setProperty('--theme-dark-900', activeTheme.dark900)
  }, [activeTheme])
  useEffect(() => {
    const chat = FONT_OPTIONS.find((f) => f.id === applicationSettings.fontChat) ?? FONT_OPTIONS[0]
    const code = MONO_FONT_OPTIONS.find((f) => f.id === applicationSettings.fontCode) ?? MONO_FONT_OPTIONS[0]
    const thinking = FONT_OPTIONS.find((f) => f.id === applicationSettings.fontThinking) ?? FONT_OPTIONS[0]
    const editor = MONO_FONT_OPTIONS.find((f) => f.id === applicationSettings.fontEditor) ?? MONO_FONT_OPTIONS[0]
    document.documentElement.style.setProperty('--app-font-family', chat.fontStack)
    document.documentElement.style.setProperty('--app-font-chat', chat.fontStack)
    document.documentElement.style.setProperty('--app-font-code', code.fontStack)
    document.documentElement.style.setProperty('--app-font-thinking', thinking.fontStack)
    document.documentElement.style.setProperty('--app-font-editor', editor.fontStack)
    document.documentElement.style.setProperty('--app-font-chat-size', `${applicationSettings.fontChatSize}px`)
    document.documentElement.style.setProperty('--app-font-code-size', `${applicationSettings.fontCodeSize}px`)
    document.documentElement.style.setProperty('--app-font-thinking-size', `${applicationSettings.fontThinkingSize}px`)
    document.documentElement.style.setProperty('--app-font-editor-size', `${applicationSettings.fontEditorSize}px`)
  }, [applicationSettings.fontChat, applicationSettings.fontChatSize, applicationSettings.fontCode, applicationSettings.fontCodeSize, applicationSettings.fontThinking, applicationSettings.fontThinkingSize, applicationSettings.fontEditor, applicationSettings.fontEditorSize])

  // ── Workspace list + API sync (non-localStorage side-effects) ─────
  useEffect(() => {
    api.setRecentWorkspaces?.(workspaceList)
  }, [workspaceList, api])
  useEffect(() => {
    void api.syncOrchestratorSettings?.(orchestratorSettings)
  }, [api, orchestratorSettings])

  // ── Chat history API sync ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const loaded = await api.loadChatHistory?.()
        if (cancelled) return
        const parsed = parseChatHistoryEntries(loaded, workspaceRootRef.current || getInitialWorkspaceRoot())
        if (parsed.length === 0) return
        setChatHistory((prev) => mergeChatHistoryEntries(parsed, prev))
      } catch { /* best-effort */ }
    })()
    return () => { cancelled = true }
  }, [api])
  useEffect(() => {
    void api.saveChatHistory?.(chatHistory).catch(() => {})
  }, [api, chatHistory])

  // ── Ref syncs ─────────────────────────────────────────────────────
  useEffect(() => { workspaceRootRef.current = workspaceRoot }, [workspaceRoot])
  useEffect(() => { workspaceListRef.current = workspaceList }, [workspaceList])

  // ── UI side-effects ───────────────────────────────────────────────
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
    if (appSettingsView === 'mcp-servers') void refreshMcpServers()
  }, [appSettingsView])
  useEffect(() => {
    if (draggingPanelId) {
      document.body.style.userSelect = 'none'
      return () => { document.body.style.userSelect = '' }
    }
  }, [draggingPanelId])

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

  // ── Ref syncs (panels, editors, workspace) ─────────────────────────
  useEffect(() => { panelsRef.current = panels }, [panels])
  useEffect(() => { activePanelIdRef.current = activePanelId }, [activePanelId])
  useEffect(() => { editorPanelsRef.current = editorPanels }, [editorPanels])
  useEffect(() => { focusedEditorIdRef.current = focusedEditorId }, [focusedEditorId])
  useEffect(() => { showWorkspaceWindowRef.current = showWorkspaceWindow }, [showWorkspaceWindow])
  useEffect(() => { workspaceTreeRef.current = workspaceTree }, [workspaceTree])
  useEffect(() => { showHiddenFilesRef.current = showHiddenFiles }, [showHiddenFiles])
  useEffect(() => { showNodeModulesRef.current = showNodeModules }, [showNodeModules])
  useEffect(() => { selectedWorkspaceFileRef.current = selectedWorkspaceFile }, [selectedWorkspaceFile])

  // ── Panel focus / active panel scroll-to-bottom ───────────────────
  useEffect(() => {
    if (!activePanelId) return
    stickToBottomByPanelRef.current.set(activePanelId, true)
    const viewport = messageViewportRefs.current.get(activePanelId)
    if (viewport) {
      const scrollToBottom = () => { viewport.scrollTop = viewport.scrollHeight }
      requestAnimationFrame(() => { scrollToBottom(); requestAnimationFrame(scrollToBottom) })
    }
  }, [activePanelId])

  function setFocusedEditor(next: string | null) {
    focusedEditorIdRef.current = next
    setFocusedEditorId(next)
  }

  useEffect(() => {
    const level = api.getZoomLevel?.()
    if (level !== undefined) setZoomLevel(level)
  }, [api])
  useEffect(() => { api.setEditorMenuState?.(Boolean(focusedEditorId)) }, [api, focusedEditorId])
  useEffect(() => {
    if (focusedEditorId && !editorPanels.some((p) => p.id === focusedEditorId)) setFocusedEditor(null)
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
        if (typeof restored.showGitWindow === 'boolean') {
          setShowGitWindow(restored.showGitWindow)
        }
        if (typeof restored.showSettingsWindow === 'boolean') {
          setShowSettingsWindow(restored.showSettingsWindow)
        }
        if (restored.codeWindowTab) setCodeWindowTab(restored.codeWindowTab)
        if (restored.layoutMode) setLayoutMode(restored.layoutMode)
        if (restored.dockTab) setDockTab(restored.dockTab)
        if (restored.workspaceDockSide) setWorkspaceDockSide(restored.workspaceDockSide)
        if (restored.gitDockSide) setGitDockSide(restored.gitDockSide)
        if (restored.settingsDockSide) setSettingsDockSide(restored.settingsDockSide)
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

  const modelsPingedOnStartupRef = useRef(false)
  const modelsCatalogFetchedRef = useRef(false)
  useEffect(() => {
    if (!api.pingModel || modelsPingedOnStartupRef.current) return
    if (modelConfig.interfaces.length === 0) return
    modelsPingedOnStartupRef.current = true
    void (async () => {
      const allModels = modelConfig.interfaces
        .map((m) => ({ provider: m.provider, id: String(m.id ?? '').trim() }))
        .filter((m) => m.id.length > 0)
      const seen = new Set<string>()
      const uniqueModels = allModels.filter((m) => {
        const key = getModelPingKey(m.provider, m.id)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      if (uniqueModels.length === 0) return
      setModelPingPending((prev) => new Set([...prev, ...uniqueModels.map((m) => getModelPingKey(m.provider, m.id))]))
      const CONCURRENCY = 4
      const queue = [...uniqueModels]
      let active = 0
      let done = 0
      const runNext = () => {
        while (active < CONCURRENCY && queue.length > 0) {
          const item = queue.shift()!
          active++
          const modelPingKey = getModelPingKey(item.provider, item.id)
          api.pingModel(item.provider, item.id)
            .then((result) => {
              setModelPingResults((prev) => ({ ...prev, [modelPingKey]: result }))
              setModelPingPending((prev) => { const next = new Set(prev); next.delete(modelPingKey); return next })
            })
            .catch(() => {
              setModelPingResults((prev) => ({ ...prev, [modelPingKey]: { ok: false, durationMs: 0, error: 'Ping failed' } }))
              setModelPingPending((prev) => { const next = new Set(prev); next.delete(modelPingKey); return next })
            })
            .finally(() => {
              active--
              done++
              if (done < uniqueModels.length) runNext()
            })
        }
      }
      runNext()
    })()
  }, [api, modelConfig])

  useEffect(() => {
    if (!api.getAvailableModels || modelsCatalogFetchedRef.current) return
    modelsCatalogFetchedRef.current = true
    void (async () => {
      try {
        const available = await api.getAvailableModels()
        if (
          available.codex.length > 0 ||
          available.claude.length > 0 ||
          available.gemini.length > 0 ||
          available.openrouter.length > 0
        ) {
          setModelConfig((prev) => syncModelConfigWithCatalog(prev, available, providerRegistry))
        }
        // Startup ping effect already ran; catalog effect only syncs config, does not re-ping.
        // User can click "Refresh models" to re-fetch catalog and re-ping.
      } catch {
        // ignore - use built-in models only
      }
    })()
  }, [api, providerRegistry, modelConfig])

  const resolvedProviderConfigs = useMemo(
    () => resolveProviderConfigs(providerRegistry),
    [providerRegistry],
  )
  const showDockedAppSettings = showSettingsWindow && codeWindowTab === 'settings'

  // Warm up provider auth status on startup so status dots are available immediately.
  // Times the auth check; for providers with a deeper ping (claude, codex) runs that too.
  // Gemini's auth check is already --version, so a separate ping would be redundant.
  const startupAuthCheckedRef = useRef(false)
  useEffect(() => {
    if (startupAuthCheckedRef.current) return
    if (resolvedProviderConfigs.length === 0) return
    startupAuthCheckedRef.current = true
    void Promise.all(
      resolvedProviderConfigs
        .filter((config) => config.enabled)
        .map(async (config) => {
          const authStart = Date.now()
          const status = await refreshProviderAuthStatus(config)
          const authDurationMs = Date.now() - authStart
          if (!status?.authenticated) return
          if (PROVIDERS_WITH_DEDICATED_PING.has(config.id) && api.pingProvider) {
            try {
              const ping = await api.pingProvider(config.id)
              setProviderPingDurationByName((prev) => ({ ...prev, [config.id]: ping.durationMs }))
              if (ping.ok) {
                setProviderVerifiedByName((prev) => prev[config.id] ? prev : { ...prev, [config.id]: true })
              }
            } catch { /* ping failed - leave as amber */ }
          } else {
            setProviderPingDurationByName((prev) => ({ ...prev, [config.id]: authDurationMs }))
            setProviderVerifiedByName((prev) => prev[config.id] ? prev : { ...prev, [config.id]: true })
          }
        }),
    )
  }, [resolvedProviderConfigs])

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
    const liveCodeUnitIds = new Set<string>()
    const unitsToAutoCollapse = new Set<string>()
    for (const units of Object.values(panelTimelineById)) {
      for (const unit of units) {
        if (unit.kind !== 'code') continue
        liveCodeUnitIds.add(unit.id)
        if (unit.status !== 'completed' || timelinePinnedCodeByUnitId[unit.id]) continue
        if (autoCollapsedCompletedCodeUnitIdsRef.current.has(unit.id)) continue
        unitsToAutoCollapse.add(unit.id)
      }
    }
    if (unitsToAutoCollapse.size > 0) {
      setCodeBlockOpenById((prev) => {
        const keys = Object.keys(prev)
        if (keys.length === 0) return prev
        let changed = false
        const next = { ...prev }
        for (const unitId of unitsToAutoCollapse) {
          const prefix = `${unitId}:`
          for (const key of keys) {
            if (key.startsWith(prefix) && next[key]) {
              next[key] = false
              changed = true
            }
          }
        }
        return changed ? next : prev
      })
      for (const unitId of unitsToAutoCollapse) {
        autoCollapsedCompletedCodeUnitIdsRef.current.add(unitId)
      }
    }
    for (const unitId of Array.from(autoCollapsedCompletedCodeUnitIdsRef.current)) {
      if (!liveCodeUnitIds.has(unitId)) {
        autoCollapsedCompletedCodeUnitIdsRef.current.delete(unitId)
      }
    }
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
              showGitWindow: snapshot.showGitWindow,
              showSettingsWindow: snapshot.showSettingsWindow,
              showCodeWindow: snapshot.showCodeWindow,
              codeWindowTab: snapshot.codeWindowTab,
              dockTab: snapshot.dockTab,
              workspaceDockSide: snapshot.workspaceDockSide,
              gitDockSide: snapshot.gitDockSide,
              settingsDockSide: snapshot.settingsDockSide,
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
        showGitWindow,
        showSettingsWindow,
        showCodeWindow: false,
        codeWindowTab,
        dockTab,
        workspaceDockSide,
        gitDockSide,
        settingsDockSide,
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
        applicationSettings,
        themeOverrides,
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
    applicationSettings,
    codeWindowTab,
    dockTab,
    editorPanels,
    expandedDirectories,
    focusedEditorId,
    layoutMode,
    panels,
    selectedWorkspaceFile,
    showWorkspaceWindow,
    showGitWindow,
    showSettingsWindow,
    themeOverrides,
    workspaceList,
    workspaceRoot,
    workspaceDockSide,
    gitDockSide,
    settingsDockSide,
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
      const pending = lastScrollToUserMessageRef.current
      const scrolledPanelId = pending?.panelId ?? null
      if (pending) {
        const viewport = messageViewportRefs.current.get(pending.panelId)
        const unitId = `msg-${pending.messageId}`
        const el = viewport?.querySelector(`[data-unit-id="${unitId}"]`) as HTMLElement | null
        if (el) {
          el.scrollIntoView({ block: 'start', behavior: 'instant' })
        }
        lastScrollToUserMessageRef.current = null
      }
      for (const p of panels) {
        const viewport = messageViewportRefs.current.get(p.id)
        if (!viewport) continue
        if (scrolledPanelId === p.id) continue
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
      setSettingsPopoverByPanel((prev) =>
        Object.values(prev).some((value) => value !== null) ? {} : prev,
      )
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setSettingsPopoverByPanel((prev) =>
        Object.values(prev).some((value) => value !== null) ? {} : prev,
      )
    }
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  async function refreshProviderAuthStatusForWorkspace(config: ProviderConfig): Promise<ProviderAuthStatus | null> {
    setProviderAuthLoadingByName((prev) => ({ ...prev, [config.id]: true }))
    try {
      const status = (await api.getProviderAuthStatus(
        config.type === 'cli'
          ? { id: config.id, type: 'cli', cliCommand: config.cliCommand, cliPath: config.cliPath, authCheckCommand: config.authCheckCommand, loginCommand: config.loginCommand }
          : { id: config.id, type: 'api', apiBaseUrl: config.apiBaseUrl, loginUrl: config.loginUrl },
      )) as ProviderAuthStatus
      setProviderAuthByName((prev) => ({ ...prev, [config.id]: status }))
      setProviderAuthActionByName((prev) => ({ ...prev, [config.id]: null }))
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

  const workspaceLifecycle = useMemo(
    () =>
      createWorkspaceLifecycleController({
        api,
        workspaceSettingsByPath,
        panelsRef,
        editorPanelsRef,
        focusedEditorIdRef,
        workspaceSnapshotsRef,
        workspaceRootRef,
        activeWorkspaceLockRef,
        layoutMode,
        showWorkspaceWindow,
        showGitWindow,
        showSettingsWindow,
        showCodeWindow,
        codeWindowTab,
        dockTab,
        workspaceDockSide,
        gitDockSide,
        settingsDockSide,
        activePanelId,
        selectedWorkspaceFile,
        expandedDirectories,
        workspacePickerPrompt,
        setupWizardSelection,
        resolvedProviderConfigs,
        pendingWorkspaceSwitch,
        refreshProviderAuthStatus: refreshProviderAuthStatusForWorkspace,
        setWorkspacePickerError,
        setWorkspacePickerPrompt,
        setWorkspacePickerOpening,
        setShowWorkspacePicker,
        setSetupWizardStep,
        setSetupWizardSelection,
        setSetupWizardStatus,
        setShowSetupWizard,
        setSetupWizardFinishing,
        setProviderRegistry,
        setShowWorkspaceModal,
        setWorkspaceRoot,
        setLayoutMode,
        setShowWorkspaceWindow,
        setShowGitWindow,
        setShowSettingsWindow,
        setShowCodeWindow,
        setCodeWindowTab,
        setDockTab,
        setWorkspaceDockSide,
        setGitDockSide,
        setSettingsDockSide,
        setExpandedDirectories,
        setSelectedWorkspaceFile,
        setEditorPanels,
        setFocusedEditorId,
        setPanels,
        setActivePanelId,
        setSelectedHistoryId,
        setPendingWorkspaceSwitch,
      }),
    [
      api,
      workspaceSettingsByPath,
      layoutMode,
      showWorkspaceWindow,
      showGitWindow,
      showSettingsWindow,
      showCodeWindow,
      codeWindowTab,
      dockTab,
      workspaceDockSide,
      gitDockSide,
      settingsDockSide,
      activePanelId,
      selectedWorkspaceFile,
      expandedDirectories,
      workspacePickerPrompt,
      setupWizardSelection,
      resolvedProviderConfigs,
      pendingWorkspaceSwitch,
      refreshProviderAuthStatusForWorkspace,
    ],
  )
  const {
    buildWorkspaceSnapshot,
    openWorkspacePicker,
    closeWorkspacePicker,
    openSetupWizard,
    runSetupConnectivityChecks,
    finishSetupWizard,
    applyWorkspaceRoot,
    requestWorkspaceSwitch,
    confirmWorkspaceSwitch,
    applyWorkspaceSnapshot,
  } = workspaceLifecycle

  const workspaceSettings = useMemo(
    () =>
      createWorkspaceSettingsController({
        workspaceRoot,
        workspaceList,
        workspaceSettingsByPath,
        setWorkspaceModalMode,
        setWorkspaceForm,
        setWorkspaceFormTextDraft,
        setShowWorkspaceModal,
        setDockTab,
        setWorkspaceSettingsByPath,
        setWorkspaceList,
        setWorkspaceRoot,
        workspaceRootRef,
        activeWorkspaceLockRef,
        api,
        requestWorkspaceSwitch: (path) => requestWorkspaceSwitch(path, 'workspace-create'),
        applyWorkspaceRoot,
        applyWorkspaceSnapshot,
      }),
    [
      workspaceRoot,
      workspaceList,
      workspaceSettingsByPath,
      requestWorkspaceSwitch,
      applyWorkspaceRoot,
      applyWorkspaceSnapshot,
    ],
  )

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

  function isViewportNearBottom(viewport: HTMLElement, thresholdPx = 80) {
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
      if (showWorkspaceModal || dockTab === 'settings') {
        const normalized = workspaceSettings.normalizeWorkspaceSettingsForm(nextForm)
        queueMicrotask(() => {
          void workspaceSettings.persistWorkspaceSettings(normalized, { requestSwitch: true })
        })
      }
      return nextForm
    })
  }

  function flushWindowDelta(agentWindowId: string) {
    const buf = deltaBuffers.current.get(agentWindowId) ?? ''
    if (!buf) return
    deltaBuffers.current.set(agentWindowId, '')

    setPanels((prev) =>
      prev.map((w) => {
        if (w.id !== agentWindowId) return w
        const msgs = w.messages
        const roles = msgs.map((m) => m.role)
        const lastAssistantIdx = roles.lastIndexOf('assistant')
        const lastUserIdx = roles.lastIndexOf('user')
        // Only append to the existing assistant message if it comes AFTER the last user message.
        // If a user message was added after the last assistant message (i.e. a new turn just started),
        // create a fresh assistant message so the response doesn't bleed into the previous turn.
        if (w.streaming && lastAssistantIdx >= 0 && lastAssistantIdx > lastUserIdx) {
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

  function seedPanelActivity(agentWindowId: string) {
    const prev = activityLatestRef.current.get(agentWindowId)
    const seed: PanelActivityState = {
      lastEventAt: Date.now(),
      lastEventLabel: prev?.lastEventLabel ?? 'Turn started',
      totalEvents: prev?.totalEvents ?? 0,
      recent: prev?.recent ?? [],
    }
    activityLatestRef.current.set(agentWindowId, seed)
    setPanelActivityById((prevState) => ({ ...prevState, [agentWindowId]: seed }))
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

  // Runtime event hook is wired after editor/explorer workflow setup.

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

  function estimatePanelContextUsage(panel: AgentPanelState) {
    return estimatePanelContextUsageUtil(panel, getModelProvider)
  }

  function sandboxModeDescription(mode: SandboxMode) {
    return describeSandboxMode(mode)
  }

  function getWorkspaceSecurityLimitsForPath(path: string): { sandbox: SandboxMode; permissionMode: PermissionMode } {
    return getWorkspaceSecurityLimitsForPathUtil(path, workspaceSettingsByPath, workspaceRoot)
  }

  function clampPanelSecurityForWorkspace(
    cwd: string,
    sandbox: SandboxMode,
    permissionMode: PermissionMode,
  ): { sandbox: SandboxMode; permissionMode: PermissionMode } {
    return clampPanelSecurityForWorkspaceUtil(cwd, sandbox, permissionMode, workspaceSettingsByPath, workspaceRoot)
  }

  function getPanelSecurityState(panel: Pick<AgentPanelState, 'cwd' | 'sandbox' | 'permissionMode'>) {
    return getPanelSecurityStateUtil(panel, workspaceSettingsByPath, workspaceRoot)
  }

  const diagnosticsImageCtrl = useMemo(() => createDiagnosticsImageController({
    api,
    workspaceRoot,
    editorPanelsRef,
    setDiagnosticsActionStatus,
    setShowCodeWindow: setShowSettingsWindow, // alias for openDiagnosticsTarget
    setEditorPanels,
    setFocusedEditor,
    setPanels,
    formatError,
    fileNameFromRelativePath,
    newId,
    MAX_EDITOR_PANELS,
  }), [api, workspaceRoot])
  const { openDiagnosticsTarget, handlePasteImage } = diagnosticsImageCtrl

  function getModelProvider(model: string): ModelProvider {
    return modelConfig.interfaces.find((m) => m.id === model)?.provider ?? 'codex'
  }

  // ── Provider connectivity (auth, ping, API keys, login, upgrade) ──
  const providerCtrl = useMemo(() => createProviderConnectivityController({
    resolvedProviderConfigs,
    providerApiKeyDraftByName,
    api,
    setProviderAuthByName,
    setProviderAuthLoadingByName,
    setProviderAuthActionByName,
    setProviderPingDurationByName,
    setProviderVerifiedByName,
    setProviderApiKeyStateByName,
    setProviderApiKeyDraftByName,
    setMcpServers,
  }), [resolvedProviderConfigs, providerApiKeyDraftByName, api])
  const {
    ensureProviderReady,
    refreshProviderAuthStatus,
    refreshProviderApiAuthStatus,
    refreshAllProviderAuthStatuses,
    refreshMcpServers,
    refreshProviderApiKeyState,
    saveProviderApiKey,
    clearProviderApiKey,
    importProviderApiKeyFromEnv,
    startProviderLoginFlow,
    startProviderUpgradeFlow,
  } = providerCtrl

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

  const gitWorkflow = useMemo(
    () =>
      createGitWorkflowController({
        workspaceRoot,
        gitStatus,
        selectedGitPaths,
        gitSelectionAnchorPath,
        gitOperationPending,
        setGitStatus,
        setGitStatusLoading,
        setGitStatusError,
        setGitOperationPending,
        setGitOperationSuccess,
        setGitContextMenu,
        setSelectedWorkspaceFile,
        setSelectedGitPaths,
        setGitSelectionAnchorPath,
        setExplorerContextMenu,
        api,
        formatError,
      }),
    [
      workspaceRoot,
      gitStatus,
      selectedGitPaths,
      gitSelectionAnchorPath,
      gitOperationPending,
      api,
    ],
  )
  const {
    refreshGitStatus,
    resolveGitSelection,
    runGitOperation,
    handleGitEntryClick,
    openGitContextMenu,
  } = gitWorkflow

  function setExplorerPrefs(next: ExplorerPrefs) {
    setShowHiddenFiles(next.showHiddenFiles)
    setShowNodeModules(next.showNodeModules)
    if (!workspaceRoot) return
    setExplorerPrefsByWorkspace((prev) => ({ ...prev, [workspaceRoot]: next }))
  }

  const editorFile = useMemo(
    () =>
      createEditorFileController({
        workspaceRoot,
        setShowCodeWindow: () => {}, // Editor panels no longer require showing a specific dock window
        setCodeWindowTab,
        setEditorPanels,
        setFocusedEditor,
        setSelectedWorkspaceFile,
        editorPanelsRef,
        focusedEditorIdRef,
        api,
        refreshWorkspaceTree,
        fileNameFromRelativePath,
        formatError,
        newId,
        MAX_EDITOR_PANELS,
        MAX_EDITOR_FILE_SIZE_BYTES,
      }),
    [
      workspaceRoot,
      setShowCodeWindow,
      setCodeWindowTab,
      setEditorPanels,
      setFocusedEditor,
      setSelectedWorkspaceFile,
      api,
      refreshWorkspaceTree,
    ],
  )
  const {
    openEditorForRelativePath,
    updateEditorContent,
    saveEditorPanel,
    saveEditorPanelAs,
    closeEditorPanel,
    createNewFileFromMenu,
    openFileFromMenu,
  } = editorFile

  const explorerWorkflow = useMemo(
    () =>
      createExplorerWorkflowController({
        workspaceRoot,
        workspaceTree,
        expandedDirectories,
        setExpandedDirectories,
        setSelectedWorkspaceFile,
        setDockTab,
        setExplorerContextMenu,
        workspaceTreeRef,
        lastFindInPageQueryRef,
        lastFindInFilesQueryRef,
        selectedWorkspaceFileRef,
        showHiddenFilesRef,
        showNodeModulesRef,
        api,
        openEditorForRelativePath,
        formatError,
      }),
    [
      workspaceRoot,
      workspaceTree,
      expandedDirectories,
      api,
      openEditorForRelativePath,
    ],
  )
  const {
    findInPageFromMenu,
    findInFilesFromMenu,
    toggleDirectory,
    isDirectoryExpanded,
    expandAllDirectories,
    collapseAllDirectories,
    openExplorerContextMenu,
    closeExplorerContextMenu,
    openFileFromExplorerContextMenu,
  } = explorerWorkflow

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

  const panelLayoutCtrl = useMemo(() => createPanelLayoutController({
    panelsRef,
    workspaceRoot,
    workspaceSettingsByPath,
    MAX_PANELS,
    DEFAULT_MODEL,
    newId,
    makeDefaultPanel,
    withModelBanner,
    parseInteractionMode,
    clampPanelSecurityForWorkspace,
    setPanels,
    setLayoutMode,
    setActivePanelId,
    setFocusedEditorId,
    setWorkspaceDockSide,
    setDraggingPanelId,
    setDragOverTarget,
  }), [workspaceRoot, workspaceSettingsByPath])
  const {
    DND_TYPE_DOCK,
    DND_TYPE_AGENT,
    createAgentPanel,
    splitAgentPanel,
    reorderAgentPanel,
    handleDragStart,
    handleDragEnd,
    handleDockDrop,
    handleAgentDrop,
    handleDragOver,
  } = panelLayoutCtrl

  useAppRuntimeEvents({
    api,
    workspaceList,
    workspaceRoot,
    appendPanelDebug,
    markPanelActivity,
    formatToolTrace,
    setPanels,
    newId,
    withLimitWarningMessage,
    clearPanelTurnComplete,
    markPanelTurnComplete,
    activePromptStartedAtRef,
    kickQueuedMessage,
    queueDelta,
    flushWindowDelta,
    panelsRef,
    getModelProvider,
    setProviderVerifiedByName,
    looksIncomplete,
    autoContinueCountRef,
    MAX_AUTO_CONTINUE,
    AUTO_CONTINUE_PROMPT,
    setLastPromptDurationMsByPanel,
    upsertPanelToHistory,
    withExhaustedRateLimitWarning,
    isTurnCompletionRawNotification,
    summarizeRawNotification,
    shouldSurfaceRawNoteInChat,
    createAgentPanel,
    createNewFileFromMenu,
    workspaceSettings,
    openWorkspacePicker,
    openFileFromMenu,
    requestWorkspaceSwitch,
    closeWorkspacePicker,
    closeFocusedFromMenu,
    findInPageFromMenu,
    findInFilesFromMenu,
    openAppSettingsInRightDock,
    focusedEditorIdRef,
    saveEditorPanel,
    saveEditorPanelAs,
    setLayoutMode,
    setShowWorkspaceWindow,
    setShowSettingsWindow,
    setShowCodeWindow: setShowSettingsWindow, // alias for runtime events
    setZoomLevel,
  })

  function setEditorTabEditMode(editorId: string, editMode: boolean) {
    setEditorPanels((prev) =>
      prev.map((p) => (p.id === editorId ? { ...p, editMode } : p)),
    )
  }

  function toggleRightDockWindow(nextTab: CodeWindowTab) {
    if (showSettingsWindow && codeWindowTab === nextTab) {
      setShowSettingsWindow(false)
      return
    }
    setCodeWindowTab(nextTab)
    if (!showSettingsWindow) setShowSettingsWindow(true)
  }

  function openAppSettingsInRightDock(view: AppSettingsView) {
    setAppSettingsView(view)
    setCodeWindowTab('settings')
    if (!showSettingsWindow) setShowSettingsWindow(true)
  }

  function renderWorkspaceTile() {
    const dockContent =
      dockTab === 'orchestrator'
        ? renderAgentOrchestratorPane()
        : dockTab === 'explorer'
          ? (
              <ExplorerPane
                workspaceTree={workspaceTree}
                workspaceTreeLoading={workspaceTreeLoading}
                workspaceTreeError={workspaceTreeError}
                workspaceTreeTruncated={workspaceTreeTruncated}
                showHiddenFiles={showHiddenFiles}
                showNodeModules={showNodeModules}
                onExplorerPrefsChange={setExplorerPrefs}
                onRefresh={() => void refreshWorkspaceTree()}
                onExpandAll={expandAllDirectories}
                onCollapseAll={collapseAllDirectories}
                expandedDirectories={expandedDirectories}
                isDirectoryExpanded={isDirectoryExpanded}
                onToggleDirectory={toggleDirectory}
                selectedWorkspaceFile={selectedWorkspaceFile}
                onSelectFile={setSelectedWorkspaceFile}
                onOpenFile={(relativePath) => void openEditorForRelativePath(relativePath)}
                onOpenContextMenu={openExplorerContextMenu}
                onCloseGitContextMenu={() => setGitContextMenu(null)}
              />
            )
          : dockTab === 'git'
            ? (
                <GitPane
                  gitStatus={gitStatus}
                  gitStatusLoading={gitStatusLoading}
                  gitStatusError={gitStatusError}
                  gitOperationPending={gitOperationPending}
                  gitOperationSuccess={gitOperationSuccess}
                  workspaceRoot={workspaceRoot ?? ''}
                  resolvedSelectedPaths={resolveGitSelection()}
                  onRunOperation={(op) => void runGitOperation(op)}
                  onRefresh={() => void refreshGitStatus()}
                  onEntryClick={handleGitEntryClick}
                  onEntryDoubleClick={(relativePath) => void openEditorForRelativePath(relativePath)}
                  onEntryContextMenu={openGitContextMenu}
                />
              )
            : (
                <WorkspaceSettingsPane
                  workspaceForm={workspaceForm}
                  workspaceFormTextDraft={workspaceFormTextDraft}
                  modelOptions={getModelOptions(workspaceForm.defaultModel)}
                  onPathChange={(path) => setWorkspaceForm((prev) => ({ ...prev, path }))}
                  onPathBlur={(path) => {
                    const next = workspaceSettings.normalizeWorkspaceSettingsForm({ ...workspaceForm, path })
                    if (!next.path) return
                    void workspaceSettings.persistWorkspaceSettings(next, { requestSwitch: true })
                  }}
                  onBrowse={browseForWorkspaceIntoForm}
                  onDefaultModelChange={(value) =>
                    workspaceSettings.updateDockedWorkspaceForm((prev) => ({ ...prev, defaultModel: value }))
                  }
                  onSandboxChange={(value) =>
                    workspaceSettings.updateDockedWorkspaceForm((prev) => ({
                      ...prev,
                      sandbox: value,
                      permissionMode: value === 'read-only' ? 'verify-first' : prev.permissionMode,
                    }))
                  }
                  onPermissionModeChange={(value) =>
                    workspaceSettings.updateDockedWorkspaceForm((prev) => ({ ...prev, permissionMode: value }))
                  }
                  onTextDraftChange={workspaceSettings.updateDockedWorkspaceTextDraft}
                />
              )
    return (
      <WorkspaceTile
        dockTab={dockTab}
        workspaceDockSide={workspaceDockSide}
        showCodeWindow={true}
        draggingPanelId={draggingPanelId}
        dragOverTarget={dragOverTarget}
        dockContent={dockContent}
        onMouseDownCapture={() => setFocusedEditorId(null)}
        onDragOver={(e) => showSettingsWindow && handleDragOver(e, { acceptDock: true, targetId: 'dock-workspace' })}
        onDrop={(e) => showSettingsWindow && handleDockDrop(e)}
        onDragStart={(e) => showSettingsWindow && handleDragStart(e, 'workspace', 'workspace-window')}
        onDragEnd={handleDragEnd}
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
        onDockTabChange={(tab) => setDockTab(tab)}
        onWorkspaceSettingsTab={workspaceSettings.openWorkspaceSettingsTab}
        onDockSideToggle={() => setWorkspaceDockSide((prev) => (prev === 'right' ? 'left' : 'right'))}
        onClose={() => setShowWorkspaceWindow(false)}
      />
    )
  }

  function renderEditorPanel(panel: EditorPanelState) {
    return (
      <EditorPanel
        panel={panel}
        isFocused={focusedEditorId === panel.id}
        applicationSettings={applicationSettings}
        activeTheme={activeTheme}
        onFocus={() => setFocusedEditorId(panel.id)}
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
        onSave={() => void saveEditorPanel(panel.id)}
        onSaveAs={() => void saveEditorPanelAs(panel.id)}
        onClose={() => closeEditorPanel(panel.id)}
        onContentChange={(v) => updateEditorContent(panel.id, v)}
      />
    )
  }

  function renderLayoutPane(panelId: string) {
    if (panelId === 'workspace-window') return renderWorkspaceTile()
    if (panelId === 'git-window') return renderGitTile()
    if (panelId === 'settings-window') return renderSettingsTile()

    const editorPanel = editorPanels.find(p => p.id === panelId)
    if (editorPanel) return renderEditorPanel(editorPanel)

    const agentPanel = panels.find((w) => w.id === panelId)
    if (agentPanel) return renderPanelContent(agentPanel)
    return null
  }

  function renderGitTile() {
    return (
      <WorkspaceTile
        dockTab="git"
        workspaceDockSide={gitDockSide}
        showCodeWindow={true}
        draggingPanelId={draggingPanelId}
        dragOverTarget={dragOverTarget}
        dockContent={
          <GitPane
            gitStatus={gitStatus}
            gitStatusLoading={gitStatusLoading}
            gitStatusError={gitStatusError}
            gitOperationPending={gitOperationPending}
            gitOperationSuccess={gitOperationSuccess}
            workspaceRoot={workspaceRoot ?? ''}
            resolvedSelectedPaths={resolveGitSelection()}
            onRunOperation={(op) => void runGitOperation(op)}
            onRefresh={() => void refreshGitStatus()}
            onEntryClick={handleGitEntryClick}
            onEntryDoubleClick={(relativePath) => void openEditorForRelativePath(relativePath)}
            onEntryContextMenu={openGitContextMenu}
          />
        }
        onMouseDownCapture={() => setFocusedEditorId(null)}
        onDragOver={(e) => showSettingsWindow && handleDragOver(e, { acceptDock: true, targetId: 'dock-workspace' })}
        onDrop={(e) => showSettingsWindow && handleDockDrop(e)}
        onDragStart={(e) => showSettingsWindow && handleDragStart(e, 'workspace', 'git-window')}
        onDragEnd={handleDragEnd}
        onWheel={() => {}}
        onDockTabChange={(tab) => setDockTab(tab)}
        onWorkspaceSettingsTab={workspaceSettings.openWorkspaceSettingsTab}
        onDockSideToggle={() => setGitDockSide((prev) => (prev === 'right' ? 'left' : 'right'))}
        onClose={() => setShowGitWindow(false)}
      />
    )
  }

  function renderSettingsTile() {
    return (
      <WorkspaceTile
        dockTab="settings"
        workspaceDockSide={settingsDockSide}
        showCodeWindow={true}
        draggingPanelId={draggingPanelId}
        dragOverTarget={dragOverTarget}
        dockContent={
          <div className="h-full flex flex-col bg-neutral-50 dark:bg-neutral-900">
            {codeWindowSettingsHostRef.current ? null : <div ref={codeWindowSettingsHostRef} className="flex-1 min-h-0" />}
            <div ref={codeWindowSettingsHostRef} className="flex-1 min-h-0" />
          </div>
        }
        onMouseDownCapture={() => setFocusedEditorId(null)}
        onDragOver={(e) => showSettingsWindow && handleDragOver(e, { acceptDock: true, targetId: 'dock-workspace' })}
        onDrop={(e) => showSettingsWindow && handleDockDrop(e)}
        onDragStart={(e) => showSettingsWindow && handleDragStart(e, 'workspace', 'settings-window')}
        onDragEnd={handleDragEnd}
        onWheel={() => {}}
        onDockTabChange={(tab) => setDockTab(tab)}
        onWorkspaceSettingsTab={workspaceSettings.openWorkspaceSettingsTab}
        onDockSideToggle={() => setSettingsDockSide((prev) => (prev === 'right' ? 'left' : 'right'))}
        onClose={() => setShowSettingsWindow(false)}
      />
    )
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


  // ── Panel lifecycle (connect/reconnect/stall) ──────────────────────
  const panelLifecycleCtrl = useMemo(() => createPanelLifecycleController({
    modelConfig,
    workspaceSettingsByPath,
    workspaceRoot,
    api,
    panelsRef,
    reconnectingRef,
    needsContextOnNextCodexSendRef,
    setPanels,
    kickQueuedMessage,
    getModelProvider,
    clampPanelSecurityForWorkspace,
  }), [modelConfig, workspaceSettingsByPath, workspaceRoot, api])
  const { connectWindow, reconnectPanel, connectWindowWithRetry, formatConnectionError } = panelLifecycleCtrl

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
  }, [panelActivityById, reconnectPanel])

  // ── Agent pipeline (sendToAgent, closePanel, switchModel) ──────────
  const agentPipelineCtrl = useMemo(() => createAgentPipelineController({
    workspaceRoot,
    applicationSettings,
    panelsRef,
    activePromptStartedAtRef,
    needsContextOnNextCodexSendRef,
    api,
    setPanels,
    setLastPromptDurationMsByPanel,
    getModelProvider,
    ensureProviderReady,
    connectWindowWithRetry,
    connectWindow,
    formatConnectionError,
    appendPanelDebug,
    clearPanelTurnComplete,
    upsertPanelToHistory,
  }), [workspaceRoot, applicationSettings, api, connectWindowWithRetry, connectWindow, formatConnectionError])
  const { sendToAgent, closePanel, switchModel } = agentPipelineCtrl

  function kickQueuedMessage(winId: string) {
    let nextText = ''
    let snapshotForHistory: AgentPanelState | null = null
    stickToBottomByPanelRef.current.set(winId, true)
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
        lastScrollToUserMessageRef.current = { panelId: winId, messageId: queuedUserMessage.id }
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
    seedPanelActivity(winId)
    markPanelActivity(winId, { type: 'turnStart' })
    if (nextText) {
      clearPanelTurnComplete(winId)
      void sendToAgent(winId, nextText)
    }
  }

  const [resendingPanelId, setResendingPanelId] = useState<string | null>(null)

  const panelInputCtrl = useMemo(() => createPanelInputController({
    panels,
    panelsRef,
    editorPanels,
    inputDraftEditByPanel,
    stickToBottomByPanelRef,
    lastScrollToUserMessageRef,
    setPanels,
    setInputDraftEditByPanel,
    setSettingsPopoverByPanel,
    setResendingPanelId,
    autoResizeTextarea,
    upsertPanelToHistory,
    seedPanelActivity,
    markPanelActivity,
    clearPanelTurnComplete,
    sendToAgent,
    appendPanelDebug,
    getModelProvider,
    getWorkspaceSecurityLimitsForPath,
    clampPanelSecurityForWorkspace,
  }), [
    panels,
    editorPanels,
    inputDraftEditByPanel,
    sendToAgent,
  ])
  const {
    injectQueuedMessage,
    beginQueuedMessageEdit,
    removeQueuedMessage,
    cancelDraftEdit,
    recallLastUserMessage,
    sendMessage,
    resendLastUserMessage,
    grantPermissionAndResend,
    setInteractionMode,
    setPanelSandbox,
    setPanelPermission,
  } = panelInputCtrl

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

  const leftDockToggleButton = (
    <button
      type="button"
      className={headerDockToggleButtonClass(showWorkspaceWindow)}
      onClick={() => setShowWorkspaceWindow((prev) => !prev)}
      title={showWorkspaceWindow ? 'Hide left dock' : 'Show left dock'}
      aria-label={showWorkspaceWindow ? 'Hide left dock' : 'Show left dock'}
    >
      <PanelLeftIcon size={20} active={showWorkspaceWindow} />
    </button>
  )

  const rightDockToggleButton = (
    <button
      type="button"
      className={headerDockToggleButtonClass(showSettingsWindow)}
      onClick={() => setShowSettingsWindow((prev) => !prev)}
      title={showSettingsWindow ? 'Hide right dock' : 'Show right dock'}
      aria-label={showSettingsWindow ? 'Hide right dock' : 'Show right dock'}
    >
      <PanelRightIcon size={20} active={showSettingsWindow} />
    </button>
  )

  return (
    <div className="theme-preset h-screen w-full min-w-0 max-w-full overflow-y-auto overflow-x-hidden flex flex-col bg-neutral-100 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
      <style>{THEME_PRESET_CSS}</style>
      <AppHeaderBar
        workspaceDockButtonOnLeft={workspaceDockButtonOnLeft}
        toolsDockButtonsOnLeft={toolsDockButtonsOnLeft}
        leftDockToggleButton={leftDockToggleButton}
        rightDockToggleButton={rightDockToggleButton}
        headerDockToggleButtonClass={headerDockToggleButtonClass}
        showTerminalBar={showTerminalBar}
        setShowTerminalBar={setShowTerminalBar}
        workspaceList={workspaceList}
        workspaceRoot={workspaceRoot}
        requestWorkspaceSwitch={requestWorkspaceSwitch}
        UI_INPUT_CLASS={UI_INPUT_CLASS}
        UI_ICON_BUTTON_CLASS={UI_ICON_BUTTON_CLASS}
        openWorkspaceSettings={workspaceSettings.openWorkspaceSettings}
        historyDropdownRef={historyDropdownRef}
        historyDropdownOpen={historyDropdownOpen}
        setHistoryDropdownOpen={setHistoryDropdownOpen}
        workspaceScopedHistory={workspaceScopedHistory}
        openChatFromHistory={openChatFromHistory}
        formatHistoryOptionLabel={formatHistoryOptionLabel}
        setDeleteHistoryIdPending={setDeleteHistoryIdPending}
        createAgentPanel={() => createAgentPanel()}
        layoutMode={layoutMode}
        setLayoutMode={setLayoutMode}
      />

      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <div className="relative flex-1 min-h-0 min-w-0 bg-gradient-to-b from-neutral-100/90 to-neutral-100/60 dark:from-neutral-900 dark:to-neutral-950">
          <div ref={layoutRef} className="h-full flex flex-col min-h-0 min-w-0">
          {(() => {
            const contentPaneIds = [
              ...panels.map((p) => p.id),
              ...editorPanels.map((p) => p.id),
            ]
            const leftDockPanels = [
              ...(showWorkspaceWindow && workspaceDockSide === 'left' ? ['workspace-window'] : []),
              ...(showGitWindow && gitDockSide === 'left' ? ['git-window'] : []),
              ...(showSettingsWindow && settingsDockSide === 'left' ? ['settings-window'] : [])
            ]
            const rightDockPanels = [
              ...(showWorkspaceWindow && workspaceDockSide === 'right' ? ['workspace-window'] : []),
              ...(showGitWindow && gitDockSide === 'right' ? ['git-window'] : []),
              ...(showSettingsWindow && settingsDockSide === 'right' ? ['settings-window'] : [])
            ]
            
            const layoutPaneIds = [...leftDockPanels, ...contentPaneIds, ...rightDockPanels]
            if (layoutPaneIds.length === 1) {
              const id = layoutPaneIds[0]
              if (id === 'workspace-window' || id === 'git-window' || id === 'settings-window') {
                return (
                  <div className="flex-1 min-h-0 min-w-0 overflow-hidden px-3 py-3">
                    <div className="h-full min-h-0 max-w-full" style={{ width: '32%' }}>
                      {renderLayoutPane(id)}
                    </div>
                  </div>
                )
              }
              return <div className="flex-1 min-h-0 min-w-0 overflow-hidden">{renderLayoutPane(id)}</div>
            }
            // Tile vertical, horizontal, and grid: sidebars honour workspaceDockSide; only agent panels are tiled.
            const leftPaneId = leftDockPanels.length > 0 ? 'left-dock' : null
            const rightPaneId = rightDockPanels.length > 0 ? 'right-dock' : null
            const paneFlowOrientation = layoutMode === 'horizontal' ? 'vertical' : 'horizontal'
            const layoutGroupKey = `${layoutMode}:${leftDockPanels.join(',')}:${rightDockPanels.join(',')}:${contentPaneIds.join('|')}`
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
                      defaultSize="15"
                      minSize="15"
                      maxSize="55"
                      className="min-h-0 min-w-0"
                    >
                      {renderLayoutPane(leftPaneId)}
                    </Panel>
                    <Separator className="w-1 min-w-1 bg-neutral-300/80 dark:bg-neutral-700 hover:bg-blue-400 dark:hover:bg-blue-600 data-[resize-handle-active]:bg-blue-500" />
                  </>
                )}
                <Panel id="panel-content-tiled" defaultSize={leftPaneId && rightPaneId ? '70' : leftPaneId || rightPaneId ? '85' : '100'} minSize="20" className="min-h-0 min-w-0">
                  {contentPane}
                </Panel>
                {rightPaneId && (
                  <>
                    <Separator className="w-1 min-w-1 bg-neutral-300/80 dark:bg-neutral-700 hover:bg-blue-400 dark:hover:bg-blue-600 data-[resize-handle-active]:bg-blue-500" />
                    <Panel
                      id={`panel-${rightPaneId}`}
                      defaultSize="15"
                      minSize="15"
                      maxSize="55"
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
                <EmbeddedTerminal
                  workspaceRoot={workspaceRoot?.trim() || ''}
                  fontFamily={MONO_FONT_OPTIONS.find((f) => f.id === applicationSettings.fontCode)?.fontStack ?? MONO_FONT_OPTIONS[0].fontStack}
                  api={api}
                />
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
            onClick={closeExplorerContextMenu}
          />
          <div
            className="fixed z-50 py-1 min-w-[120px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-lg"
            style={{ left: explorerContextMenu.x, top: explorerContextMenu.y }}
          >
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-xs text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              onClick={() => openFileFromExplorerContextMenu(explorerContextMenu.relativePath)}
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

      <DockedAppSettings
        portalTarget={codeWindowSettingsHostRef.current}
        visible={showDockedAppSettings}
        appSettingsView={appSettingsView}
        setAppSettingsView={setAppSettingsView}
        onClose={() => { if (showDockedAppSettings) setCodeWindowTab('code') }}
        api={api}
        modelConfig={modelConfig}
        setModelConfig={setModelConfig}
        providerRegistry={providerRegistry}
        setProviderRegistry={setProviderRegistry}
        modelCatalogRefreshPending={modelCatalogRefreshPending}
        setModelCatalogRefreshPending={setModelCatalogRefreshPending}
        modelCatalogRefreshStatus={modelCatalogRefreshStatus}
        setModelCatalogRefreshStatus={setModelCatalogRefreshStatus}
        modelPingResults={modelPingResults}
        setModelPingResults={setModelPingResults}
        modelPingPending={modelPingPending}
        setModelPingPending={setModelPingPending}
        editingModel={editingModel}
        setEditingModel={setEditingModel}
        modelForm={modelForm}
        setModelForm={setModelForm}
        modelFormStatus={modelFormStatus}
        setModelFormStatus={setModelFormStatus}
        applicationSettings={applicationSettings}
        setApplicationSettings={setApplicationSettings}
        themeOverrides={themeOverrides}
        setThemeOverrides={setThemeOverrides}
        themeCatalog={themeCatalog}
        selectedThemeEditorId={selectedThemeEditorId}
        setSelectedThemeEditorId={setSelectedThemeEditorId}
        themeEditorDraft={themeEditorDraft}
        setThemeEditorDraft={setThemeEditorDraft}
        themeEditorStatus={themeEditorStatus}
        setThemeEditorStatus={setThemeEditorStatus}
        repairShortcutStatus={repairShortcutStatus}
        setRepairShortcutStatus={setRepairShortcutStatus}
        resolvedProviderConfigs={resolvedProviderConfigs}
        providerAuthByName={providerAuthByName}
        providerAuthLoadingByName={providerAuthLoadingByName}
        providerAuthActionByName={providerAuthActionByName}
        providerVerifiedByName={providerVerifiedByName}
        setProviderVerifiedByName={setProviderVerifiedByName}
        providerPingDurationByName={providerPingDurationByName}
        setProviderPingDurationByName={setProviderPingDurationByName}
        providerPanelOpenByName={providerPanelOpenByName}
        setProviderPanelOpenByName={setProviderPanelOpenByName}
        providerApiKeyDraftByName={providerApiKeyDraftByName}
        setProviderApiKeyDraftByName={setProviderApiKeyDraftByName}
        providerApiKeyStateByName={providerApiKeyStateByName}
        editingProvider={editingProvider}
        setEditingProvider={setEditingProvider}
        showProviderSetupModal={showProviderSetupModal}
        setShowProviderSetupModal={setShowProviderSetupModal}
        refreshProviderAuthStatus={refreshProviderAuthStatus}
        refreshProviderApiAuthStatus={refreshProviderApiAuthStatus}
        refreshAllProviderAuthStatuses={refreshAllProviderAuthStatuses}
        saveProviderApiKey={saveProviderApiKey}
        clearProviderApiKey={clearProviderApiKey}
        importProviderApiKeyFromEnv={importProviderApiKeyFromEnv}
        startProviderLoginFlow={startProviderLoginFlow}
        startProviderUpgradeFlow={startProviderUpgradeFlow}
        loadedPlugins={loadedPlugins ?? []}
        orchestratorSettings={orchestratorSettings}
        setOrchestratorSettings={setOrchestratorSettings}
        orchestratorLicenseKeyState={orchestratorLicenseKeyState}
        setOrchestratorLicenseKeyState={setOrchestratorLicenseKeyState}
        orchestratorLicenseKeyDraft={orchestratorLicenseKeyDraft}
        setOrchestratorLicenseKeyDraft={setOrchestratorLicenseKeyDraft}
        orchestratorInstallStatus={orchestratorInstallStatus}
        setOrchestratorInstallStatus={setOrchestratorInstallStatus}
        mcpServers={mcpServers}
        setMcpServers={setMcpServers}
        mcpPanelOpenByName={mcpPanelOpenByName}
        setMcpPanelOpenByName={setMcpPanelOpenByName}
        mcpEditingServer={mcpEditingServer}
        setMcpEditingServer={setMcpEditingServer}
        mcpJsonDraft={mcpJsonDraft}
        setMcpJsonDraft={setMcpJsonDraft}
        mcpJsonError={mcpJsonError}
        setMcpJsonError={setMcpJsonError}
        mcpAddMode={mcpAddMode}
        setMcpAddMode={setMcpAddMode}
        refreshMcpServers={refreshMcpServers}
        diagnosticsInfo={diagnosticsInfo}
        setDiagnosticsInfo={setDiagnosticsInfo}
        diagnosticsError={diagnosticsError}
        setDiagnosticsError={setDiagnosticsError}
        diagnosticsActionStatus={diagnosticsActionStatus}
        setDiagnosticsActionStatus={setDiagnosticsActionStatus}
        openDiagnosticsTarget={openDiagnosticsTarget}
        getModelOptions={getModelOptions}
        getModelOptionsGrouped={getModelOptionsGrouped}
      />

      <AppModals
        api={api}
        showProviderSetupModal={showProviderSetupModal}
        setShowProviderSetupModal={setShowProviderSetupModal}
        editingProvider={editingProvider}
        setEditingProvider={setEditingProvider}
        providerRegistry={providerRegistry}
        setProviderRegistry={setProviderRegistry}
        showSetupWizard={showSetupWizard}
        setShowSetupWizard={setShowSetupWizard}
        setupWizardStep={setupWizardStep}
        setSetupWizardStep={setSetupWizardStep}
        setupWizardSelection={setupWizardSelection}
        setSetupWizardSelection={setSetupWizardSelection}
        setupWizardStatus={setupWizardStatus}
        setSetupWizardStatus={setSetupWizardStatus}
        setupWizardFinishing={setupWizardFinishing}
        resolvedProviderConfigs={resolvedProviderConfigs}
        providerAuthByName={providerAuthByName}
        providerAuthLoadingByName={providerAuthLoadingByName}
        providerVerifiedByName={providerVerifiedByName}
        setProviderVerifiedByName={setProviderVerifiedByName}
        providerPingDurationByName={providerPingDurationByName}
        setProviderPingDurationByName={setProviderPingDurationByName}
        providerApiKeyDraftByName={providerApiKeyDraftByName}
        setProviderApiKeyDraftByName={setProviderApiKeyDraftByName}
        providerApiKeyStateByName={providerApiKeyStateByName}
        saveProviderApiKey={saveProviderApiKey}
        importProviderApiKeyFromEnv={importProviderApiKeyFromEnv}
        refreshProviderAuthStatus={refreshProviderAuthStatus}
        startProviderLoginFlow={startProviderLoginFlow}
        startProviderUpgradeFlow={startProviderUpgradeFlow}
        runSetupConnectivityChecks={runSetupConnectivityChecks}
        finishSetupWizard={finishSetupWizard}
        deleteHistoryIdPending={deleteHistoryIdPending}
        setDeleteHistoryIdPending={setDeleteHistoryIdPending}
        deleteAllHistoryChecked={deleteAllHistoryChecked}
        setDeleteAllHistoryChecked={setDeleteAllHistoryChecked}
        deleteThisAndOlderChecked={deleteThisAndOlderChecked}
        setDeleteThisAndOlderChecked={setDeleteThisAndOlderChecked}
        deleteHistoryEntry={deleteHistoryEntry}
        pendingWorkspaceSwitch={pendingWorkspaceSwitch}
        setPendingWorkspaceSwitch={setPendingWorkspaceSwitch}
        showWorkspacePicker={showWorkspacePicker}
        workspacePickerPrompt={workspacePickerPrompt}
        setWorkspacePickerPrompt={setWorkspacePickerPrompt}
        workspacePickerOpening={workspacePickerOpening}
        setWorkspacePickerOpening={setWorkspacePickerOpening}
        workspacePickerError={workspacePickerError}
        setWorkspacePickerError={setWorkspacePickerError}
        workspaceList={workspaceList}
        setWorkspaceList={setWorkspaceList}
        workspaceRoot={workspaceRoot}
        workspaceSettingsByPath={workspaceSettingsByPath}
        setWorkspaceSettingsByPath={setWorkspaceSettingsByPath}
        openWorkspacePicker={openWorkspacePicker}
        closeWorkspacePicker={closeWorkspacePicker}
        requestWorkspaceSwitch={requestWorkspaceSwitch}
        confirmWorkspaceSwitch={confirmWorkspaceSwitch}
        showWorkspaceModal={showWorkspaceModal}
        setShowWorkspaceModal={setShowWorkspaceModal}
        workspaceModalMode={workspaceModalMode}
        workspaceForm={workspaceForm}
        setWorkspaceForm={setWorkspaceForm}
        workspaceFormTextDraft={workspaceFormTextDraft}
        workspaceSettings={workspaceSettings}
        browseForWorkspaceIntoForm={browseForWorkspaceIntoForm}
        sandboxModeDescription={sandboxModeDescription}
        modelConfig={modelConfig}
        getModelOptions={getModelOptions}
      />
    </div>
  )

  function renderPanelContent(w: AgentPanelState) {
    return (
      <PanelContentRenderer
        panel={w}
        ctx={{
          api,
          panels,
          activePanelId,
          draggingPanelId,
          dragOverTarget,
          panelActivityById,
          panelTimelineById,
          panelTurnCompleteAtById,
          activityClock,
          lastPromptDurationMsByPanel,
          activePromptStartedAtRef,
          applicationSettings,
          inputDraftEditByPanel,
          settingsPopoverByPanel,
          activeTheme,
          modelConfig,
          providerAuthByName,
          providerVerifiedByName,
          timelineOpenByUnitId,
          setTimelineOpenByUnitId,
          codeBlockOpenById,
          setCodeBlockOpenById,
          timelinePinnedCodeByUnitId,
          setTimelinePinnedCodeByUnitId,
          resendingPanelId,
          handleDragOver,
          handleAgentDrop,
          handleDragStart,
          handleDragEnd,
          splitAgentPanel,
          closePanel,
          registerMessageViewport,
          onMessageViewportScroll,
          onChatHistoryContextMenu,
          formatToolTrace,
          onChatLinkClick,
          grantPermissionAndResend,
          recallLastUserMessage,
          resendLastUserMessage,
          beginQueuedMessageEdit,
          injectQueuedMessage,
          removeQueuedMessage,
          getModelProvider,
          getModelOptions,
          registerTextarea,
          setPanels,
          autoResizeTextarea,
          handlePasteImage,
          sendMessage,
          onInputPanelContextMenu,
          cancelDraftEdit,
          setSettingsPopoverByPanel,
          setInteractionMode,
          setPanelSandbox,
          setPanelPermission,
          switchModel,
          parseInteractionMode,
          getPanelSecurityState,
          estimatePanelContextUsage,
          setActivePanelId,
          setFocusedEditorId,
          onPanelWheel: (e: React.WheelEvent, panelId: string) => {
            if (!isZoomWheelGesture(e)) return
            e.preventDefault()
            setActivePanelId(panelId)
            setFocusedEditorId(null)
            if (zoomWheelThrottleRef.current) return
            zoomWheelThrottleRef.current = true
            if (e.deltaY < 0) api.zoomIn?.()
            else if (e.deltaY > 0) api.zoomOut?.()
            const level = api.getZoomLevel?.()
            if (level !== undefined) setZoomLevel(level)
            setTimeout(() => { zoomWheelThrottleRef.current = false }, 120)
          },
        }}
      />
    )
  }
}

