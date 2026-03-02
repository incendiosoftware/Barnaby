import React, { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { StandaloneTheme } from '../../types'

// React Strict Mode double-mounts in dev: effect runs, cleanup runs (destroy), then effect runs again.
// Defer destroy so a remount can cancel it; avoids terminal dying immediately when panel opens.
let pendingDestroyTimeout: ReturnType<typeof setTimeout> | null = null

function buildXtermTheme(theme: StandaloneTheme): Record<string, string> {
  const dark = theme.codeSyntax === 'dark'
  if (dark) {
    return {
      background: theme.bgBase,
      foreground: theme.textPrimary,
      cursor: theme.accent,
      cursorAccent: theme.bgBase,
      selectionBackground: theme.accentStrong,
      black: theme.bgBase,
      red: '#ff7b72',
      green: '#3fb950',
      yellow: '#d29922',
      blue: theme.accent,
      magenta: '#bc8cff',
      cyan: '#39c5cf',
      white: theme.textPrimary,
      brightBlack: '#484f58',
      brightRed: '#ff7b72',
      brightGreen: '#3fb950',
      brightYellow: '#d29922',
      brightBlue: theme.accent,
      brightMagenta: '#bc8cff',
      brightCyan: '#39c5cf',
      brightWhite: '#ffffff',
    }
  }
  return {
    background: theme.bgSurface,
    foreground: theme.textPrimary,
    cursor: theme.accentStrong,
    cursorAccent: theme.bgSurface,
    selectionBackground: theme.accent,
    black: theme.textPrimary,
    red: '#dc2626',
    green: '#16a34a',
    yellow: '#ca8a04',
    blue: theme.accentStrong,
    magenta: '#9333ea',
    cyan: '#0891b2',
    white: theme.textPrimary,
    brightBlack: '#64748b',
    brightRed: '#dc2626',
    brightGreen: '#16a34a',
    brightYellow: '#ca8a04',
    brightBlue: theme.accentStrong,
    brightMagenta: '#9333ea',
    brightCyan: '#0891b2',
    brightWhite: theme.textPrimary,
  }
}

type EmbeddedTerminalProps = {
  workspaceRoot: string
  fontFamily?: string
  activeTheme: StandaloneTheme
  api: {
    terminalSpawn: (cwd: string) => Promise<{ ok: boolean; error?: string }>
    terminalWrite: (data: string) => void
    terminalResize: (cols: number, rows: number) => Promise<void>
    terminalDestroy: () => Promise<void>
    onTerminalData: (cb: (data: string) => void) => () => void
    onTerminalExit: (cb: () => void) => () => void
  }
}

export function EmbeddedTerminal({ workspaceRoot, fontFamily = 'Consolas, "Courier New", monospace', activeTheme, api }: EmbeddedTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !api.terminalSpawn) return

    if (pendingDestroyTimeout != null) {
      clearTimeout(pendingDestroyTimeout)
      pendingDestroyTimeout = null
    }

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily,
      theme: buildXtermTheme(activeTheme),
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)
    termRef.current = term
    fitRef.current = fitAddon

    const cleanupData = api.onTerminalData?.((data: string) => {
      term.write(data)
    })
    const cleanupExit = api.onTerminalExit?.(() => {
      term.write('\r\n\x1b[33m[Terminal session ended]\x1b[0m\r\n')
    })

    term.onData((data: string) => {
      api.terminalWrite?.(data)
    })

    const resize = () => {
      try {
        fitAddon.fit()
        const { cols, rows } = term
        api.terminalResize?.(cols, rows)
      } catch {
        // ignore
      }
    }

    let raf: number
    const resizeObserver = new ResizeObserver(() => {
      raf = requestAnimationFrame(resize)
    })
    resizeObserver.observe(container)

    void api.terminalSpawn(workspaceRoot.trim() || '/').then((result) => {
      if (result?.ok) {
        resize()
      } else {
        term.writeln(`\x1b[31mFailed to start terminal: ${result?.error ?? 'Unknown error'}\x1b[0m`)
      }
    })

    return () => {
      resizeObserver.disconnect()
      cancelAnimationFrame(raf)
      cleanupData?.()
      cleanupExit?.()
      term.dispose()
      termRef.current = null
      fitRef.current = null
      pendingDestroyTimeout = setTimeout(() => {
        pendingDestroyTimeout = null
        void api.terminalDestroy?.()
      }, 150)
    }
  }, [workspaceRoot, fontFamily, api])

  useEffect(() => {
    const term = termRef.current
    if (term) {
      term.options.theme = buildXtermTheme(activeTheme)
    }
  }, [activeTheme])

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ minHeight: 120 }}
    />
  )
}
