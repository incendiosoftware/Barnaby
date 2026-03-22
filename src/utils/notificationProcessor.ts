import type { AgentPanelState, ChatMessage } from '../types'
import { ALL_WORKSPACES_LOCKED_PROMPT, STARTUP_LOCKED_WORKSPACE_PROMPT } from '../constants'
import { newId } from './pathUtils'

export const LIMIT_WARNING_PREFIX = 'Warning (Limits):'
export const OUTSIDE_WORKSPACE_BUILD_WARNING_PREFIX = 'Warning: "Build commands are permitted to run outside the workspace folder."'
export const OUTSIDE_WORKSPACE_BUILD_WARNING = OUTSIDE_WORKSPACE_BUILD_WARNING_PREFIX
export const TRANSCRIPT_SAVED_PREFIX = '📄 Transcript saved:'
export const CONTEXT_COMPACTION_NOTICE_PREFIX = '⚙️ System Notice: The conversation history was getting too long.'
export const CONTEXT_COMPACTION_NOTICE = `${CONTEXT_COMPACTION_NOTICE_PREFIX} Older messages have been compacted into a summary to save memory.`
export const MANUAL_CONTEXT_COMPACTION_NOTICE =
  '⚙️ System Notice: Context was manually compacted. Older messages were replaced by a checkpoint summary.'

export function isLockedWorkspacePrompt(prompt: string | null): boolean {
  return prompt === STARTUP_LOCKED_WORKSPACE_PROMPT || prompt === ALL_WORKSPACES_LOCKED_PROMPT
}

export function simplifyCommand(raw: string): string {
  const trimmed = raw.trim()
  const m = trimmed.match(/-Command\s+'([^']+)'/i)
  const reduced = m?.[1]?.trim() || trimmed
  return reduced.length > 140 ? `${reduced.slice(0, 140)}...` : reduced
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
  if (e.type === 'contextCompacting') {
    return {
      label: 'Compacting context',
      detail: typeof e.detail === 'string' ? e.detail : undefined,
      kind: 'event',
    }
  }
  if (e.type === 'contextCompacted') {
    return {
      label: 'Context compacted',
      detail: typeof e.detail === 'string' ? e.detail : undefined,
      kind: 'event',
    }
  }
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
    const compactionPhase = classifyContextCompactionNotification(method, params)
    if (compactionPhase === 'start') {
      return { label: 'Compacting context', kind: 'event' }
    }
    if (compactionPhase === 'completed') {
      return { label: 'Context compacted', kind: 'event' }
    }
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

export function classifyContextCompactionNotification(
  method: string,
  params: unknown,
): 'start' | 'completed' | null {
  const methodLower = method.toLowerCase()
  const p = params as Record<string, unknown> | null | undefined
  const paramSignalCandidates = [
    pickString(p, ['type', 'kind', 'name', 'event', 'action']),
    pickString(p?.item as Record<string, unknown>, ['type', 'kind', 'name', 'event', 'action']),
    pickString(p?.checkpoint as Record<string, unknown>, ['type', 'kind', 'name', 'event', 'action']),
    pickString(p?.context as Record<string, unknown>, ['type', 'kind', 'name', 'event', 'action']),
  ]
  const paramSignals = paramSignalCandidates
    .filter((x): x is string => Boolean(x && x.trim()))
    .map((x) => x.toLowerCase())
    .join(' ')
  const hasStrongSignal =
    methodLower.includes('checkpoint') ||
    methodLower.includes('truncat') ||
    methodLower.includes('compact') ||
    paramSignals.includes('checkpoint') ||
    paramSignals.includes('truncat') ||
    paramSignals.includes('compact')
  const hasWeakSignal =
    ((methodLower.includes('summary') || methodLower.includes('summar')) &&
      (methodLower.includes('context') || methodLower.includes('history'))) ||
    ((paramSignals.includes('summary') || paramSignals.includes('summar')) &&
      (paramSignals.includes('context') || paramSignals.includes('history')))
  if (!hasStrongSignal && !hasWeakSignal) return null

  const statusHint =
    pickString(p, ['status', 'state', 'phase']) ??
    pickString(p?.checkpoint as Record<string, unknown>, ['status', 'state', 'phase']) ??
    pickString(p?.context as Record<string, unknown>, ['status', 'state', 'phase']) ??
    ''
  const statusLower = statusHint.toLowerCase()
  const startHint =
    methodLower.includes('start') ||
    methodLower.includes('begin') ||
    methodLower.includes('creating') ||
    methodLower.includes('building') ||
    methodLower.includes('generating') ||
    paramSignals.includes('start') ||
    paramSignals.includes('begin') ||
    paramSignals.includes('creating') ||
    paramSignals.includes('building') ||
    paramSignals.includes('generating') ||
    statusLower.includes('start') ||
    statusLower.includes('begin') ||
    statusLower.includes('running') ||
    statusLower.includes('in_progress') ||
    statusLower.includes('progress')
  if (startHint) return 'start'

  const doneHint =
    methodLower.includes('complete') ||
    methodLower.includes('completed') ||
    methodLower.includes('done') ||
    methodLower.includes('finish') ||
    methodLower.includes('finished') ||
    methodLower.includes('injected') ||
    paramSignals.includes('complete') ||
    paramSignals.includes('completed') ||
    paramSignals.includes('done') ||
    paramSignals.includes('finish') ||
    paramSignals.includes('finished') ||
    paramSignals.includes('injected') ||
    statusLower.includes('complete') ||
    statusLower.includes('done') ||
    statusLower.includes('finished') ||
    statusLower.includes('success')
  if (doneHint) return 'completed'

  // If we only know a checkpoint event happened, default to "completed" so the user still gets a notice.
  return 'completed'
}

export function withContextCompactionNotice(messages: ChatMessage[], detail?: string): ChatMessage[] {
  const detailText = typeof detail === 'string' ? detail.trim() : ''
  const content = detailText ? `${CONTEXT_COMPACTION_NOTICE}\n\n${detailText}` : CONTEXT_COMPACTION_NOTICE
  const duplicate = messages
    .slice(-8)
    .some((m) => m.role === 'system' && typeof m.content === 'string' && m.content.startsWith(CONTEXT_COMPACTION_NOTICE_PREFIX))
  if (duplicate) return messages
  return [...messages, { id: newId(), role: 'system', content, format: 'text', createdAt: Date.now() }]
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

export function classifyTerminalProviderFailure(message: string): { reason: string; userMessage: string } | null {
  const trimmed = message.trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()

  const isCodex403 =
    lower.includes('403 forbidden') &&
    (lower.includes('responses_websocket') ||
      lower.includes('backend-api/codex/responses') ||
      lower.includes('failed to connect to websocket') ||
      lower.includes('chatgpt.com/backend-api/codex/responses'))
  if (isCodex403) {
    return {
      reason: 'provider-forbidden',
      userMessage:
        'Provider access was denied (403 Forbidden). This session has expired and is now read-only. Re-authenticate Codex/ChatGPT, then start a new chat.',
    }
  }

  const authDenied =
    (lower.includes('forbidden') ||
      lower.includes('unauthorized') ||
      lower.includes('access denied') ||
      lower.includes('authentication failed') ||
      lower.includes('not authenticated') ||
      lower.includes('invalid api key') ||
      lower.includes('api key is invalid') ||
      lower.includes('api key missing')) &&
    (lower.includes('api key') ||
      lower.includes('auth') ||
      lower.includes('login') ||
      lower.includes('provider') ||
      lower.includes('codex') ||
      lower.includes('openai') ||
      lower.includes('openrouter') ||
      lower.includes('claude') ||
      lower.includes('gemini'))
  if (authDenied) {
    return {
      reason: 'provider-auth',
      userMessage:
        'Provider authentication failed. This session has expired and is now read-only. Fix the provider login/API key, then start a new chat.',
    }
  }

  return null
}

export function isOutsideWorkspaceBuildWarningMessage(message: ChatMessage | undefined): boolean {
  return Boolean(
    message &&
    message.role === 'system' &&
    typeof message.content === 'string' &&
    message.content.startsWith(OUTSIDE_WORKSPACE_BUILD_WARNING_PREFIX),
  )
}

export function withOutsideWorkspaceBuildWarning(messages: ChatMessage[]): ChatMessage[] {
  const existingIdx = messages.findIndex((message) => isOutsideWorkspaceBuildWarningMessage(message))
  const existing = existingIdx >= 0 ? messages[existingIdx] : null
  const warning: ChatMessage = existing
    ? { ...existing, role: 'system', content: OUTSIDE_WORKSPACE_BUILD_WARNING, format: 'text' }
    : { id: newId(), role: 'system', content: OUTSIDE_WORKSPACE_BUILD_WARNING, format: 'text', createdAt: Date.now() }

  if (existingIdx === 0) {
    const normalizedHead = warning
    if (messages[0].content === normalizedHead.content && messages[0].format === 'text') return messages
    return [normalizedHead, ...messages.slice(1)]
  }

  if (existingIdx > 0) {
    return [warning, ...messages.slice(0, existingIdx), ...messages.slice(existingIdx + 1)]
  }

  return [warning, ...messages]
}

export function syncOutsideWorkspaceBuildWarning(messages: ChatMessage[], enabled: boolean): ChatMessage[] {
  if (enabled) return withOutsideWorkspaceBuildWarning(messages)
  const next = messages.filter((message) => !isOutsideWorkspaceBuildWarningMessage(message))
  return next.length === messages.length ? messages : next
}
