/**
 * Pure helper logic extracted from App.tsx.
 * No React/JSX - safe for tree-shaking and testing.
 */

import type {
  AgentPanelState,
  ChatMessage,
  WorkspaceSettings,
} from '../types'
import {
  DEFAULT_MODEL,
  DEFAULT_WORKSPACE_ALLOWED_AUTO_READ_PREFIXES,
  DEFAULT_WORKSPACE_ALLOWED_AUTO_WRITE_PREFIXES,
  DEFAULT_WORKSPACE_ALLOWED_COMMAND_PREFIXES,
  DEFAULT_WORKSPACE_CURSOR_ALLOW_BUILDS,
  DEFAULT_WORKSPACE_DENIED_AUTO_READ_PREFIXES,
  DEFAULT_WORKSPACE_DENIED_AUTO_WRITE_PREFIXES,
  MODEL_BANNER_PREFIX,
  RESTRICTED_WORKSPACE_ALLOWED_COMMAND_PREFIXES,
  RESTRICTED_WORKSPACE_DENIED_AUTO_READ_PREFIXES,
  RESTRICTED_WORKSPACE_DENIED_AUTO_WRITE_PREFIXES,
  WORKSPACE_SETTINGS_STORAGE_KEY,
} from '../constants'
import { newId } from './pathUtils'
import { getModelProvider, syncModelConfigWithCatalog, resolveProviderConfigs, getModelPingKey } from './providerUtils'
import { normalizeAllowedCommandPrefixes } from './persistenceUtils'
import { isOutsideWorkspaceBuildWarningMessage, syncOutsideWorkspaceBuildWarning } from './notificationProcessor'

// Re-exports for backwards compatibility
export { getModelProvider, resolveProviderConfigs, syncModelConfigWithCatalog, getModelPingKey } from './providerUtils'
export { looksIncomplete, isLikelyThinkingUpdate, stripSyntheticAutoContinueMessages, filterMessagesForPresentation, looksLikeDiff } from './messageAnalysisUtils'
export { applyThemeOverrides, sanitizeThemeOverrides, getInitialThemeOverrides, cloneTheme, extractHexColor, getNextFontScale, isZoomWheelGesture } from './themeUtils'
export { newId, formatToolTrace, linkifyFilePathsInMarkdown, fileNameFromRelativePath, toLocalFileUrl, normalizeWorkspacePathForCompare, decodeUriComponentSafe, stripLinkQueryAndHash, stripFileLineAndColumnSuffix, normalizeWorkspaceRelativePath, toWorkspaceRelativePathIfInsideRoot, resolveWorkspaceRelativePathFromChatHref, collectDirectoryPaths } from './pathUtils'
export { LIMIT_WARNING_PREFIX, OUTSIDE_WORKSPACE_BUILD_WARNING_PREFIX, OUTSIDE_WORKSPACE_BUILD_WARNING, TRANSCRIPT_SAVED_PREFIX, CONTEXT_COMPACTION_NOTICE_PREFIX, CONTEXT_COMPACTION_NOTICE, MANUAL_CONTEXT_COMPACTION_NOTICE, isLockedWorkspacePrompt, simplifyCommand, summarizeRawNotification, describeOperationTrace, describeActivityEntry, shouldSurfaceRawNoteInChat, isTurnCompletionRawNotification, isPermissionEscalationMessage, isUsageLimitMessage, classifyContextCompactionNotification, withContextCompactionNotice, withLimitWarningMessage, formatLimitResetHint, getRateLimitPercent, formatRateLimitLabel, withExhaustedRateLimitWarning, withTimeout, classifyTerminalProviderFailure, withOutsideWorkspaceBuildWarning, syncOutsideWorkspaceBuildWarning } from './notificationProcessor'
export type { ActivityKind } from './notificationProcessor'
export { cloneChatMessages, panelMessagesToInitialHistory, parseHistoryMessages, parseChatHistoryEntries, getInitialChatHistory, parseApplicationSettings, getInitialApplicationSettings, mergeChatHistoryEntries, parsePanelAttachments, clampFontScale, parseInteractionMode, extractInteractionModeChange, normalizeAllowedCommandPrefixes, parseAllowedCommandPrefixesInput, parsePersistedAgentPanel, parsePersistedEditorPanel, parsePersistedAppState, formatHistoryOptionLabel, getConversationPrecis, toShortJson, truncateText, pickString, getInitialThemeId, getInitialWorkspaceRoot, getInitialSetupWizardDone, getDefaultSetupWizardSelection, getInitialWorkspaceDockSide, getInitialModelConfig, getInitialProviderRegistry, getInitialWorkspaceList, getInitialExplorerPrefsByWorkspace, getInitialOrchestratorSettings, workspaceSettingsToTextDraft, applyWorkspaceTextDraftField } from './persistenceUtils'

function buildDefaultWorkspaceSettings(path: string): WorkspaceSettings {
  return {
    path,
    defaultModel: DEFAULT_MODEL,
    permissionMode: 'proceed-always',
    sandbox: 'workspace-write',
    restrictAgentAccess: false,
    workspaceContext: '',
    showWorkspaceContextInPrompt: false,
    systemPrompt: '',
    allowedCommandPrefixes: [...DEFAULT_WORKSPACE_ALLOWED_COMMAND_PREFIXES],
    allowedAutoReadPrefixes: [...DEFAULT_WORKSPACE_ALLOWED_AUTO_READ_PREFIXES],
    allowedAutoWritePrefixes: [...DEFAULT_WORKSPACE_ALLOWED_AUTO_WRITE_PREFIXES],
    deniedAutoReadPrefixes: [...DEFAULT_WORKSPACE_DENIED_AUTO_READ_PREFIXES],
    deniedAutoWritePrefixes: [...DEFAULT_WORKSPACE_DENIED_AUTO_WRITE_PREFIXES],
    cursorAllowBuilds: DEFAULT_WORKSPACE_CURSOR_ALLOW_BUILDS,
  }
}

export function makeDefaultPanel(
  id: string,
  cwd: string,
  initialModel?: string,
  historyId = newId(),
  cursorAllowBuilds = false,
): AgentPanelState {
  const model = initialModel ?? DEFAULT_MODEL
  const provider = getModelProvider(model)
  const baseMessages: ChatMessage[] = [
    {
      id: newId(),
      role: 'system',
      content: `Model: ${model}`,
      format: 'text',
      createdAt: Date.now(),
    },
  ]
  const messages = syncOutsideWorkspaceBuildWarning(baseMessages, cursorAllowBuilds)

  return {
    id,
    historyId,
    historyLocked: false,
    title: `Agent ${id.slice(-4)}`,
    cwd,
    provider,
    model: model,
    interactionMode: 'agent',
    permissionMode: 'proceed-always',
    sandbox: 'workspace-write',
    status: 'Not connected',
    connected: false,
    streaming: false,
    messages,
    attachments: [],
    input: '',
    pendingInputs: [],
    fontScale: 1,
    usage: undefined,
  }
}

export function withModelBanner(messages: ChatMessage[], model: string): ChatMessage[] {
  const banner = `${MODEL_BANNER_PREFIX}${model}`
  const hasOutsideWorkspaceBuildWarning = isOutsideWorkspaceBuildWarningMessage(messages[0])
  const modelBannerIndex = hasOutsideWorkspaceBuildWarning ? 1 : 0
  if (
    messages[modelBannerIndex]?.role === 'system' &&
    messages[modelBannerIndex].content.startsWith(MODEL_BANNER_PREFIX)
  ) {
    return [
      ...messages.slice(0, modelBannerIndex),
      { ...messages[modelBannerIndex], content: banner, format: 'text' },
      ...messages.slice(modelBannerIndex + 1),
    ]
  }
  return [
    ...messages.slice(0, modelBannerIndex),
    { id: newId(), role: 'system', content: banner, format: 'text', createdAt: Date.now() },
    ...messages.slice(modelBannerIndex),
  ]
}

export function normalizeWorkspaceSettingsFromPartial(
  fallbackPath: string,
  value?: Partial<WorkspaceSettings> | null,
): WorkspaceSettings {
  const normalizedFallbackPath = typeof fallbackPath === 'string' ? fallbackPath.trim() : ''
  const defaults = buildDefaultWorkspaceSettings(normalizedFallbackPath)
  const v = value ?? {}
  const path =
    typeof v.path === 'string' && v.path.trim() ? v.path.trim() : normalizedFallbackPath || defaults.path
  const restrictAgentAccess = v?.restrictAgentAccess === true

  const sandbox = v?.sandbox === 'read-only' ? 'read-only' as const : 'workspace-write' as const
  const permissionMode =
    sandbox === 'read-only'
      ? 'verify-first' as const
      : restrictAgentAccess
        ? 'verify-first' as const
        : v?.permissionMode === 'verify-first'
          ? 'verify-first' as const
          : 'proceed-always' as const

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

  const restrictiveDefaults = {
    allowedCommandPrefixes: [...RESTRICTED_WORKSPACE_ALLOWED_COMMAND_PREFIXES],
    allowedAutoReadPrefixes: [...DEFAULT_WORKSPACE_ALLOWED_AUTO_READ_PREFIXES],
    allowedAutoWritePrefixes: [...DEFAULT_WORKSPACE_ALLOWED_AUTO_WRITE_PREFIXES],
    deniedAutoReadPrefixes: [...RESTRICTED_WORKSPACE_DENIED_AUTO_READ_PREFIXES],
    deniedAutoWritePrefixes: [...RESTRICTED_WORKSPACE_DENIED_AUTO_WRITE_PREFIXES],
  }
  const effectiveDefaults = restrictAgentAccess ? restrictiveDefaults : defaults

  const cursorAllowBuilds =
    typeof v?.cursorAllowBuilds === 'boolean' ? v.cursorAllowBuilds : defaults.cursorAllowBuilds ?? true

  return {
    path,
    defaultModel: typeof v?.defaultModel === 'string' && v.defaultModel ? v.defaultModel : defaults.defaultModel,
    permissionMode,
    sandbox,
    restrictAgentAccess,
    workspaceContext: typeof v?.workspaceContext === 'string' ? v.workspaceContext : defaults.workspaceContext,
    showWorkspaceContextInPrompt: v?.showWorkspaceContextInPrompt === true,
    systemPrompt: typeof v?.systemPrompt === 'string' ? v.systemPrompt : defaults.systemPrompt,
    allowedCommandPrefixes: hasAllowedCommandPrefixes ? allowedCommandPrefixes : effectiveDefaults.allowedCommandPrefixes,
    allowedAutoReadPrefixes: hasAllowedAutoReadPrefixes ? allowedAutoReadPrefixes : effectiveDefaults.allowedAutoReadPrefixes,
    allowedAutoWritePrefixes: hasAllowedAutoWritePrefixes ? allowedAutoWritePrefixes : effectiveDefaults.allowedAutoWritePrefixes,
    deniedAutoReadPrefixes: hasDeniedAutoReadPrefixes ? deniedAutoReadPrefixes : effectiveDefaults.deniedAutoReadPrefixes,
    deniedAutoWritePrefixes: hasDeniedAutoWritePrefixes ? deniedAutoWritePrefixes : effectiveDefaults.deniedAutoWritePrefixes,
    cursorAllowBuilds,
    promptShortcuts: Array.isArray(v?.promptShortcuts)
      ? v.promptShortcuts.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.slice(0, 80))
      : [],
  }
}

export function getInitialWorkspaceSettings(list: string[]): Record<string, WorkspaceSettings> {
  try {
    const raw = globalThis.localStorage?.getItem(WORKSPACE_SETTINGS_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, Partial<WorkspaceSettings>>) : {}
    const result: Record<string, WorkspaceSettings> = {}
    for (const [key, value] of Object.entries(parsed)) {
      const path = typeof value?.path === 'string' && value.path.trim() ? value.path.trim() : key.trim()
      if (!path) continue
      result[path] = normalizeWorkspaceSettingsFromPartial(path, value)
    }
    for (const p of list) {
      if (!result[p]) {
        result[p] = normalizeWorkspaceSettingsFromPartial(p)
      }
    }
    return result
  } catch {
    const result: Record<string, WorkspaceSettings> = {}
    for (const p of list) {
      result[p] = normalizeWorkspaceSettingsFromPartial(p)
    }
    return result
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
