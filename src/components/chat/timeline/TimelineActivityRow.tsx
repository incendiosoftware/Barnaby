/**
 * Activity unit row (reasoning, etc.) - collapsible details.
 */

import React from 'react'
import type { TimelineUnit } from '../../../chat/timelineTypes'

export interface TimelineActivityRowProps {
  unit: TimelineUnit
  isOpen: boolean
  onToggle: (open: boolean) => void
  timelineMessageColor: string
}

export const TimelineActivityRow = React.memo(function TimelineActivityRow({
  unit,
  isOpen,
  onToggle,
  timelineMessageColor,
}: TimelineActivityRowProps) {
  const activitySummary = unit.title || unit.body.trim().split(/\r?\n/)[0]?.slice(0, 80) || 'Activity'

  return (
    <div key={unit.id} className="w-full py-1">
      <details
        open={isOpen}
        onToggle={(e) => {
          const next = e.currentTarget.open
          onToggle(next)
        }}
        className="group"
      >
        <summary
          className="list-none cursor-pointer py-0.5 text-[10.5px] flex items-center justify-between gap-2 [&_*]:text-current"
          style={{ color: timelineMessageColor }}
        >
          <span>{activitySummary}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className="transition-transform group-open:rotate-180"
            aria-hidden
          >
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <div className="mt-1 pl-0 py-1 text-[12px] leading-5 [&_*]:!text-current" style={{ color: timelineMessageColor }}>
          {unit.body}
        </div>
      </details>
    </div>
  )
})
