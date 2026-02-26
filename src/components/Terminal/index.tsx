import React, { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

// React Strict Mode double-mounts in dev: effect runs, cleanup runs (destroy), then effect runs again.
// Defer destroy so a remount can cancel it; avoids terminal dying immediately when panel opens.
let pendingDestroyTimeout: ReturnType<typeof setTimeout> | null = null

type EmbeddedTerminalProps = {
  workspaceRoot: string
  fontFamily?: string
  api: {
    terminalSpawn: (cwd: string) => Promise<{ ok: boolean; error?: string }>
    terminalWrite: (data: string) => void
    terminalResize: (cols: number, rows: number) => Promise<void>
    terminalDestroy: () => Promise<void>
    onTerminalData: (cb: (data: string) => void) => () => void
    onTerminalExit: (cb: () => void) => () => void
  }
}

export function EmbeddedTerminal({ workspaceRoot, fontFamily = 'Consolas, "Courier New", monospace', api }: EmbeddedTerminalProps) {
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
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#c9d1d9',
        cursorAccent: '#0d1117',
        selectionBackground: '#264f78',
        black: '#0d1117',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#c9d1d9',
        brightBlack: '#484f58',
        brightRed: '#ff7b72',
        brightGreen: '#3fb950',
        brightYellow: '#d29922',
        brightBlue: '#58a6ff',
        brightMagenta: '#bc8cff',
        brightCyan: '#39c5cf',
        brightWhite: '#ffffff',
      },
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

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ minHeight: 120 }}
    />
  )
}
