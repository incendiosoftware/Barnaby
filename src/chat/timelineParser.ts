import type { TimelineActivityItem, TimelineMessage, TimelineUnit, TimelineUnitKind } from './timelineTypes'

export type BuildTimelineInput = {
  panelId: string
  messages: TimelineMessage[]
  activityItems: TimelineActivityItem[]
  streaming: boolean
  retrospectiveWindow?: number
}

const ACTIVITY_MERGE_WINDOW_MS = 8000

function defaultIsLikelyThinkingUpdate(content: string) {
  const text = content.trim()
  if (!text) return false
  if (text.includes('```')) return false
  if (/^#{1,6}\s/m.test(text)) return false
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
  ]
  return markers.some((marker) => lower.includes(marker))
}

function messageKind(message: TimelineMessage): TimelineUnitKind {
  if (message.role === 'user') return 'user'
  if (message.role === 'system') return 'system'
  if (defaultIsLikelyThinkingUpdate(message.content)) return 'thinking'
  if (message.content.includes('```')) return 'code'
  return 'assistant'
}

function mergeActivityItems(items: TimelineActivityItem[]): TimelineActivityItem[] {
  const sorted = [...items]
    .filter((item) => {
      const label = String(item.label ?? '').trim().toLowerCase()
      if (!label) return false
      if (label.startsWith('event:')) return false
      if (label === 'assistantdelta') return false
      if (label === 'rawnotification') return false
      if (label === 'usageupdated') return false
      return true
    })
    .sort((a, b) => a.at - b.at)
  const merged: TimelineActivityItem[] = []
  for (const item of sorted) {
    const prev = merged[merged.length - 1]
    if (
      prev &&
      prev.kind === item.kind &&
      prev.label === item.label &&
      item.at - prev.at <= ACTIVITY_MERGE_WINDOW_MS
    ) {
      const detailParts = [prev.detail, item.detail].filter((p): p is string => Boolean(p && p.trim()))
      const deduped = [...new Set(detailParts)]
      merged[merged.length - 1] = {
        ...prev,
        detail: deduped.length > 0 ? deduped.join('\n') : undefined,
        at: item.at,
        count: (prev.count || 1) + (item.count || 1),
      }
      continue
    }
    merged.push({ ...item, count: item.count || 1 })
  }
  return merged
}

function formatActivityTitle(item: TimelineActivityItem, countSuffix: string): string {
  if (item.kind === 'operation') return `Operation trace: ${item.label}${countSuffix}`
  if (item.kind === 'reasoning') return `Reasoning: ${item.label}${countSuffix}`
  if (item.kind) return `${item.kind}: ${item.label}${countSuffix}`
  return `${item.label}${countSuffix}`
}

export function buildTimelineForPanel(input: BuildTimelineInput): TimelineUnit[] {
  const windowSize =
    typeof input.retrospectiveWindow === 'number' && Number.isFinite(input.retrospectiveWindow)
      ? Math.max(1, Math.round(input.retrospectiveWindow))
      : null
  const units: TimelineUnit[] = []

  for (let i = 0; i < input.messages.length; i += 1) {
    const message = input.messages[i]
    const kind = messageKind(message)
    units.push({
      id: `msg-${message.id}`,
      panelId: input.panelId,
      sourceMessageIds: [message.id],
      kind,
      title: kind === 'thinking' ? 'Thinking' : undefined,
      body: message.content,
      markdown: (message.format ?? 'markdown') === 'markdown',
      attachments: message.attachments,
      createdAt: i,
      updatedAt: i,
      status: 'completed',
      collapsible: kind === 'thinking' || kind === 'activity' || kind === 'code',
      defaultOpen: kind !== 'thinking' && kind !== 'code',
    })
  }

  const orderedActivity = mergeActivityItems(input.activityItems)
  for (const item of orderedActivity) {
    const detailSuffix = item.detail ? `\n${item.detail}` : ''
    const countSuffix = item.count > 1 ? ` x${item.count}` : ''
    units.push({
      id: `activity-${item.id}`,
      panelId: input.panelId,
      sourceMessageIds: [],
      kind: 'activity',
      title: formatActivityTitle(item, countSuffix),
      body: `${item.label}${countSuffix}${detailSuffix}`.trim(),
      markdown: false,
      activityKind: item.kind,
      createdAt: item.at,
      updatedAt: item.at,
      status: 'completed',
      collapsible: true,
      defaultOpen: false,
    })
  }

  const ordered = [...units].sort((a, b) => {
    if (a.createdAt === b.createdAt) return a.id.localeCompare(b.id)
    return a.createdAt - b.createdAt
  })
  const sliced = windowSize === null ? ordered : ordered.slice(-windowSize)
  const latestActivityIndex = [...sliced].map((unit) => unit.kind).lastIndexOf('activity')

  return sliced.map((unit, index) => {
    if (unit.kind === 'activity') {
      return {
        ...unit,
        defaultOpen: index === latestActivityIndex,
      }
    }
    if (input.streaming && index === sliced.length - 1 && (unit.kind === 'code' || unit.kind === 'assistant')) {
      return {
        ...unit,
        status: 'in_progress',
        defaultOpen: true,
      }
    }
    return unit
  })
}
