import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { APP_STORAGE_DIRNAME, RUNTIME_LOG_FILENAME, DEBUG_LOG_FILENAME } from './constants'

let debugLogWindow: BrowserWindow | null = null

export function setDebugLogWindow(win: BrowserWindow | null) {
  debugLogWindow = win
}

export function getAppStorageDirPath() {
  return path.join(app.getPath('userData'), APP_STORAGE_DIRNAME)
}

export function getRuntimeLogFilePath() {
  return path.join(getAppStorageDirPath(), RUNTIME_LOG_FILENAME)
}

export function getDebugLogFilePath() {
  return path.join(getAppStorageDirPath(), DEBUG_LOG_FILENAME)
}

export function appendDebugLog(line: string) {
  try {
    const logPath = getDebugLogFilePath()
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    const ts = new Date().toISOString()
    fs.appendFileSync(logPath, `[${ts}] ${line}
`, 'utf8')
    debugLogWindow?.webContents?.send?.('barnaby:debug-log-append', `[${ts}] ${line}`)
  } catch {
    // best-effort only
  }
}

export function appendRuntimeLog(event: string, detail?: unknown, level: 'info' | 'warn' | 'error' = 'info') {
  try {
    const logPath = getRuntimeLogFilePath()
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    const entry = {
      at: new Date().toISOString(),
      level,
      pid: process.pid,
      event,
      detail: detail ?? null,
    }
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}
`, 'utf8')
    const detailStr = detail != null ? (typeof detail === 'object' ? JSON.stringify(detail) : String(detail)) : ''
    appendDebugLog(`[${level.toUpperCase()}] ${event}${detailStr ? ` ${detailStr}` : ''}`)
  } catch {
    // best-effort only
  }
}

export function errorMessage(value: unknown) {
  if (value && typeof value === 'object') {
    const stderr = (value as { stderr?: unknown }).stderr
    if (typeof stderr === 'string' && stderr.trim()) return stderr.trim()
  }
  if (value instanceof Error && value.message) return value.message
  return 'Unknown error.'
}
