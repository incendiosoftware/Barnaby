import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import {
  APP_STORAGE_DIRNAME,
  CHAT_HISTORY_FILENAME,
  APP_STATE_FILENAME,
  CHAT_HISTORY_STORAGE_KEY,
  LEGACY_APPDATA_DIRNAME,
  LEGACY_STORAGE_MIGRATION_MARKER
} from './constants'
import { appendRuntimeLog, errorMessage, getAppStorageDirPath } from './logger'

export function isDirectory(p: string) {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

export function copyDirectoryRecursive(sourceDir: string, destinationDir: string, skipNames = new Set<string>()) {
  fs.mkdirSync(destinationDir, { recursive: true })
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    if (skipNames.has(entry.name)) continue
    const sourcePath = path.join(sourceDir, entry.name)
    const destinationPath = path.join(destinationDir, entry.name)
    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, destinationPath, skipNames)
      continue
    }
    if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath)
    }
  }
}

export function levelDbHasNonEmptyChatHistory(levelDbDir: string) {
  if (!isDirectory(levelDbDir)) return false
  const files = fs
    .readdirSync(levelDbDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && (entry.name.endsWith('.ldb') || entry.name.endsWith('.log')))
    .map((entry) => path.join(levelDbDir, entry.name))

  for (const filePath of files) {
    let content = ''
    try {
      content = fs.readFileSync(filePath, 'latin1')
    } catch {
      continue
    }
    let idx = content.indexOf(CHAT_HISTORY_STORAGE_KEY)
    while (idx >= 0) {
      const snippet = content.slice(idx, idx + 240)
      if (snippet.includes('[{') || snippet.includes('[\x00{\x00')) return true
      idx = content.indexOf(CHAT_HISTORY_STORAGE_KEY, idx + CHAT_HISTORY_STORAGE_KEY.length)
    }
  }
  return false
}

export function writeLegacyMigrationMarker(userDataDir: string, status: 'migrated' | 'skipped') {
  try {
    const markerPath = path.join(userDataDir, LEGACY_STORAGE_MIGRATION_MARKER)
    fs.writeFileSync(
      markerPath,
      JSON.stringify({ version: 1, status, at: new Date().toISOString() }, null, 2),
      'utf8',
    )
  } catch {
    // best effort only
  }
}

export function migrateLegacyLocalStorageIfNeeded() {
  const userDataDir = app.getPath('userData')
  const markerPath = path.join(userDataDir, LEGACY_STORAGE_MIGRATION_MARKER)
  if (fs.existsSync(markerPath)) return

  const legacyLevelDbDir = path.join(app.getPath('appData'), LEGACY_APPDATA_DIRNAME, 'Local Storage', 'leveldb')
  const currentLevelDbDir = path.join(userDataDir, 'Local Storage', 'leveldb')

  if (!isDirectory(legacyLevelDbDir)) {
    writeLegacyMigrationMarker(userDataDir, 'skipped')
    return
  }
  if (!levelDbHasNonEmptyChatHistory(legacyLevelDbDir)) {
    writeLegacyMigrationMarker(userDataDir, 'skipped')
    return
  }
  if (levelDbHasNonEmptyChatHistory(currentLevelDbDir)) {
    writeLegacyMigrationMarker(userDataDir, 'skipped')
    return
  }

  try {
    if (isDirectory(currentLevelDbDir)) {
      const backupDir = path.join(userDataDir, 'Local Storage', `leveldb-pre-legacy-import-${Date.now()}`)
      copyDirectoryRecursive(currentLevelDbDir, backupDir, new Set(['LOCK']))
      fs.rmSync(currentLevelDbDir, { recursive: true, force: true })
    }
    copyDirectoryRecursive(legacyLevelDbDir, currentLevelDbDir, new Set(['LOCK']))
    writeLegacyMigrationMarker(userDataDir, 'migrated')
    console.info('[Barnaby] Imported legacy chat history from Agent Orchestrator.')
  } catch (err) {
    console.warn('[Barnaby] Legacy chat history migration failed:', errorMessage(err))
  }
}

export function getChatHistoryFilePath() {
  return path.join(app.getPath('userData'), APP_STORAGE_DIRNAME, CHAT_HISTORY_FILENAME)
}

export function getAppStateFilePath() {
  return path.join(getAppStorageDirPath(), APP_STATE_FILENAME)
}

export function readPersistedAppState() {
  const statePath = getAppStateFilePath()
  if (!fs.existsSync(statePath)) return null
  try {
    const raw = fs.readFileSync(statePath, 'utf8')
    if (!raw.trim()) return null
    const parsed = JSON.parse(raw) as { state?: unknown } | unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'state' in parsed) {
      return (parsed as { state?: unknown }).state ?? null
    }
    return parsed
  } catch (err) {
    appendRuntimeLog('read-app-state-failed', errorMessage(err), 'warn')
    return null
  }
}

export function writePersistedAppState(state: unknown) {
  const statePath = getAppStateFilePath()
  const payload = {
    version: 1,
    savedAt: Date.now(),
    state: state ?? null,
  }
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  fs.writeFileSync(statePath, JSON.stringify(payload, null, 2), 'utf8')
  return {
    ok: true,
    path: statePath,
    savedAt: payload.savedAt,
  }
}
