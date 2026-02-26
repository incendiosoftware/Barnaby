/**
 * Dock panel tab - shaded name bar, flat X close button, draggable.
 * Used for all dockable panels (orchestrator, workspace-folder, etc.).
 */

import React from 'react'
import { CloseIcon } from '../icons'

export interface DockPanelTabProps {
  id: string
  label: string
  icon?: React.ReactNode
  isActive: boolean
  onSelect: () => void
  onClose: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  isDragging?: boolean
  isDropTarget?: boolean
}

export function DockPanelTab({
  id,
  label,
  icon,
  isActive,
  onSelect,
  onClose,
  onDragStart,
  onDragEnd,
  isDragging,
  isDropTarget,
}: DockPanelTabProps) {
  return (
    <div
      data-dock-tab={id}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`
        flex items-center gap-1.5 min-w-0 shrink-0 cursor-grab active:cursor-grabbing
        px-2 py-1.5 rounded-sm text-xs font-medium
        bg-neutral-200/80 dark:bg-neutral-800/80
        text-neutral-700 dark:text-neutral-300
        hover:bg-neutral-300/80 dark:hover:bg-neutral-700/80
        ${isActive ? 'bg-neutral-300/90 dark:bg-neutral-700/90' : ''}
        ${isDropTarget ? 'bg-blue-200/60 dark:bg-blue-900/40' : ''}
        ${isDragging ? 'opacity-50' : ''}
      `}
      onClick={onSelect}
    >
      {icon && <span className="shrink-0 flex text-neutral-500 dark:text-neutral-400">{icon}</span>}
      <span className="truncate">{label}</span>
      <button
        type="button"
        className="ml-0.5 h-5 w-5 shrink-0 inline-flex items-center justify-center rounded text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-400/40 dark:hover:bg-neutral-600/50 transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        title="Close"
        aria-label="Close"
      >
        <CloseIcon size={10} />
      </button>
    </div>
  )
}
