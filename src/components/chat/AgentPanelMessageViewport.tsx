/**
 * Agent panel message viewport - scrollable timeline container.
 * Use for: timeline scroll, context menu, panel text style.
 */

import React from 'react'

export interface AgentPanelMessageViewportProps {
  registerRef: (el: HTMLDivElement | null) => void
  onScroll: () => void
  onContextMenu: (e: React.MouseEvent<HTMLDivElement>) => void
  panelTextStyle: React.CSSProperties
  children: React.ReactNode
}

export function AgentPanelMessageViewport({
  registerRef,
  onScroll,
  onContextMenu,
  panelTextStyle,
  children,
}: AgentPanelMessageViewportProps) {
  return (
    <div
      ref={registerRef}
      onScroll={onScroll}
      onContextMenu={onContextMenu}
      className="flex-1 overflow-y-auto overflow-x-hidden pl-3 pr-4 py-3 space-y-2.5 bg-neutral-50 dark:bg-neutral-950 min-h-0"
      style={{ scrollbarGutter: 'stable', ...panelTextStyle }}
    >
      {children}
    </div>
  )
}
