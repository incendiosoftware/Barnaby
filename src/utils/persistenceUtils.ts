import type {
  AgentInteractionMode,
  AgentPanelState,
  ApplicationSettings,
  ChatHistoryEntry,
  ChatMessage,
  ChatRole,
  ConnectivityProvider,
  EditorPanelState,
  ExplorerPrefs,
  MessageFormat,
  ModelConfig,
  ModelProvider,
  OrchestratorSettings,
  ParsedAppState,
  PastedImageAttachment,
  PermissionMode,
  PersistedAgentPanelState,
  PersistedEditorPanelState,
  ProviderRegistry,
  SandboxMode,
  WorkspaceSettings,
  WorkspaceSettingsTextDraft,
} from '../types'
import {
  APP_SETTINGS_STORAGE_KEY,
  CHAT_HISTORY_STORAGE_KEY,
  DEFAULT_FONT_CODE,
  DEFAULT_FONT_EDITOR,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_THINKING,
  DEFAULT_MODEL,
  DEFAULT_MODEL_INTERFACES,
  DEFAULT_THEME_ID,
  EXPLORER_PREFS_STORAGE_KEY,
  FONT_OPTIONS,
  MAX_CHAT_HISTORY_ENTRIES,
  MAX_FONT_SCALE,
  MAX_PANELS,
  MIN_FONT_SCALE,
  MODEL_CONFIG_STORAGE_KEY,
  MONO_FONT_OPTIONS,
  ORCHESTRATOR_SETTINGS_STORAGE_KEY,
  PROVIDER_REGISTRY_STORAGE_KEY,
  SETUP_WIZARD_DONE_STORAGE_KEY,
  THEME_ID_STORAGE_KEY,
  WORKSPACE_DOCK_SIDE_STORAGE_KEY,
  WORKSPACE_LIST_STORAGE_KEY,
  WORKSPACE_SETTINGS_STORAGE_KEY,
  WORKSPACE_STORAGE_KEY,
} from '../constants'
import { THEMES } from '../constants/themes'
import { newId, fileNameFromRelativePath } from './pathUtils'
import { sanitizeThemeOverrides, getInitialThemeOverrides } from './themeUtils'
import { stripSyntheticAutoContinueMessages } from './messageAnalysisUtils'

// Re-export getInitialThemeOverrides so it is available from persistenceUtils if needed
export { getInitialThemeOverrides }

const INITIAL_HISTORY_MAX_MESSAGES = 24

export function getInitialThemeId(): string {
  const stored = globalThis.localStorage?.getItem(THEME_ID_STORAGE_KEY) ?? ''
  if (THEMES.some((t) => t.id === stored)) return stored
  return DEFAULT_THEME_ID
}

export function getInitialWorkspaceRoot() {
  return (globalThis.localStorage?.getItem(WORKSPACE_STORAGE_KEY) ?? '').trim()
}

export function getInitialSetupWizardDone() {
  return (globalThis.localStorage?.getItem(SETUP_WIZARD_DONE_STORAGE_KEY) ?? '') === '1'
}

export function getDefaultSetupWizardSelection(): Record<ConnectivityProvider, boolean> {
  return {
    codex: true,
    claude: false,
    gemini: false,
    openrouter: false,
  }
}

export function getInitialWorkspaceDockSide(): 'left' | 'right' {
  const stored = (globalThis.localStorage?.getItem(WORKSPACE_DOCK_SIDE_STORAGE_KEY) ?? '').toLowerCase()
  return stored === 'right' ? 'right' : 'left'
}

export function getInitialModelConfig(): ModelConfig {
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

export function getInitialProviderRegistry(): ProviderRegistry {
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

export function getInitialWorkspaceList(): string[] {
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

export function cloneChatMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    ...m,
    attachments: m.attachments ? m.attachments.map((a) => ({ ...a })) : undefined,
  }))
}

export function panelMessagesToInitialHistory(
  messages: ChatMessage[],
  maxMessages = INITIAL_HISTORY_MAX_MESSAGES,
): Array<{ role: 'user' | 'assistant'; text: string }> {
  const trimmed = messages.slice(-maxMessages)
  return trimmed
    .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, text: (m.content ?? '').trim() }))
    .filter((m) => m.text.length > 0)
}

export function parseHistoryMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return []
  const next: ChatMessage[] = []
  for (const message of raw) {
    if (!message || typeof message !== 'object') continue
    const record = message as Partial<ChatMessage>
    const role: ChatRole =
      record.role === 'user' || record.role === 'assistant' || record.role === 'system' ? record.role : 'system'
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
      interactionMode:
        record.interactionMode === 'agent' ||
          record.interactionMode === 'plan' ||
          record.interactionMode === 'debug' ||
          record.interactionMode === 'ask'
          ? record.interactionMode
          : undefined,
      format,
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
      createdAt:
        typeof record.createdAt === 'number' && Number.isFinite(record.createdAt) ? record.createdAt : undefined,
    })
  }
  return stripSyntheticAutoContinueMessages(next)
}

export function parseChatHistoryEntries(raw: unknown, fallbackWorkspaceRoot: string): ChatHistoryEntry[] {
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
      record.sandbox === 'read-only' || record.sandbox === 'workspace-write' ? record.sandbox : 'workspace-write'
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
      fontScale:
        typeof record.fontScale === 'number'
          ? Math.max(MIN_FONT_SCALE, Math.min(MAX_FONT_SCALE, record.fontScale))
          : 1,
      messages,
    })
  }
  return entries
}

export function getInitialChatHistory(): ChatHistoryEntry[] {
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

export function parseApplicationSettings(parsed: Partial<ApplicationSettings> | null | undefined): ApplicationSettings {
  const validUiFontIds = new Set(FONT_OPTIONS.map((f) => f.id))
  const validMonoFontIds = new Set(MONO_FONT_OPTIONS.map((f) => f.id))
  const resolveChat = (): string => {
    if (typeof parsed?.fontChat === 'string' && validUiFontIds.has(parsed.fontChat)) return parsed.fontChat
    if (typeof parsed?.fontFamily === 'string' && validUiFontIds.has(parsed.fontFamily)) return parsed.fontFamily
    return DEFAULT_FONT_FAMILY
  }
  const resolveCode = (): string =>
    typeof parsed?.fontCode === 'string' && validMonoFontIds.has(parsed.fontCode) ? parsed.fontCode : DEFAULT_FONT_CODE
  const resolveThinking = (): string => {
    if (typeof parsed?.fontThinking === 'string' && validUiFontIds.has(parsed.fontThinking)) return parsed.fontThinking
    return resolveChat()
  }
  const resolveEditor = (): string =>
    typeof parsed?.fontEditor === 'string' && validMonoFontIds.has(parsed.fontEditor) ? parsed.fontEditor : DEFAULT_FONT_EDITOR

  const defaults: ApplicationSettings = {
    restoreSessionOnStartup: false,
    alwaysOpenLastWorkspace: false,
    themeId: DEFAULT_THEME_ID,
    fontChat: DEFAULT_FONT_FAMILY,
    fontChatSize: 14,
    fontCode: DEFAULT_FONT_CODE,
    fontCodeSize: 13,
    fontThinking: DEFAULT_FONT_FAMILY,
    fontThinkingSize: 13,
    fontEditor: DEFAULT_FONT_EDITOR,
    fontEditorSize: 13,
    responseStyle: 'standard',
    showDebugNotesInTimeline: false,
    showRawConversationTools: false,
    verboseDiagnostics: false,
    showResponseDurationAfterPrompt: false,
    editorWordWrap: true,
    customiseStandardThemes: false,
    enableMessageSizeLog: false,
    showDebugLogPanel: false,
  }
  if (!parsed || typeof parsed !== 'object') return defaults
  return {
    restoreSessionOnStartup:
      typeof parsed.restoreSessionOnStartup === 'boolean' ? parsed.restoreSessionOnStartup : false,
    alwaysOpenLastWorkspace:
      typeof parsed.alwaysOpenLastWorkspace === 'boolean' ? parsed.alwaysOpenLastWorkspace : false,
    themeId: (() => {
      if (typeof parsed.themeId === 'string' && THEMES.some((t) => t.id === parsed.themeId)) return parsed.themeId
      return getInitialThemeId()
    })(),
    fontChat: resolveChat(),
    fontChatSize: typeof parsed.fontChatSize === 'number' && parsed.fontChatSize >= 8 && parsed.fontChatSize <= 32 ? parsed.fontChatSize : 14,
    fontCode: resolveCode(),
    fontCodeSize: typeof parsed.fontCodeSize === 'number' && parsed.fontCodeSize >= 8 && parsed.fontCodeSize <= 32 ? parsed.fontCodeSize : 13,
    fontThinking: resolveThinking(),
    fontThinkingSize: typeof parsed.fontThinkingSize === 'number' && parsed.fontThinkingSize >= 8 && parsed.fontThinkingSize <= 32 ? parsed.fontThinkingSize : 13,
    fontEditor: resolveEditor(),
    fontEditorSize: typeof parsed.fontEditorSize === 'number' && parsed.fontEditorSize >= 8 && parsed.fontEditorSize <= 32 ? parsed.fontEditorSize : 13,
    responseStyle:
      parsed.responseStyle === 'concise' || parsed.responseStyle === 'standard' || parsed.responseStyle === 'detailed'
        ? parsed.responseStyle
        : 'standard',
    showDebugNotesInTimeline: Boolean(parsed.showDebugNotesInTimeline),
    showRawConversationTools: Boolean(parsed.showRawConversationTools),
    verboseDiagnostics: Boolean(parsed.verboseDiagnostics),
    showResponseDurationAfterPrompt: Boolean(parsed.showResponseDurationAfterPrompt),
    editorWordWrap: typeof parsed.editorWordWrap === 'boolean' ? parsed.editorWordWrap : true,
    customiseStandardThemes: Boolean(parsed.customiseStandardThemes),
    enableMessageSizeLog: Boolean(parsed.enableMessageSizeLog),
    showDebugLogPanel: Boolean(parsed.showDebugLogPanel),
  }
}

export function getInitialApplicationSettings(): ApplicationSettings {
  try {
    const raw = globalThis.localStorage?.getItem(APP_SETTINGS_STORAGE_KEY)
    if (!raw) return parseApplicationSettings(null)
    return parseApplicationSettings(JSON.parse(raw) as Partial<ApplicationSettings>)
  } catch {
    return parseApplicationSettings(null)
  }
}

export function mergeChatHistoryEntries(primary: ChatHistoryEntry[], secondary: ChatHistoryEntry[]): ChatHistoryEntry[] {
  const byId = new Map<string, ChatHistoryEntry>()
  for (const entry of [...primary, ...secondary]) {
    if (byId.has(entry.id)) continue
    byId.set(entry.id, entry)
  }
  return Array.from(byId.values())
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_CHAT_HISTORY_ENTRIES)
}

export function parsePanelAttachments(raw: unknown): PastedImageAttachment[] {
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

export function clampFontScale(value: unknown, fallback = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(MIN_FONT_SCALE, Math.min(MAX_FONT_SCALE, value))
}

export function parseInteractionMode(value: unknown): AgentInteractionMode {
  return value === 'plan' || value === 'debug' || value === 'ask' ? value : 'agent'
}

function parseInteractionModeToken(value: string): AgentInteractionMode | null {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'agent' || normalized === 'default') return 'agent'
  if (normalized === 'plan' || normalized === 'planner' || normalized === 'planning') return 'plan'
  if (normalized === 'ask' || normalized === 'question' || normalized === 'questions' || normalized === 'read-only') return 'ask'
  if (normalized === 'debug') return 'debug'
  return null
}

function extractInteractionModeFromText(content: string): AgentInteractionMode | null {
  const text = String(content ?? '').trim()
  if (!text) return null
  const direct = parseInteractionModeToken(text)
  if (direct) return direct

  const switched = text.match(/\bmode\s+switched\s+to\s+(agent|plan|ask|debug|default)\b/i)
  if (switched?.[1]) return parseInteractionModeToken(switched[1])

  const switching = text.match(/\bswitch(?:ing)?\s+to\s+(agent|plan|ask|debug|default)\s+mode\b/i)
  if (switching?.[1]) return parseInteractionModeToken(switching[1])

  return null
}

export function extractInteractionModeChange(input: unknown): AgentInteractionMode | null {
  if (typeof input === 'string') return extractInteractionModeFromText(input)
  if (!input || typeof input !== 'object') return null

  const record = input as Record<string, unknown>
  const directCandidates = [
    record.interactionMode,
    record.interaction_mode,
    record.mode,
    record.collaboration_mode_kind,
    record.collaborationModeKind,
    (record.collaboration_mode as Record<string, unknown> | undefined)?.mode,
    (record.collaborationMode as Record<string, unknown> | undefined)?.mode,
  ]
  for (const candidate of directCandidates) {
    if (typeof candidate !== 'string') continue
    const parsed = parseInteractionModeToken(candidate)
    if (parsed) return parsed
    const fromText = extractInteractionModeFromText(candidate)
    if (fromText) return fromText
  }

  const nestedCandidates = [record.params, record.payload, record.data, record.detail, record.details]
  for (const candidate of nestedCandidates) {
    const parsed = extractInteractionModeChange(candidate)
    if (parsed) return parsed
  }

  return null
}

export function normalizeAllowedCommandPrefixes(raw: unknown): string[] {
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

export function parseAllowedCommandPrefixesInput(raw: string): string[] {
  return raw.split(/\r?\n/g)
}

export function workspaceSettingsToTextDraft(settings: WorkspaceSettings): WorkspaceSettingsTextDraft {
  return {
    allowedCommandPrefixes: settings.allowedCommandPrefixes.join('\n'),
    allowedAutoReadPrefixes: settings.allowedAutoReadPrefixes.join('\n'),
    allowedAutoWritePrefixes: settings.allowedAutoWritePrefixes.join('\n'),
    deniedAutoReadPrefixes: settings.deniedAutoReadPrefixes.join('\n'),
    deniedAutoWritePrefixes: settings.deniedAutoWritePrefixes.join('\n'),
  }
}

export function applyWorkspaceTextDraftField(
  form: WorkspaceSettings,
  field: keyof WorkspaceSettingsTextDraft,
  raw: string,
): WorkspaceSettings {
  const parsed = parseAllowedCommandPrefixesInput(raw)
  if (field === 'allowedCommandPrefixes') return { ...form, allowedCommandPrefixes: parsed }
  if (field === 'allowedAutoReadPrefixes') return { ...form, allowedAutoReadPrefixes: parsed }
  if (field === 'allowedAutoWritePrefixes') return { ...form, allowedAutoWritePrefixes: parsed }
  if (field === 'deniedAutoReadPrefixes') return { ...form, deniedAutoReadPrefixes: parsed }
  return { ...form, deniedAutoWritePrefixes: parsed }
}

export function parsePersistedAgentPanel(
  raw: unknown,
  fallbackWorkspaceRoot: string,
  getModelProvider?: (model: string) => ModelProvider
): AgentPanelState | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as PersistedAgentPanelState
  const messages = parseHistoryMessages(rec.messages)
  if (messages.length === 0) return null
  const id = typeof rec.id === 'string' && rec.id ? rec.id : newId()
  const title = typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim() : `Agent ${id.slice(-4)}`
  const sandbox: SandboxMode =
    rec.sandbox === 'read-only' || rec.sandbox === 'workspace-write' ? rec.sandbox : 'workspace-write'
  const permissionMode: PermissionMode = rec.permissionMode === 'proceed-always' ? 'proceed-always' : 'verify-first'
  const cwd =
    typeof rec.cwd === 'string' && rec.cwd.trim() ? rec.cwd : fallbackWorkspaceRoot || ''
  const model = typeof rec.model === 'string' && rec.model ? rec.model : DEFAULT_MODEL

  // Migration: infer provider from model if not present in persisted state
  const provider = getModelProvider ? getModelProvider(model) : 'codex'
  const status = typeof rec.status === 'string' && rec.status.trim() ? rec.status.trim() : 'Restored from previous session.'
  const hasHistoricalLockNotice = messages.some(
    (message) =>
      message.role === 'system' &&
      typeof message.content === 'string' &&
      message.content.includes('loaded from history') &&
      message.content.includes('read-only'),
  )
  const historyLocked =
    rec.historyLocked === true ||
    status.toLowerCase().includes('loaded from history') ||
    hasHistoricalLockNotice

  return {
    id,
    historyId: typeof rec.historyId === 'string' && rec.historyId ? rec.historyId : newId(),
    historyLocked,
    title,
    cwd,
    provider,
    model,
    interactionMode: parseInteractionMode(rec.interactionMode),
    permissionMode,
    sandbox,
    status,
    connected: false,
    streaming: false,
    messages,
    attachments: parsePanelAttachments(rec.attachments),
    input: typeof rec.input === 'string' ? rec.input : '',
    pendingInputs: Array.isArray(rec.pendingInputs)
      ? rec.pendingInputs.flatMap((x) => {
          if (typeof x === 'string') return [{ text: x }]
          if (x && typeof x === 'object' && typeof (x as any).text === 'string') return [x as { text: string; hidden?: boolean }]
          return []
        })
      : [],
    fontScale: clampFontScale(rec.fontScale),
    usage: undefined,
  }
}

export function parsePersistedEditorPanel(raw: unknown, fallbackWorkspaceRoot: string): EditorPanelState | null {
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
    title:
      typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim() : fileNameFromRelativePath(relativePath),
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

type WorkspaceUiSnapshot = ParsedAppState['workspaceSnapshotsByRoot'][string]

export function parsePersistedAppState(
  raw: unknown,
  fallbackWorkspaceRoot: string,
  getModelProvider?: (model: string) => ModelProvider
): ParsedAppState | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as import('../types').PersistedAppState
  const workspaceRoot =
    typeof rec.workspaceRoot === 'string' && rec.workspaceRoot.trim() ? rec.workspaceRoot.trim() : null
  const workspaceList = Array.isArray(rec.workspaceList)
    ? rec.workspaceList
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((x) => x.trim())
    : null
  const recentWorkspaceFiles = Array.isArray(rec.recentWorkspaceFiles)
    ? rec.recentWorkspaceFiles
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
          .map((panel) => parsePersistedAgentPanel(panel, workspacePath, getModelProvider))
          .filter((panel): panel is AgentPanelState => Boolean(panel))
        : []
      const parsedEditors = Array.isArray(snapshot.editorPanels)
        ? snapshot.editorPanels
          .map((panel) => parsePersistedEditorPanel(panel, workspacePath))
          .filter((panel): panel is EditorPanelState => Boolean(panel))
        : []
      workspaceSnapshotsByRoot[workspacePath] = {
        layoutMode:
          snapshot.layoutMode === 'vertical' ||
            snapshot.layoutMode === 'horizontal' ||
            snapshot.layoutMode === 'grid'
            ? snapshot.layoutMode
            : 'vertical',
        showWorkspaceWindow: typeof snapshot.showWorkspaceWindow === 'boolean' ? snapshot.showWorkspaceWindow : true,
        showGitWindow: typeof snapshot.showGitWindow === 'boolean' ? snapshot.showGitWindow : false,
        showSettingsWindow: typeof snapshot.showSettingsWindow === 'boolean' ? snapshot.showSettingsWindow : true,
        showCodeWindow: typeof snapshot.showCodeWindow === 'boolean' ? snapshot.showCodeWindow : true,
        codeWindowTab:
          snapshot.codeWindowTab === 'code' || snapshot.codeWindowTab === 'settings' ? snapshot.codeWindowTab : 'code',
        dockTab:
          snapshot.dockTab === 'orchestrator' ||
            snapshot.dockTab === 'explorer' ||
            snapshot.dockTab === 'git' ||
            snapshot.dockTab === 'settings'
            ? snapshot.dockTab
            : 'explorer',
        workspaceDockSide:
          snapshot.workspaceDockSide === 'left' || snapshot.workspaceDockSide === 'right'
            ? snapshot.workspaceDockSide
            : 'left',
        gitDockSide:
          snapshot.gitDockSide === 'left' || snapshot.gitDockSide === 'right'
            ? snapshot.gitDockSide
            : 'left',
        settingsDockSide:
          snapshot.settingsDockSide === 'left' || snapshot.settingsDockSide === 'right'
            ? snapshot.settingsDockSide
            : 'right',
        panels: parsedPanels,
        editorPanels: parsedEditors,
        activePanelId: typeof snapshot.activePanelId === 'string' ? snapshot.activePanelId : null,
        focusedEditorId: typeof snapshot.focusedEditorId === 'string' ? snapshot.focusedEditorId : null,
        selectedWorkspaceFile:
          typeof snapshot.selectedWorkspaceFile === 'string' ? snapshot.selectedWorkspaceFile : null,
        expandedDirectories:
          snapshot.expandedDirectories && typeof snapshot.expandedDirectories === 'object'
            ? (Object.fromEntries(
              Object.entries(snapshot.expandedDirectories as Record<string, unknown>).filter(
                ([k, v]) => typeof k === 'string' && typeof v === 'boolean',
              ),
            ) as Record<string, boolean>)
            : {},
      }
    }
  }
  const panels = Array.isArray(rec.panels)
    ? rec.panels
      .map((item) => parsePersistedAgentPanel(item, fallbackWorkspaceRoot, getModelProvider))
      .filter((x): x is AgentPanelState => Boolean(x))
      .slice(0, MAX_PANELS)
    : []
  const editorPanels = Array.isArray(rec.editorPanels)
    ? rec.editorPanels
      .map((item) => parsePersistedEditorPanel(item, fallbackWorkspaceRoot))
      .filter((x): x is EditorPanelState => Boolean(x))
    : []
  const dockTab: ParsedAppState['dockTab'] =
    rec.dockTab === 'orchestrator' ||
      rec.dockTab === 'explorer' ||
      rec.dockTab === 'git' ||
      rec.dockTab === 'settings'
      ? rec.dockTab
      : null
  const codeWindowTab: ParsedAppState['codeWindowTab'] =
    rec.codeWindowTab === 'code' || rec.codeWindowTab === 'settings' ? rec.codeWindowTab : null
  const layoutMode: ParsedAppState['layoutMode'] =
    rec.layoutMode === 'vertical' || rec.layoutMode === 'horizontal' || rec.layoutMode === 'grid'
      ? rec.layoutMode
      : null
  const workspaceDockSide: ParsedAppState['workspaceDockSide'] =
    rec.workspaceDockSide === 'left' || rec.workspaceDockSide === 'right' ? rec.workspaceDockSide : null
  const gitDockSide: ParsedAppState['gitDockSide'] =
    rec.gitDockSide === 'left' || rec.gitDockSide === 'right' ? rec.gitDockSide : null
  const settingsDockSide: ParsedAppState['settingsDockSide'] =
    rec.settingsDockSide === 'left' || rec.settingsDockSide === 'right' ? rec.settingsDockSide : null
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
    recentWorkspaceFiles,
    workspaceSnapshotsByRoot,
    panels,
    editorPanels,
    dockTab,
    codeWindowTab,
    layoutMode,
    workspaceDockSide,
    gitDockSide,
    settingsDockSide,
    selectedWorkspaceFile,
    activePanelId,
    focusedEditorId,
    showWorkspaceWindow: typeof rec.showWorkspaceWindow === 'boolean' ? rec.showWorkspaceWindow : undefined,
    showGitWindow: typeof rec.showGitWindow === 'boolean' ? rec.showGitWindow : undefined,
    showSettingsWindow: typeof rec.showSettingsWindow === 'boolean' ? rec.showSettingsWindow : undefined,
    showCodeWindow: typeof rec.showCodeWindow === 'boolean' ? rec.showCodeWindow : undefined,
    expandedDirectories,
    applicationSettings:
      rec.applicationSettings && typeof rec.applicationSettings === 'object'
        ? parseApplicationSettings(rec.applicationSettings as Partial<ApplicationSettings>)
        : undefined,
    themeOverrides:
      rec.themeOverrides && typeof rec.themeOverrides === 'object' ? sanitizeThemeOverrides(rec.themeOverrides) : undefined,
  }
}

export function formatHistoryOptionLabel(entry: ChatHistoryEntry): string {
  const dt = new Date(entry.savedAt)
  const when = Number.isFinite(dt.getTime())
    ? dt.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''
  return when ? `${entry.title} (${when})` : entry.title
}

export function getConversationPrecis(panel: AgentPanelState): string {
  const firstUser = stripSyntheticAutoContinueMessages(panel.messages).find((m) => m.role === 'user')
  if (!firstUser?.content?.trim()) return panel.title
  const text = firstUser.content.trim().replace(/\s+/g, ' ')
  const maxLen = 36
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen).trim() + '...'
}

export function toShortJson(value: unknown, maxLen = 280): string {
  try {
    const s = JSON.stringify(value)
    if (!s) return ''
    return s.length > maxLen ? `${s.slice(0, maxLen)}...` : s
  } catch {
    return String(value ?? '')
  }
}

export function truncateText(value: string, maxLen = 200): string {
  const text = String(value ?? '').trim()
  if (!text) return ''
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text
}

export function pickString(obj: unknown, keys: string[]): string | null {
  const o = obj as Record<string, unknown> | null | undefined
  for (const key of keys) {
    const v = o?.[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

export function getInitialExplorerPrefsByWorkspace(): Record<string, ExplorerPrefs> {
  try {
    const raw = globalThis.localStorage?.getItem(EXPLORER_PREFS_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, ExplorerPrefs>) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function getInitialOrchestratorSettings(): OrchestratorSettings {
  const sanitizePool = (
    value: unknown,
    fallback: Array<{ id: string; label: string; provider: string; model: string }>,
  ): Array<{ id: string; label: string; provider: string; model: string }> => {
    if (!Array.isArray(value)) return fallback
    const next: Array<{ id: string; label: string; provider: string; model: string }> = []
    for (const entry of value) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
      const row = entry as Record<string, unknown>
      const id = typeof row.id === 'string' ? row.id.trim() : ''
      const label = typeof row.label === 'string' ? row.label.trim() : ''
      const provider = typeof row.provider === 'string' ? row.provider.trim() : ''
      const model = typeof row.model === 'string' ? row.model.trim() : ''
      if (!id || !label || !provider) continue
      next.push({ id, label, provider, model })
    }
    return next.length > 0 ? next : fallback
  }

  const defaults: OrchestratorSettings = {
    orchestratorModel: '',
    workerProvider: 'codex',
    workerModel: '',
    maxParallelPanels: 2,
    maxTaskAttempts: 3,
    orchestratorPool: [
      { id: 'orch-codex', label: 'Orchestrator Codex', provider: 'codex', model: '' },
      { id: 'orch-claude', label: 'Orchestrator Claude', provider: 'claude', model: '' },
    ],
    workerPool: [
      { id: 'worker-codex', label: 'Codex Reviewer', provider: 'codex', model: '' },
      { id: 'worker-claude', label: 'Claude Reviewer', provider: 'claude', model: '' },
      { id: 'worker-gemini', label: 'Gemini Reviewer', provider: 'gemini', model: '' },
      { id: 'worker-openrouter', label: 'OpenRouter Reviewer', provider: 'openrouter', model: '' },
    ],
    comparativeReviewerAId: 'worker-codex',
    comparativeReviewerBId: 'worker-claude',
  }
  try {
    const raw = globalThis.localStorage?.getItem(ORCHESTRATOR_SETTINGS_STORAGE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<OrchestratorSettings>
    const workerPool = sanitizePool(parsed?.workerPool, defaults.workerPool)
    return {
      orchestratorModel: typeof parsed?.orchestratorModel === 'string' ? parsed.orchestratorModel : defaults.orchestratorModel,
      workerProvider: typeof parsed?.workerProvider === 'string' ? parsed.workerProvider : defaults.workerProvider,
      workerModel: typeof parsed?.workerModel === 'string' ? parsed.workerModel : defaults.workerModel,
      maxParallelPanels:
        typeof parsed?.maxParallelPanels === 'number' && parsed.maxParallelPanels >= 1 && parsed.maxParallelPanels <= 8
          ? parsed.maxParallelPanels
          : defaults.maxParallelPanels,
      maxTaskAttempts:
        typeof parsed?.maxTaskAttempts === 'number' && parsed.maxTaskAttempts >= 1 && parsed.maxTaskAttempts <= 10
          ? parsed.maxTaskAttempts
          : defaults.maxTaskAttempts,
      orchestratorPool: sanitizePool(parsed?.orchestratorPool, defaults.orchestratorPool),
      workerPool,
      comparativeReviewerAId:
        typeof parsed?.comparativeReviewerAId === 'string' && workerPool.some((p) => p.id === parsed.comparativeReviewerAId)
          ? parsed.comparativeReviewerAId
          : workerPool[0]?.id ?? defaults.comparativeReviewerAId,
      comparativeReviewerBId:
        typeof parsed?.comparativeReviewerBId === 'string' && workerPool.some((p) => p.id === parsed.comparativeReviewerBId)
          ? parsed.comparativeReviewerBId
          : workerPool[1]?.id ?? workerPool[0]?.id ?? defaults.comparativeReviewerBId,
    }
  } catch {
    return defaults
  }
}
