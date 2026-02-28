export type TimelineUnitKind = 'user' | 'assistant' | 'thinking' | 'activity' | 'code' | 'system'

export type TimelineUnitStatus = 'in_progress' | 'completed'

export type TimelineMessageRole = 'user' | 'assistant' | 'system'

export type TimelineMessage = {
  id: string
  role: TimelineMessageRole
  content: string
  interactionMode?: 'agent' | 'plan' | 'debug' | 'ask'
  format?: 'text' | 'markdown'
  attachments?: Array<{ id: string; path: string; label: string; mimeType?: string }>
  createdAt?: number
}

export type TimelineActivityItem = {
  id: string
  label: string
  detail?: string
  kind?: string
  at: number
  count: number
}

export type TimelineUnit = {
  id: string
  panelId: string
  sourceMessageIds: string[]
  kind: TimelineUnitKind
  title?: string
  body: string
  interactionMode?: 'agent' | 'plan' | 'debug' | 'ask'
  markdown: boolean
  attachments?: Array<{ id: string; path: string; label: string; mimeType?: string }>
  activityKind?: string
  createdAt: number
  updatedAt: number
  status: TimelineUnitStatus
  collapsible: boolean
  defaultOpen: boolean
}
