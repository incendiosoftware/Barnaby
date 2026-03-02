/**
 * Workspace window tile - title bar, dock tab bar, content pane.
 * Use for: workspace window chrome, orchestrator/explorer/git/settings tabs.
 */

import React from 'react'
import { CloseIcon, FolderIcon, GitIcon, RobotIcon, SettingsIcon } from '../icons'

const DROP_ZONE_OVERLAY_STYLE: React.CSSProperties = {
  backgroundColor: 'color-mix(in srgb, var(--theme-accent-500) 28%, transparent)',
}

export type WorkspaceDockTab = 'orchestrator' | 'explorer' | 'git' | 'settings'

export interface WorkspaceTileProps {
  dockTab: WorkspaceDockTab
  workspaceDockSide: 'left' | 'right'
  showCodeWindow: boolean
  draggingPanelId: string | null
  dragOverTarget: string | { zoneId: string; hint: string } | null
  dockContent: React.ReactNode
  onMouseDownCapture: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onWheel: (e: React.WheelEvent) => void
  onDockTabChange: (tab: WorkspaceDockTab) => void
  onWorkspaceSettingsTab: () => void
  onDockSideToggle: () => void
  onClose: () => void
}

export function WorkspaceTile({
  dockTab,
  workspaceDockSide,
  showCodeWindow,
  draggingPanelId,
  dragOverTarget,
  dockContent,
  onMouseDownCapture,
  onDragOver,
  onDrop,
  onDragStart,
  onDragEnd,
  onWheel,
  onDockTabChange,
  onWorkspaceSettingsTab,
  onDockSideToggle,
  onClose,
}: WorkspaceTileProps) {
  return (
    <div
      data-workspace-window-root="true"
      className="relative h-full min-h-0 min-w-0 flex flex-col border border-neutral-200/80 dark:border-neutral-800 rounded-lg overflow-hidden bg-neutral-50 dark:bg-neutral-900 font-mono"
      onMouseDownCapture={onMouseDownCapture}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onWheel={onWheel}
    >
      <div
        data-workspace-title-bar="true"
        className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 shrink-0 select-none"
        draggable={showCodeWindow}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Workspace Window</div>
      </div>
      {draggingPanelId && dragOverTarget === 'dock-workspace' && (
        <div className="absolute inset-0 rounded-lg pointer-events-none z-10" style={DROP_ZONE_OVERLAY_STYLE} />
      )}
      <div data-workspace-dock-tab-bar="true" className="px-2.5 py-2 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center gap-1.5 bg-neutral-100 dark:bg-neutral-900/80">
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            title="Agent Orchestrator"
            aria-label="Agent Orchestrator"
            className={`h-8 w-8 inline-flex items-center justify-center rounded-md border-0 text-xs font-medium ${
              dockTab === 'orchestrator'
                ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-100'
                : 'bg-white hover:bg-neutral-50 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
            }`}
            onClick={() => onDockTabChange('orchestrator')}
          >
            <RobotIcon size={18} />
          </button>
          <button
            type="button"
            title="Workspace Folder"
            aria-label="Workspace Folder"
            className={`h-8 w-8 inline-flex items-center justify-center rounded-md border-0 text-xs font-medium ${
              dockTab === 'explorer'
                ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-100'
                : 'bg-white hover:bg-neutral-50 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
            }`}
            onClick={() => onDockTabChange('explorer')}
          >
            <FolderIcon size={18} />
          </button>
          <button
            type="button"
            title="Git"
            aria-label="Git"
            className={`h-8 w-8 inline-flex items-center justify-center rounded-md border-0 text-xs font-medium ${
              dockTab === 'git'
                ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-100'
                : 'bg-white hover:bg-neutral-50 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
            }`}
            onClick={() => onDockTabChange('git')}
          >
            <GitIcon size={18} />
          </button>
          <button
            type="button"
            title="Workspace settings"
            aria-label="Workspace settings"
            className={`h-8 w-8 inline-flex items-center justify-center rounded-md border-0 text-xs font-medium ${
              dockTab === 'settings'
                ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-100'
                : 'bg-white hover:bg-neutral-50 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
            }`}
            onClick={onWorkspaceSettingsTab}
          >
            <SettingsIcon size={18} />
          </button>
        </div>
        <button
          type="button"
          title={`Dock workspace window to ${workspaceDockSide === 'right' ? 'left' : 'right'}`}
          aria-label={`Dock workspace window to ${workspaceDockSide === 'right' ? 'left' : 'right'}`}
          className="ml-auto h-8 w-8 inline-flex items-center justify-center rounded-md border-0 text-xs font-medium bg-white hover:bg-neutral-50 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200"
          onClick={onDockSideToggle}
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 5.5H11.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
            <path d="M5.5 3.5L3 5.5L5.5 7.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13 10.5H4.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
            <path d="M10.5 8.5L13 10.5L10.5 12.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          title="Close workspace window"
          aria-label="Close workspace window"
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border-0 text-xs font-medium bg-white hover:bg-neutral-50 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200"
          onClick={onClose}
        >
          <CloseIcon size={12} />
        </button>
      </div>
      <div className="flex-1 min-h-0">{dockContent}</div>
    </div>
  )
}
