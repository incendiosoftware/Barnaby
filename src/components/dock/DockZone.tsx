/**
 * Dock zone - tab bar (shaded) + content, drop target with edge detection.
 */

import React, { useCallback, useRef, useState } from 'react'
import type { DockPanelId, DockZoneId, DropTargetHint } from '../../types'
import { DOCK_PANEL_LABELS } from '../../constants'
import { resolveDropTarget, type SideDockZones, type BottomDockZones } from '../../utils/dockLayout'
import { DockPanelTab } from './DockPanelTab'
import {
  DebugOutputIcon,
  FolderIcon,
  GitIcon,
  RobotIcon,
  SettingsIcon,
  TerminalIcon,
} from '../icons'

const DOCK_PANEL_ICONS: Record<DockPanelId, React.ReactNode> = {
  orchestrator: <RobotIcon size={14} />,
  'workspace-folder': <FolderIcon size={14} />,
  'workspace-settings': <SettingsIcon size={14} />,
  'application-settings': <SettingsIcon size={14} />,
  'source-control': <GitIcon size={14} />,
  terminal: <TerminalIcon size={14} />,
  'debug-output': <DebugOutputIcon size={14} />,
}

export interface DockZoneProps {
  zoneId: DockZoneId
  tabs: DockPanelId[]
  activeTab: DockPanelId | undefined
  content: React.ReactNode
  dockSide: 'left' | 'right' | 'bottom'
  showCloseButtons?: boolean
  existingZones: SideDockZones | BottomDockZones
  draggingPanelId: string | null
  dragOverTarget: { zoneId: DockZoneId; hint: DropTargetHint } | null
  onTabSelect: (panelId: DockPanelId) => void
  onTabClose: (panelId: DockPanelId) => void
  onTabDragStart: (e: React.DragEvent, panelId: DockPanelId) => void
  onTabDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave?: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  dndType: string
}

export function DockZone({
  zoneId,
  tabs,
  activeTab,
  content,
  dockSide,
  showCloseButtons = true,
  existingZones,
  draggingPanelId,
  dragOverTarget,
  onTabSelect,
  onTabClose,
  onTabDragStart,
  onTabDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  dndType,
}: DockZoneProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [isOver, setIsOver] = useState(false)

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(dndType)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setIsOver(true)
      onDragOver(e)
    },
    [dndType, onDragOver],
  )

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      setIsOver(false)
      onDragLeave?.(e)
    },
    [onDragLeave],
  )

  const isTarget = dragOverTarget?.zoneId === zoneId

  return (
    <div
      ref={ref}
      className="h-full flex flex-col min-h-0"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-1 px-1.5 py-1 shrink-0 bg-neutral-200/70 dark:bg-neutral-800/70">
        {tabs.map((panelId) => (
          <DockPanelTab
            key={panelId}
            id={panelId}
            label={DOCK_PANEL_LABELS[panelId]}
            icon={DOCK_PANEL_ICONS[panelId]}
            isActive={activeTab === panelId}
            onSelect={() => onTabSelect(panelId)}
            onClose={() => onTabClose(panelId)}
            showCloseButton={showCloseButtons}
            onDragStart={(e) => onTabDragStart(e, panelId)}
            onDragEnd={onTabDragEnd}
            isDragging={draggingPanelId === panelId}
            isDropTarget={isTarget && activeTab === panelId}
          />
        ))}
      </div>
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {content}
      </div>
    </div>
  )
}
