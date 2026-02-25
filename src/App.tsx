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
import { createAgentPipelineController } from './controllers/agentPipelineController'
import { useLocalStoragePersistence } from './hooks/useLocalStoragePersistence'
import { createProviderConnectivityController, PROVIDERS_WITH_DEDICATED_PING } from './controllers/providerConnectivityController'
import { createExplorerWorkflowController } from './controllers/explorerWorkflowController'
import { createGitWorkflowController } from './controllers/gitWorkflowController'
import { createWorkspaceSettingsController } from './controllers/workspaceSettingsController'
import { AgentPanelHeader } from './components/panels/AgentPanelHeader'
import { EditorPanel } from './components/panels/EditorPanel'
import { WorkspaceTile } from './components/workspace/WorkspaceTile'
import { AgentPanelShell } from './components/panels/AgentPanelShell'
import { CodeWindowTile } from './components/panels/CodeWindowTile'
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
  const showDockedAppSettings = showCodeWindow && codeWindowTab === 'settings'

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
    showCodeWindow,
    themeOverrides,
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

  useEffect(() => {
    const unsubEvent = api.onEvent(({ agentWindowId, evt }: any) => {
      if (!agentWindowId) agentWindowId = 'default'
      if (evt?.type === 'thinking') {
        appendPanelDebug(agentWindowId, 'event:thinking', evt.message ?? '')
        markPanelActivity(agentWindowId, evt)
        const thinkingText = typeof evt.message === 'string' ? evt.message.trim() : ''
        if (thinkingText && thinkingText.includes(':')) {
          const prefixed = `\u{1F504} ${formatToolTrace(thinkingText)}`
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
        // Mark this provider as verified (first successful response confirms readiness)
        const completedPanel = panelsRef.current.find((p) => p.id === agentWindowId)
        if (completedPanel) {
          const verifiedProvider = getModelProvider(completedPanel.model)
          setProviderVerifiedByName((prev) => prev[verifiedProvider] ? prev : { ...prev, [verifiedProvider]: true })
        }
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
        workspaceSettings.openWorkspaceSettings('new')
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
        void workspaceSettings.deleteWorkspace(workspaceRoot)
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
        setShowCodeWindow,
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
        showCodeWindow={showCodeWindow}
        draggingPanelId={draggingPanelId}
        dragOverTarget={dragOverTarget}
        dockContent={dockContent}
        onMouseDownCapture={() => setFocusedEditorId(null)}
        onDragOver={(e) => showCodeWindow && handleDragOver(e, { acceptDock: true, targetId: 'dock-workspace' })}
        onDrop={(e) => showCodeWindow && handleDockDrop(e)}
        onDragStart={(e) => showCodeWindow && handleDragStart(e, 'workspace', 'workspace-window')}
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
    if (panelId === 'code-window')
      return (
        <CodeWindowTile
          editorPanels={editorPanels}
          focusedEditorId={focusedEditorId}
          codeWindowTab={codeWindowTab}
          showWorkspaceWindow={showWorkspaceWindow}
          workspaceDockSide={workspaceDockSide}
          applicationSettings={applicationSettings}
          activeTheme={activeTheme}
          settingsHostRef={codeWindowSettingsHostRef}
          onDragOver={(e) => showWorkspaceWindow && handleDragOver(e, { acceptDock: true, targetId: 'dock-code' })}
          onDrop={(e) => showWorkspaceWindow && handleDockDrop(e)}
          onDragStart={(e) => showWorkspaceWindow && handleDragStart(e, 'code', 'code-window')}
          onDragEnd={handleDragEnd}
          onZoomWheel={(e) => {
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
          onDockSideToggle={() => setWorkspaceDockSide((prev) => (prev === 'right' ? 'left' : 'right'))}
          onCloseCodeWindow={() => setShowCodeWindow(false)}
          onFocusedEditorChange={(id) => setFocusedEditor(id)}
          onEditorTabChange={(id) => setFocusedEditor(id)}
          onEditModeToggle={(id) => {
            const panel = editorPanelsRef.current.find((p) => p.id === id)
            const nextMode = !(panel?.editMode ?? false)
            setEditorTabEditMode(id, nextMode)
          }}
          onWordWrapToggle={() => setApplicationSettings((p) => ({ ...p, editorWordWrap: !p.editorWordWrap }))}
          onSave={(id) => void saveEditorPanel(id)}
          onSaveAs={(id) => void saveEditorPanelAs(id)}
          onCloseEditor={closeEditorPanel}
          onEditorContentChange={updateEditorContent}
          onMouseDownCapture={(e) => {
            const target = e.target
            if (target instanceof HTMLElement) {
              if (target.closest('select') || target.closest('button') || target.closest('textarea') || target.closest('.cm-editor') || target.closest('a')) return
            }
            const id = focusedEditorIdRef.current ?? editorPanelsRef.current[0]?.id ?? null
            if (id) setFocusedEditor(id)
          }}
          draggingPanelId={draggingPanelId}
          dragOverTarget={dragOverTarget}
        />
      )
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
        lastScrollToUserMessageRef.current = { panelId: winId, messageId: queuedUserMessage.id }
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
    seedPanelActivity(winId)
    markPanelActivity(winId, { type: 'turnStart' })
    if (!textToInject) return
    clearPanelTurnComplete(winId)
    void sendToAgent(winId, textToInject)
  }

  function beginQueuedMessageEdit(winId: string, index: number) {
    let queuedText = ''
    setPanels((prev) =>
      prev.map((x) => {
        if (x.id !== winId) return x
        if (index < 0 || index >= x.pendingInputs.length) return x
        queuedText = x.pendingInputs[index]
        return {
          ...x,
          input: queuedText,
          status: `Editing queued message ${index + 1}. Send to update this slot.`,
        }
      }),
    )
    if (!queuedText) return
    setInputDraftEditByPanel((prev) => ({ ...prev, [winId]: { kind: 'queued', index } }))
    queueMicrotask(() => autoResizeTextarea(winId))
  }

  function removeQueuedMessage(winId: string, index: number) {
    setPanels((prev) =>
      prev.map((x) => {
        if (x.id !== winId) return x
        if (index < 0 || index >= x.pendingInputs.length) return x
        const nextPending = x.pendingInputs.filter((_, j) => j !== index)
        return { ...x, pendingInputs: nextPending }
      }),
    )
    setInputDraftEditByPanel((prev) => {
      const draft = prev[winId]
      if (!draft || draft.kind !== 'queued') return prev
      if (draft.index === index) return { ...prev, [winId]: null }
      if (draft.index > index) return { ...prev, [winId]: { kind: 'queued', index: draft.index - 1 } }
      return prev
    })
  }

  function cancelDraftEdit(winId: string) {
    setInputDraftEditByPanel((prev) => ({ ...prev, [winId]: null }))
    setPanels((prev) =>
      prev.map((x) =>
        x.id !== winId
          ? x
          : {
              ...x,
              status: 'Draft edit cancelled.',
            },
      ),
    )
  }

  function recallLastUserMessage(winId: string) {
    const w = panels.find((x) => x.id === winId)
    if (!w) return
    const lastUserMsg = [...w.messages].reverse().find((m) => m.role === 'user' && (m.content ?? '').trim())
    if (!lastUserMsg?.content) return
    const isBusy = w.streaming || w.pendingInputs.length > 0
    setInputDraftEditByPanel((prev) => ({
      ...prev,
      [winId]: isBusy ? { kind: 'recalled' } : null,
    }))
    setPanels((prev) =>
      prev.map((x) =>
        x.id !== winId
          ? x
          : {
              ...x,
              input: lastUserMsg.content ?? '',
              status: isBusy
                ? 'Recalled last message. Edit, then send to queue corrected text next.'
                : 'Recalled last message. Edit and send when ready.',
            },
      ),
    )
    queueMicrotask(() => autoResizeTextarea(winId))
  }

  function sendMessage(winId: string) {
    const w = panels.find((x) => x.id === winId)
    if (!w) return
    const draftEdit = inputDraftEditByPanel[winId] ?? null
    const text = w.input.trim()
    const messageAttachments = w.attachments.map((a) => ({ ...a }))
    const imagePaths = messageAttachments.map((a) => a.path)
    if (!text && imagePaths.length === 0) return
    const hasDirtyEditor = editorPanels.some((p) => p.dirty)
    const updatingQueuedDraft = draftEdit?.kind === 'queued'
    if (hasDirtyEditor) {
      if (updatingQueuedDraft) {
        // Updating queued text does not execute tools yet, so skip unsaved-editor warning.
      } else {
      const proceed = confirm(
        'You have unsaved changes in the Code Window. Agents may overwrite your edits. Save your changes first, or choose OK to continue anyway.',
      )
      if (!proceed) return
      }
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
          if (draftEdit?.kind === 'queued') {
            const nextPending = [...x.pendingInputs]
            if (draftEdit.index >= 0 && draftEdit.index < nextPending.length) {
              nextPending[draftEdit.index] = text
              appendPanelDebug(winId, 'queue', `Updated queued message #${draftEdit.index + 1} (${text.length} chars)`)
            } else {
              nextPending.push(text)
              appendPanelDebug(winId, 'queue', `Queued edited message at end (${text.length} chars)`)
            }
            const updated: AgentPanelState = {
              ...x,
              input: '',
              pendingInputs: nextPending,
              status: 'Updated queued message.',
            }
            snapshotForHistory = updated
            return updated
          }
          if (draftEdit?.kind === 'recalled') {
            appendPanelDebug(winId, 'queue', `Queued recalled correction at front (${text.length} chars)`)
            const updated: AgentPanelState = {
              ...x,
              input: '',
              pendingInputs: [text, ...x.pendingInputs],
              status: 'Correction queued to run next.',
            }
            snapshotForHistory = updated
            return updated
          }
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
        stickToBottomByPanelRef.current.set(winId, true)
        const userMessage: ChatMessage = {
          id: newId(),
          role: 'user',
          content: text,
          format: 'text',
          attachments: messageAttachments.length > 0 ? messageAttachments : undefined,
          createdAt: Date.now(),
        }
        lastScrollToUserMessageRef.current = { panelId: winId, messageId: userMessage.id }
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
    seedPanelActivity(winId)
    markPanelActivity(winId, { type: 'turnStart' })
    if (draftEdit) {
      setInputDraftEditByPanel((prev) => ({ ...prev, [winId]: null }))
    }

    if (!isBusy) void sendToAgent(winId, text, imagePaths)
  }

  const [resendingPanelId, setResendingPanelId] = useState<string | null>(null)

  function resendLastUserMessage(winId: string) {
    const w = panels.find((x) => x.id === winId)
    if (!w || w.streaming) return
    const lastUserMsg = [...w.messages].reverse().find((m) => m.role === 'user')
    if (!lastUserMsg) return
    setResendingPanelId(winId)
    setTimeout(() => setResendingPanelId(null), 1200)
    clearPanelTurnComplete(winId)
    stickToBottomByPanelRef.current.set(winId, true)
    lastScrollToUserMessageRef.current = { panelId: winId, messageId: lastUserMsg.id }
    setPanels((prev) =>
      prev.map((x) =>
        x.id !== winId
          ? x
          : { ...x, streaming: true, status: 'Resending...' },
      ),
    )
    seedPanelActivity(winId)
    markPanelActivity(winId, { type: 'turnStart' })
    void sendToAgent(winId, lastUserMsg.content)
  }

  function grantPermissionAndResend(panelId: string) {
    const panel = panelsRef.current.find((p) => p.id === panelId)
    if (!panel || panel.streaming) return
    const limits = getWorkspaceSecurityLimitsForPath(panel.cwd)
    if (limits.sandbox === 'read-only') {
      setPanels((prev) =>
        prev.map((p) =>
          p.id !== panelId
            ? p
            : {
                ...p,
                status: 'Permissions are disabled because workspace sandbox is Read only.',
              },
        ),
      )
      return
    }

    if (limits.permissionMode === 'verify-first') {
      setPanels((prev) =>
        prev.map((p) =>
          p.id !== panelId
            ? p
            : {
                ...p,
                permissionMode: 'verify-first',
                status: 'Permissions are locked to Verify first by Workspace settings.',
              },
        ),
      )
      return
    }

    setPanels((prev) =>
      prev.map((p) =>
        p.id !== panelId
          ? p
          : (() => {
              const clamped = clampPanelSecurityForWorkspace(p.cwd, p.sandbox, 'proceed-always')
              return {
                ...p,
                permissionMode: clamped.permissionMode,
                connected: false,
                status: 'Permissions set: Proceed always (reconnect on next send).',
              }
            })(),
      ),
    )
    setTimeout(() => resendLastUserMessage(panelId), 0)
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
      <style>{THEME_PRESET_CSS}</style>
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
              onClick={() => workspaceSettings.openWorkspaceSettings('new')}
              title="New workspace"
            >
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className={`${UI_ICON_BUTTON_CLASS} shrink-0`}
              onClick={() => workspaceSettings.openWorkspaceSettings('edit')}
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
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-0.5 shrink-0">
              {!workspaceDockButtonOnLeft && workspaceDockToggleButton}
              {!toolsDockButtonsOnLeft && codeDockToggleButton}
              {!toolsDockButtonsOnLeft && settingsDockToggleButton}
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
                  {view === 'mcp-servers' && 'MCP Servers'}
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
                      setModelPingResults({})
                      setModelPingPending(new Set())
                      try {
                        const available = await api.getAvailableModels()
                        const nextModelConfig = syncModelConfigWithCatalog(modelConfig, available, providerRegistry)
                        setModelConfig(nextModelConfig)

                        const seenModelPingKeys = new Set<string>()
                        const allModels: { provider: ModelProvider; id: string }[] = nextModelConfig.interfaces
                          .map((m) => ({ provider: m.provider, id: String(m.id ?? '').trim() }))
                          .filter((m) => m.id.length > 0)
                          .filter((m) => {
                            const key = getModelPingKey(m.provider, m.id)
                            if (seenModelPingKeys.has(key)) return false
                            seenModelPingKeys.add(key)
                            return true
                          })

                        if (allModels.length === 0) {
                          setModelCatalogRefreshStatus({ kind: 'error', message: 'No models available to test. Enable providers and try again.' })
                          return
                        }
                        const total = allModels.length
                        setModelCatalogRefreshStatus({ kind: 'success', message: `Found ${total} model${total === 1 ? '' : 's'}. Testing each...` })

                        // Kick off pings for all configured models in parallel (max 4 at a time).
                        setModelPingPending(new Set(allModels.map((m) => getModelPingKey(m.provider, m.id))))

                        const CONCURRENCY = 4
                        const queue = [...allModels]
                        let active = 0
                        let done = 0
                        const runNext = () => {
                          while (active < CONCURRENCY && queue.length > 0) {
                            const item = queue.shift()!
                            active++
                            const modelPingKey = getModelPingKey(item.provider, item.id)
                            ;(api.pingModel ? api.pingModel(item.provider, item.id) : Promise.resolve({ ok: true, durationMs: 0 }))
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
                                if (done === allModels.length) {
                                  setModelCatalogRefreshStatus((prev) => prev?.kind === 'success' ? { kind: 'success', message: `${total} model${total === 1 ? '' : 's'} tested.` } : prev)
                                } else {
                                  runNext()
                                }
                              })
                          }
                        }
                        runNext()
                      } catch (err) {
                        setModelCatalogRefreshStatus({ kind: 'error', message: `Provider refresh failed: ${formatError(err)}` })
                      } finally {
                        setModelCatalogRefreshPending(false)
                      }
                    }}
                    disabled={modelCatalogRefreshPending}
                  >
                    {modelCatalogRefreshPending && (
                      <SpinnerIcon size={14} className="animate-spin" />
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
                            <div className="min-w-0 flex items-center gap-2">
                              {(() => {
                                const modelPingKey = getModelPingKey(m.provider, m.id)
                                const ping = modelPingResults[modelPingKey]
                                const pending = modelPingPending.has(modelPingKey)
                                if (pending) return (
                                  <svg className="h-2.5 w-2.5 shrink-0 animate-spin text-neutral-400" viewBox="0 0 16 16" fill="none" aria-label="Testing...">
                                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
                                    <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                  </svg>
                                )
                                if (!ping) return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-neutral-300 dark:bg-neutral-600" title="Not tested" />
                                return <span
                                  className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${ping.ok ? 'bg-emerald-500' : 'bg-red-500'}`}
                                  title={ping.ok ? `Working (${ping.durationMs}ms)` : (ping.error ?? 'Failed')}
                                />
                              })()}
                              <span className="font-medium break-all">{m.id}</span>
                              <span className="text-xs text-neutral-500 dark:text-neutral-400">{grp.label}</span>
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
                            ? (providerVerifiedByName[config.id] ? 'Connected' : 'Authenticated')
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
                            ? (providerVerifiedByName[config.id]
                              ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300'
                              : 'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300')
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
                            {(() => {
                              const cVerified = providerVerifiedByName[config.id]
                              const dotCls = !providerEnabled
                                ? 'bg-neutral-400 dark:bg-neutral-500'
                                : !status
                                  ? 'bg-neutral-400 dark:bg-neutral-500'
                                  : !status.installed
                                    ? 'bg-red-500'
                                    : status.authenticated
                                      ? (cVerified ? 'bg-emerald-500' : 'bg-amber-500')
                                      : 'bg-amber-500'
                              const dotTitle = !providerEnabled
                                ? 'Disabled'
                                : !status
                                  ? 'Checking...'
                                  : !status.installed
                                    ? status.detail ?? 'CLI not found'
                                    : status.authenticated
                                      ? (cVerified ? status.detail ?? 'Connected' : 'Authenticated. Waiting for first response to verify.')
                                      : status.detail ?? 'Login required'
                              return (
                                <span
                                  className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${dotCls}`}
                                  title={dotTitle}
                                />
                              )
                            })()}
                            <span className="font-medium text-sm text-neutral-800 dark:text-neutral-200 truncate">
                              {config.displayName}
                              {!isBuiltIn && (
                                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 ml-1">(custom)</span>
                              )}
                            </span>
                            <div className={`px-2 py-0.5 rounded-full text-[11px] border ${statusClass}`}>{statusLabel}</div>
                            {providerPingDurationByName[config.id] != null && (
                              <span className="text-[10px] text-neutral-500 dark:text-neutral-400" title="Startup ping round-trip time">
                                {providerPingDurationByName[config.id]! < 1000
                                  ? `${providerPingDurationByName[config.id]}ms`
                                  : `${(providerPingDurationByName[config.id]! / 1000).toFixed(1)}s`}
                              </span>
                            )}
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
                                  onClick={async () => {
                                    const authStart = Date.now()
                                    const s = await refreshProviderAuthStatus(config)
                                    const authDurationMs = Date.now() - authStart
                                    if (!s?.authenticated) return
                                    if (PROVIDERS_WITH_DEDICATED_PING.has(config.id) && api.pingProvider) {
                                      try {
                                        const ping = await api.pingProvider(config.id)
                                        setProviderPingDurationByName((prev) => ({ ...prev, [config.id]: ping.durationMs }))
                                        if (ping.ok) setProviderVerifiedByName((prev) => prev[config.id] ? prev : { ...prev, [config.id]: true })
                                      } catch { /* ignore */ }
                                    } else {
                                      setProviderPingDurationByName((prev) => ({ ...prev, [config.id]: authDurationMs }))
                                      setProviderVerifiedByName((prev) => prev[config.id] ? prev : { ...prev, [config.id]: true })
                                    }
                                  }}
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

              {appSettingsView === 'mcp-servers' && (
                <>
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">MCP Servers</div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                      onClick={() => void refreshMcpServers()}
                    >
                      Refresh
                    </button>
                    <button
                      type="button"
                      className="px-2.5 py-1.5 rounded-md border border-blue-400 bg-blue-50 text-blue-800 hover:bg-blue-100 text-xs dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-900/50"
                      onClick={() => {
                        setMcpAddMode(true)
                        setMcpEditingServer(null)
                        setMcpJsonDraft('')
                        setMcpJsonError(null)
                      }}
                    >
                      Add Server
                    </button>
                  </div>
                </div>
                <div className="text-xs text-neutral-600 dark:text-neutral-400">
                  MCP (Model Context Protocol) servers provide additional tools to agents. Paste server config JSON below in Claude Desktop format. Tools are automatically available to API-based providers (OpenRouter, OpenAI).
                </div>

                {mcpAddMode && (
                  <div className="rounded-lg border border-blue-300 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-3 space-y-2">
                    <div className="text-xs font-medium text-blue-800 dark:text-blue-200">Add MCP Server</div>
                    <textarea
                      className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-xs font-mono dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 resize-y"
                      rows={8}
                      value={mcpJsonDraft}
                      onChange={(e) => { setMcpJsonDraft(e.target.value); setMcpJsonError(null) }}
                      placeholder={'{\n  "azure-sql": {\n    "command": "npx",\n    "args": ["-y", "@azure/mssql-mcp-server"],\n    "env": {\n      "MSSQL_CONNECTION_STRING": "Server=tcp:..."\n    }\n  }\n}'}
                      spellCheck={false}
                    />
                    {mcpJsonError && (
                      <div className="text-xs text-red-600 dark:text-red-400">{mcpJsonError}</div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        className="px-2.5 py-1.5 rounded-md border border-blue-400 bg-blue-50 text-blue-800 hover:bg-blue-100 text-xs dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-900/50"
                        onClick={async () => {
                          try {
                            let parsed = JSON.parse(mcpJsonDraft.trim()) as Record<string, unknown>
                            if (parsed.mcpServers && typeof parsed.mcpServers === 'object' && !Array.isArray(parsed.mcpServers)) {
                              parsed = parsed.mcpServers as Record<string, unknown>
                            }
                            const keys = Object.keys(parsed)
                            if (keys.length === 0) { setMcpJsonError('JSON must have at least one server key.'); return }
                            for (const key of keys) {
                              const val = parsed[key] as Record<string, unknown>
                              if (!val || typeof val !== 'object' || typeof val.command !== 'string' || !val.command) {
                                setMcpJsonError(`Server "${key}" is missing a "command" field.`); return
                              }
                              await api.addMcpServer(key, {
                                command: val.command as string,
                                args: Array.isArray(val.args) ? val.args.map(String) : undefined,
                                env: val.env && typeof val.env === 'object' ? val.env as Record<string, string> : undefined,
                                enabled: true,
                              })
                            }
                            setMcpAddMode(false)
                            setMcpJsonDraft('')
                            setMcpJsonError(null)
                            void refreshMcpServers()
                          } catch {
                            setMcpJsonError('Invalid JSON. Paste a valid config object.')
                          }
                        }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                        onClick={() => { setMcpAddMode(false); setMcpJsonDraft(''); setMcpJsonError(null) }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  {mcpServers.length === 0 && !mcpAddMode && (
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 italic py-2">
                      No MCP servers configured. Click "Add Server" and paste a JSON config block.
                    </div>
                  )}
                  {mcpServers.map((server) => {
                    const panelOpen = mcpPanelOpenByName[server.name] ?? false
                    const isEditing = mcpEditingServer === server.name
                    const statusLabel = server.config.enabled === false
                      ? 'Disabled'
                      : server.connected
                        ? 'Connected'
                        : server.error
                          ? 'Error'
                          : 'Disconnected'
                    const statusClass = server.config.enabled === false
                      ? 'border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400'
                      : server.connected
                        ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300'
                        : server.error
                          ? 'border-red-300 text-red-700 dark:border-red-800 dark:text-red-300'
                          : 'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300'
                    return (
                      <details
                        key={server.name}
                        open={panelOpen}
                        onToggle={(e) => {
                          const next = e.currentTarget.open
                          setMcpPanelOpenByName((prev) => (prev[server.name] === next ? prev : { ...prev, [server.name]: next }))
                        }}
                        className={`group rounded-lg border border-neutral-300 dark:border-neutral-700 p-3 bg-neutral-100 dark:bg-neutral-900/60 shadow-sm ${server.config.enabled === false ? 'opacity-60' : ''}`}
                      >
                        <summary className="list-none cursor-pointer flex items-center justify-between gap-3 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/80 hover:bg-neutral-50 dark:hover:bg-neutral-800 px-2.5 py-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-medium text-sm text-neutral-800 dark:text-neutral-200 truncate">{server.name}</span>
                            <div className={`px-2 py-0.5 rounded-full text-[11px] border ${statusClass}`}>{statusLabel}</div>
                            {server.connected && (
                              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                {server.toolCount} tool{server.toolCount !== 1 ? 's' : ''}
                              </span>
                            )}
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
                          {!isEditing && (
                            <>
                              <pre className="text-xs font-mono text-neutral-800 dark:text-neutral-200 bg-neutral-50 dark:bg-neutral-900 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all border border-neutral-200 dark:border-neutral-700">
{JSON.stringify({ [server.name]: { command: server.config.command, ...(server.config.args?.length ? { args: server.config.args } : {}), ...(server.config.env && Object.keys(server.config.env).length ? { env: server.config.env } : {}) } }, null, 2)}
                              </pre>
                              {server.error && (
                                <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-2 py-1 rounded border border-red-200 dark:border-red-900">
                                  {server.error}
                                </div>
                              )}
                              {server.connected && server.tools.length > 0 && (
                                <div className="space-y-1">
                                  <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Available Tools</div>
                                  <div className="flex flex-wrap gap-1">
                                    {server.tools.map((t) => (
                                      <span
                                        key={t.name}
                                        className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300"
                                        title={t.description ?? t.name}
                                      >
                                        {t.name}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="flex gap-1.5 pt-1 flex-wrap">
                                <button
                                  type="button"
                                  className="px-2 py-1 text-xs rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                  onClick={() => {
                                    setMcpEditingServer(server.name)
                                    const configObj: Record<string, unknown> = { command: server.config.command }
                                    if (server.config.args?.length) configObj.args = server.config.args
                                    if (server.config.env && Object.keys(server.config.env).length) configObj.env = server.config.env
                                    setMcpJsonDraft(JSON.stringify({ [server.name]: configObj }, null, 2))
                                    setMcpJsonError(null)
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="px-2 py-1 text-xs rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                  onClick={async () => {
                                    await api.restartMcpServer(server.name)
                                    void refreshMcpServers()
                                  }}
                                >
                                  Restart
                                </button>
                                <button
                                  type="button"
                                  className="px-2 py-1 text-xs rounded border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                                  onClick={async () => {
                                    await api.removeMcpServer(server.name)
                                    void refreshMcpServers()
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            </>
                          )}
                          {isEditing && (
                            <div className="space-y-2">
                              <textarea
                                className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-xs font-mono dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 resize-y"
                                rows={8}
                                value={mcpJsonDraft}
                                onChange={(e) => { setMcpJsonDraft(e.target.value); setMcpJsonError(null) }}
                                spellCheck={false}
                              />
                              {mcpJsonError && (
                                <div className="text-xs text-red-600 dark:text-red-400">{mcpJsonError}</div>
                              )}
                              <div className="flex gap-2 pt-1">
                                <button
                                  type="button"
                                  className="px-2.5 py-1.5 rounded-md border border-blue-400 bg-blue-50 text-blue-800 hover:bg-blue-100 text-xs dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-900/50"
                                  onClick={async () => {
                                    try {
                                      let parsed = JSON.parse(mcpJsonDraft.trim()) as Record<string, unknown>
                                      if (parsed.mcpServers && typeof parsed.mcpServers === 'object' && !Array.isArray(parsed.mcpServers)) {
                                        parsed = parsed.mcpServers as Record<string, unknown>
                                      }
                                      const keys = Object.keys(parsed)
                                      if (keys.length !== 1) { setMcpJsonError('Edit JSON must have exactly one server key.'); return }
                                      const newName = keys[0]
                                      const val = parsed[newName] as Record<string, unknown>
                                      if (!val || typeof val !== 'object' || typeof val.command !== 'string' || !val.command) {
                                        setMcpJsonError('Missing "command" field.'); return
                                      }
                                      if (newName !== server.name) {
                                        await api.removeMcpServer(server.name)
                                      }
                                      const fn = newName !== server.name ? api.addMcpServer : api.updateMcpServer
                                      await fn(newName, {
                                        command: val.command as string,
                                        args: Array.isArray(val.args) ? val.args.map(String) : undefined,
                                        env: val.env && typeof val.env === 'object' ? val.env as Record<string, string> : undefined,
                                        enabled: server.config.enabled,
                                      })
                                      setMcpEditingServer(null)
                                      setMcpJsonDraft('')
                                      setMcpJsonError(null)
                                      void refreshMcpServers()
                                    } catch {
                                      setMcpJsonError('Invalid JSON.')
                                    }
                                  }}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                  onClick={() => { setMcpEditingServer(null); setMcpJsonDraft(''); setMcpJsonError(null) }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </details>
                    )
                  })}
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
                          ? (providerVerifiedByName[providerId] ? 'Connected' : 'Authenticated')
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
                          <div className="flex items-center gap-2 font-medium text-sm text-neutral-800 dark:text-neutral-200">
                            <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${
                              !providerEnabled ? 'bg-neutral-400 dark:bg-neutral-500'
                              : !status ? 'bg-neutral-400 dark:bg-neutral-500'
                              : !status.installed ? 'bg-red-500'
                              : status.authenticated
                                ? (providerVerifiedByName[providerId] ? 'bg-emerald-500' : 'bg-amber-500')
                                : 'bg-amber-500'
                            }`} title={
                              !providerEnabled ? 'Disabled'
                              : !status ? 'Checking...'
                              : !status.installed ? (status.detail ?? 'CLI not found')
                              : status.authenticated
                                ? (providerVerifiedByName[providerId] ? (status.detail ?? 'Connected') : 'Authenticated. Waiting for first response to verify.')
                                : (status.detail ?? 'Login required')
                            } />
                            {providerId === 'openrouter' ? 'OpenRouter (Free Models)' : config.displayName}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-neutral-600 dark:text-neutral-400">{statusText}</span>
                            {providerPingDurationByName[providerId] != null && (
                              <span className="text-[10px] text-neutral-500 dark:text-neutral-400" title="Ping round-trip time">
                                {providerPingDurationByName[providerId]! < 1000
                                  ? `${providerPingDurationByName[providerId]}ms`
                                  : `${(providerPingDurationByName[providerId]! / 1000).toFixed(1)}s`}
                              </span>
                            )}
                          </div>
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
                            onClick={async () => {
                              const authStart = Date.now()
                              const s = await refreshProviderAuthStatus(config)
                              const authDurationMs = Date.now() - authStart
                              if (!s?.authenticated) return
                              if (PROVIDERS_WITH_DEDICATED_PING.has(config.id) && api.pingProvider) {
                                try {
                                  const ping = await api.pingProvider(config.id)
                                  setProviderPingDurationByName((prev) => ({ ...prev, [config.id]: ping.durationMs }))
                                  if (ping.ok) setProviderVerifiedByName((prev) => prev[config.id] ? prev : { ...prev, [config.id]: true })
                                } catch { /* ignore */ }
                              } else {
                                setProviderPingDurationByName((prev) => ({ ...prev, [config.id]: authDurationMs }))
                                setProviderVerifiedByName((prev) => prev[config.id] ? prev : { ...prev, [config.id]: true })
                              }
                            }}
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
                          {config.type === 'cli' &&
                            ((config as ProviderConfigCli).upgradeCommand || (config as ProviderConfigCli).upgradePackage) && (
                            <button
                              className={UI_BUTTON_SECONDARY_CLASS}
                              disabled={loading}
                              onClick={() => void startProviderUpgradeFlow(config)}
                              title={
                                (config as ProviderConfigCli).upgradePackage
                                  ? `Clean reinstall: npm uninstall -g ${(config as ProviderConfigCli).upgradePackage}; npm install -g ${(config as ProviderConfigCli).upgradePackage}@latest`
                                  : (config as ProviderConfigCli).upgradeCommand
                              }
                            >
                              {status?.installed ? 'Upgrade CLI' : 'Install CLI'}
                            </button>
                          )}
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
                  <div>{workspacePickerPrompt}</div>
                  {isLockedWorkspacePrompt(workspacePickerPrompt) && (
                    <button
                      type="button"
                      className="mt-2 px-3 py-1.5 text-xs rounded border border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-800/60"
                      disabled={Boolean(workspacePickerOpening)}
                      onClick={async () => {
                        setWorkspacePickerError(null)
                        for (const p of workspaceList) {
                          setWorkspacePickerOpening(p)
                          try {
                            const result = await api.claimWorkspace?.(p)
                            if (result?.ok) {
                              setWorkspacePickerPrompt(null)
                              requestWorkspaceSwitch(p, 'picker')
                              return
                            }
                          } catch { /* try next */ }
                        }
                        setWorkspacePickerOpening(null)
                        setWorkspacePickerError('Could not override locks. Try closing other Barnaby instances manually.')
                      }}
                    >
                      Force unlock and open
                    </button>
                  )}
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
                    const next = workspaceSettings.normalizeWorkspaceSettingsForm({ ...workspaceForm, path: e.target.value })
                    if (!next.path) return
                    void workspaceSettings.persistWorkspaceSettings(next, { requestSwitch: true })
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
                    workspaceSettings.updateWorkspaceModalForm((prev) => ({ ...prev, defaultModel: e.target.value }))
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
                      workspaceSettings.updateWorkspaceModalForm((prev) => {
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
                      workspaceSettings.updateWorkspaceModalForm((prev) => ({
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
                      onChange={(e) => workspaceSettings.updateWorkspaceModalTextDraft('allowedCommandPrefixes', e.target.value)}
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
                        void workspaceSettings.deleteWorkspace(workspaceForm.path)
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
    const isIdle = !w.streaming && queueCount === 0
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
    const draftEdit = inputDraftEditByPanel[w.id] ?? null
    const editingQueuedIndex = draftEdit?.kind === 'queued' ? draftEdit.index : null
    const sendTitle = draftEdit?.kind === 'queued'
      ? 'Update queued message'
      : draftEdit?.kind === 'recalled' && isBusy
        ? 'Queue corrected message next'
        : isBusy
      ? hasInput
        ? `Stop${queueCount > 0 ? ` (${queueCount} queued)` : ''}`
        : 'Stop'
      : 'Send'
    const secondsAgo = Number.isFinite(msSinceLastActivity) ? Math.max(0, Math.floor(msSinceLastActivity / 1000)) : null
    const activityTitle = activity
      ? `Activity: ${activityLabel}\nLast event: ${activity.lastEventLabel}\n${secondsAgo}s ago\nEvents seen: ${activity.totalEvents}\nTimeline units: ${timelineUnits.length}`
      : `Activity: idle\nNo events seen yet for this panel.\nTimeline units: ${timelineUnits.length}`
    const lastPromptDurationMs = lastPromptDurationMsByPanel[w.id]
    const formatDurationLabel = (durationMs: number) => `${(durationMs / 1000).toFixed(1).replace(/\.0$/, '')}s`
    const activePromptStartedAt = activePromptStartedAtRef.current.get(w.id)
    const livePromptDurationLabel =
      isRunning && typeof activePromptStartedAt === 'number'
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
    const lastUserUnitId = [...timelineUnits].reverse().find((u) => u.kind === 'user')?.id ?? null
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
    const contextUsageStrokeColor =
      contextUsagePercent === null
        ? 'currentColor'
        : contextUsagePercent >= 95
          ? '#dc2626'
          : contextUsagePercent >= 85
            ? '#f59e0b'
            : '#059669'

    return (
      <AgentPanelShell
        isActive={activePanelId === w.id}
        hasSettingsPopover={Boolean(settingsPopover)}
        onFocus={() => {
          setActivePanelId(w.id)
          setFocusedEditorId(null)
        }}
        onMouseDown={() => {
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
        <AgentPanelHeader
          panel={w}
          panelsCount={panels.length}
          draggingPanelId={draggingPanelId}
          dragOverTarget={dragOverTarget}
          onDragOver={(e) => handleDragOver(e, { acceptAgent: true, targetId: `agent-${w.id}` })}
          onDrop={(e) => handleAgentDrop(e, w.id)}
          onDragStart={(e) => handleDragStart(e, 'agent', w.id)}
          onDragEnd={handleDragEnd}
          onSplit={() => splitAgentPanel(w.id)}
          onClose={() => closePanel(w.id)}
        />

        <AgentPanelMessageViewport
          registerRef={(el) => registerMessageViewport(w.id, el)}
          onScroll={() => onMessageViewportScroll(w.id)}
          onContextMenu={onChatHistoryContextMenu}
          panelTextStyle={panelTextStyle}
        >
          <ChatTimeline
            timelineUnits={timelineUnits}
            showOperationTrace={showOperationTrace}
            showReasoningUpdates={showReasoningUpdates}
            showActivityUpdates={showActivityUpdates}
            timelineOpenByUnitId={timelineOpenByUnitId}
            setTimelineOpenByUnitId={setTimelineOpenByUnitId}
            codeBlockOpenById={codeBlockOpenById}
            setCodeBlockOpenById={setCodeBlockOpenById}
            timelinePinnedCodeByUnitId={timelinePinnedCodeByUnitId}
            setTimelinePinnedCodeByUnitId={setTimelinePinnedCodeByUnitId}
            operationTraceColor={operationTraceColor}
            timelineMessageColor={timelineMessageColor}
            debugNoteColor={debugNoteColor}
            activeTheme={activeTheme}
            panelId={w.id}
            isStreaming={w.streaming}
            permissionMode={w.permissionMode}
            isIdle={isIdle}
            activityClock={activityClock}
            lastAgentTimelineUnitId={lastAgentTimelineUnitId}
            lastUserUnitId={lastUserUnitId}
            completedPromptDurationLabel={completedPromptDurationLabel}
            resendingPanelId={resendingPanelId}
            queueCount={queueCount}
            pendingInputs={w.pendingInputs}
            editingQueuedIndex={editingQueuedIndex}
            formatToolTrace={formatToolTrace}
            onChatLinkClick={onChatLinkClick}
            onGrantPermissionAndResend={() => grantPermissionAndResend(w.id)}
            onRecallLastUserMessage={() => recallLastUserMessage(w.id)}
            onResendLastUserMessage={() => resendLastUserMessage(w.id)}
            onBeginQueuedMessageEdit={(i) => beginQueuedMessageEdit(w.id, i)}
            onInjectQueuedMessage={(i) => injectQueuedMessage(w.id, i)}
            onRemoveQueuedMessage={(i) => removeQueuedMessage(w.id, i)}
          />
        </AgentPanelMessageViewport>

        <ChatInputSection
          panel={w}
          panelFontSizePx={panelFontSizePx}
          panelLineHeightPx={panelLineHeightPx}
          hasInput={hasInput}
          isBusy={isBusy}
          draftEdit={draftEdit}
          sendTitle={sendTitle}
          livePromptDurationLabel={livePromptDurationLabel}
          timelineMessageColor={timelineMessageColor}
          contextUsage={contextUsage ?? null}
          contextUsagePercent={contextUsagePercent}
          contextUsageStrokeColor={contextUsageStrokeColor}
          activityDotClass={activityDotClass}
          activityLabel={activityLabel}
          activityTitle={activityTitle}
          isRunning={isRunning}
          showCompletionNotice={showCompletionNotice}
          settingsPopover={settingsPopover}
          interactionMode={interactionMode}
          effectiveSandbox={effectiveSandbox}
          effectivePermissionMode={effectivePermissionMode}
          sandboxLockedToView={sandboxLockedToView}
          permissionDisabledByReadOnlySandbox={permissionDisabledByReadOnlySandbox}
          permissionLockedToVerifyFirst={permissionLockedToVerifyFirst}
          modelConfig={modelConfig}
          providerAuthByName={providerAuthByName}
          providerVerifiedByName={providerVerifiedByName}
          getModelProvider={getModelProvider}
          getModelOptions={getModelOptions}
          textareaRef={(el) => registerTextarea(w.id, el)}
          onInputChange={(next) => {
            setPanels((prev) => prev.map((x) => (x.id === w.id ? { ...x, input: next } : x)))
            queueMicrotask(() => autoResizeTextarea(w.id))
          }}
          onFocus={() => setActivePanelId(w.id)}
          onPasteImage={(file) => void handlePasteImage(w.id, file)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendMessage(w.id)
            }
          }}
          onContextMenu={onInputPanelContextMenu}
          onSend={() => sendMessage(w.id)}
          onInterrupt={() => void api.interrupt(w.id)}
          onCancelDraftEdit={() => cancelDraftEdit(w.id)}
          onRemoveAttachment={(attachmentId) =>
            setPanels((prev) =>
              prev.map((p) =>
                p.id !== w.id ? p : { ...p, attachments: p.attachments.filter((x) => x.id !== attachmentId) },
              ),
            )
          }
          setSettingsPopover={(next) =>
            setSettingsPopoverByPanel((prev) => ({ ...prev, [w.id]: next }))
          }
          onSetInteractionMode={(mode) => setInteractionMode(w.id, mode)}
          onSetPanelSandbox={(value) => setPanelSandbox(w.id, value)}
          onSetPanelPermission={(value) => setPanelPermission(w.id, value)}
          onSandboxLockedClick={() =>
            setPanels((prev) =>
              prev.map((p) =>
                p.id !== w.id
                  ? p
                  : { ...p, status: 'Sandbox is locked to View. Expand sandbox in Workspace settings.' },
              ),
            )
          }
          onSwitchModel={(modelId) => switchModel(w.id, modelId)}
        />
      </AgentPanelShell>
    )
  }
}

