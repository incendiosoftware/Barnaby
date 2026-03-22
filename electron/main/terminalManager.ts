import { BrowserWindow } from 'electron'
import { getMainWindow } from './windowManager'

let terminalPtyProcess: import('node-pty').IPty | null = null

function getNodePty(): typeof import('node-pty') | null {
  try {
    return require('node-pty') as typeof import('node-pty')
  } catch (err) {
    console.error('[node-pty] Failed to load:', err)
    return null
  }
}

export function openTerminalInWorkspace(workspaceRoot: string) {
  const nodePty = getNodePty()
  if (!nodePty) return { ok: false, error: 'node-pty not available' }
  // Logic from index.ts
  return { ok: true } // Placeholder
}

export function terminalSpawn(cwd: string) {
  const nodePty = getNodePty()
  if (!nodePty) return { ok: false, error: 'node-pty not available' }
  const win = getMainWindow()
  if (terminalPtyProcess) {
    try {
      terminalPtyProcess.kill()
    } catch { }
  }

  try {
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash'
    terminalPtyProcess = nodePty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: cwd || process.cwd(),
      env: process.env as Record<string, string>,
    } as Record<string, unknown>)
    terminalPtyProcess.onData((data: string) => {
      win?.webContents.send('agentorchestrator:terminalData', data)
    })
    terminalPtyProcess.onExit(() => {
      terminalPtyProcess = null
      win?.webContents.send('agentorchestrator:terminalExit', {})
    })
    return { ok: true }
  } catch (err: unknown) {
    terminalPtyProcess = null
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function terminalWrite(data: string) {
  if (terminalPtyProcess) terminalPtyProcess.write(data)
}

export function terminalResize(cols: number, rows: number) {
  if (terminalPtyProcess) terminalPtyProcess.resize(cols, rows)
}

export function terminalDestroy() {
  if (terminalPtyProcess) {
    try {
      terminalPtyProcess.kill()
    } catch {
      // ignore
    }
    terminalPtyProcess = null
  }
}
