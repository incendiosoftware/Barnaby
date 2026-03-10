/**
 * Agent panel shell - outer chrome, focus capture, zoom wheel.
 * Use for: panel border/ring, active state, focus/mousedown, Ctrl+wheel zoom.
 */

import React from 'react'

export interface AgentPanelShellProps {
  isActive: boolean
  hasSettingsPopover: boolean
  onFocus: () => void
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void
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
  const shellStyle: React.CSSProperties = {
    backgroundColor: 'var(--theme-bg-surface)',
    borderColor: isActive ? 'var(--theme-accent-strong)' : 'var(--theme-border-default)',
    boxShadow: isActive ? '0 0 0 2px color-mix(in srgb, var(--theme-accent-tint) 72%, transparent)' : undefined,
  }

  return (
    <div
      className={[
        'relative h-full min-h-0 min-w-0 flex flex-col rounded-xl border overflow-hidden outline-none shadow-sm',
        hasSettingsPopover ? 'z-40' : 'z-0',
      ].join(' ')}
      style={shellStyle}
      tabIndex={0}
      onFocusCapture={onFocus}
      onMouseDown={onMouseDown}
      onWheel={onWheel}
    >
      {children}
    </div>
  )
}
