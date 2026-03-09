import type { TimelineActivityItem, TimelineMessage, TimelineUnit, TimelineUnitKind } from './timelineTypes'

export type BuildTimelineInput = {
  panelId: string
  messages: TimelineMessage[]
  activityItems: TimelineActivityItem[]
  streaming: boolean
  retrospectiveWindow?: number
}

const ACTIVITY_MERGE_WINDOW_MS = 8000

/** Max length for reasoning/operational updates; longer messages are formal replies. */
const THINKING_MAX_CHARS = 180

function defaultIsLikelyThinkingUpdate(content: string) {
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
  ]
  return markers.some((marker) => lower.includes(marker))
}

function messageKind(message: TimelineMessage): TimelineUnitKind {
  if (message.role === 'user') return 'user'
  if (message.role === 'system') {
    if (message.content.startsWith('\u{1F504} ')) return 'thinking'
    return 'system'
  }
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
    const messageCreatedAt = typeof message.createdAt === 'number' && Number.isFinite(message.createdAt) ? message.createdAt : i
    
    if (message.role === 'assistant' && /<(?:think|thought)>[\s\S]*?/i.test(message.content)) {
      const thoughtRegex = /<(?:think|thought)>([\s\S]*?)(?:<\/(?:think|thought)>|$)/gi
      let match
      let lastIndex = 0
      let segmentIndex = 0
      let attachmentsAttached = false

      while ((match = thoughtRegex.exec(message.content)) !== null) {
        const prefix = message.content.slice(lastIndex, match.index).trim()
        if (prefix) {
          const kind = prefix.includes('```') ? 'code' : 'assistant'
          units.push({
            id: `msg-${message.id}-${String(segmentIndex++).padStart(3, '0')}`,
            panelId: input.panelId,
            sourceMessageIds: [message.id],
            kind,
            title: undefined,
            body: prefix,
            interactionMode: message.interactionMode,
            markdown: (message.format ?? 'markdown') === 'markdown',
            attachments: !attachmentsAttached ? (attachmentsAttached = true, message.attachments) : undefined,
            createdAt: messageCreatedAt,
            updatedAt: messageCreatedAt,
            status: 'completed',
            collapsible: kind === 'code',
            defaultOpen: kind !== 'code',
          })
        }

        const thoughtContent = match[1].trim()
        const isClosed = match[0].toLowerCase().endsWith('</think>') || match[0].toLowerCase().endsWith('</thought>')
        
        if (thoughtContent || !isClosed) {
          units.push({
            id: `msg-${message.id}-${String(segmentIndex++).padStart(3, '0')}-thought`,
            panelId: input.panelId,
            sourceMessageIds: [message.id],
            kind: 'thinking',
            title: 'Thinking',
            body: thoughtContent || 'Thinking...',
            interactionMode: message.interactionMode,
            markdown: (message.format ?? 'markdown') === 'markdown',
            attachments: undefined,
            createdAt: messageCreatedAt,
            updatedAt: messageCreatedAt,
            status: isClosed ? 'completed' : (input.streaming && i === input.messages.length - 1 ? 'in_progress' : 'completed'),
            collapsible: true,
            defaultOpen: false,
          })
        }
        lastIndex = thoughtRegex.lastIndex
      }

      const suffix = message.content.slice(lastIndex).trim()
      if (suffix || lastIndex === 0) {
        const contentToUse = suffix || message.content
        const kind = suffix ? (suffix.includes('```') ? 'code' : 'assistant') : messageKind({ ...message, content: contentToUse })
        units.push({
          id: `msg-${message.id}-${String(segmentIndex++).padStart(3, '0')}`,
          panelId: input.panelId,
          sourceMessageIds: [message.id],
          kind,
          title: kind === 'thinking' ? 'Thinking' : undefined,
          body: contentToUse,
          interactionMode: message.interactionMode,
          markdown: (message.format ?? 'markdown') === 'markdown',
          attachments: !attachmentsAttached ? (attachmentsAttached = true, message.attachments) : undefined,
          createdAt: messageCreatedAt,
          updatedAt: messageCreatedAt,
          status: 'completed',
          collapsible: kind === 'thinking' || kind === 'activity' || kind === 'code',
          defaultOpen: kind !== 'thinking' && kind !== 'code',
        })
      }
    } else {
      const kind = messageKind(message)
      units.push({
        id: `msg-${message.id}`,
        panelId: input.panelId,
        sourceMessageIds: [message.id],
        kind,
        title: kind === 'thinking' ? 'Thinking' : undefined,
        body: message.content,
        interactionMode: message.interactionMode,
        markdown: (message.format ?? 'markdown') === 'markdown',
        attachments: message.attachments,
        createdAt: messageCreatedAt,
        updatedAt: messageCreatedAt,
        status: 'completed',
        collapsible: kind === 'thinking' || kind === 'activity' || kind === 'code',
        defaultOpen: kind !== 'thinking' && kind !== 'code',
      })
    }
  }

  const orderedActivity = mergeActivityItems(input.activityItems)
  for (let j = 0; j < orderedActivity.length; j += 1) {
    const item = orderedActivity[j]
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
    if (input.streaming && index === sliced.length - 1 && (unit.kind === 'code' || unit.kind === 'assistant' || unit.kind === 'thinking')) {
      return {
        ...unit,
        status: 'in_progress',
        defaultOpen: true,
      }
    }
    return unit
  })
}
