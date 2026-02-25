/**
 * Agent panel header - drag handle, title, split, close.
 */

import React from 'react'
import type { AgentPanelState } from '../../types'
import { getConversationPrecis } from '../../utils/appCore'
import { MAX_PANELS } from '../../constants'

const DROP_ZONE_OVERLAY_STYLE: React.CSSProperties = {
  backgroundColor: 'color-mix(in srgb, var(--theme-accent-500) 28%, transparent)',
}

export interface AgentPanelHeaderProps {
  panel: AgentPanelState
  panelsCount: number
  draggingPanelId: string | null
  dragOverTarget: string | null
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onSplit: () => void
  onClose: () => void
}

export function AgentPanelHeader({
  panel,
  panelsCount,
  draggingPanelId,
  dragOverTarget,
  onDragOver,
  onDrop,
  onDragStart,
  onDragEnd,
  onSplit,
  onClose,
}: AgentPanelHeaderProps) {
  const showDropZone = draggingPanelId && draggingPanelId !== panel.id && dragOverTarget === `agent-${panel.id}`

  return (
    <div
      data-agent-panel-header="true"
      className="relative flex items-center justify-between gap-2 min-w-0 px-3 py-2.5 border-b border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-950 shrink-0"
      onDragOver={(e) => panelsCount > 1 && onDragOver(e)}
      onDrop={(e) => panelsCount > 1 && onDrop(e)}
    >
      {showDropZone && (
        <div className="absolute inset-0 rounded-none pointer-events-none z-10" style={DROP_ZONE_OVERLAY_STYLE} />
      )}
      <div
        className="flex-1 min-w-0 flex items-center gap-2 select-none"
        title={panelsCount > 1 ? `${panel.title} — drag to reorder` : panel.title}
        draggable={panelsCount > 1}
        onDragStart={(e) => panelsCount > 1 && onDragStart(e)}
        onDragEnd={onDragEnd}
      >
        {panelsCount > 1 && (
          <span className="shrink-0 flex text-neutral-400 dark:text-neutral-500 touch-none" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 12 12" fill="currentColor">
              <circle cx="4" cy="3" r="1" /><circle cx="8" cy="3" r="1" />
              <circle cx="4" cy="6" r="1" /><circle cx="8" cy="6" r="1" />
              <circle cx="4" cy="9" r="1" /><circle cx="8" cy="9" r="1" />
            </svg>
          </span>
        )}
        <span className="text-sm font-semibold tracking-tight truncate">{getConversationPrecis(panel)}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0 cursor-default">
        <button
          className={[
            'h-8 w-9 shrink-0 inline-flex items-center justify-center rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
            'border-neutral-300 bg-white text-neutral-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700',
            'dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-blue-950/50 dark:hover:text-blue-300 dark:hover:border-blue-900/60',
          ].join(' ')}
          onClick={onSplit}
          disabled={panelsCount >= MAX_PANELS}
          title={panelsCount >= MAX_PANELS ? `Maximum ${MAX_PANELS} panels` : 'Split panel'}
          aria-label="Split panel"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-label="Split Panel">
            <path d="M1 2.25C1 1.56 1.56 1 2.25 1h13.5c.69 0 1.25.56 1.25 1.25v13.5c0 .69-.56 1.25-1.25 1.25H2.25A1.25 1.25 0 0 1 1 15.75V2.25z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M9 2V16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <button
          className={[
            'h-8 w-9 shrink-0 inline-flex items-center justify-center rounded-md border transition-colors',
            'border-neutral-300 bg-white text-neutral-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700',
            'dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-red-950/50 dark:hover:text-red-300 dark:hover:border-red-900/60',
          ].join(' ')}
          onClick={onClose}
          title="Close"
        >
          <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
            <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
