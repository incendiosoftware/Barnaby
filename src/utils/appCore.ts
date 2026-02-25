/**
 * Pure helper logic extracted from App.tsx.
 * No React/JSX - safe for tree-shaking and testing.
 */

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
  ModelInterface,
  ModelProvider,
  OrchestratorSettings,
  ParsedAppState,
  PastedImageAttachment,
  PermissionMode,
  PersistedAgentPanelState,
  PersistedAppState,
  PersistedEditorPanelState,
  ProviderConfig,
  ProviderRegistry,
  SandboxMode,
  StandaloneTheme,
  ThemeOverrides,
  ThemeOverrideValues,
  WorkspaceSettings,
  WorkspaceSettingsTextDraft,
  WorkspaceTreeNode,
} from '../types'
import type { AvailableCatalogModels } from '../types'
import {
  ALL_WORKSPACES_LOCKED_PROMPT,
  AUTO_CONTINUE_PROMPT,
  STARTUP_LOCKED_WORKSPACE_PROMPT,
  CHAT_HISTORY_STORAGE_KEY,
  CONNECTIVITY_PROVIDERS,
  DEFAULT_BUILTIN_PROVIDER_CONFIGS,
  DEFAULT_MODEL,
  DEFAULT_THEME_ID,
  DEFAULT_WORKSPACE_ALLOWED_AUTO_READ_PREFIXES,
  DEFAULT_WORKSPACE_ALLOWED_AUTO_WRITE_PREFIXES,
  DEFAULT_WORKSPACE_ALLOWED_COMMAND_PREFIXES,
  DEFAULT_WORKSPACE_DENIED_AUTO_READ_PREFIXES,
  DEFAULT_WORKSPACE_DENIED_AUTO_WRITE_PREFIXES,
  DEFAULT_MODEL_INTERFACES,
  EXPLORER_PREFS_STORAGE_KEY,
  FONT_SCALE_STEP,
  MAX_CHAT_HISTORY_ENTRIES,
  MAX_PANELS,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  MODEL_BANNER_PREFIX,
  MODEL_CONFIG_STORAGE_KEY,
  ORCHESTRATOR_SETTINGS_STORAGE_KEY,
  PROVIDER_REGISTRY_STORAGE_KEY,
  THEME_EDITABLE_FIELDS,
  THEME_ID_STORAGE_KEY,
  THEME_OVERRIDES_STORAGE_KEY,
  THINKING_MAX_CHARS,
  WORKSPACE_LIST_STORAGE_KEY,
  WORKSPACE_SETTINGS_STORAGE_KEY,
  WORKSPACE_STORAGE_KEY,
  WORKSPACE_DOCK_SIDE_STORAGE_KEY,
  APP_SETTINGS_STORAGE_KEY,
  SETUP_WIZARD_DONE_STORAGE_KEY,
} from '../constants'
import { THEMES } from '../constants/themes'
import { LEGACY_PRESET_TO_THEME_ID } from '../constants'

export const LIMIT_WARNING_PREFIX = 'Warning (Limits):'
const INITIAL_HISTORY_MAX_MESSAGES = 24

export function isLockedWorkspacePrompt(prompt: string | null): boolean {
  return prompt === STARTUP_LOCKED_WORKSPACE_PROMPT || prompt === ALL_WORKSPACES_LOCKED_PROMPT
}

export function resolveProviderConfigs(registry: ProviderRegistry): ProviderConfig[] {
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

export function syncModelConfigWithCatalog(
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
      displayName: id,
    }
    const existing = keptById.get(id)
    if (!existing) {
      keptById.set(id, normalized)
      continue
    }
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

export function getModelPingKey(provider: string, modelId: string): string {
  return `${provider}::${modelId}`
}

export function looksIncomplete(content: string): boolean {
  const t = content.trim().toLowerCase()
  if (!t) return false
  const incompletePhrases = [
    "i'm about to",
    'about to edit',
    'about to implement',
    "i have a concrete",
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

export function isLikelyThinkingUpdate(content: string): boolean {
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

export function stripSyntheticAutoContinueMessages(messages: ChatMessage[]): ChatMessage[] {
  const filtered = messages.filter((message) => {
    if (message.role !== 'user') return true
    if ((message.attachments?.length ?? 0) > 0) return true
    return message.content.trim() !== AUTO_CONTINUE_PROMPT
  })
  return filtered.length === messages.length ? messages : filtered
}

export function filterMessagesForPresentation(
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

export function looksLikeDiff(code: string): boolean {
  const lines = code.split('\n')
  let plusCount = 0
  let minusCount = 0
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) plusCount++
    else if (line.startsWith('-') && !line.startsWith('---')) minusCount++
  }
  return plusCount + minusCount >= 3 && plusCount > 0 && minusCount > 0
}

export function applyThemeOverrides(overrides: ThemeOverrides): StandaloneTheme[] {
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

export function sanitizeThemeOverrides(raw: unknown): ThemeOverrides {
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

export function getInitialThemeOverrides(): ThemeOverrides {
  try {
    const raw = globalThis.localStorage?.getItem(THEME_OVERRIDES_STORAGE_KEY)
    if (!raw) return {}
    return sanitizeThemeOverrides(JSON.parse(raw))
  } catch {
    return {}
  }
}

export function cloneTheme(theme: StandaloneTheme): StandaloneTheme {
  return { ...theme }
}

export function extractHexColor(value: string): string | null {
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

export function getNextFontScale(current: number, deltaY: number) {
  const direction = deltaY < 0 ? 1 : -1
  return Math.max(MIN_FONT_SCALE, Math.min(MAX_FONT_SCALE, Number((current + direction * FONT_SCALE_STEP).toFixed(2))))
}

export function isZoomWheelGesture(e: { ctrlKey: boolean; metaKey: boolean }) {
  return e.ctrlKey || e.metaKey
}

export function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function formatToolTrace(raw: string): string {
  const colonIdx = raw.indexOf(':')
  if (colonIdx < 0) return raw
  const tool = raw.slice(0, colonIdx).trim().toLowerCase()
  const detail = raw.slice(colonIdx + 1).trim()
  const shortPath = (p: string) => {
    const parts = p.replace(/\\/g, '/').split('/')
    return parts.length > 3 ? `.../${parts.slice(-3).join('/')}` : p
  }
  const shortCmd = (c: string) => {
    const clean = c.replace(/\s+/g, ' ').trim()
    return clean.length > 80 ? clean.slice(0, 77) + '...' : clean
  }
  if (/^(read_file|read|readfile|read_workspace_file|view_file)$/i.test(tool)) {
    return `Read ${shortPath(detail)}`
  }
  if (/^(write_file|write|writefile|write_workspace_file|create_file)$/i.test(tool)) {
    return `Write ${shortPath(detail)}`
  }
  if (/^(edit|edit_file|patch|str_replace_editor|apply_diff)$/i.test(tool)) {
    return `Edit ${shortPath(detail)}`
  }
  if (/^(bash|shell|run_command|run_shell_command|terminal|execute)$/i.test(tool)) {
    return `Ran ${shortCmd(detail)}`
  }
  if (/^(grep|rg|search|search_workspace|ripgrep|find_in_files)$/i.test(tool)) {
    return `Searched for "${detail.length > 60 ? detail.slice(0, 57) + '...' : detail}"`
  }
  if (/^(glob|find|list_dir|list_directory|list_workspace_tree|ls|tree)$/i.test(tool)) {
    return `Listed ${shortPath(detail) || 'directory'}`
  }
  if (/^(web_search|browser|fetch|curl)$/i.test(tool)) {
    return `Fetched ${detail.length > 60 ? detail.slice(0, 57) + '...' : detail}`
  }
  const cleanTool = raw
    .slice(0, colonIdx)
    .trim()
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
  return `${cleanTool}: ${detail.length > 70 ? detail.slice(0, 67) + '...' : detail}`
}

export function fileNameFromRelativePath(relativePath: string) {
  const parts = relativePath.split('/')
  return parts[parts.length - 1] || relativePath
}

export function toLocalFileUrl(filePath: string) {
  const normalized = String(filePath ?? '').replace(/\\/g, '/')
  if (!normalized) return ''
  if (/^file:\/\//i.test(normalized)) return normalized
  if (normalized.startsWith('//')) return `file:${encodeURI(normalized)}`
  if (/^[a-zA-Z]:\//.test(normalized)) return `file:///${encodeURI(normalized)}`
  if (normalized.startsWith('/')) return `file://${encodeURI(normalized)}`
  return encodeURI(normalized)
}

export function normalizeWorkspacePathForCompare(value: string) {
  return value.trim().replace(/\//g, '\\').toLowerCase()
}

export function decodeUriComponentSafe(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function stripLinkQueryAndHash(value: string) {
  const q = value.indexOf('?')
  const h = value.indexOf('#')
  const end = Math.min(q >= 0 ? q : Number.POSITIVE_INFINITY, h >= 0 ? h : Number.POSITIVE_INFINITY)
  return Number.isFinite(end) ? value.slice(0, end) : value
}

export function stripFileLineAndColumnSuffix(pathLike: string) {
  const m = pathLike.match(/^(.*?)(?::\d+)(?::\d+)?$/)
  return m?.[1] ? m[1] : pathLike
}

export function normalizeWorkspaceRelativePath(pathLike: string): string | null {
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

export function toWorkspaceRelativePathIfInsideRoot(workspaceRoot: string, absolutePath: string): string | null {
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

export function resolveWorkspaceRelativePathFromChatHref(workspaceRoot: string, href: string): string | null {
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

export function getInitialThemeId(): string {
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
  const defaults: ApplicationSettings = {
    restoreSessionOnStartup: true,
    themeId: DEFAULT_THEME_ID,
    responseStyle: 'standard',
    showDebugNotesInTimeline: false,
    verboseDiagnostics: false,
    showResponseDurationAfterPrompt: false,
    editorWordWrap: true,
  }
  if (!parsed || typeof parsed !== 'object') return defaults
  return {
    restoreSessionOnStartup:
      typeof parsed.restoreSessionOnStartup === 'boolean' ? parsed.restoreSessionOnStartup : true,
    themeId: (() => {
      if (typeof parsed.themeId === 'string' && THEMES.some((t) => t.id === parsed.themeId)) return parsed.themeId
      return getInitialThemeId()
    })(),
    responseStyle:
      parsed.responseStyle === 'concise' || parsed.responseStyle === 'standard' || parsed.responseStyle === 'detailed'
        ? parsed.responseStyle
        : 'standard',
    showDebugNotesInTimeline: Boolean(parsed.showDebugNotesInTimeline),
    verboseDiagnostics: Boolean(parsed.verboseDiagnostics),
    showResponseDurationAfterPrompt: Boolean(parsed.showResponseDurationAfterPrompt),
    editorWordWrap: typeof parsed.editorWordWrap === 'boolean' ? parsed.editorWordWrap : true,
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

export function parsePersistedAgentPanel(raw: unknown, fallbackWorkspaceRoot: string): AgentPanelState | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as PersistedAgentPanelState
  const messages = parseHistoryMessages(rec.messages)
  if (messages.length === 0) return null
  const id = typeof rec.id === 'string' && rec.id ? rec.id : newId()
  const title = typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim() : `Agent ${id.slice(-4)}`
  const permissionMode: PermissionMode = rec.permissionMode === 'proceed-always' ? 'proceed-always' : 'verify-first'
  const sandbox: SandboxMode =
    rec.sandbox === 'read-only' || rec.sandbox === 'workspace-write' ? rec.sandbox : 'workspace-write'
  const cwd =
    typeof rec.cwd === 'string' && rec.cwd.trim() ? rec.cwd : fallbackWorkspaceRoot || ''
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
    pendingInputs: Array.isArray(rec.pendingInputs)
      ? rec.pendingInputs.filter((x): x is string => typeof x === 'string')
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

export function parsePersistedAppState(raw: unknown, fallbackWorkspaceRoot: string): ParsedAppState | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as PersistedAppState
  const workspaceRoot =
    typeof rec.workspaceRoot === 'string' && rec.workspaceRoot.trim() ? rec.workspaceRoot.trim() : null
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
          snapshot.layoutMode === 'vertical' ||
          snapshot.layoutMode === 'horizontal' ||
          snapshot.layoutMode === 'grid'
            ? snapshot.layoutMode
            : 'vertical',
        showWorkspaceWindow: typeof snapshot.showWorkspaceWindow === 'boolean' ? snapshot.showWorkspaceWindow : true,
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
    applicationSettings:
      rec.applicationSettings && typeof rec.applicationSettings === 'object'
        ? parseApplicationSettings(rec.applicationSettings as Partial<ApplicationSettings>)
        : undefined,
    themeOverrides:
      rec.themeOverrides && typeof rec.themeOverrides === 'object' ? sanitizeThemeOverrides(rec.themeOverrides) : undefined,
  }
}

type WorkspaceUiSnapshot = ParsedAppState['workspaceSnapshotsByRoot'][string]

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

export function summarizeRawNotification(method: string, params: unknown): string | null {
  if (!method) return null
  const p = params as Record<string, unknown> | null | undefined
  if (method.endsWith('/requestApproval')) {
    const reason =
      pickString(p, ['reason', 'message', 'description']) ??
      pickString(p?.request as Record<string, unknown>, ['reason', 'message', 'description']) ??
      pickString(p?.action as Record<string, unknown>, ['reason', 'message', 'description'])
    const command =
      pickString(p, ['command', 'cmd']) ??
      pickString(p?.command as Record<string, unknown>, ['command', 'cmd', 'raw']) ??
      pickString(p?.action as Record<string, unknown>, ['command', 'cmd'])
    const filePath =
      pickString(p, ['path', 'file']) ??
      pickString(p?.action as Record<string, unknown>, ['path', 'file']) ??
      pickString(p?.edit as Record<string, unknown>, ['path', 'file'])
    const bits = ['Approval requested']
    if (reason) bits.push(reason)
    if (command) bits.push(`cmd: ${command}`)
    if (filePath) bits.push(`file: ${filePath}`)
    if (!reason && !command && !filePath) bits.push(toShortJson(params))
    return `${bits.join(' | ')}`
  }
  if (method === 'item/completed') {
    const item = p?.item as Record<string, unknown> | undefined
    const itemType = item?.type
    if (!itemType || itemType === 'agentMessage') return null
    const command =
      pickString(item, ['command', 'cmd']) ??
      pickString(item?.command as Record<string, unknown>, ['command', 'cmd', 'raw']) ??
      pickString(item?.input as Record<string, unknown>, ['command', 'cmd'])
    const pathLike =
      pickString(item, ['path', 'file']) ??
      pickString(item?.target as Record<string, unknown>, ['path', 'file']) ??
      pickString(item?.edit as Record<string, unknown>, ['path', 'file'])
    const out = [`Activity: ${itemType}`]
    if (command) out.push(`cmd: ${command}`)
    if (pathLike) out.push(`file: ${pathLike}`)
    return out.join(' | ')
  }
  return null
}

export function simplifyCommand(raw: string): string {
  const trimmed = raw.trim()
  const m = trimmed.match(/-Command\s+'([^']+)'/i)
  const reduced = m?.[1]?.trim() || trimmed
  return reduced.length > 140 ? `${reduced.slice(0, 140)}...` : reduced
}

export function describeOperationTrace(method: string, params: unknown): { label: string; detail?: string } | null {
  const methodLower = method.toLowerCase()
  const p = params as Record<string, unknown> | null | undefined
  const pathLike =
    pickString(p, ['path', 'file', 'targetPath']) ??
    pickString(p?.target as Record<string, unknown>, ['path', 'file']) ??
    pickString(p?.edit as Record<string, unknown>, ['path', 'file']) ??
    pickString(p?.item as Record<string, unknown>, ['path', 'file']) ??
    pickString((p?.item as Record<string, unknown>)?.target as Record<string, unknown>, ['path', 'file'])
  const queryLike =
    pickString(p, ['query', 'pattern', 'text']) ??
    pickString(p?.search as Record<string, unknown>, ['query', 'pattern', 'text']) ??
    pickString(p?.input as Record<string, unknown>, ['query', 'pattern', 'text'])
  const cmdLike =
    pickString(p, ['command', 'cmd']) ??
    pickString(p?.command as Record<string, unknown>, ['command', 'cmd', 'raw']) ??
    pickString(p?.item as Record<string, unknown>, ['command', 'cmd']) ??
    pickString((p?.item as Record<string, unknown>)?.command as Record<string, unknown>, [
      'command',
      'cmd',
      'raw',
    ]) ??
    pickString((p?.item as Record<string, unknown>)?.input as Record<string, unknown>, ['command', 'cmd'])
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
    return {
      label: 'Searched workspace',
      detail: truncateText(queryLike ?? pathLike ?? cmdLike ?? '', 180) || undefined,
    }
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
  if (isCommandLikeMethod && !cmdLike) return null
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

export type ActivityKind = 'approval' | 'command' | 'reasoning' | 'event' | 'operation'

export function describeActivityEntry(evt: unknown): { label: string; detail?: string; kind: ActivityKind } | null {
  const e = evt as Record<string, unknown> | null | undefined
  if (!e) return null
  if (e.type === 'assistantDelta') return null
  if (e.type === 'usageUpdated') return null
  if (e.type === 'planUpdated') return null
  if (e.type === 'status') {
    return {
      label: `Status: ${String(e.status ?? 'unknown')}`,
      detail: typeof e.message === 'string' ? e.message : undefined,
      kind: 'event',
    }
  }
  if (e.type === 'thinking') {
    return {
      label: 'Thinking',
      detail: typeof e.message === 'string' ? e.message : undefined,
      kind: 'event',
    }
  }
  if (e.type === 'assistantCompleted') return { label: 'Turn complete', kind: 'event' }
  if (e.type === 'rawNotification' && typeof e.method === 'string') {
    const method = e.method
    const params = e.params
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
        pickString(params as Record<string, unknown>, ['command', 'cmd']) ??
        pickString((params as Record<string, unknown>)?.command as Record<string, unknown>, [
          'command',
          'cmd',
          'raw',
        ]) ??
        pickString((params as Record<string, unknown>)?.action as Record<string, unknown>, ['command', 'cmd'])
      if (!cmd) return null
      return { label: 'Running command', detail: simplifyCommand(cmd), kind: 'command' }
    }
    if (/reasoning/i.test(method)) {
      const detail =
        pickString(params as Record<string, unknown>, ['summary', 'text', 'reasoning', 'message']) ??
        pickString((params as Record<string, unknown>)?.reasoning as Record<string, unknown>, ['summary', 'text']) ??
        pickString((params as Record<string, unknown>)?.step as Record<string, unknown>, ['summary', 'text'])
      if (!detail) return null
      return { label: 'Reasoning update', detail: truncateText(detail, 220), kind: 'reasoning' }
    }
    if (method === 'item/completed') {
      const item = (params as Record<string, unknown>)?.item as Record<string, unknown> | undefined
      const itemType = item?.type
      if (!itemType || itemType === 'agentMessage') return null
      if (itemType === 'commandExecution') {
        const cmd =
          pickString(item, ['command', 'cmd']) ??
          pickString(item?.command as Record<string, unknown>, ['command', 'cmd', 'raw']) ??
          pickString(item?.input as Record<string, unknown>, ['command', 'cmd'])
        const exitCode =
          typeof (params as Record<string, unknown>)?.item === 'object' &&
          typeof ((params as Record<string, unknown>)?.item as Record<string, unknown>)?.exitCode === 'number'
            ? ((params as Record<string, unknown>)?.item as Record<string, unknown>).exitCode
            : typeof ((params as Record<string, unknown>)?.item as Record<string, unknown>)?.statusCode === 'number'
              ? ((params as Record<string, unknown>)?.item as Record<string, unknown>).statusCode
              : null
        const parts = ['Command finished']
        if (cmd) parts.push(simplifyCommand(cmd))
        if (exitCode !== null) parts.push(`exit ${exitCode}`)
        return { label: parts[0], detail: parts.slice(1).join(' | ') || undefined, kind: 'command' }
      }
      if (itemType === 'fileChange') {
        const filePath =
          pickString(item, ['path', 'file']) ??
          pickString(item?.target as Record<string, unknown>, ['path', 'file']) ??
          pickString(item?.edit as Record<string, unknown>, ['path', 'file'])
        return { label: 'Edited file', detail: filePath ?? undefined, kind: 'event' }
      }
      if (itemType === 'reasoning') {
        const detail =
          pickString(item, ['summary', 'text', 'reasoning']) ??
          pickString(item?.reasoning as Record<string, unknown>, ['summary', 'text'])
        if (!detail) return null
        return { label: 'Reasoning step', detail: truncateText(detail, 220), kind: 'reasoning' }
      }
      if (itemType === 'userMessage') return null
      return { label: `Completed ${itemType}`, kind: 'event' }
    }
    if (methodLower.includes('file') || methodLower.includes('edit')) {
      const filePath =
        pickString(params as Record<string, unknown>, ['path', 'file']) ??
        pickString((params as Record<string, unknown>)?.target as Record<string, unknown>, ['path', 'file']) ??
        pickString((params as Record<string, unknown>)?.edit as Record<string, unknown>, ['path', 'file'])
      if (filePath) return { label: 'Edited file', detail: filePath, kind: 'event' }
    }
    if (methodLower.includes('search') || methodLower.includes('scan')) {
      const query =
        pickString(params as Record<string, unknown>, ['query', 'pattern', 'text']) ??
        pickString((params as Record<string, unknown>)?.search as Record<string, unknown>, [
          'query',
          'pattern',
          'text',
        ])
      return {
        label: 'Scanning workspace',
        detail: query ? truncateText(query, 140) : undefined,
        kind: 'event',
      }
    }
    if (methodLower.includes('task') && methodLower.includes('complete')) {
      return { label: 'Task step complete', kind: 'event' }
    }
    if (methodLower.includes('turn') && methodLower.includes('complete')) {
      return { label: 'Turn complete', kind: 'event' }
    }
    if (methodLower.includes('agent_message')) return null
    return null
  }
  if (typeof e.type === 'string') return null
  return null
}

export function shouldSurfaceRawNoteInChat(method: string): boolean {
  if (method.endsWith('/requestApproval')) return true
  return false
}

export function isTurnCompletionRawNotification(method: string, params: unknown): boolean {
  const methodLower = method.toLowerCase()
  const p = params as Record<string, unknown> | null | undefined
  if (method === 'item/completed' && (p?.item as Record<string, unknown>)?.type === 'agentMessage') return true
  if (methodLower.includes('turn') && methodLower.includes('complete')) return true
  if (methodLower.includes('response') && methodLower.includes('complete')) return true
  return false
}

export function isPermissionEscalationMessage(message: string): boolean {
  const lower = message.trim().toLowerCase()
  if (!lower) return false
  return (
    lower.includes('approval requested') ||
    lower.includes('action requires approval') ||
    lower.includes('requires approval') ||
    lower.includes('set permissions to proceed always') ||
    lower.includes('write denied in verify-first mode') ||
    lower.includes('command execution denied in verify-first mode') ||
    (lower.includes('verify-first') &&
      (lower.includes('permission') || lower.includes('write') || lower.includes('command')) &&
      (lower.includes('denied') || lower.includes('approval')))
  )
}

export function isUsageLimitMessage(message: string): boolean {
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

export function withLimitWarningMessage(messages: ChatMessage[], rawMessage: string): ChatMessage[] {
  const trimmed = rawMessage.trim()
  if (!trimmed || !isUsageLimitMessage(trimmed)) return messages
  const content = `${LIMIT_WARNING_PREFIX} ${trimmed}\n\nSwitch to another model/provider (for example Gemini) or wait for your limit window to reset.`
  const duplicate = messages.slice(-8).some((m) => m.role === 'system' && m.content === content)
  if (duplicate) return messages
  return [...messages, { id: newId(), role: 'system' as const, content, format: 'text' as const, createdAt: Date.now() }]
}

export function formatLimitResetHint(usage: AgentPanelState['usage']) {
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

export function getRateLimitPercent(usage: AgentPanelState['usage']) {
  const p = usage?.primary
  if (!p || typeof p.usedPercent !== 'number') return null
  return Math.max(0, Math.min(100, p.usedPercent))
}

export function formatRateLimitLabel(usage: AgentPanelState['usage']) {
  const p = usage?.primary
  if (!p || typeof p.usedPercent !== 'number') return null
  const used = Math.max(0, Math.min(100, p.usedPercent))
  const left = 100 - used
  const windowMinutes = typeof p.windowMinutes === 'number' ? p.windowMinutes : null
  const windowLabel = windowMinutes === 300 ? '5h' : windowMinutes ? `${Math.round(windowMinutes / 60)}h` : null
  return `${windowLabel ? `${windowLabel} ` : ''}${left}% left`
}

export function withExhaustedRateLimitWarning(messages: ChatMessage[], usage: AgentPanelState['usage']) {
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

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
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

export function makeDefaultPanel(id: string, cwd: string, historyId = newId()): AgentPanelState {
  return {
    id,
    historyId,
    title: `Agent ${id.slice(-4)}`,
    cwd,
    model: DEFAULT_MODEL,
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
        content: `Model: ${DEFAULT_MODEL}`,
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

export function withModelBanner(messages: ChatMessage[], model: string): ChatMessage[] {
  const banner = `${MODEL_BANNER_PREFIX}${model}`
  if (messages[0]?.role === 'system' && messages[0].content.startsWith(MODEL_BANNER_PREFIX)) {
    return [{ ...messages[0], content: banner, format: 'text' }, ...messages.slice(1)]
  }
  return [{ id: newId(), role: 'system', content: banner, format: 'text', createdAt: Date.now() }, ...messages]
}

export function getInitialWorkspaceSettings(list: string[]): Record<string, WorkspaceSettings> {
  try {
    const raw = globalThis.localStorage?.getItem(WORKSPACE_SETTINGS_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, Partial<WorkspaceSettings>>) : {}
    const result: Record<string, WorkspaceSettings> = {}
    for (const [key, value] of Object.entries(parsed)) {
      const path = typeof value?.path === 'string' && value.path.trim() ? value.path : key
      if (!path) continue
      const v = value as Partial<WorkspaceSettings>
      const hasAllowedCommandPrefixes = Array.isArray(v?.allowedCommandPrefixes)
      const hasAllowedAutoReadPrefixes = Array.isArray(v?.allowedAutoReadPrefixes)
      const hasAllowedAutoWritePrefixes = Array.isArray(v?.allowedAutoWritePrefixes)
      const hasDeniedAutoReadPrefixes = Array.isArray(v?.deniedAutoReadPrefixes)
      const hasDeniedAutoWritePrefixes = Array.isArray(v?.deniedAutoWritePrefixes)
      const allowedCommandPrefixes = normalizeAllowedCommandPrefixes(v?.allowedCommandPrefixes)
      const allowedAutoReadPrefixes = normalizeAllowedCommandPrefixes(v?.allowedAutoReadPrefixes)
      const allowedAutoWritePrefixes = normalizeAllowedCommandPrefixes(v?.allowedAutoWritePrefixes)
      const deniedAutoReadPrefixes = normalizeAllowedCommandPrefixes(v?.deniedAutoReadPrefixes)
      const deniedAutoWritePrefixes = normalizeAllowedCommandPrefixes(v?.deniedAutoWritePrefixes)
      result[path] = {
        path,
        defaultModel: typeof value?.defaultModel === 'string' && value.defaultModel ? value.defaultModel : DEFAULT_MODEL,
        permissionMode: value?.permissionMode === 'proceed-always' ? 'proceed-always' : 'verify-first',
        sandbox: value?.sandbox === 'read-only' ? value.sandbox : 'workspace-write',
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
      maxParallelPanels:
        typeof parsed?.maxParallelPanels === 'number' && parsed.maxParallelPanels >= 1 && parsed.maxParallelPanels <= 8
          ? parsed.maxParallelPanels
          : defaults.maxParallelPanels,
      maxTaskAttempts:
        typeof parsed?.maxTaskAttempts === 'number' && parsed.maxTaskAttempts >= 1 && parsed.maxTaskAttempts <= 10
          ? parsed.maxTaskAttempts
          : defaults.maxTaskAttempts,
    }
  } catch {
    return defaults
  }
}

export function formatError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  return String(err ?? 'Unknown error')
}

export function formatCheckedAt(ts?: number): string {
  if (!ts) return 'Never'
  const dt = new Date(ts)
  return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function collectDirectoryPaths(nodes: WorkspaceTreeNode[]): string[] {
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
