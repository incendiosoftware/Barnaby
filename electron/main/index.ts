import { app, BrowserWindow, shell, ipcMain, Menu, dialog, screen, nativeTheme } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { CodexAppServerClient, type CodexConnectOptions, type FireHarnessCodexEvent } from './codexAppServerClient'
import { GeminiClient, type GeminiClientEvent } from './geminiClient'

const WORKSPACE_CONFIG_FILENAME = '.agentorchestrator.json'
const WORKSPACE_LOCK_DIRNAME = '.barnaby'
const WORKSPACE_LOCK_FILENAME = 'active-token.json'
const WORKSPACE_LOCK_HEARTBEAT_INTERVAL_MS = 5000
const WORKSPACE_LOCK_STALE_MS = 30000
const LEGACY_APPDATA_DIRNAME = 'Agent Orchestrator'
const LEGACY_STORAGE_MIGRATION_MARKER = '.legacy-storage-migration-v1.json'
const CHAT_HISTORY_STORAGE_KEY = 'agentorchestrator.chatHistory'
const APP_STORAGE_DIRNAME = '.storage'
const CHAT_HISTORY_FILENAME = 'chat-history.json'
const APP_STATE_FILENAME = 'app-state.json'
const RUNTIME_LOG_FILENAME = 'runtime.log'
const MAX_PERSISTED_CHAT_HISTORY_ENTRIES = 200
const MAX_EXPLORER_NODES = 2500
const MAX_FILE_PREVIEW_BYTES = 1024 * 1024
const STARTUP_SPLASH_TIMEOUT_MS = 30000
const EXPLORER_ALWAYS_IGNORED_DIRECTORIES = new Set([
  '.git',
  'dist',
  'dist-electron',
  'release',
  '.next',
  'out',
  '.turbo',
])
const execFileAsync = promisify(execFile)

type WorkspaceTreeOptions = {
  includeHidden?: boolean
  includeNodeModules?: boolean
}

type WorkspaceTreeNode = {
  name: string
  relativePath: string
  type: 'file' | 'directory'
  children?: WorkspaceTreeNode[]
}

type GitStatusEntry = {
  relativePath: string
  indexStatus: string
  workingTreeStatus: string
  staged: boolean
  unstaged: boolean
  untracked: boolean
  renamedFrom?: string
}

type GitStatusResult = {
  ok: boolean
  branch: string
  ahead: number
  behind: number
  stagedCount: number
  unstagedCount: number
  untrackedCount: number
  clean: boolean
  entries: GitStatusEntry[]
  checkedAt: number
  error?: string
}

type WorkspaceLockToken = {
  version: 1
  app: 'Barnaby'
  instanceId: string
  pid: number
  hostname: string
  workspaceRoot: string
  acquiredAt: number
  heartbeatAt: number
}

type WorkspaceLockAcquireResult =
  | {
      ok: true
      workspaceRoot: string
      lockFilePath: string
    }
  | {
      ok: false
      reason: 'invalid-workspace' | 'in-use' | 'error'
      message: string
      workspaceRoot: string
      lockFilePath: string
      owner?: Pick<WorkspaceLockToken, 'pid' | 'hostname' | 'acquiredAt' | 'heartbeatAt'> | null
    }

type ConnectOptions = CodexConnectOptions & {
  provider?: 'codex' | 'gemini'
  modelConfig?: Record<string, string>
}

type ProviderName = 'codex' | 'gemini'
type ProviderAuthStatus = {
  provider: ProviderName
  installed: boolean
  authenticated: boolean
  detail: string
  checkedAt: number
}

type PersistedChatAttachment = {
  id: string
  path: string
  label: string
  mimeType?: string
}

type PersistedChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  format?: 'text' | 'markdown'
  attachments?: PersistedChatAttachment[]
}

type PersistedChatHistoryEntry = {
  id: string
  title: string
  savedAt: number
  workspaceRoot: string
  model: string
  permissionMode: 'verify-first' | 'proceed-always'
  sandbox: 'read-only' | 'workspace-write' | 'danger-full-access'
  fontScale: number
  messages: PersistedChatMessage[]
}

type AgentClient = CodexAppServerClient | GeminiClient
type AgentEvent = FireHarnessCodexEvent | GeminiClientEvent

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

let win: BrowserWindow | null = null
let splashWin: BrowserWindow | null = null
let recentWorkspaces: string[] = []
let editorMenuEnabled = false
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')
let startupRevealTimer: ReturnType<typeof setTimeout> | null = null
let mainWindowReadyToShow = false
let rendererStartupReady = false
let waitForRendererStartup = false
let mainWindowRevealed = false

const agentClients = new Map<string, AgentClient>()
const workspaceLockInstanceId = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
const ownedWorkspaceLocks = new Map<string, { lockFilePath: string; acquiredAt: number }>()
let workspaceLockHeartbeatTimer: ReturnType<typeof setInterval> | null = null

function isBareElectronHostLaunch() {
  // In dev, defaultApp=true when running with the Electron host binary.
  // If no non-flag app target argument is provided, Electron opens its default page.
  if (!process.defaultApp) return false
  const candidateArgs = process.argv.slice(1).filter(Boolean)
  const hasAppTarget = candidateArgs.some((arg) => !arg.startsWith('-'))
  return !hasAppTarget
}

function normalizeRelativePath(p: string) {
  return p.replace(/\\/g, '/')
}

function isDirectory(p: string) {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

function clearStartupRevealTimer() {
  if (!startupRevealTimer) return
  clearTimeout(startupRevealTimer)
  startupRevealTimer = null
}

function closeSplashWindow() {
  if (!splashWin) return
  if (!splashWin.isDestroyed()) splashWin.close()
  splashWin = null
}

function createSplashWindow() {
  const splashImagePath = path.join(process.env.VITE_PUBLIC, 'splash.png')
  if (!fs.existsSync(splashImagePath)) return null

  const splash = new BrowserWindow({
    width: 560,
    height: 360,
    center: true,
    show: true,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0b0b0b',
    autoHideMenuBar: true,
  })
  splash.setMenuBarVisibility(false)
  const splashImageUrl = pathToFileURL(splashImagePath).toString()
  const splashHtml = [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<style>',
    'html, body { margin: 0; width: 100%; height: 100%; background: #0b0b0b; overflow: hidden; }',
    '.root { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }',
    'img { max-width: 90%; max-height: 90%; object-fit: contain; user-select: none; -webkit-user-drag: none; }',
    '</style>',
    '</head>',
    '<body>',
    `<div class="root"><img src="${splashImageUrl}" alt="Barnaby splash" /></div>`,
    '</body>',
    '</html>',
  ].join('')
  void splash.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(splashHtml)}`).catch(() => {})
  splash.on('closed', () => {
    if (splashWin === splash) splashWin = null
  })
  return splash
}

function revealMainWindow() {
  if (!win || mainWindowRevealed) return
  mainWindowRevealed = true
  clearStartupRevealTimer()
  closeSplashWindow()
  win.maximize()
  win.show()
}

function maybeRevealMainWindow() {
  if (!win) return
  if (mainWindowRevealed) return
  if (!mainWindowReadyToShow) return
  if (waitForRendererStartup && !rendererStartupReady) return
  revealMainWindow()
}

function copyDirectoryRecursive(sourceDir: string, destinationDir: string, skipNames = new Set<string>()) {
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

function levelDbHasNonEmptyChatHistory(levelDbDir: string) {
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

function writeLegacyMigrationMarker(userDataDir: string, status: 'migrated' | 'skipped') {
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

function migrateLegacyLocalStorageIfNeeded() {
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

function resolveWorkspacePath(workspaceRoot: string, relativePath: string) {
  const root = path.resolve(workspaceRoot)
  const safeRelative = relativePath.split('/').filter(Boolean).join(path.sep)
  const target = path.resolve(root, safeRelative)
  const check = path.relative(root, target)
  if (check.startsWith('..') || path.isAbsolute(check)) {
    throw new Error('Path is outside the workspace root.')
  }
  return target
}

function toWorkspaceRelativePath(workspaceRoot: string, absolutePath: string) {
  const root = path.resolve(workspaceRoot)
  const target = path.resolve(absolutePath)
  const check = path.relative(root, target)
  if (check.startsWith('..') || path.isAbsolute(check)) {
    throw new Error('Path is outside the workspace root.')
  }
  return normalizeRelativePath(check)
}

function getChatHistoryFilePath() {
  return path.join(app.getPath('userData'), APP_STORAGE_DIRNAME, CHAT_HISTORY_FILENAME)
}

function getAppStorageDirPath() {
  return path.join(app.getPath('userData'), APP_STORAGE_DIRNAME)
}

function getAppStateFilePath() {
  return path.join(getAppStorageDirPath(), APP_STATE_FILENAME)
}

function getRuntimeLogFilePath() {
  return path.join(getAppStorageDirPath(), RUNTIME_LOG_FILENAME)
}

function appendRuntimeLog(event: string, detail?: unknown, level: 'info' | 'warn' | 'error' = 'info') {
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
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8')
  } catch {
    // best-effort only
  }
}

function readPersistedAppState() {
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

function writePersistedAppState(state: unknown) {
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

function getDiagnosticsInfo() {
  return {
    userDataPath: app.getPath('userData'),
    storageDir: getAppStorageDirPath(),
    chatHistoryPath: getChatHistoryFilePath(),
    appStatePath: getAppStateFilePath(),
    runtimeLogPath: getRuntimeLogFilePath(),
  }
}

function openRuntimeLogFile() {
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

function registerRuntimeDiagnosticsLogging() {
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

function sanitizePersistedChatHistory(raw: unknown): PersistedChatHistoryEntry[] {
  if (!Array.isArray(raw)) return []
  const fallbackWorkspace = process.env.APP_ROOT || process.cwd()
  const next: PersistedChatHistoryEntry[] = []

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Partial<PersistedChatHistoryEntry>
    if (!Array.isArray(record.messages) || record.messages.length === 0) continue

    const messages: PersistedChatMessage[] = []
    for (const message of record.messages) {
      if (!message || typeof message !== 'object') continue
      const msgRecord = message as Partial<PersistedChatMessage>
      const role =
        msgRecord.role === 'user' || msgRecord.role === 'assistant' || msgRecord.role === 'system'
          ? msgRecord.role
          : 'system'
      const format = msgRecord.format === 'text' || msgRecord.format === 'markdown' ? msgRecord.format : undefined
      const attachments = Array.isArray(msgRecord.attachments)
        ? msgRecord.attachments
            .filter((x): x is PersistedChatAttachment => Boolean(x && typeof x === 'object'))
            .map((x) => ({
              id: typeof x.id === 'string' && x.id.trim() ? x.id.trim() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
              path: typeof x.path === 'string' ? x.path : '',
              label: typeof x.label === 'string' && x.label.trim() ? x.label.trim() : 'attachment',
              mimeType: typeof x.mimeType === 'string' && x.mimeType.trim() ? x.mimeType.trim() : undefined,
            }))
            .filter((x) => Boolean(x.path))
        : undefined

      messages.push({
        id:
          typeof msgRecord.id === 'string' && msgRecord.id.trim()
            ? msgRecord.id.trim()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role,
        content: typeof msgRecord.content === 'string' ? msgRecord.content : '',
        format,
        attachments: attachments && attachments.length > 0 ? attachments : undefined,
      })
    }

    if (messages.length === 0) continue

    next.push({
      id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: typeof record.title === 'string' && record.title.trim() ? record.title.trim() : 'Untitled chat',
      savedAt: typeof record.savedAt === 'number' && Number.isFinite(record.savedAt) ? record.savedAt : Date.now(),
      workspaceRoot:
        typeof record.workspaceRoot === 'string' && record.workspaceRoot.trim()
          ? record.workspaceRoot.trim()
          : fallbackWorkspace,
      model: typeof record.model === 'string' && record.model.trim() ? record.model.trim() : 'gpt-5',
      permissionMode: record.permissionMode === 'proceed-always' ? 'proceed-always' : 'verify-first',
      sandbox:
        record.sandbox === 'read-only' || record.sandbox === 'workspace-write' || record.sandbox === 'danger-full-access'
          ? record.sandbox
          : 'workspace-write',
      fontScale: typeof record.fontScale === 'number' && Number.isFinite(record.fontScale) ? record.fontScale : 1,
      messages,
    })
  }

  return next
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_PERSISTED_CHAT_HISTORY_ENTRIES)
}

function readPersistedChatHistory() {
  const historyPath = getChatHistoryFilePath()
  if (!fs.existsSync(historyPath)) return []
  try {
    const raw = fs.readFileSync(historyPath, 'utf8')
    if (!raw.trim()) return []
    const parsed = JSON.parse(raw) as { entries?: unknown } | unknown[]
    const candidate =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'entries' in parsed ? parsed.entries : parsed
    return sanitizePersistedChatHistory(candidate)
  } catch (err) {
    console.warn('[Barnaby] Failed to read persisted chat history:', errorMessage(err))
    return []
  }
}

function writePersistedChatHistory(entries: unknown) {
  const historyPath = getChatHistoryFilePath()
  const historyDir = path.dirname(historyPath)
  const sanitized = sanitizePersistedChatHistory(entries)
  const payload = {
    version: 1,
    savedAt: Date.now(),
    entries: sanitized,
  }
  fs.mkdirSync(historyDir, { recursive: true })
  fs.writeFileSync(historyPath, JSON.stringify(payload, null, 2), 'utf8')
  return {
    ok: true,
    count: sanitized.length,
    path: historyPath,
  }
}

function readWorkspaceTree(
  workspaceRoot: string,
  options: WorkspaceTreeOptions = {},
): { nodes: WorkspaceTreeNode[]; truncated: boolean } {
  const root = path.resolve(workspaceRoot)
  if (!fs.existsSync(root)) throw new Error('Workspace path does not exist.')
  if (!fs.statSync(root).isDirectory()) throw new Error('Workspace path is not a directory.')
  const includeHidden = Boolean(options.includeHidden)
  const includeNodeModules = Boolean(options.includeNodeModules)

  let seenNodes = 0
  let truncated = false

  function walk(relativeParent: string): WorkspaceTreeNode[] {
    if (truncated) return []

    const absoluteParent = relativeParent ? resolveWorkspacePath(root, relativeParent) : root
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(absoluteParent, { withFileTypes: true })
    } catch {
      return []
    }

    const sorted = entries
      .filter((entry) => {
        if (!includeHidden && entry.name.startsWith('.')) return false
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' && !includeNodeModules) return false
          return !EXPLORER_ALWAYS_IGNORED_DIRECTORIES.has(entry.name)
        }
        return entry.isFile()
      })
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
        return a.name.localeCompare(b.name)
      })

    const nodes: WorkspaceTreeNode[] = []
    for (const entry of sorted) {
      if (truncated) break
      seenNodes += 1
      if (seenNodes > MAX_EXPLORER_NODES) {
        truncated = true
        break
      }

      const childRelative = normalizeRelativePath(relativeParent ? `${relativeParent}/${entry.name}` : entry.name)
      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          relativePath: childRelative,
          type: 'directory',
          children: walk(childRelative),
        })
      } else {
        nodes.push({
          name: entry.name,
          relativePath: childRelative,
          type: 'file',
        })
      }
    }
    return nodes
  }

  return { nodes: walk(''), truncated }
}

function readWorkspaceFile(workspaceRoot: string, relativePath: string) {
  if (!relativePath?.trim()) throw new Error('File path is required.')
  const absolutePath = resolveWorkspacePath(workspaceRoot, normalizeRelativePath(relativePath))
  if (!fs.existsSync(absolutePath)) throw new Error('File does not exist.')

  const stat = fs.statSync(absolutePath)
  if (!stat.isFile()) throw new Error('Path is not a file.')

  const bytesToRead = Math.min(stat.size, MAX_FILE_PREVIEW_BYTES)
  const buffer = Buffer.alloc(bytesToRead)
  const handle = fs.openSync(absolutePath, 'r')

  try {
    fs.readSync(handle, buffer, 0, bytesToRead, 0)
  } finally {
    fs.closeSync(handle)
  }

  const binary = buffer.includes(0)
  return {
    relativePath: normalizeRelativePath(relativePath),
    size: stat.size,
    truncated: stat.size > MAX_FILE_PREVIEW_BYTES,
    binary,
    content: binary ? '' : buffer.toString('utf8'),
  }
}

function readWorkspaceTextFile(workspaceRoot: string, relativePath: string) {
  if (!relativePath?.trim()) throw new Error('File path is required.')
  const normalizedPath = normalizeRelativePath(relativePath)
  const absolutePath = resolveWorkspacePath(workspaceRoot, normalizedPath)
  if (!fs.existsSync(absolutePath)) throw new Error('File does not exist.')

  const stat = fs.statSync(absolutePath)
  if (!stat.isFile()) throw new Error('Path is not a file.')

  const buffer = fs.readFileSync(absolutePath)
  const binary = buffer.includes(0)
  return {
    relativePath: normalizedPath,
    size: stat.size,
    binary,
    content: binary ? '' : buffer.toString('utf8'),
  }
}

function writeWorkspaceFile(workspaceRoot: string, relativePath: string, content: string) {
  if (!relativePath?.trim()) throw new Error('File path is required.')
  const normalizedPath = normalizeRelativePath(relativePath)
  const absolutePath = resolveWorkspacePath(workspaceRoot, normalizedPath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, content ?? '', 'utf8')
  const stat = fs.statSync(absolutePath)
  return {
    relativePath: normalizedPath,
    size: stat.size,
  }
}

async function pickWorkspaceSavePath(workspaceRoot: string, relativePath: string) {
  const root = path.resolve(workspaceRoot)
  if (!fs.existsSync(root)) throw new Error('Workspace path does not exist.')
  if (!fs.statSync(root).isDirectory()) throw new Error('Workspace path is not a directory.')

  const normalizedPath = normalizeRelativePath(relativePath || 'untitled.txt')
  const defaultPath = path.join(root, normalizedPath.split('/').filter(Boolean).join(path.sep))
  const parent = BrowserWindow.getFocusedWindow() ?? win ?? BrowserWindow.getAllWindows()[0] ?? undefined
  const result = await dialog.showSaveDialog(parent, {
    title: 'Save file as',
    defaultPath,
  })
  if (result.canceled || !result.filePath) return null
  const nextRelativePath = toWorkspaceRelativePath(root, result.filePath)
  if (!nextRelativePath) throw new Error('Save As path must be a file inside the workspace root.')
  return nextRelativePath
}

function parseGitStatus(rawStatus: string): GitStatusResult {
  let branch = '(detached HEAD)'
  let ahead = 0
  let behind = 0
  const entries: GitStatusEntry[] = []

  for (const line of rawStatus.split(/\r?\n/)) {
    if (!line.trim()) continue

    if (line.startsWith('## ')) {
      const header = line.slice(3).trim()
      const branchPart = header.split('...')[0].trim()
      branch = branchPart.replace(/\s+\[.*\]$/, '') || branch
      const aheadMatch = header.match(/ahead (\d+)/)
      const behindMatch = header.match(/behind (\d+)/)
      ahead = aheadMatch ? Number.parseInt(aheadMatch[1], 10) : 0
      behind = behindMatch ? Number.parseInt(behindMatch[1], 10) : 0
      continue
    }

    const status = line.slice(0, 2)
    const rawPath = line.slice(3).trim()
    if (!rawPath) continue

    let relativePath = normalizeRelativePath(rawPath)
    let renamedFrom: string | undefined
    if (rawPath.includes(' -> ')) {
      const [from, to] = rawPath.split(' -> ')
      renamedFrom = normalizeRelativePath(from.trim())
      relativePath = normalizeRelativePath(to.trim())
    }

    const indexStatus = status[0] ?? ' '
    const workingTreeStatus = status[1] ?? ' '
    const untracked = status === '??'
    const staged = !untracked && indexStatus !== ' '
    const unstaged = !untracked && workingTreeStatus !== ' '

    entries.push({
      relativePath,
      indexStatus,
      workingTreeStatus,
      staged,
      unstaged,
      untracked,
      renamedFrom,
    })
  }

  const stagedCount = entries.filter((entry) => entry.staged).length
  const unstagedCount = entries.filter((entry) => entry.unstaged).length
  const untrackedCount = entries.filter((entry) => entry.untracked).length

  return {
    ok: true,
    branch,
    ahead,
    behind,
    stagedCount,
    unstagedCount,
    untrackedCount,
    clean: entries.length === 0,
    entries,
    checkedAt: Date.now(),
  }
}

function errorMessage(value: unknown) {
  if (value && typeof value === 'object') {
    const stderr = (value as { stderr?: unknown }).stderr
    if (typeof stderr === 'string' && stderr.trim()) return stderr.trim()
  }
  if (value instanceof Error && value.message) return value.message
  return 'Unknown error.'
}

function resolveWorkspaceRootPath(workspaceRoot: string) {
  const root = path.resolve(workspaceRoot)
  if (!fs.existsSync(root)) throw new Error('Workspace path does not exist.')
  if (!fs.statSync(root).isDirectory()) throw new Error('Workspace path is not a directory.')
  return root
}

function getWorkspaceLockFilePath(workspaceRoot: string) {
  return path.join(workspaceRoot, WORKSPACE_LOCK_DIRNAME, WORKSPACE_LOCK_FILENAME)
}

function readWorkspaceLockToken(lockFilePath: string): WorkspaceLockToken | null {
  try {
    const raw = fs.readFileSync(lockFilePath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<WorkspaceLockToken>
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.app !== 'Barnaby') return null
    if (parsed.version !== 1) return null
    if (typeof parsed.instanceId !== 'string' || !parsed.instanceId.trim()) return null
    if (typeof parsed.pid !== 'number' || !Number.isFinite(parsed.pid) || parsed.pid <= 0) return null
    if (typeof parsed.hostname !== 'string') return null
    if (typeof parsed.workspaceRoot !== 'string' || !parsed.workspaceRoot.trim()) return null
    if (typeof parsed.acquiredAt !== 'number' || !Number.isFinite(parsed.acquiredAt)) return null
    if (typeof parsed.heartbeatAt !== 'number' || !Number.isFinite(parsed.heartbeatAt)) return null
    return {
      version: 1,
      app: 'Barnaby',
      instanceId: parsed.instanceId,
      pid: parsed.pid,
      hostname: parsed.hostname,
      workspaceRoot: parsed.workspaceRoot,
      acquiredAt: parsed.acquiredAt,
      heartbeatAt: parsed.heartbeatAt,
    }
  } catch {
    return null
  }
}

function isPidLikelyAlive(pid: number) {
  if (!Number.isFinite(pid) || pid <= 0) return false
  if (pid === process.pid) return true
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ESRCH') return false
    return true
  }
}

function isWorkspaceLockOwnedByThisProcess(token: WorkspaceLockToken) {
  return token.instanceId === workspaceLockInstanceId && token.pid === process.pid
}

function isWorkspaceLockStale(token: WorkspaceLockToken) {
  if (isWorkspaceLockOwnedByThisProcess(token)) return false
  if (!Number.isFinite(token.heartbeatAt)) return true
  if (Date.now() - token.heartbeatAt > WORKSPACE_LOCK_STALE_MS) return true
  return !isPidLikelyAlive(token.pid)
}

function makeWorkspaceLockToken(workspaceRoot: string, acquiredAt?: number, heartbeatAt?: number): WorkspaceLockToken {
  const now = Date.now()
  return {
    version: 1,
    app: 'Barnaby',
    instanceId: workspaceLockInstanceId,
    pid: process.pid,
    hostname: os.hostname(),
    workspaceRoot,
    acquiredAt: acquiredAt ?? now,
    heartbeatAt: heartbeatAt ?? now,
  }
}

function writeWorkspaceLockToken(lockFilePath: string, token: WorkspaceLockToken, mode: 'exclusive' | 'overwrite') {
  fs.mkdirSync(path.dirname(lockFilePath), { recursive: true })
  fs.writeFileSync(lockFilePath, `${JSON.stringify(token, null, 2)}\n`, {
    encoding: 'utf8',
    flag: mode === 'exclusive' ? 'wx' : 'w',
  })
}

function ensureWorkspaceLockHeartbeatTimer() {
  if (workspaceLockHeartbeatTimer) return
  workspaceLockHeartbeatTimer = setInterval(() => {
    const now = Date.now()
    for (const [workspaceRoot, lockInfo] of ownedWorkspaceLocks) {
      const currentToken = readWorkspaceLockToken(lockInfo.lockFilePath)
      if (currentToken && !isWorkspaceLockOwnedByThisProcess(currentToken)) {
        ownedWorkspaceLocks.delete(workspaceRoot)
        continue
      }
      const nextToken = makeWorkspaceLockToken(workspaceRoot, lockInfo.acquiredAt, now)
      try {
        writeWorkspaceLockToken(lockInfo.lockFilePath, nextToken, 'overwrite')
      } catch {
        // best-effort only; stale locks are recovered by timeout checks
      }
    }
    if (ownedWorkspaceLocks.size === 0 && workspaceLockHeartbeatTimer) {
      clearInterval(workspaceLockHeartbeatTimer)
      workspaceLockHeartbeatTimer = null
    }
  }, WORKSPACE_LOCK_HEARTBEAT_INTERVAL_MS)

  if (typeof workspaceLockHeartbeatTimer.unref === 'function') {
    workspaceLockHeartbeatTimer.unref()
  }
}

function acquireWorkspaceLock(workspaceRoot: string): WorkspaceLockAcquireResult {
  let root = ''
  try {
    root = resolveWorkspaceRootPath(workspaceRoot)
  } catch (err) {
    const resolvedPath = path.resolve(workspaceRoot || '.')
    return {
      ok: false,
      reason: 'invalid-workspace',
      message: errorMessage(err),
      workspaceRoot: resolvedPath,
      lockFilePath: getWorkspaceLockFilePath(resolvedPath),
      owner: null,
    }
  }

  const lockFilePath = getWorkspaceLockFilePath(root)
  const existingOwned = ownedWorkspaceLocks.get(root)
  if (existingOwned) {
    const refreshedToken = makeWorkspaceLockToken(root, existingOwned.acquiredAt, Date.now())
    try {
      writeWorkspaceLockToken(lockFilePath, refreshedToken, 'overwrite')
    } catch (err) {
      return {
        ok: false,
        reason: 'error',
        message: errorMessage(err),
        workspaceRoot: root,
        lockFilePath,
      }
    }
    return {
      ok: true,
      workspaceRoot: root,
      lockFilePath,
    }
  }

  const nextToken = makeWorkspaceLockToken(root)
  try {
    writeWorkspaceLockToken(lockFilePath, nextToken, 'exclusive')
    ownedWorkspaceLocks.set(root, { lockFilePath, acquiredAt: nextToken.acquiredAt })
    ensureWorkspaceLockHeartbeatTimer()
    return {
      ok: true,
      workspaceRoot: root,
      lockFilePath,
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
      return {
        ok: false,
        reason: 'error',
        message: errorMessage(err),
        workspaceRoot: root,
        lockFilePath,
      }
    }
  }

  const currentOwner = readWorkspaceLockToken(lockFilePath)
  if (currentOwner && !isWorkspaceLockStale(currentOwner)) {
    return {
      ok: false,
      reason: 'in-use',
      message: 'Workspace is already open in another Barnaby instance.',
      workspaceRoot: root,
      lockFilePath,
      owner: {
        pid: currentOwner.pid,
        hostname: currentOwner.hostname,
        acquiredAt: currentOwner.acquiredAt,
        heartbeatAt: currentOwner.heartbeatAt,
      },
    }
  }

  try {
    writeWorkspaceLockToken(lockFilePath, nextToken, 'overwrite')
    const confirmed = readWorkspaceLockToken(lockFilePath)
    if (!confirmed || !isWorkspaceLockOwnedByThisProcess(confirmed)) {
      return {
        ok: false,
        reason: 'in-use',
        message: 'Workspace lock was claimed by another Barnaby instance.',
        workspaceRoot: root,
        lockFilePath,
        owner: confirmed
          ? {
              pid: confirmed.pid,
              hostname: confirmed.hostname,
              acquiredAt: confirmed.acquiredAt,
              heartbeatAt: confirmed.heartbeatAt,
            }
          : null,
      }
    }
    ownedWorkspaceLocks.set(root, { lockFilePath, acquiredAt: confirmed.acquiredAt })
    ensureWorkspaceLockHeartbeatTimer()
    return {
      ok: true,
      workspaceRoot: root,
      lockFilePath,
    }
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      message: errorMessage(err),
      workspaceRoot: root,
      lockFilePath,
      owner: currentOwner
        ? {
            pid: currentOwner.pid,
            hostname: currentOwner.hostname,
            acquiredAt: currentOwner.acquiredAt,
            heartbeatAt: currentOwner.heartbeatAt,
          }
        : null,
    }
  }
}

function releaseWorkspaceLock(workspaceRoot: string) {
  const root = path.resolve(workspaceRoot)
  const lockFilePath = ownedWorkspaceLocks.get(root)?.lockFilePath ?? getWorkspaceLockFilePath(root)
  let released = false
  const token = readWorkspaceLockToken(lockFilePath)
  if (token && isWorkspaceLockOwnedByThisProcess(token)) {
    try {
      fs.rmSync(lockFilePath, { force: true })
      released = true
    } catch {
      // best-effort only
    }
  }

  ownedWorkspaceLocks.delete(root)
  if (ownedWorkspaceLocks.size === 0 && workspaceLockHeartbeatTimer) {
    clearInterval(workspaceLockHeartbeatTimer)
    workspaceLockHeartbeatTimer = null
  }
  return released
}

function releaseAllWorkspaceLocks() {
  const roots = [...ownedWorkspaceLocks.keys()]
  for (const root of roots) {
    releaseWorkspaceLock(root)
  }
}

async function getProviderAuthStatus(provider: ProviderName): Promise<ProviderAuthStatus> {
  async function isCliInstalled(command: 'codex' | 'gemini'): Promise<boolean> {
    try {
      if (process.platform === 'win32') {
        await execFileAsync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `${command} --version`], {
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        })
      } else {
        await execFileAsync(command, ['--version'], {
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        })
      }
      return true
    } catch {
      return false
    }
  }

  if (provider === 'codex') {
    try {
      const result =
        process.platform === 'win32'
          ? await execFileAsync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'codex login status'], {
              windowsHide: true,
              maxBuffer: 1024 * 1024,
            })
          : await execFileAsync('codex', ['login', 'status'], {
              windowsHide: true,
              maxBuffer: 1024 * 1024,
            })
      const out = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim()
      const normalized = out.toLowerCase()
      const authenticated = normalized.includes('logged in') && !normalized.includes('not logged in')
      return {
        provider,
        installed: true,
        authenticated,
        detail: out || (authenticated ? 'Logged in.' : 'Not logged in.'),
        checkedAt: Date.now(),
      }
    } catch (err) {
      const msg = errorMessage(err)
      const installed = await isCliInstalled('codex')
      return {
        provider,
        installed,
        authenticated: false,
        detail: msg || (installed ? 'Not logged in.' : 'Codex CLI not found.'),
        checkedAt: Date.now(),
      }
    }
  }

  try {
    const version =
      process.platform === 'win32'
        ? await execFileAsync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'gemini --version'], {
            windowsHide: true,
            maxBuffer: 1024 * 1024,
          })
        : await execFileAsync('gemini', ['--version'], {
            windowsHide: true,
            maxBuffer: 1024 * 1024,
          })
    const versionText = (version.stdout ?? version.stderr ?? '').trim()
    return {
      provider,
      installed: true,
      authenticated: true,
      detail: versionText
        ? `Gemini CLI ${versionText} detected. Uses local CLI login/session.`
        : 'Gemini CLI detected. Uses local CLI login/session.',
      checkedAt: Date.now(),
    }
  } catch (err) {
    return {
      provider,
      installed: false,
      authenticated: false,
      detail: errorMessage(err) || 'Gemini CLI not found.',
      checkedAt: Date.now(),
    }
  }
}

async function launchProviderLogin(provider: ProviderName): Promise<{ started: boolean; detail: string }> {
  if (process.platform === 'win32') {
    const cmd = provider === 'codex' ? 'codex login' : 'gemini'
    await execFileAsync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'start', '', 'cmd', '/k', cmd], {
      windowsHide: true,
    })
    return {
      started: true,
      detail:
        provider === 'codex'
          ? 'Opened terminal for Codex login.'
          : 'Opened terminal for Gemini login.',
    }
  }

  // Best effort for non-Windows shells.
  const command = provider === 'codex' ? 'codex login' : 'gemini'
  await execFileAsync('sh', ['-lc', command], { windowsHide: true })
  return { started: true, detail: `Launched ${provider} login.` }
}

async function getGitStatus(workspaceRoot: string): Promise<GitStatusResult> {
  const root = path.resolve(workspaceRoot)
  const base: Omit<GitStatusResult, 'ok'> = {
    branch: '(not a git repository)',
    ahead: 0,
    behind: 0,
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
    clean: true,
    entries: [],
    checkedAt: Date.now(),
  }

  try {
    const inside = await execFileAsync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    })
    if (!inside.stdout.trim().startsWith('true')) {
      return { ok: false, ...base, error: 'This workspace is not inside a git repository.' }
    }
  } catch (err) {
    return { ok: false, ...base, error: errorMessage(err) }
  }

  try {
    const status = await execFileAsync('git', ['-C', root, 'status', '--short', '--branch'], {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    })
    return parseGitStatus(status.stdout)
  } catch (err) {
    return { ok: false, ...base, error: errorMessage(err) }
  }
}

function forwardEvent(agentWindowId: string, evt: AgentEvent) {
  win?.webContents.send('agentorchestrator:event', { agentWindowId, evt })
  win?.webContents.send('fireharness:event', { agentWindowId, evt })
}

async function getOrCreateClient(agentWindowId: string, options: ConnectOptions): Promise<{ client: AgentClient; result: { threadId: string } }> {
  const provider = options.provider ?? 'codex'

  const existing = agentClients.get(agentWindowId)
  if (existing) {
    await (existing as { close: () => Promise<void> }).close()
    agentClients.delete(agentWindowId)
  }

  if (provider === 'gemini') {
    const client = new GeminiClient()
    client.on('event', (evt: GeminiClientEvent) => forwardEvent(agentWindowId, evt))
    const result = await client.connect({ model: options.model }) as { threadId: string }
    agentClients.set(agentWindowId, client)
    return { client, result }
  }

  const client = new CodexAppServerClient()
  client.on('event', (evt: FireHarnessCodexEvent) => {
    forwardEvent(agentWindowId, evt)
    if (evt?.type === 'status' && evt.status === 'closed') {
      agentClients.delete(agentWindowId)
    }
  })
  const result = await client.connect(options)
  agentClients.set(agentWindowId, client)
  return { client, result }
}

async function createWindow() {
  clearStartupRevealTimer()
  closeSplashWindow()
  mainWindowReadyToShow = false
  rendererStartupReady = false
  waitForRendererStartup = false
  mainWindowRevealed = false

  splashWin = createSplashWindow()
  waitForRendererStartup = Boolean(splashWin)
  if (!waitForRendererStartup) {
    rendererStartupReady = true
  } else {
    startupRevealTimer = setTimeout(() => {
      rendererStartupReady = true
      maybeRevealMainWindow()
    }, STARTUP_SPLASH_TIMEOUT_MS)
  }

  const { width: workAreaWidth, height: workAreaHeight } = screen.getPrimaryDisplay().workAreaSize
  const startupWidth = Math.floor(workAreaWidth / 5)
  const startupHeight = Math.floor(workAreaHeight * 0.9)

  win = new BrowserWindow({
    title: 'Barnaby',
    icon: path.join(process.env.VITE_PUBLIC, 'appicon.png'),
    show: false,
    width: startupWidth,
    height: startupHeight,
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // nodeIntegration: true,

      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      // contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) { // #298
    win.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  win.once('ready-to-show', () => {
    mainWindowReadyToShow = true
    maybeRevealMainWindow()
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  setAppMenu()
}

app.whenReady().then(async () => {
  if (isBareElectronHostLaunch()) {
    appendRuntimeLog('bare-electron-host-launch-blocked', { argv: process.argv }, 'warn')
    app.quit()
    return
  }
  registerRuntimeDiagnosticsLogging()
  appendRuntimeLog('app-start', { version: app.getVersion(), platform: process.platform, electron: process.versions.electron })
  migrateLegacyLocalStorageIfNeeded()
  await createWindow()
})

app.on('window-all-closed', () => {
  win = null
  closeSplashWindow()
  clearStartupRevealTimer()
  releaseAllWorkspaceLocks()
  for (const client of agentClients.values()) {
    (client as { close: () => Promise<void> }).close().catch(() => {})
  }
  agentClients.clear()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  closeSplashWindow()
  clearStartupRevealTimer()
  releaseAllWorkspaceLocks()
  for (const client of agentClients.values()) {
    (client as { close: () => Promise<void> }).close().catch(() => {})
  }
  agentClients.clear()
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})

ipcMain.handle('fireharness:connect', async (_evt, options: ConnectOptions) => {
  const { result } = await getOrCreateClient('default', options)
  return result
})

ipcMain.handle('fireharness:sendMessage', async (_evt, text: string) => {
  const client = agentClients.get('default')
  if (client) await (client as { sendUserMessage: (t: string) => Promise<void> }).sendUserMessage(text)
  return {}
})

ipcMain.handle('fireharness:interrupt', async () => {
  const client = agentClients.get('default')
  if (client) await (client as { interruptActiveTurn: () => Promise<void> }).interruptActiveTurn()
  return {}
})

ipcMain.handle('fireharness:disconnect', async () => {
  const client = agentClients.get('default')
  if (!client) return {}
  await (client as { close: () => Promise<void> }).close()
  agentClients.delete('default')
  return {}
})

ipcMain.handle('agentorchestrator:connect', async (_evt, agentWindowId: string, options: ConnectOptions) => {
  const { result } = await getOrCreateClient(agentWindowId, options)
  return result
})

ipcMain.handle('agentorchestrator:sendMessage', async (_evt, agentWindowId: string, text: string) => {
  const client = agentClients.get(agentWindowId)
  if (client) await (client as { sendUserMessage: (t: string) => Promise<void> }).sendUserMessage(text)
  return {}
})

ipcMain.handle('agentorchestrator:sendMessageEx', async (_evt, agentWindowId: string, payload: { text: string; imagePaths?: string[] }) => {
  const client = agentClients.get(agentWindowId)
  if (!client) return {}
  const text = typeof payload?.text === 'string' ? payload.text : ''
  const imagePaths = Array.isArray(payload?.imagePaths) ? payload.imagePaths.filter((p): p is string => typeof p === 'string' && p.trim().length > 0) : []
  if (imagePaths.length > 0) {
    const withImages = client as { sendUserMessageWithImages?: (t: string, paths: string[]) => Promise<void> }
    if (typeof withImages.sendUserMessageWithImages !== 'function') {
      throw new Error('Selected provider does not support image attachments in this app yet.')
    }
    await withImages.sendUserMessageWithImages(text, imagePaths)
    return {}
  }
  await (client as { sendUserMessage: (t: string) => Promise<void> }).sendUserMessage(text)
  return {}
})

ipcMain.handle('agentorchestrator:loadChatHistory', async () => {
  const loaded = readPersistedChatHistory()
  return loaded
})

ipcMain.handle('agentorchestrator:saveChatHistory', async (_evt, entries: unknown) => {
  return writePersistedChatHistory(entries)
})

ipcMain.handle('agentorchestrator:loadAppState', async () => {
  return readPersistedAppState()
})

ipcMain.handle('agentorchestrator:saveAppState', async (_evt, state: unknown) => {
  return writePersistedAppState(state)
})

ipcMain.handle('agentorchestrator:setWindowTheme', async (_evt, requestedTheme: unknown) => {
  const themeSource =
    requestedTheme === 'light' || requestedTheme === 'dark' || requestedTheme === 'system'
      ? requestedTheme
      : 'system'
  nativeTheme.themeSource = themeSource
  return { ok: true, themeSource, shouldUseDarkColors: nativeTheme.shouldUseDarkColors }
})

ipcMain.handle('agentorchestrator:rendererReady', async () => {
  rendererStartupReady = true
  maybeRevealMainWindow()
  return { ok: true }
})

ipcMain.handle('agentorchestrator:getDiagnosticsInfo', async () => {
  return getDiagnosticsInfo()
})

ipcMain.handle('agentorchestrator:openRuntimeLog', async () => {
  return openRuntimeLogFile()
})

ipcMain.handle('agentorchestrator:openExternalUrl', async (_evt, rawUrl: string) => {
  const url = typeof rawUrl === 'string' ? rawUrl.trim() : ''
  if (!url) return { ok: false, error: 'URL is required.' }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, error: 'Invalid URL.' }
  }
  const protocol = parsed.protocol.toLowerCase()
  if (protocol !== 'http:' && protocol !== 'https:' && protocol !== 'mailto:') {
    return { ok: false, error: `Unsupported URL protocol: ${protocol}` }
  }
  try {
    await shell.openExternal(parsed.toString())
    return { ok: true as const }
  } catch (err) {
    return { ok: false as const, error: errorMessage(err) }
  }
})

ipcMain.handle('agentorchestrator:interrupt', async (_evt, agentWindowId: string) => {
  const client = agentClients.get(agentWindowId)
  if (!client) return {}
  await (client as { interruptActiveTurn: () => Promise<void> }).interruptActiveTurn()
  return {}
})

ipcMain.handle('agentorchestrator:disconnect', async (_evt, agentWindowId: string) => {
  const client = agentClients.get(agentWindowId)
  if (!client) return {}
  await (client as { close: () => Promise<void> }).close()
  agentClients.delete(agentWindowId)
  return {}
})

ipcMain.handle('agentorchestrator:openFolderDialog', async () => {
  const parent = win ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? undefined
  const result = await dialog.showOpenDialog(parent, {
    properties: ['openDirectory'],
    title: 'Select workspace folder',
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('agentorchestrator:writeWorkspaceConfig', async (_evt, folderPath: string) => {
  const configPath = path.join(folderPath, WORKSPACE_CONFIG_FILENAME)
  const config = { version: 1, agentorchestrator: true }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
  return true
})

ipcMain.handle('agentorchestrator:claimWorkspace', async (_evt, workspaceRoot: string) => {
  return acquireWorkspaceLock(workspaceRoot)
})

ipcMain.handle('agentorchestrator:releaseWorkspace', async (_evt, workspaceRoot: string) => {
  if (!workspaceRoot?.trim()) return false
  return releaseWorkspaceLock(workspaceRoot)
})

ipcMain.handle('agentorchestrator:savePastedImage', async (_evt, dataUrl: string, mimeType?: string) => {
  const match = /^data:([^;]+);base64,(.+)$/.exec(String(dataUrl ?? ''))
  if (!match) throw new Error('Invalid image data')
  const dataMime = match[1]
  const base64 = match[2]
  const effectiveMime = (mimeType && typeof mimeType === 'string' ? mimeType : dataMime).toLowerCase()
  const ext =
    effectiveMime.includes('jpeg') || effectiveMime.includes('jpg')
      ? 'jpg'
      : effectiveMime.includes('webp')
        ? 'webp'
        : effectiveMime.includes('gif')
          ? 'gif'
          : 'png'
  const dir = path.join(os.tmpdir(), 'agentorchestrator', 'pasted-images')
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, `paste-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`)
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
  return { path: filePath, mimeType: effectiveMime }
})

ipcMain.handle('agentorchestrator:listWorkspaceTree', async (_evt, workspaceRoot: string, options?: WorkspaceTreeOptions) => {
  return readWorkspaceTree(workspaceRoot, options)
})

ipcMain.handle('agentorchestrator:readWorkspaceFile', async (_evt, workspaceRoot: string, relativePath: string) => {
  return readWorkspaceFile(workspaceRoot, relativePath)
})

ipcMain.handle('agentorchestrator:readWorkspaceTextFile', async (_evt, workspaceRoot: string, relativePath: string) => {
  return readWorkspaceTextFile(workspaceRoot, relativePath)
})

ipcMain.handle('agentorchestrator:writeWorkspaceFile', async (_evt, workspaceRoot: string, relativePath: string, content: string) => {
  return writeWorkspaceFile(workspaceRoot, relativePath, content)
})

ipcMain.handle('agentorchestrator:pickWorkspaceSavePath', async (_evt, workspaceRoot: string, relativePath: string) => {
  return pickWorkspaceSavePath(workspaceRoot, relativePath)
})

ipcMain.handle('agentorchestrator:getGitStatus', async (_evt, workspaceRoot: string) => {
  return getGitStatus(workspaceRoot)
})

ipcMain.on('agentorchestrator:setRecentWorkspaces', (_evt, list: string[]) => {
  recentWorkspaces = Array.isArray(list) ? list : []
  setAppMenu()
})

ipcMain.on('agentorchestrator:setEditorMenuState', (_evt, enabled: boolean) => {
  const next = Boolean(enabled)
  if (editorMenuEnabled === next) return
  editorMenuEnabled = next
  setAppMenu()
})

ipcMain.handle('agentorchestrator:getProviderAuthStatus', async (_evt, provider: ProviderName) => {
  return getProviderAuthStatus(provider)
})

ipcMain.handle('agentorchestrator:startProviderLogin', async (_evt, provider: ProviderName) => {
  return launchProviderLogin(provider)
})

function sendMenuAction(action: string, payload?: Record<string, unknown>) {
  const message = { action, ...payload }
  win?.webContents.send('agentorchestrator:menu', message)
  win?.webContents.send('fireharness:menu', message)
}

function setAppMenu() {
  const recentSubmenu: Electron.MenuItemConstructorOptions[] =
    recentWorkspaces.length > 0
      ? recentWorkspaces.slice(0, 10).map((p) => ({
          label: path.basename(p) || p,
          click: () => sendMenuAction('openWorkspace', { path: p }),
        }))
      : [{ label: '(none)', enabled: false }]

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'New Workspace', click: () => sendMenuAction('newWorkspace') },
        { label: 'Open Workspace...', click: () => sendMenuAction('openWorkspacePicker') },
        { label: 'Recent workspaces', submenu: recentSubmenu },
        { type: 'separator' },
        { label: 'New Panel', accelerator: 'Ctrl+N', click: () => sendMenuAction('newAgentWindow') },
        ...(editorMenuEnabled
          ? [
              { type: 'separator' as const },
              { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction('saveEditorFile') },
              { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenuAction('saveEditorFileAs') },
            ]
          : []),
        { type: 'separator' },
        { label: 'Close workspace', click: () => sendMenuAction('closeWorkspace') },
        { label: 'Exit', role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'New Panel', accelerator: 'Ctrl+Shift+N', click: () => sendMenuAction('newAgentWindow') },
        { label: 'Theme...', click: () => sendMenuAction('openThemeModal') },
        {
          label: 'Layout',
          submenu: [
            { label: 'Split Vertical (V)', click: () => sendMenuAction('layoutVertical') },
            { label: 'Split Horizontal (H)', click: () => sendMenuAction('layoutHorizontal') },
            { label: 'Tile / Grid', click: () => sendMenuAction('layoutGrid') },
          ],
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Application settings...', accelerator: 'CmdOrCtrl+,', click: () => sendMenuAction('openAppSettings') },
        { type: 'separator' },
        { label: 'Model setup...', click: () => sendMenuAction('openModelSetup') },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Barnaby',
          click: () => {
            const parent = win ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
            const opts: Electron.MessageBoxOptions = {
              type: 'info',
              title: 'About Barnaby',
              icon: path.join(process.env.VITE_PUBLIC, 'appicon.png'),
              message: 'Barnaby',
              detail: [
                `Version: ${app.getVersion()}`,
                'Contact: stuartmackereth@gmail.com',
              ].join('\n'),
              buttons: ['OK'],
            }
            if (parent) {
              dialog.showMessageBox(parent, opts)
            } else {
              dialog.showMessageBox(opts)
            }
          },
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
