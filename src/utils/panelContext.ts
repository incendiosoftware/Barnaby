import type { AgentPanelState, ModelProvider, PermissionMode, SandboxMode, WorkspaceSettings } from '../types'
import {
  CONTEXT_MAX_OUTPUT_RESERVE_TOKENS,
  CONTEXT_MIN_OUTPUT_RESERVE_TOKENS,
  CONTEXT_OUTPUT_RESERVE_RATIO,
  DEFAULT_GPT_CONTEXT_TOKENS,
  TOKEN_ESTIMATE_CHARS_PER_TOKEN,
  TOKEN_ESTIMATE_IMAGE_ATTACHMENT_TOKENS,
  TOKEN_ESTIMATE_MESSAGE_OVERHEAD,
  TOKEN_ESTIMATE_THREAD_OVERHEAD_TOKENS,
  TOKEN_ESTIMATE_WORDS_MULTIPLIER,
} from '../constants'

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
  if (provider === 'claude') return 200_000
  if (provider === 'codex') return DEFAULT_GPT_CONTEXT_TOKENS
  if (provider === 'openrouter') return 128_000
  return null
}

export function estimatePanelContextUsage(
  panel: AgentPanelState,
  getModelProvider: (model: string) => ModelProvider,
) {
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

export function sandboxModeDescription(mode: SandboxMode) {
  if (mode === 'read-only') return 'Read project files only; no file edits or shell writes.'
  return 'Can edit files and run commands inside the workspace folder.'
}

export function getWorkspaceSecurityLimitsForPath(
  path: string,
  workspaceSettingsByPath: Record<string, WorkspaceSettings>,
  workspaceRoot: string,
): { sandbox: SandboxMode; permissionMode: PermissionMode } {
  const ws = resolveWorkspaceSettingsForPath(path, workspaceSettingsByPath, workspaceRoot)
  const sandbox: SandboxMode = ws?.sandbox === 'read-only' ? 'read-only' : 'workspace-write'
  const permissionMode: PermissionMode =
    sandbox === 'read-only'
      ? 'verify-first'
      : ws?.permissionMode === 'proceed-always'
        ? 'proceed-always'
        : 'verify-first'
  return { sandbox, permissionMode }
}

function normalizeWorkspacePath(value: string) {
  return value.trim().replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

function resolveWorkspaceSettingsForPath(
  path: string,
  workspaceSettingsByPath: Record<string, WorkspaceSettings>,
  workspaceRoot: string,
): WorkspaceSettings | undefined {
  const direct = workspaceSettingsByPath[path] ?? workspaceSettingsByPath[workspaceRoot]
  if (direct) return direct

  const normalizedPath = normalizeWorkspacePath(path)
  const normalizedRoot = normalizeWorkspacePath(workspaceRoot)
  let bestMatch: WorkspaceSettings | undefined
  let bestLength = -1

  for (const [rawPath, settings] of Object.entries(workspaceSettingsByPath)) {
    const normalizedSettingPath = normalizeWorkspacePath(rawPath)
    if (!normalizedSettingPath) continue
    if (normalizedSettingPath === normalizedPath || normalizedSettingPath === normalizedRoot) {
      return settings
    }
    if (
      normalizedPath.startsWith(`${normalizedSettingPath}\\`) &&
      normalizedSettingPath.length > bestLength
    ) {
      bestMatch = settings
      bestLength = normalizedSettingPath.length
    }
  }

  return bestMatch
}

export function clampPanelSecurityForWorkspace(
  cwd: string,
  sandbox: SandboxMode,
  permissionMode: PermissionMode,
  workspaceSettingsByPath: Record<string, WorkspaceSettings>,
  workspaceRoot: string,
) {
  const limits = getWorkspaceSecurityLimitsForPath(cwd, workspaceSettingsByPath, workspaceRoot)
  const nextSandbox: SandboxMode = limits.sandbox === 'read-only' ? 'read-only' : sandbox
  const nextPermissionMode: PermissionMode =
    nextSandbox === 'read-only' || limits.permissionMode === 'verify-first'
      ? 'verify-first'
      : permissionMode
  return { sandbox: nextSandbox, permissionMode: nextPermissionMode }
}

export function getPanelSecurityState(
  panel: Pick<AgentPanelState, 'cwd' | 'sandbox' | 'permissionMode'>,
  workspaceSettingsByPath: Record<string, WorkspaceSettings>,
  workspaceRoot: string,
) {
  const limits = getWorkspaceSecurityLimitsForPath(panel.cwd, workspaceSettingsByPath, workspaceRoot)
  const effective = clampPanelSecurityForWorkspace(
    panel.cwd,
    panel.sandbox,
    panel.permissionMode,
    workspaceSettingsByPath,
    workspaceRoot,
  )
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
