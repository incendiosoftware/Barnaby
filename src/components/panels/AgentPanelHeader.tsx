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
  splitDisabled?: boolean
  splitTitle?: string
  showRawConversationButton?: boolean
  draggingPanelId: string | null
  dragOverTarget: string | null
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onSplit: () => void
  onViewRawConversation?: () => void
  onDownloadTranscript: () => void
  onRemember: () => void
  onClose: () => void
}

export function AgentPanelHeader({
  panel,
  panelsCount,
  splitDisabled,
  splitTitle,
  showRawConversationButton,
  draggingPanelId,
  dragOverTarget,
  onDragOver,
  onDrop,
  onDragStart,
  onDragEnd,
  onSplit,
  onViewRawConversation,
  onDownloadTranscript,
  onRemember,
  onClose,
}: AgentPanelHeaderProps) {
  const showDropZone = draggingPanelId && draggingPanelId !== panel.id && dragOverTarget === `agent-${panel.id}`
  const headerStyle: React.CSSProperties = {
    backgroundColor: 'var(--theme-bg-surface)',
    borderColor: 'var(--theme-border-default)',
    color: 'var(--theme-text-primary)',
  }
  const dragDotsStyle: React.CSSProperties = {
    color: 'var(--theme-text-tertiary)',
  }
  const iconButtonStyle: React.CSSProperties = {
    color: 'var(--theme-text-secondary)',
  }
  const closeButtonStyle: React.CSSProperties = {
    color: 'var(--theme-text-secondary)',
  }

  return (
    <div
      data-agent-panel-header="true"
      className="relative flex items-center justify-between gap-2 min-w-0 px-3 py-2.5 border-b shrink-0"
      style={headerStyle}
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
          <span className="shrink-0 flex touch-none" style={dragDotsStyle} aria-hidden="true">
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
            'h-8 w-9 shrink-0 inline-flex items-center justify-center rounded-md border-0 transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed',
            'hover:opacity-90 active:opacity-80',
          ].join(' ')}
          style={iconButtonStyle}
          onClick={onSplit}
          disabled={Boolean(splitDisabled)}
          title={splitTitle ?? (panelsCount >= MAX_PANELS ? `Maximum ${MAX_PANELS} panels` : 'Split panel')}
          aria-label="Split panel"
        >
          <svg width="18" height="16" viewBox="0 0 18 16" fill="none" aria-label="Split Panel">
            <path d="M5.75 8H1.5" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
            <path d="M3.9 5.75 1.5 8l2.4 2.25" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12.25 8h4.25" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
            <path d="M14.1 5.75 16.5 8l-2.4 2.25" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7.7 1.75v12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M10.3 1.75v12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <div className="w-1" />
        {showRawConversationButton && onViewRawConversation && (
          <button
            className={[
              'h-8 px-2.5 shrink-0 inline-flex items-center justify-center rounded-md border-0 transition-colors focus:outline-none text-xs font-medium',
              'hover:opacity-90 active:opacity-80',
            ].join(' ')}
            style={iconButtonStyle}
            onClick={onViewRawConversation}
            title="View raw conversation"
            aria-label="View raw conversation"
          >
            Raw
          </button>
        )}
        <button
          className={[
            'h-8 w-9 shrink-0 inline-flex items-center justify-center rounded-md border-0 transition-colors focus:outline-none',
            'hover:opacity-90 active:opacity-80',
          ].join(' ')}
          style={iconButtonStyle}
          onClick={onDownloadTranscript}
          title="Download transcript"
          aria-label="Download transcript"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2.4V9.8M8 9.8L5 6.8M8 9.8L11 6.8M2.8 12.6H13.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          className={[
            'h-8 w-9 shrink-0 inline-flex items-center justify-center rounded-md border-0 transition-colors focus:outline-none',
            'hover:opacity-90 active:opacity-80',
          ].join(' ')}
          style={iconButtonStyle}
          onClick={onRemember}
          title="Remember conversation"
          aria-label="Remember conversation"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M5.35 2.5H3.9c-.77 0-1.4.63-1.4 1.4v8.2c0 .77.63 1.4 1.4 1.4h8.2c.77 0 1.4-.63 1.4-1.4v-1.35"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M5.2 2.5h4.05c.5 0 .9.4.9.9v1.1"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M8.7 4.3 12.95 8.55"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M12.95 5.35v3.2h-3.2"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          className={[
            'h-9 w-10 shrink-0 inline-flex items-center justify-center rounded-md border-0 transition-colors focus:outline-none',
            'hover:opacity-90 active:opacity-80',
          ].join(' ')}
          style={closeButtonStyle}
          onClick={onClose}
          title="Close"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
