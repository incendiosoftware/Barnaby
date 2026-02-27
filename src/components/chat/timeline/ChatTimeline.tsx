/**
 * Chat timeline container - builds rows, renders empty state, rows, and queued messages.
 */

import React, { useMemo } from 'react'
import type { TimelineUnit } from '../../../chat/timelineTypes'
import type { TimelineRow } from './types'
import { ChatEmptyState } from '../ChatEmptyState'
import { TimelineUnitRow } from './TimelineUnitRow'

const isToolThinking = (u: TimelineUnit) => u.kind === 'thinking' && u.body.startsWith('\u{1F504} ')

function buildRows(timelineUnits: TimelineUnit[], showOperationTrace: boolean): TimelineRow[] {
  const rows: TimelineRow[] = []
  let i = 0
  while (i < timelineUnits.length) {
    const unit = timelineUnits[i]
    const isOp = unit.kind === 'activity' && unit.activityKind === 'operation'
    if (isOp && showOperationTrace) {
      const batch: TimelineUnit[] = []
      while (i < timelineUnits.length && timelineUnits[i].kind === 'activity' && timelineUnits[i].activityKind === 'operation') {
        batch.push(timelineUnits[i])
        i += 1
      }
      rows.push({ type: 'operationBatch', units: batch })
      continue
    }
    if (isToolThinking(unit)) {
      const batch: TimelineUnit[] = []
      while (i < timelineUnits.length && isToolThinking(timelineUnits[i])) {
        batch.push(timelineUnits[i])
        i += 1
      }
      rows.push({ type: 'thinkingBatch', units: batch })
      continue
    }
    rows.push({ type: 'single', unit })
    i += 1
  }
  return rows
}

export interface ChatTimelineProps {
  timelineUnits: TimelineUnit[]
  showOperationTrace: boolean
  showReasoningUpdates: boolean
  showActivityUpdates: boolean
  timelineOpenByUnitId: Record<string, boolean>
  setTimelineOpenByUnitId: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  codeBlockOpenById: Record<string, boolean>
  setCodeBlockOpenById: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  timelinePinnedCodeByUnitId: Record<string, boolean>
  setTimelinePinnedCodeByUnitId: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  operationTraceColor: string
  timelineMessageColor: string
  debugNoteColor: string
  activeTheme: { mode: 'light' | 'dark' }
  panelId: string
  isStreaming: boolean
  permissionMode: 'verify-first' | 'proceed-always'
  isIdle: boolean
  activityClock: number
  lastAgentTimelineUnitId: string | null
  lastUserUnitId: string | null
  completedPromptDurationLabel: string | null
  completedPromptTimestamp: number | null
  resendingPanelId: string | null
  queueCount: number
  pendingInputs: string[]
  editingQueuedIndex: number | null
  formatToolTrace: (raw: string) => string
  onChatLinkClick: (href: string) => void
  onGrantPermissionAndResend: () => void
  onRecallLastUserMessage: () => void
  onBeginQueuedMessageEdit: (index: number) => void
  onInjectQueuedMessage: (index: number) => void
  onRemoveQueuedMessage: (index: number) => void
}

export function ChatTimeline(props: ChatTimelineProps) {
  const {
    timelineUnits,
    showOperationTrace,
    queueCount,
    pendingInputs,
    editingQueuedIndex,
    onBeginQueuedMessageEdit,
    onInjectQueuedMessage,
    onRemoveQueuedMessage,
  } = props

  const rows = useMemo(
    () => buildRows(timelineUnits, showOperationTrace),
    [timelineUnits, showOperationTrace]
  )

  return (
    <>
      {timelineUnits.length === 0 && <ChatEmptyState />}
      {rows.map((row) => {
        const key = row.type === 'single' ? row.unit.id : `${row.type}-${row.units.map((u) => u.id).join('-')}`
        return <TimelineUnitRow key={key} row={row} {...props} />
      })}
      {queueCount > 0 && (
        <div className="mt-4 pt-3 border-t border-amber-200/60 dark:border-amber-800/50 space-y-2">
          <div className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
            {queueCount} queued - will run after current turn
          </div>
          {pendingInputs.map((text, i) => {
            const preview = text.length > 80 ? text.slice(0, 80) + '...' : text
            const isEditingThisQueueItem = editingQueuedIndex === i
            return (
              <div
                key={`queued-${i}-${text.slice(0, 20)}`}
                className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${
                  isEditingThisQueueItem
                    ? 'border-blue-300 bg-blue-50/90 dark:border-blue-700 dark:bg-blue-950/30'
                    : 'border-amber-300 dark:border-amber-700 bg-amber-50/90 dark:bg-amber-950/30'
                }`}
              >
                <span
                  className={`flex-1 min-w-0 text-sm whitespace-pre-wrap break-words ${
                    isEditingThisQueueItem ? 'text-blue-950 dark:text-blue-100' : 'text-amber-950 dark:text-amber-100'
                  }`}
                >
                  {preview}
                </span>
                <div className="shrink-0 flex items-center gap-0.5">
                  <button
                    type="button"
                    className="h-6 w-6 inline-flex items-center justify-center rounded border border-blue-300 bg-white/90 text-blue-700 hover:bg-blue-100 hover:border-blue-400 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-900/50 dark:hover:border-blue-600"
                    title="Edit queued message"
                    aria-label="Edit queued message"
                    onClick={() => onBeginQueuedMessageEdit(i)}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path d="M3 11.5L2.8 13.2L4.5 13L12.2 5.3L10.7 3.8L3 11.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                      <path d="M9.9 4.6L11.4 6.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="h-6 w-6 inline-flex items-center justify-center rounded border border-amber-400 bg-white/80 text-amber-700 hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-700 dark:border-amber-600 dark:bg-amber-900/50 dark:text-amber-200 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
                    title="Inject now - send to agent immediately"
                    aria-label="Inject now"
                    onClick={() => onInjectQueuedMessage(i)}
                  >
                    <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                      <path d="M6 10V2M2.5 5.5L6 2l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="h-6 w-6 inline-flex items-center justify-center rounded border border-amber-400 bg-white/80 text-amber-700 hover:bg-red-50 hover:border-red-300 hover:text-red-700 dark:border-amber-600 dark:bg-amber-900/50 dark:text-amber-200 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    title="Remove from queue"
                    aria-label="Remove from queue"
                    onClick={() => onRemoveQueuedMessage(i)}
                  >
                    &times;
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
