/**
 * Agent panel shell - outer chrome, focus capture, zoom wheel.
 * Use for: panel border/ring, active state, focus/mousedown, Ctrl+wheel zoom.
 */

import React from 'react'

export interface AgentPanelShellProps {
  isActive: boolean
  hasSettingsPopover: boolean
  onFocus: () => void
  onMouseDown: () => void
  onWheel: (e: React.WheelEvent) => void
  children: React.ReactNode
}

export function AgentPanelShell({
  isActive,
  hasSettingsPopover,
  onFocus,
  onMouseDown,
  onWheel,
  children,
}: AgentPanelShellProps) {
  return (
    <div
      className={[
        'relative h-full min-h-0 min-w-0 flex flex-col rounded-xl border bg-white dark:bg-neutral-950 overflow-hidden outline-none shadow-sm',
        hasSettingsPopover ? 'z-40' : 'z-0',
        isActive
          ? 'border-blue-400 dark:border-blue-600 ring-2 ring-blue-100 dark:ring-blue-900/40'
          : 'border-neutral-200/90 dark:border-neutral-800',
      ].join(' ')}
      tabIndex={0}
      onFocusCapture={onFocus}
      onMouseDownCapture={onMouseDown}
      onWheel={onWheel}
    >
      {children}
    </div>
  )
}
