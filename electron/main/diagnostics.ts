import { app, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import {
  getChatHistoryFilePath,
  getAppStateFilePath,
} from './storageUtils'
import { appendRuntimeLog, errorMessage, getAppStorageDirPath, getRuntimeLogFilePath, getDebugLogFilePath } from './logger'
import type { DiagnosticsFileTarget, DiagnosticsPathTarget } from './types'

export function getDiagnosticsInfo() {
  return {
    userDataPath: app.getPath('userData'),
    storageDir: getAppStorageDirPath(),
    chatHistoryPath: getChatHistoryFilePath(),
    appStatePath: getAppStateFilePath(),
    runtimeLogPath: getRuntimeLogFilePath(),
    debugLogPath: getDebugLogFilePath(),
    crashDumpsPath: app.getPath('crashDumps'),
  }
}

export function resolveDiagnosticsPathTarget(target: DiagnosticsPathTarget) {
  const info = getDiagnosticsInfo()
  switch (target) {
    case 'userData':
      return { path: info.userDataPath, kind: 'directory' as const }
    case 'storage':
      return { path: info.storageDir, kind: 'directory' as const }
    case 'chatHistory':
      return { path: info.chatHistoryPath, kind: 'file' as const }
    case 'appState':
      return { path: info.appStatePath, kind: 'file' as const }
    case 'runtimeLog':
      return { path: info.runtimeLogPath, kind: 'file' as const }
    case 'debugLog':
      return { path: info.debugLogPath, kind: 'file' as const }
    case 'crashDumps':
      return { path: info.crashDumpsPath, kind: 'directory' as const }
  }
}

export async function openDiagnosticsPath(rawTarget: unknown) {
  const target = typeof rawTarget === 'string' ? (rawTarget as DiagnosticsPathTarget) : undefined
  if (
    target !== 'userData' &&
    target !== 'storage' &&
    target !== 'chatHistory' &&
    target !== 'appState' &&
    target !== 'runtimeLog' &&
    target !== 'debugLog' &&
    target !== 'crashDumps'
  ) {
    return {
      ok: false as const,
      path: '',
      error: 'Unknown diagnostics path target.',
    }
  }

  const resolved = resolveDiagnosticsPathTarget(target)
  if (!resolved) {
    return {
      ok: false as const,
      path: '',
      error: 'Unknown diagnostics path target.',
    }
  }

  try {
    if (resolved.kind === 'directory') {
      fs.mkdirSync(resolved.path, { recursive: true })
    } else if (target === 'runtimeLog' || target === 'debugLog') {
      fs.mkdirSync(path.dirname(resolved.path), { recursive: true })
      if (!fs.existsSync(resolved.path)) {
        fs.writeFileSync(resolved.path, '', 'utf8')
      }
    }
  } catch (err) {
    return {
      ok: false as const,
      path: resolved.path,
      error: errorMessage(err),
    }
  }

  const result = await shell.openPath(resolved.path)
  return {
    ok: !result,
    path: resolved.path,
    error: result || undefined,
  }
}

export function isDiagnosticsFileTarget(target: unknown): target is DiagnosticsFileTarget {
  return target === 'chatHistory' || target === 'appState' || target === 'runtimeLog'
}

export function ensureDiagnosticsFileExists(target: DiagnosticsFileTarget, absolutePath: string) {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  if (!fs.existsSync(absolutePath)) {
    fs.writeFileSync(absolutePath, '', 'utf8')
  }
}

export async function readDiagnosticsFile(rawTarget: unknown) {
  if (!isDiagnosticsFileTarget(rawTarget)) {
    return { ok: false as const, path: '', error: 'Unknown diagnostics file target.' }
  }
  const resolved = resolveDiagnosticsPathTarget(rawTarget)
  if (!resolved || resolved.kind !== 'file') {
    return { ok: false as const, path: '', error: 'Diagnostics target is not a file.' }
  }
  try {
    ensureDiagnosticsFileExists(rawTarget, resolved.path)
    const content = fs.readFileSync(resolved.path, 'utf8')
    return {
      ok: true as const,
      path: resolved.path,
      content,
      writable: false,
    }
  } catch (err) {
    return { ok: false as const, path: resolved.path, error: errorMessage(err) }
  }
}

export async function writeDiagnosticsFile(rawTarget: unknown, _rawContent: unknown) {
  if (!isDiagnosticsFileTarget(rawTarget)) {
    return { ok: false as const, path: '', error: 'Unknown diagnostics file target.' }
  }
  return { ok: false as const, path: '', error: 'Diagnostics files are read-only in this view.' }
}

export async function openAgentHistoryFolder() {
  const chatHistoryPath = getChatHistoryFilePath()
  const folderPath = path.dirname(chatHistoryPath)
  try {
    fs.mkdirSync(folderPath, { recursive: true })
  } catch (err) {
    return {
      ok: false,
      path: folderPath,
      error: errorMessage(err),
    }
  }
  const result = await shell.openPath(folderPath)
  return {
    ok: !result,
    path: folderPath,
    error: result || undefined,
  }
}

export function openRuntimeLogFile() {
  const runtimeLogPath = getRuntimeLogFilePath()
  try {
    fs.mkdirSync(path.dirname(runtimeLogPath), { recursive: true })
    if (!fs.existsSync(runtimeLogPath)) {
      fs.writeFileSync(runtimeLogPath, '', 'utf8')
    }
  } catch (err) {
    return {
      ok: false,
      path: runtimeLogPath,
      error: errorMessage(err),
    }
  }
  return shell.openPath(runtimeLogPath).then((result) => ({
    ok: !result,
    path: runtimeLogPath,
    error: result || undefined,
  }))
}

export function registerRuntimeDiagnosticsLogging() {
  process.on('uncaughtException', (err) => {
    appendRuntimeLog('uncaughtException', { message: err?.message, stack: err?.stack }, 'error')
  })

  process.on('unhandledRejection', (reason) => {
    appendRuntimeLog('unhandledRejection', reason, 'error')
  })

  app.on('render-process-gone', (_event, webContents, details) => {
    appendRuntimeLog(
      'render-process-gone',
      {
        url: webContents.getURL(),
        reason: details.reason,
        exitCode: details.exitCode,
      },
      'error',
    )
  })

  app.on('child-process-gone', (_event, details) => {
    appendRuntimeLog(
      'child-process-gone',
      {
        type: details.type,
        reason: details.reason,
        name: details.name,
        serviceName: details.serviceName,
        exitCode: details.exitCode,
      },
      details.reason === 'clean-exit' ? 'info' : 'warn',
    )
  })
}
