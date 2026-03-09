/**
 * Dock panel tab - shaded name bar, draggable.
 * Used for all dockable panels (orchestrator, workspace-folder, etc.).
 */

import React from 'react'

export interface DockPanelTabProps {
  id: string
  label: string
  icon?: React.ReactNode
  isActive: boolean
  onSelect: () => void
  onClose: () => void
  showCloseButton?: boolean
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
        bg-blue-50/70 dark:bg-blue-900/30
        text-neutral-700 dark:text-neutral-300
        hover:bg-blue-100/70 dark:hover:bg-blue-800/40
        ${isActive ? 'bg-blue-100/90 dark:bg-blue-800/60 text-neutral-900 dark:text-neutral-100' : ''}
        ${isDropTarget ? 'bg-blue-200/60 dark:bg-blue-900/40' : ''}
        ${isDragging ? 'opacity-50' : ''}
      `}
      onClick={onSelect}
    >
      {icon && <span className="shrink-0 flex text-neutral-500 dark:text-neutral-400">{icon}</span>}
      <span className="truncate">{label}</span>
    </div>
  )
}
