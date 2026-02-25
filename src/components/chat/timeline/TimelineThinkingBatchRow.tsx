/**
 * Thinking batch row - collapsible list of tool thinking steps.
 */

import React from 'react'
import type { TimelineUnit } from '../../../chat/timelineTypes'

const INLINE_LIMIT = 10

export interface TimelineThinkingBatchRowProps {
  batchKey: string
  units: TimelineUnit[]
  batchColor: string
  batchOpen: boolean
  onToggle: () => void
  formatToolTrace: (raw: string) => string
}

export const TimelineThinkingBatchRow = React.memo(function TimelineThinkingBatchRow({
  batchKey,
  units,
  batchColor,
  batchOpen,
  onToggle,
  formatToolTrace,
}: TimelineThinkingBatchRowProps) {
  const lastInProgress = units[units.length - 1]?.status === 'in_progress'
  const label = lastInProgress ? 'Working...' : `${units.length} tool steps`

  const renderItem = (u: TimelineUnit) => {
    const rawText = u.body.replace(/^\u{1F504}\s*/u, '').trim()
    const text = formatToolTrace(rawText)
    return (
      <div key={u.id} className="px-1 py-0">
        <div
          className={`text-[11px] leading-[1.4] truncate ${u.status === 'in_progress' ? 'animate-pulse motion-reduce:animate-none' : ''}`}
          style={{ color: batchColor }}
          title={rawText}
        >
          {text}
        </div>
      </div>
    )
  }

  if (units.length <= INLINE_LIMIT) {
    return (
      <div key={batchKey} className="w-full space-y-0">
        {units.map(renderItem)}
      </div>
    )
  }

  return (
    <div key={batchKey} className="w-full">
      <button
        type="button"
        className={`w-full text-left cursor-pointer py-1 px-1 text-[11px] flex items-center gap-1.5 select-none hover:opacity-80 bg-transparent border-0 outline-none ${lastInProgress ? 'animate-pulse motion-reduce:animate-none' : ''}`}
        style={{ color: batchColor }}
        onClick={onToggle}
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className={`shrink-0 transition-transform ${batchOpen ? 'rotate-90' : ''}`} aria-hidden>
          <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{label}</span>
      </button>
      {batchOpen && (
        <div className="space-y-0 pl-3">
          {units.map(renderItem)}
        </div>
      )}
    </div>
  )
})
