import { app, BrowserWindow, shell, ipcMain, Menu, dialog, screen, nativeTheme, crashReporter } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function getNodePty(): typeof import('node-pty') | null {
  try {
    return require('node-pty') as typeof import('node-pty')
  } catch (err) {
    console.error('[node-pty] Failed to load:', err)
    return null
  }
}

import { CodexAppServerClient, type CodexConnectOptions, type FireHarnessCodexEvent } from './codexAppServerClient'
import { GeminiClient, type GeminiClientEvent } from './geminiClient'
import { ClaudeClient, type ClaudeClientEvent } from './claudeClient'
import { OpenRouterClient, type OpenRouterClientEvent } from './openRouterClient'
import { OpenAIClient, type OpenAIClientEvent } from './openaiClient'
import { initializePluginHost, shutdownPluginHost, setPluginHostWindow, setWorkspaceRootGetter, notifyPluginPanelEvent, notifyPluginPanelTurnComplete, getLoadedPlugins } from './pluginHost'
import { readOrchestratorSecrets, writeOrchestratorSecrets, writeOrchestratorSettings, type OrchestratorSettingsData } from './orchestratorStorage'
import { validateLicenseKey } from './licenseKeys'
import { McpServerManager, type McpServerConfig } from './mcpClient'
import { truncateHistoryWithMeta, type HistoryMessage } from './historyTruncation'

const WORKSPACE_CONFIG_FILENAME = '.agentorchestrator.json'
const WORKSPACE_BUNDLE_FILENAME = '.barnaby-workspace.json'
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
const PROVIDER_SECRETS_FILENAME = 'provider-secrets.json'
const RUNTIME_LOG_FILENAME = 'runtime.log'
const DEBUG_LOG_FILENAME = 'debug.log'
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

  // Enable crash reporting and Chromium verbose logging before app.ready
  ; (function initDebugAndCrashReporting() {
    try {
      crashReporter.start({
        submitURL: '',
        uploadToServer: false,
        compress: true,
      })
    } catch (err) {
      console.error('[Barnaby] crashReporter.start failed:', err)
    }
    const storageDir = path.join(app.getPath('userData'), APP_STORAGE_DIRNAME)
    const chromiumLogPath = path.join(storageDir, 'chromium.log')
    try {
      app.commandLine.appendSwitch('enable-logging')
      app.commandLine.appendSwitch('log-file', chromiumLogPath)
      app.commandLine.appendSwitch('v', '1')
    } catch (err) {
      console.error('[Barnaby] Chromium logging setup failed:', err)
    }
  })()

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
  provider?: 'codex' | 'claude' | 'gemini' | 'openrouter'
  modelConfig?: Record<string, string>
  interactionMode?: string
  initialHistory?: Array<{ role: 'user' | 'assistant'; text: string }>
}

type WorkspaceConfigSettingsPayload = {
  path?: string
  defaultModel?: string
  permissionMode?: 'verify-first' | 'proceed-always'
  sandbox?: 'read-only' | 'workspace-write'
  workspaceContext?: string
  showWorkspaceContextInPrompt?: boolean
  systemPrompt?: string
  allowedCommandPrefixes?: string[]
  allowedAutoReadPrefixes?: string[]
  allowedAutoWritePrefixes?: string[]
  deniedAutoReadPrefixes?: string[]
  deniedAutoWritePrefixes?: string[]
  cursorAllowBuilds?: boolean
}

type BarnabyWorkspaceFolder = {
  id: string
  path: string
  name?: string
  settings?: WorkspaceConfigSettingsPayload
}

type BarnabyWorkspaceFile = {
  version: 1
  app: 'Barnaby'
  kind: 'workspace'
  savedAt: number
  activeFolderId?: string
  folders: BarnabyWorkspaceFolder[]
}
type ContextMenuKind = 'input-selection' | 'chat-selection'
type ViewMenuDockPanelId =
  | 'orchestrator'
  | 'workspace-folder'
  | 'workspace-settings'
  | 'application-settings'
  | 'source-control'
  | 'terminal'
  | 'debug-output'
type ViewMenuDockState = Record<ViewMenuDockPanelId, boolean>
const DEFAULT_VIEW_MENU_DOCK_STATE: ViewMenuDockState = {
  orchestrator: false,
  'workspace-folder': false,
  'workspace-settings': false,
  'application-settings': false,
  'source-control': false,
  terminal: false,
  'debug-output': false,
}
const VIEW_MENU_DOCK_PANEL_IDS: ViewMenuDockPanelId[] = [
  'orchestrator',
  'workspace-folder',
  'workspace-settings',
  'application-settings',
  'source-control',
  'terminal',
  'debug-output',
]

function normalizeViewMenuDockState(raw: Partial<Record<ViewMenuDockPanelId, unknown>> | null | undefined): ViewMenuDockState {
  return {
    orchestrator: Boolean(raw?.orchestrator),
    'workspace-folder': Boolean(raw?.['workspace-folder']),
    'workspace-settings': Boolean(raw?.['workspace-settings']),
    'application-settings': Boolean(raw?.['application-settings']),
    'source-control': Boolean(raw?.['source-control']),
    terminal: Boolean(raw?.terminal),
    'debug-output': Boolean(raw?.['debug-output']),
  }
}

function viewMenuDockStateEquals(a: ViewMenuDockState, b: ViewMenuDockState) {
  return VIEW_MENU_DOCK_PANEL_IDS.every((panelId) => a[panelId] === b[panelId])
}

type ProviderName = 'codex' | 'claude' | 'gemini' | 'openrouter'
type ProviderConfigForAuth = {
  id: string
  type?: 'cli' | 'api'
  cliCommand?: string
  cliPath?: string
  authCheckCommand?: string
  loginCommand?: string
  upgradeCommand?: string
  upgradePackage?: string
  apiBaseUrl?: string
  loginUrl?: string
}
type ProviderAuthStatus = {
  provider: string
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
  sandbox: 'read-only' | 'workspace-write'
  fontScale: number
  messages: PersistedChatMessage[]
}

type AgentClient = CodexAppServerClient | ClaudeClient | GeminiClient | OpenRouterClient | OpenAIClient
type AgentEvent = FireHarnessCodexEvent | ClaudeClientEvent | GeminiClientEvent | OpenRouterClientEvent | OpenAIClientEvent

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

const WINDOWS_APP_USER_MODEL_ID = 'build.barnaby.app'
const WINDOWS_DISPLAY_NAME = 'Barnaby'

function getReleaseVersion() {
  const packagePaths = [
    path.join(process.env.APP_ROOT, 'package.json'),
    path.join(app.getAppPath(), 'package.json'),
  ]
  for (const pkgPath of packagePaths) {
    try {
      const raw = fs.readFileSync(pkgPath, 'utf8')
      const parsed = JSON.parse(raw) as { version?: unknown }
      if (typeof parsed.version === 'string' && parsed.version.trim()) return parsed.version.trim()
    } catch {
    }
  }
  return app.getVersion()
}

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Dev-mode stability: avoid GPU/cache crashes ("Access is denied", "Gpu Cache Creation failed: -2")
if (process.env.VITE_DEV_SERVER_URL) {
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
}

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') {
  app.setName(WINDOWS_DISPLAY_NAME)
  app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID)
}

let win: BrowserWindow | null = null
let splashWin: BrowserWindow | null = null
let debugLogWindow: BrowserWindow | null = null
let recentWorkspaces: string[] = []
let editorMenuEnabled = false
let viewMenuDockState: ViewMenuDockState = { ...DEFAULT_VIEW_MENU_DOCK_STATE }
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')
let startupRevealTimer: ReturnType<typeof setTimeout> | null = null
let mainWindowReadyToShow = false
let rendererStartupReady = false
let waitForRendererStartup = false
let mainWindowRevealed = false
let currentWindowWorkspaceRoot = ''
let pendingStartupWorkspaceRoot = ''

const agentClients = new Map<string, AgentClient>()
const agentClientCwds = new Map<string, string>()
const mcpServerManager = new McpServerManager()
const MAX_GIT_STATUS_FILES_IN_PROMPT = 60
const workspaceLockInstanceId = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
let terminalPtyProcess: import('node-pty').IPty | null = null
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

function readStartupWorkspaceRoot(argv: string[]): string {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] ?? '')
    if (!arg) continue
    if (arg.startsWith('--workspace-root=')) {
      const raw = arg.slice('--workspace-root='.length).trim()
      return raw ? path.resolve(raw) : ''
    }
    if (arg === '--workspace-root') {
      const next = String(argv[i + 1] ?? '').trim()
      return next ? path.resolve(next) : ''
    }
  }
  return ''
}

function relaunchArgsForNewWorkspace(workspaceRoot: string): string[] {
  const cleaned = process.argv.filter((arg) => {
    const value = String(arg ?? '')
    if (!value) return false
    return !(value === '--workspace-root' || value.startsWith('--workspace-root='))
  })
  const baseArgs = process.defaultApp ? cleaned.slice(1) : cleaned.slice(1)
  return [...baseArgs, '--workspace-root', workspaceRoot]
}

function openWorkspaceInNewBarnabyInstance(workspaceRoot: string): { ok: boolean; error?: string } {
  const resolvedRoot = path.resolve(workspaceRoot)
  if (!isDirectory(resolvedRoot)) return { ok: false, error: 'Workspace folder does not exist.' }
  const args = relaunchArgsForNewWorkspace(resolvedRoot)
  try {
    const child = spawn(process.execPath, args, {
      cwd: resolvedRoot,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

function normalizeRelativePath(p: string) {
  return p.replace(/\\/g, '/')
}

function getWindowWorkspaceLabel(workspaceRoot: string) {
  const trimmed = workspaceRoot.trim()
  if (!trimmed) return 'No workspace'
  const normalized = trimmed.replace(/[\\/]+$/, '')
  const baseName = path.basename(normalized)
  return baseName || normalized
}

function getMainWindowTitle(workspaceRoot: string) {
  const titleSuffix = VITE_DEV_SERVER_URL ? `(DEV ${getReleaseVersion()})` : `(v${getReleaseVersion()})`
  return `Barnaby ${titleSuffix} - ${getWindowWorkspaceLabel(workspaceRoot)}`
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

function splashFallbackHtmlDataUrl(splashImagePath: string) {
  let splashImageUrl = ''
  try {
    if (fs.existsSync(splashImagePath)) {
      const splashImageBase64 = fs.readFileSync(splashImagePath).toString('base64')
      splashImageUrl = `data:image/png;base64,${splashImageBase64}`
    }
  } catch (err) {
    appendRuntimeLog('splash-image-base64-failed', { splashImagePath, error: errorMessage(err) }, 'warn')
  }

  const version = getReleaseVersion()
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Barnaby Splash</title>
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: #0b0b0b;
      overflow: hidden;
    }
    .root {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    img {
      max-width: 90%;
      max-height: 90%;
      object-fit: contain;
      user-select: none;
      -webkit-user-drag: none;
    }
    .version {
      position: fixed;
      bottom: 8px;
      right: 12px;
      font-size: 11px;
      color: white;
      font-family: system-ui, sans-serif;
      opacity: 0.8;
    }
  </style>
</head>
<body>
  <div class="root">
    ${splashImageUrl ? `<img src="${splashImageUrl}" alt="Barnaby splash" />` : ''}
  </div>
  <div class="version">${String(version).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
</body>
</html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

function createSplashWindow() {
  const publicRoot = process.env.VITE_PUBLIC
  if (!publicRoot) {
    appendRuntimeLog('splash-skipped', { reason: 'vite-public-missing' }, 'warn')
    return null
  }
  const splashImagePath = path.join(publicRoot, 'splash.png')
  const splashHtmlPath = path.join(publicRoot, 'splash.html')
  if (!fs.existsSync(splashImagePath)) {
    appendRuntimeLog('splash-skipped', { reason: 'splash-image-missing', splashImagePath }, 'warn')
    return null
  }
  const hasSplashHtml = fs.existsSync(splashHtmlPath)

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
  const injectSplashVersion = () => {
    splash.webContents
      .executeJavaScript(
        `(function(){var el=document.getElementById('version');if(el)el.textContent=${JSON.stringify(getReleaseVersion())};})()`,
      )
      .catch(() => { })
  }
  if (hasSplashHtml) {
    splash.webContents.once('did-finish-load', injectSplashVersion)
    void splash.loadFile(splashHtmlPath).catch((err) => {
      appendRuntimeLog('splash-loadfile-failed', { splashHtmlPath, error: errorMessage(err) }, 'warn')
      void splash.loadURL(splashFallbackHtmlDataUrl(splashImagePath)).catch(() => { })
    })
  } else {
    appendRuntimeLog('splash-html-missing-fallback', { splashHtmlPath }, 'warn')
    void splash.loadURL(splashFallbackHtmlDataUrl(splashImagePath)).catch((err) => {
      appendRuntimeLog('splash-fallback-loadurl-failed', { splashImagePath, error: errorMessage(err) }, 'warn')
    })
  }
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

function getDebugLogFilePath() {
  return path.join(getAppStorageDirPath(), DEBUG_LOG_FILENAME)
}

function appendDebugLog(line: string) {
  try {
    const logPath = getDebugLogFilePath()
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    const ts = new Date().toISOString()
    fs.appendFileSync(logPath, `[${ts}] ${line}\n`, 'utf8')
    debugLogWindow?.webContents?.send?.('barnaby:debug-log-append', `[${ts}] ${line}`)
  } catch {
    // best-effort only
  }
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
    const detailStr = detail != null ? (typeof detail === 'object' ? JSON.stringify(detail) : String(detail)) : ''
    appendDebugLog(`[${level.toUpperCase()}] ${event}${detailStr ? ` ${detailStr}` : ''}`)
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

function normalizeWorkspaceRoots(raw: unknown, preferredRoot?: string): string[] {
  const roots: string[] = []
  const seen = new Set<string>()
  const pushRoot = (value: unknown) => {
    if (typeof value !== 'string') return
    const trimmed = value.trim()
    if (!trimmed) return
    const resolved = path.resolve(trimmed)
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved
    if (seen.has(key)) return
    seen.add(key)
    roots.push(resolved)
  }
  pushRoot(preferredRoot)
  if (Array.isArray(raw)) {
    for (const item of raw) pushRoot(item)
  } else {
    pushRoot(raw)
  }
  return roots
}

function isWorkspaceBundlePath(rawPath: string) {
  return path.basename(rawPath).toLowerCase() === WORKSPACE_BUNDLE_FILENAME.toLowerCase()
}

function defaultWorkspaceConfigSettings(folderPath: string): WorkspaceConfigSettingsPayload {
  return {
    path: folderPath,
    defaultModel: '',
    permissionMode: 'proceed-always',
    sandbox: 'workspace-write',
    workspaceContext: '',
    showWorkspaceContextInPrompt: false,
    systemPrompt: '',
    allowedCommandPrefixes: [],
    allowedAutoReadPrefixes: [],
    allowedAutoWritePrefixes: [],
    deniedAutoReadPrefixes: [],
    deniedAutoWritePrefixes: [],
    cursorAllowBuilds: true,
  }
}

function resolveWorkspaceRootFromAnyPath(rawPath: string): string {
  const trimmed = typeof rawPath === 'string' ? rawPath.trim() : ''
  if (!trimmed) throw new Error('Workspace path is required.')
  const resolved = path.resolve(trimmed)
  return isWorkspaceBundlePath(resolved) ? path.dirname(resolved) : resolved
}

function getWorkspaceBundleFilePathForRoot(workspaceRoot: string) {
  return path.join(workspaceRoot, WORKSPACE_BUNDLE_FILENAME)
}

function upsertWorkspaceBundleFolder(
  workspaceRoot: string,
  settings?: WorkspaceConfigSettingsPayload,
): { ok: boolean; workspaceRoot: string; workspaceFilePath: string; error?: string } {
  let resolvedRoot = ''
  try {
    resolvedRoot = resolveWorkspaceRootPath(workspaceRoot)
  } catch (err) {
    return { ok: false, workspaceRoot: path.resolve(workspaceRoot || '.'), workspaceFilePath: '', error: errorMessage(err) }
  }
  const workspaceFilePath = getWorkspaceBundleFilePathForRoot(resolvedRoot)
  const folderSettings = sanitizeWorkspaceConfigSettings(resolvedRoot, settings ?? defaultWorkspaceConfigSettings(resolvedRoot))
  const defaultFolder: BarnabyWorkspaceFolder = {
    id: 'folder-1',
    path: '.',
    name: path.basename(resolvedRoot),
    settings: folderSettings,
  }
  let next: BarnabyWorkspaceFile = {
    version: 1,
    app: 'Barnaby',
    kind: 'workspace',
    savedAt: Date.now(),
    activeFolderId: defaultFolder.id,
    folders: [defaultFolder],
  }
  try {
    if (fs.existsSync(workspaceFilePath)) {
      const raw = fs.readFileSync(workspaceFilePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<BarnabyWorkspaceFile>
      if (parsed && parsed.app === 'Barnaby' && parsed.kind === 'workspace' && Array.isArray(parsed.folders) && parsed.folders.length > 0) {
        const folders = parsed.folders
          .filter((item): item is BarnabyWorkspaceFolder => Boolean(item && typeof item === 'object'))
          .map((item, index) => {
            const itemPath = typeof item.path === 'string' && item.path.trim() ? item.path.trim() : '.'
            const absolute = path.isAbsolute(itemPath) ? path.resolve(itemPath) : path.resolve(resolvedRoot, itemPath)
            const portable = toPortableWorkspacePath(resolvedRoot, absolute)
            return {
              id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `folder-${index + 1}`,
              path: portable,
              name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : path.basename(absolute),
              settings: item.settings && typeof item.settings === 'object'
                ? sanitizeWorkspaceConfigSettings(absolute, item.settings)
                : undefined,
            } as BarnabyWorkspaceFolder
          })
        const rootFolderIndex = folders.findIndex((item) => {
          const absolute = path.isAbsolute(item.path) ? path.resolve(item.path) : path.resolve(resolvedRoot, item.path)
          return path.resolve(absolute) === resolvedRoot
        })
        if (rootFolderIndex >= 0) {
          folders[rootFolderIndex] = {
            ...folders[rootFolderIndex],
            path: '.',
            settings: folderSettings,
          }
        } else {
          folders.unshift(defaultFolder)
        }
        const activeFolderId =
          typeof parsed.activeFolderId === 'string' && parsed.activeFolderId.trim()
            ? parsed.activeFolderId.trim()
            : folders[0]?.id
        next = {
          version: 1,
          app: 'Barnaby',
          kind: 'workspace',
          savedAt: Date.now(),
          activeFolderId,
          folders,
        }
      }
    }
    fs.writeFileSync(workspaceFilePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    return { ok: true, workspaceRoot: resolvedRoot, workspaceFilePath }
  } catch (err) {
    return { ok: false, workspaceRoot: resolvedRoot, workspaceFilePath, error: errorMessage(err) }
  }
}

function normalizeRecentWorkspaceFiles(rawList: unknown): string[] {
  if (!Array.isArray(rawList)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of rawList) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed) continue
    let root = ''
    try {
      root = resolveWorkspaceRootFromAnyPath(trimmed)
    } catch {
      continue
    }
    const ensured = upsertWorkspaceBundleFolder(root)
    if (!ensured.ok || !ensured.workspaceFilePath) continue
    const key = process.platform === 'win32' ? ensured.workspaceFilePath.toLowerCase() : ensured.workspaceFilePath
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ensured.workspaceFilePath)
  }
  return out
}

function toPortableWorkspacePath(anchorRoot: string, workspaceRoot: string): string {
  const relative = path.relative(anchorRoot, workspaceRoot)
  if (!relative) return '.'
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return workspaceRoot
  }
  return relative.replace(/\\/g, '/')
}

function readWorkspaceBundleFromRoot(rawRoot: string): { workspaceRoot: string; workspaceList: string[]; sourcePath: string } | null {
  const root = typeof rawRoot === 'string' ? rawRoot.trim() : ''
  if (!root) return null
  let resolvedRoot = ''
  try {
    resolvedRoot = resolveWorkspaceRootPath(root)
  } catch {
    return null
  }
  const sourcePath = path.join(resolvedRoot, WORKSPACE_BUNDLE_FILENAME)
  if (!fs.existsSync(sourcePath)) return null
  try {
    const raw = fs.readFileSync(sourcePath, 'utf8')
    if (!raw.trim()) return null
    const parsed = JSON.parse(raw) as Partial<BarnabyWorkspaceFile>
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.app !== 'Barnaby' || parsed.kind !== 'workspace') return null
    if (!Array.isArray(parsed.folders)) return null
    const folders: BarnabyWorkspaceFolder[] = parsed.folders
      .filter((item): item is BarnabyWorkspaceFolder => Boolean(item && typeof item === 'object'))
      .map((item, index) => {
        const folderPath = typeof item.path === 'string' ? item.path.trim() : ''
        if (!folderPath) return null
        const absolutePath = path.isAbsolute(folderPath)
          ? path.resolve(folderPath)
          : path.resolve(resolvedRoot, folderPath)
        return {
          id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `folder-${index + 1}`,
          name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : undefined,
          path: absolutePath,
        } as BarnabyWorkspaceFolder
      })
      .filter((item): item is BarnabyWorkspaceFolder => Boolean(item))
    if (folders.length === 0) return null
    const activeFolderId = typeof parsed.activeFolderId === 'string' && parsed.activeFolderId.trim()
      ? parsed.activeFolderId.trim()
      : folders[0].id
    const activeFolder = folders.find((item) => item.id === activeFolderId) ?? folders[0]
    const workspaceList = normalizeWorkspaceRoots(folders.map((item) => item.path), activeFolder.path)
    const workspaceRoot = workspaceList[0] ?? activeFolder.path
    return {
      workspaceRoot,
      workspaceList,
      sourcePath,
    }
  } catch (err) {
    appendRuntimeLog('read-workspace-bundle-failed', { root: resolvedRoot, error: errorMessage(err) }, 'warn')
    return null
  }
}

function extractWorkspaceSelectionFromState(rawState: unknown): { workspaceRoot: string; workspaceList: string[] } {
  if (!rawState || typeof rawState !== 'object') {
    return { workspaceRoot: '', workspaceList: [] }
  }
  const record = rawState as { workspaceRoot?: unknown; workspaceList?: unknown }
  const preferredRoot = typeof record.workspaceRoot === 'string' ? record.workspaceRoot : ''
  const list = normalizeWorkspaceRoots(record.workspaceList, preferredRoot)
  return {
    workspaceRoot: list[0] ?? '',
    workspaceList: list,
  }
}

function withWorkspaceBundleSelection(rawState: unknown): unknown {
  const persisted = extractWorkspaceSelectionFromState(rawState)
  const searchRoots = normalizeWorkspaceRoots(
    [currentWindowWorkspaceRoot, persisted.workspaceRoot, ...persisted.workspaceList],
    '',
  )
  for (const candidate of searchRoots) {
    const loaded = readWorkspaceBundleFromRoot(candidate)
    if (!loaded) continue
    if (rawState && typeof rawState === 'object' && !Array.isArray(rawState)) {
      return {
        ...(rawState as Record<string, unknown>),
        workspaceRoot: loaded.workspaceRoot,
        workspaceList: loaded.workspaceList,
      }
    }
    return {
      version: 1,
      workspaceRoot: loaded.workspaceRoot,
      workspaceList: loaded.workspaceList,
    }
  }
  return rawState
}

function syncWorkspaceBundleFromState(rawState: unknown): { ok: boolean; path?: string; reason?: string } {
  const selection = extractWorkspaceSelectionFromState(rawState)
  if (!selection.workspaceRoot || selection.workspaceList.length === 0) {
    return { ok: false, reason: 'no-workspace-selection' }
  }
  let anchorRoot = ''
  try {
    anchorRoot = resolveWorkspaceRootPath(selection.workspaceRoot)
  } catch {
    return { ok: false, reason: 'invalid-workspace-root' }
  }
  const folders: BarnabyWorkspaceFolder[] = selection.workspaceList.map((folderPath, index) => ({
    id: `folder-${index + 1}`,
    path: toPortableWorkspacePath(anchorRoot, folderPath),
    name: path.basename(folderPath),
  }))
  const workspace: BarnabyWorkspaceFile = {
    version: 1,
    app: 'Barnaby',
    kind: 'workspace',
    savedAt: Date.now(),
    activeFolderId: folders[0]?.id,
    folders,
  }
  const bundlePath = path.join(anchorRoot, WORKSPACE_BUNDLE_FILENAME)
  const nextRaw = `${JSON.stringify(workspace, null, 2)}\n`
  try {
    const existingRaw = fs.existsSync(bundlePath) ? fs.readFileSync(bundlePath, 'utf8') : null
    if (existingRaw === nextRaw) return { ok: true, path: bundlePath }
    fs.writeFileSync(bundlePath, nextRaw, 'utf8')
    return { ok: true, path: bundlePath }
  } catch (err) {
    appendRuntimeLog('write-workspace-bundle-failed', { path: bundlePath, error: errorMessage(err) }, 'warn')
    return { ok: false, reason: 'write-failed' }
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

function getProviderSecretsPath() {
  return path.join(getAppStorageDirPath(), PROVIDER_SECRETS_FILENAME)
}

function readProviderSecrets(): Record<string, { apiKey?: string }> {
  const secretsPath = getProviderSecretsPath()
  if (!fs.existsSync(secretsPath)) return {}
  try {
    const raw = fs.readFileSync(secretsPath, 'utf8')
    if (!raw.trim()) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, { apiKey?: string }>
  } catch (err) {
    appendRuntimeLog('read-provider-secrets-failed', errorMessage(err), 'warn')
    return {}
  }
}

function writeProviderSecrets(next: Record<string, { apiKey?: string }>) {
  const secretsPath = getProviderSecretsPath()
  fs.mkdirSync(path.dirname(secretsPath), { recursive: true })
  fs.writeFileSync(secretsPath, JSON.stringify(next, null, 2), 'utf8')
}

function getProviderApiKey(providerId: string): string {
  const secrets = readProviderSecrets()
  return (secrets[providerId]?.apiKey ?? '').trim()
}

function setProviderApiKey(providerId: string, apiKey: string) {
  const secrets = readProviderSecrets()
  const key = apiKey.trim()
  if (!key) {
    delete secrets[providerId]
  } else {
    secrets[providerId] = { ...(secrets[providerId] ?? {}), apiKey: key }
  }
  writeProviderSecrets(secrets)
  return { ok: true, hasKey: key.length > 0 }
}


function importProviderApiKeyFromEnv(providerId: string) {
  const envVarByProvider: Record<string, string> = {
    openrouter: 'OPENROUTER_API_KEY',
    codex: 'OPENAI_API_KEY',
  }
  const envVar = envVarByProvider[providerId]
  if (!envVar) {
    return { ok: false as const, hasKey: false, imported: false, detail: `No environment mapping for provider "${providerId}".` }
  }
  const value = (process.env[envVar] ?? '').trim()
  if (!value) {
    return { ok: false as const, hasKey: false, imported: false, detail: `${envVar} is not set in this process environment.` }
  }
  const saved = setProviderApiKey(providerId, value)
  return { ok: true as const, hasKey: saved.hasKey, imported: true as const, detail: `Imported API key from ${envVar}.` }
}

function getDiagnosticsInfo() {
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

type DiagnosticsPathTarget = 'userData' | 'storage' | 'chatHistory' | 'appState' | 'runtimeLog' | 'debugLog' | 'crashDumps'
type DiagnosticsFileTarget = 'chatHistory' | 'appState' | 'runtimeLog'

function resolveDiagnosticsPathTarget(target: DiagnosticsPathTarget) {
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

async function openDiagnosticsPath(rawTarget: unknown) {
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

function isDiagnosticsFileTarget(target: unknown): target is DiagnosticsFileTarget {
  return target === 'chatHistory' || target === 'appState' || target === 'runtimeLog'
}

function ensureDiagnosticsFileExists(target: DiagnosticsFileTarget, absolutePath: string) {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  if (!fs.existsSync(absolutePath)) {
    fs.writeFileSync(absolutePath, '', 'utf8')
  }
}

async function readDiagnosticsFile(rawTarget: unknown) {
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

async function writeDiagnosticsFile(rawTarget: unknown, _rawContent: unknown) {
  if (!isDiagnosticsFileTarget(rawTarget)) {
    return { ok: false as const, path: '', error: 'Unknown diagnostics file target.' }
  }
  return { ok: false as const, path: '', error: 'Diagnostics files are read-only in this view.' }
}

async function openAgentHistoryFolder() {
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

const debugWindowHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Barnaby Debug Output</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; background: #1e1e1e; color: #d4d4d4; overflow: hidden; }
    #toolbar { padding: 6px 8px; background: #252526; border-bottom: 1px solid #3c3c3c; display: flex; align-items: center; gap: 8px; }
    #toolbar button { padding: 4px 10px; font-size: 11px; cursor: pointer; background: #0e639c; color: white; border: none; border-radius: 2px; }
    #toolbar button:hover { background: #1177bb; }
    #toolbar button.secondary { background: #3c3c3c; }
    #toolbar button.secondary:hover { background: #505050; }
    #log { padding: 8px; height: calc(100% - 36px); overflow: auto; white-space: pre-wrap; word-wrap: break-word; }
    .error { color: #f48771; }
    .warn { color: #dcdcaa; }
    .info { color: #9cdcfe; }
  </style>
</head>
<body>
  <div id="toolbar">
    <button id="refresh">Refresh</button>
    <button id="clear" class="secondary">Clear view</button>
    <span id="status" style="font-size: 11px; color: #858585;"></span>
  </div>
  <pre id="log"></pre>
  <script>
    const logEl = document.getElementById('log');
    const statusEl = document.getElementById('status');
    function render(content) {
      const lines = (content || '').split('\n');
      logEl.innerHTML = lines.map(l => {
        if (l.includes('[ERROR]')) return '<span class="error">' + escapeHtml(l) + '</span>';
        if (l.includes('[WARN]')) return '<span class="warn">' + escapeHtml(l) + '</span>';
        return '<span class="info">' + escapeHtml(l) + '</span>';
      }).join('\n');
      logEl.scrollTop = logEl.scrollHeight;
    }
    function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    async function load() {
      try {
        const r = await (window.api && window.api.getDebugLogContent ? window.api.getDebugLogContent() : Promise.resolve({ ok: false, content: '' }));
        render(r.ok ? r.content : '');
        statusEl.textContent = r.ok ? 'Live' : 'No API';
      } catch (e) {
        statusEl.textContent = 'Error: ' + e.message;
      }
    }
    document.getElementById('refresh').onclick = load;
    document.getElementById('clear').onclick = () => { logEl.innerHTML = ''; statusEl.textContent = 'Cleared'; };
    if (window.api && window.api.onDebugLogAppend) {
      window.api.onDebugLogAppend((line) => {
        const span = document.createElement('span');
        span.className = line.includes('[ERROR]') ? 'error' : line.includes('[WARN]') ? 'warn' : 'info';
        span.textContent = line + '\n';
        logEl.appendChild(span);
        logEl.scrollTop = logEl.scrollHeight;
      });
    }
    load();
    setInterval(load, 2000);
  </script>
</body>
</html>`

function openDebugOutputWindow() {
  if (debugLogWindow && !debugLogWindow.isDestroyed()) {
    debugLogWindow.focus()
    return { ok: true, path: getDebugLogFilePath() }
  }
  const debugHtmlPath = path.join(RENDERER_DIST, 'debug-window.html')
  const debugWindowPreload = preload
  debugLogWindow = new BrowserWindow({
    title: 'Barnaby Debug Output',
    width: 720,
    height: 480,
    minWidth: 400,
    minHeight: 200,
    show: true,
    webPreferences: {
      preload: debugWindowPreload,
      sandbox: false,
    },
  })
  debugLogWindow.setMenuBarVisibility(false)
  if (fs.existsSync(debugHtmlPath)) {
    void debugLogWindow.loadFile(debugHtmlPath)
  } else {
    void debugLogWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(debugWindowHtml)}`)
  }
  debugLogWindow.on('closed', () => {
    debugLogWindow = null
  })
  debugLogWindow.webContents.on('did-finish-load', () => {
    appendDebugLog('[DEBUG] Debug output window opened')
  })
  return { ok: true, path: getDebugLogFilePath() }
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
        record.sandbox === 'read-only' || record.sandbox === 'workspace-write'
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

function openWorkspacePathInExplorer(workspaceRoot: string, relativePath: string) {
  if (!relativePath?.trim()) throw new Error('File path is required.')
  const normalizedPath = normalizeRelativePath(relativePath)
  const absolutePath = resolveWorkspacePath(workspaceRoot, normalizedPath)
  if (!fs.existsSync(absolutePath)) throw new Error('File does not exist.')

  shell.showItemInFolder(absolutePath)
  return {
    ok: true as const,
    path: absolutePath,
  }
}

function deleteWorkspaceFile(workspaceRoot: string, relativePath: string) {
  if (!relativePath?.trim()) throw new Error('File path is required.')
  const normalizedPath = normalizeRelativePath(relativePath)
  const absolutePath = resolveWorkspacePath(workspaceRoot, normalizedPath)
  if (!fs.existsSync(absolutePath)) throw new Error('File does not exist.')
  const stat = fs.statSync(absolutePath)
  if (!stat.isFile()) throw new Error('Path is not a file.')

  fs.unlinkSync(absolutePath)
  return {
    ok: true as const,
    relativePath: normalizedPath,
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

async function pickWorkspaceOpenPath(workspaceRoot: string) {
  const root = path.resolve(workspaceRoot)
  if (!fs.existsSync(root)) throw new Error('Workspace path does not exist.')
  if (!fs.statSync(root).isDirectory()) throw new Error('Workspace path is not a directory.')

  const parent = BrowserWindow.getFocusedWindow() ?? win ?? BrowserWindow.getAllWindows()[0] ?? undefined
  const result = await dialog.showOpenDialog(parent, {
    title: 'Open file',
    defaultPath: root,
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const selectedPath = result.filePaths[0]
  return toWorkspaceRelativePath(root, selectedPath)
}

function sanitizeFileNameSegment(value: string, fallback = 'conversation-transcript') {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return cleaned || fallback
}

async function saveTranscriptFile(workspaceRoot: string, suggestedFileName: string, content: string) {
  const parent = BrowserWindow.getFocusedWindow() ?? win ?? BrowserWindow.getAllWindows()[0] ?? undefined
  const defaultFileName = `${sanitizeFileNameSegment(suggestedFileName)}.md`
  let defaultDir = app.getPath('downloads')
  const trimmedRoot = workspaceRoot.trim()
  if (trimmedRoot) {
    try {
      const resolvedRoot = path.resolve(trimmedRoot)
      if (fs.existsSync(resolvedRoot) && fs.statSync(resolvedRoot).isDirectory()) {
        defaultDir = path.join(resolvedRoot, '.barnaby', 'saved-chats')
      }
    } catch {
      // fallback to Downloads
    }
  }
  const defaultPath = path.join(defaultDir, defaultFileName)
  const result = await dialog.showSaveDialog(parent, {
    title: 'Save conversation transcript',
    defaultPath,
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'Text', extensions: ['txt'] },
    ],
  })
  if (result.canceled || !result.filePath) {
    return { ok: false as const, canceled: true as const }
  }
  fs.mkdirSync(path.dirname(result.filePath), { recursive: true })
  fs.writeFileSync(result.filePath, String(content ?? ''), 'utf8')
  return { ok: true as const, path: result.filePath }
}

async function saveTranscriptDirect(workspaceRoot: string, fileName: string, content: string) {
  const trimmedRoot = workspaceRoot.trim()
  let targetDir = path.join(app.getPath('downloads'), '.barnaby', 'downloads', 'chats')
  if (trimmedRoot) {
    try {
      const resolvedRoot = path.resolve(trimmedRoot)
      if (fs.existsSync(resolvedRoot) && fs.statSync(resolvedRoot).isDirectory()) {
        targetDir = path.join(resolvedRoot, '.barnaby', 'downloads', 'chats')
      }
    } catch {
      // fallback
    }
  }
  const safeFileName = sanitizeFileNameSegment(fileName)
  const filePath = path.join(targetDir, `${safeFileName}.md`)
  fs.mkdirSync(targetDir, { recursive: true })
  fs.writeFileSync(filePath, String(content ?? ''), 'utf8')
  return { ok: true as const, path: filePath }
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
    root = resolveWorkspaceRootPath(resolveWorkspaceRootFromAnyPath(workspaceRoot))
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

  const ensuredWorkspace = upsertWorkspaceBundleFolder(root)
  if (!ensuredWorkspace.ok) {
    return {
      ok: false,
      reason: 'error',
      message: ensuredWorkspace.error ?? 'Could not initialize workspace file.',
      workspaceRoot: root,
      lockFilePath: getWorkspaceLockFilePath(root),
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

function forceClaimWorkspaceLock(workspaceRoot: string): WorkspaceLockAcquireResult {
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
  try {
    fs.rmSync(lockFilePath, { force: true })
  } catch { /* best-effort */ }
  return acquireWorkspaceLock(root)
}

/** Ensure npm global bin is in PATH so Electron can find claude/gemini/codex CLI on Windows. */
function getCliSpawnEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  if (process.platform === 'win32') {
    const npmBin = process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : ''
    if (npmBin && env.PATH && !env.PATH.includes(npmBin)) {
      env.PATH = `${npmBin}${path.delimiter}${env.PATH}`
    }
  }
  return env
}

/**
 * Resolve a CLI's .js entry point from its npm .cmd shim on Windows.
 * Lets us spawn node directly rather than going through cmd.exe (much faster, no shell hang).
 */
function resolveNpmCliJsEntry(cliName: string): string | null {
  if (process.platform !== 'win32') return null
  const npmBin = process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : ''
  if (!npmBin) return null
  const cmdPath = path.join(npmBin, `${cliName}.cmd`)
  if (!fs.existsSync(cmdPath)) return null
  try {
    const cmdContent = fs.readFileSync(cmdPath, 'utf8')
    const match = cmdContent.match(/%dp0%\\([^\s"]+\.js)/i)
    if (match) {
      const jsPath = path.join(npmBin, match[1])
      if (fs.existsSync(jsPath)) return jsPath
    }
  } catch { /* fall through */ }
  return null
}

/** Find 'node' on PATH (process.execPath is Electron in packaged apps, not node). */
function findNodeExeOnPath(): string | null {
  const pathDirs = (process.env.PATH ?? '').split(path.delimiter)
  for (const dir of pathDirs) {
    const candidate = path.join(dir, process.platform === 'win32' ? 'node.exe' : 'node')
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

const CLI_AUTH_CHECK_TIMEOUT_MS = 8_000
const CLI_MODELS_QUERY_TIMEOUT_MS = 60_000

function runCliCommand(executable: string, args: string[], timeoutMs = CLI_AUTH_CHECK_TIMEOUT_MS): Promise<{ stdout: string; stderr: string }> {
  const env = getCliSpawnEnv()
  return new Promise((resolve, reject) => {
    const abortController = new AbortController()
    const timer = setTimeout(() => {
      abortController.abort()
      reject(new Error(`CLI check timed out after ${timeoutMs / 1000}s. The CLI may be slow to start or hung.`))
    }, timeoutMs)

    const finish = (err: Error | null, result?: { stdout: string; stderr: string }) => {
      clearTimeout(timer)
      if (err) reject(err)
      else resolve(result!)
    }

    if (process.platform === 'win32') {
      const jsEntry = resolveNpmCliJsEntry(executable)
      const nodeExe = jsEntry ? findNodeExeOnPath() : null
      if (jsEntry && nodeExe) {
        execFileAsync(nodeExe, [jsEntry, ...args], { windowsHide: true, maxBuffer: 1024 * 1024, env, signal: abortController.signal })
          .then((res) => finish(null, res))
          .catch(finish)
        return
      }
      const fullCmd = [executable, ...args].map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')
      execFileAsync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', fullCmd], { windowsHide: true, maxBuffer: 1024 * 1024, env, signal: abortController.signal })
        .then((res) => finish(null, res))
        .catch(finish)
      return
    }
    execFileAsync(executable, args, { windowsHide: true, maxBuffer: 1024 * 1024, env, signal: abortController.signal })
      .then((res) => finish(null, res))
      .catch(finish)
  })
}

async function isCliInstalled(executable: string): Promise<boolean> {
  try {
    await runCliCommand(executable, ['--version'])
    return true
  } catch {
    return false
  }
}

async function getProviderAuthStatus(config: ProviderConfigForAuth): Promise<ProviderAuthStatus> {
  const providerType = config.type ?? (config.id === 'openrouter' ? 'api' : 'cli')
  if (providerType === 'api') {
    const apiKey = getProviderApiKey(config.id)
    const base = (config.apiBaseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
    if (!apiKey) {
      return {
        provider: config.id,
        installed: true,
        authenticated: false,
        detail: 'API key not configured. Add your key in Settings -> Connectivity.',
        checkedAt: Date.now(),
      }
    }
    try {
      const res = await fetch(`${base}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://barnaby.build',
          'X-Title': 'Barnaby',
        },
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        return {
          provider: config.id,
          installed: true,
          authenticated: true,
          detail: 'API key is valid.',
          checkedAt: Date.now(),
        }
      }
      const body = await res.text().catch(() => '')
      return {
        provider: config.id,
        installed: true,
        authenticated: false,
        detail: `API check failed (${res.status}). ${body.slice(0, 200)}`.trim(),
        checkedAt: Date.now(),
      }
    } catch (err) {
      return {
        provider: config.id,
        installed: true,
        authenticated: false,
        detail: errorMessage(err) || 'API check failed.',
        checkedAt: Date.now(),
      }
    }
  }

  const executable = config.cliPath ?? config.cliCommand ?? ''
  const authArgs = (config.authCheckCommand ?? '--version').trim().split(/\s+/).filter(Boolean)
  const isCodexStyle = config.id === 'codex'
  const isClaudeStyle = config.id === 'claude'

  if (config.id === 'gemini') {
    try {
      // The current Gemini CLI doesn't have a reliable non-interactive auth check.
      // `gemini auth status` prompts if not logged in.
      // `gemini list models` has no --json flag and also prompts.
      const geminiVersionResult = await runCliCommand(executable, ['--version'], CLI_AUTH_CHECK_TIMEOUT_MS)
      const success = Object.keys(geminiVersionResult).length > 0 // We just want to know if it executed without throwing
      return {
        provider: config.id,
        installed: true,
        authenticated: success,
        detail: success ? 'Ready to use.' : 'Login required.',
        checkedAt: Date.now(),
      }
    } catch (geminiVersionErr) {
      const msg = errorMessage(geminiVersionErr)
      const isTimeout = /timed out/i.test(msg)
      const installed = isTimeout ? true : await isCliInstalled(executable)
      return {
        provider: config.id,
        installed,
        authenticated: false,
        detail: msg || 'Login required.',
        checkedAt: Date.now(),
      }
    }
  }

  try {
    const result = await runCliCommand(executable, authArgs)
    const out = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim()
    const normalized = out.toLowerCase()
    let authenticated: boolean
    let detail = ''
    if (isCodexStyle) {
      authenticated = normalized.includes('logged in') && !normalized.includes('not logged in')
      detail = out
    } else if (isClaudeStyle) {
      // `claude auth status` returns JSON: {"loggedIn":true,"email":"...","subscriptionType":"pro",...}
      try {
        const parsed = JSON.parse(out)
        authenticated = Boolean(parsed.loggedIn)
        const email = parsed.email ? ` (${parsed.email})` : ''
        const sub = parsed.subscriptionType ? ` [${parsed.subscriptionType}]` : ''
        detail = authenticated ? `Logged in${email}${sub}` : 'Not logged in.'
      } catch {
        authenticated = false
        detail = out || 'Could not parse auth status.'
      }
    } else {
      authenticated = true
      detail = out
    }
    return {
      provider: config.id,
      installed: true,
      authenticated,
      detail: detail || (authenticated ? 'Logged in.' : 'Not logged in.'),
      checkedAt: Date.now(),
    }
  } catch (err) {
    const msg = errorMessage(err)
    const isTimeout = /timed out/i.test(msg)
    const installed = isTimeout ? true : await isCliInstalled(executable)
    return {
      provider: config.id,
      installed,
      authenticated: false,
      detail: msg || (installed ? 'Login required.' : `${config.id} CLI not found.`),
      checkedAt: Date.now(),
    }
  }
}

async function launchProviderLogin(config: ProviderConfigForAuth): Promise<{ started: boolean; detail: string }> {
  const providerType = config.type ?? (config.id === 'openrouter' ? 'api' : 'cli')
  if (providerType === 'api') {
    const target = config.loginUrl || 'https://openrouter.ai/keys'
    await shell.openExternal(target)
    return { started: true, detail: `Opened ${config.id} key management page.` }
  }

  const command = config.loginCommand ?? config.cliCommand
  if (!command) {
    return { started: false, detail: `No login command configured for ${config.id}.` }
  }

  if (process.platform === 'win32') {
    await execFileAsync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'start', '', 'cmd', '/k', command], {
      windowsHide: true,
    })
    return {
      started: true,
      detail: `Opened terminal for ${config.id} login.`,
    }
  }

  await execFileAsync('sh', ['-lc', command], { windowsHide: true })
  return { started: true, detail: `Launched ${config.id} login.` }
}

async function launchProviderUpgrade(config: ProviderConfigForAuth): Promise<{ started: boolean; detail: string }> {
  const pkg = config.upgradePackage
  const fallbackCommand = config.upgradeCommand

  // Prefer clean reinstall (uninstall + install @latest) to avoid corrupted nested deps (e.g. gemini-cli-core)
  const command =
    pkg
      ? process.platform === 'win32'
        ? `npm uninstall -g ${pkg} & npm install -g ${pkg}@latest`
        : `npm uninstall -g ${pkg}; npm install -g ${pkg}@latest`
      : fallbackCommand

  if (!command) {
    return { started: false, detail: `No upgrade command configured for ${config.id}.` }
  }

  if (process.platform === 'win32') {
    await execFileAsync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'start', '', 'cmd', '/k', command], {
      windowsHide: true,
    })
    return {
      started: true,
      detail: `Opened terminal to upgrade ${config.id} CLI. Run the command shown, then close the window.`,
    }
  }

  if (process.platform === 'darwin') {
    const escaped = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    await execFileAsync('osascript', [
      '-e',
      `tell application "Terminal" to do script "${escaped}"`,
    ])
    return {
      started: true,
      detail: `Opened Terminal to upgrade ${config.id} CLI. Close the window when done.`,
    }
  }

  await execFileAsync('sh', ['-lc', command], { windowsHide: true })
  return { started: true, detail: `Ran ${config.id} CLI upgrade. Re-check connectivity.` }
}

type ModelsByProvider = {
  codex: { id: string; displayName: string }[]
  claude: { id: string; displayName: string }[]
  gemini: { id: string; displayName: string }[]
  openrouter: { id: string; displayName: string }[]
}

const MODEL_PING_TIMEOUT_MS = 30_000
const MODEL_PING_PROMPT = 'Reply with only the word OK.'

function normalizeGeminiModelForCli(modelId: string): string {
  const map: Record<string, string> = {
    'gemini-1.5-pro': 'pro', 'gemini-1.5-flash': 'flash',
    'gemini-2.0-flash': 'flash', 'gemini-3-pro': 'pro', 'gemini-pro': 'flash', 'gemini-1.0-pro': 'flash',
  }
  return map[modelId] ?? modelId
}

function normalizeClaudeModelForCli(modelId: string): string {
  const trimmed = String(modelId ?? '').trim()
  if (!trimmed) return 'sonnet'
  const normalized = trimmed.toLowerCase()
  const aliasMap: Record<string, string> = {
    'claude-sonnet-4-5-20250929': 'sonnet',
    'claude-sonnet-4-6': 'sonnet',
    'claude-opus-4-1-20250805': 'opus',
    'claude-haiku-3-5-20241022': 'haiku',
  }
  return aliasMap[normalized] ?? trimmed
}

function isClaudeModelNotFoundError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('model') &&
    (lower.includes('not found') || lower.includes('unknown') || lower.includes('invalid'))
  )
}

async function pingGeminiModel(modelId: string): Promise<{ ok: boolean; durationMs: number; error?: string }> {
  const start = Date.now()
  const normalized = normalizeGeminiModelForCli(modelId)
  const env = getCliSpawnEnv()
  return new Promise((resolve) => {
    const args = ['-m', normalized, '--yolo', '--output-format', 'stream-json']
    const proc = process.platform === 'win32'
      ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'gemini', ...args], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env } as object)
      : spawn('gemini', args, { stdio: ['pipe', 'pipe', 'pipe'], env })

    const timer = setTimeout(() => {
      try { proc.kill() } catch { /* ignore */ }
      resolve({ ok: false, durationMs: Date.now() - start, error: 'Timed out' })
    }, MODEL_PING_TIMEOUT_MS)

    let resolved = false
    const done = (ok: boolean, error?: string) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      resolve({ ok, durationMs: Date.now() - start, error })
    }

    proc.stdin?.write(MODEL_PING_PROMPT)
    proc.stdin?.end()

    let buf = ''
    proc.stdout?.setEncoding('utf8')
    proc.stdout?.on('data', (chunk: string) => {
      buf += chunk
      for (const line of buf.split('\n')) {
        const t = line.trim()
        if (!t) continue
        try {
          const evt = JSON.parse(t)
          if (evt.type === 'message' && (evt.role === 'assistant' || evt.role === 'model') && typeof evt.content === 'string' && evt.content.trim()) {
            try { proc.kill() } catch { /* ignore */ }
            done(true)
            return
          }
          if (evt.type === 'error') {
            done(false, evt.message ?? 'Model error')
            return
          }
        } catch { /* not JSON, ignore */ }
      }
    })
    proc.on('exit', (code) => done(code === 0, code !== 0 ? `Exit ${code}` : undefined))
    proc.on('error', (err) => done(false, err.message))
  })
}

async function pingClaudeModel(modelId: string, cwd?: string): Promise<{ ok: boolean; durationMs: number; error?: string }> {
  const start = Date.now()
  const pingCwd = typeof cwd === 'string' && cwd.trim() ? path.resolve(cwd.trim()) : process.cwd()
  const runPingAttempt = async (attemptModelId: string): Promise<{ ok: boolean; error?: string }> => {
    const jsEntry = resolveNpmCliJsEntry('claude')
    const nodeExe = jsEntry ? findNodeExeOnPath() : null
    const env = getCliSpawnEnv()
    return new Promise((resolve) => {
      const args = ['--model', attemptModelId, '--print', '--output-format', 'stream-json', '--input-format', 'stream-json']
      let proc: ReturnType<typeof spawn>
      if (jsEntry && nodeExe) {
        proc = spawn(nodeExe, [jsEntry, ...args], { cwd: pingCwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env } as object)
      } else if (process.platform === 'win32') {
        proc = spawn(
          process.env.ComSpec ?? 'cmd.exe',
          ['/d', '/s', '/c', 'claude', ...args],
          { cwd: pingCwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env } as object,
        )
      } else {
        proc = spawn('claude', args, { cwd: pingCwd, stdio: ['pipe', 'pipe', 'pipe'], env })
      }

      const timer = setTimeout(() => {
        try { proc.kill() } catch { /* ignore */ }
        resolve({ ok: false, error: 'Timed out' })
      }, MODEL_PING_TIMEOUT_MS)

      let resolved = false
      const done = (ok: boolean, error?: string) => {
        if (resolved) return
        resolved = true
        clearTimeout(timer)
        resolve({ ok, error })
      }

      const pingMsg = JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: MODEL_PING_PROMPT }],
        },
      }) + '\n'
      proc.stdin?.write(pingMsg)
      proc.stdin?.end()

      let stdoutBuffer = ''
      let stderrBuffer = ''
      proc.stdout?.setEncoding('utf8')
      proc.stderr?.setEncoding('utf8')
      proc.stderr?.on('data', (chunk: string) => {
        stderrBuffer += chunk
      })
      proc.stdout?.on('data', (chunk: string) => {
        stdoutBuffer += chunk
        const lines = stdoutBuffer.split('\n')
        stdoutBuffer = lines.pop() ?? ''
        for (const line of lines) {
          const t = line.trim()
          if (!t) continue
          try {
            const evt = JSON.parse(t)
            if (
              evt.type === 'assistant' ||
              evt.type === 'result' ||
              evt.type === 'content_block_delta' ||
              (evt.type === 'message' && evt.role === 'assistant') ||
              (evt.type === 'message_start' && evt.message?.role === 'assistant')
            ) {
              if (evt.type === 'result' && evt.subtype === 'error') {
                const msg = typeof evt.error === 'string' && evt.error.trim() ? evt.error.trim() : 'Model error'
                done(false, msg)
              } else {
                try { proc.kill() } catch { /* ignore */ }
                done(true)
              }
              return
            }
            if (evt.type === 'error') {
              const msg = typeof evt.message === 'string' && evt.message.trim()
                ? evt.message.trim()
                : 'Model error'
              done(false, msg)
              return
            }
          } catch { /* not JSON */ }
        }
      })
      proc.on('exit', (code) => {
        if (code === 0) {
          done(true)
          return
        }
        const err = stderrBuffer.trim()
        done(false, err || `Exit ${code}`)
      })
      proc.on('error', (err) => done(false, err.message))
    })
  }

  const normalizedModelId = normalizeClaudeModelForCli(modelId)
  const primary = await runPingAttempt(normalizedModelId)
  if (primary.ok) return { ok: true, durationMs: Date.now() - start }

  if (normalizedModelId !== 'sonnet' && primary.error && isClaudeModelNotFoundError(primary.error)) {
    const fallback = await runPingAttempt('sonnet')
    if (fallback.ok) return { ok: true, durationMs: Date.now() - start }
    return {
      ok: false,
      durationMs: Date.now() - start,
      error: fallback.error
        ? `${primary.error}; fallback to sonnet failed: ${fallback.error}`
        : primary.error,
    }
  }

  return { ok: false, durationMs: Date.now() - start, error: primary.error }
}

async function pingOpenRouterModel(modelId: string): Promise<{ ok: boolean; durationMs: number; error?: string }> {
  const start = Date.now()
  const apiKey = getProviderApiKey('openrouter')
  if (!apiKey) return { ok: false, durationMs: 0, error: 'No API key' }
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://barnaby.build', 'X-Title': 'Barnaby' },
      body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: MODEL_PING_PROMPT }], max_tokens: 5 }),
      signal: AbortSignal.timeout(MODEL_PING_TIMEOUT_MS),
    })
    const durationMs = Date.now() - start
    if (res.ok) return { ok: true, durationMs }
    const body = await res.text().catch(() => '')
    return { ok: false, durationMs, error: `HTTP ${res.status}: ${body.slice(0, 100)}` }
  } catch (err) {
    return { ok: false, durationMs: Date.now() - start, error: errorMessage(err) }
  }
}

async function pingModelById(provider: string, modelId: string, cwd?: string): Promise<{ ok: boolean; durationMs: number; error?: string }> {
  if (provider === 'gemini') return pingGeminiModel(modelId)
  if (provider === 'claude') return pingClaudeModel(modelId, cwd)
  if (provider === 'openrouter') return pingOpenRouterModel(modelId)
  // Codex: no lightweight ping available yet
  return { ok: true, durationMs: 0 }
}

const FALLBACK_CLAUDE_MODELS: Array<{ id: string; displayName: string }> = [
  { id: 'claude-opus-4-6', displayName: 'Claude Opus 4.6' },
  { id: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5' },
  { id: 'claude-sonnet-4-5-20250929', displayName: 'Claude Sonnet 4.5' },
  { id: 'claude-opus-4-5-20251101', displayName: 'Claude Opus 4.5' },
  { id: 'claude-opus-4-1-20250805', displayName: 'Claude Opus 4.1' },
  { id: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4' },
  { id: 'claude-opus-4-20250514', displayName: 'Claude Opus 4' },
  { id: 'opus', displayName: 'Claude Opus (alias)' },
  { id: 'sonnet', displayName: 'Claude Sonnet (alias)' },
  { id: 'haiku', displayName: 'Claude Haiku (alias)' },
]

const FALLBACK_GEMINI_MODELS: Array<{ id: string; displayName: string }> = [
  { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash Lite' },
  { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
  { id: 'gemini-3-pro-preview', displayName: 'Gemini 3 Pro (Preview)' },
  { id: 'gemini-3-flash-preview', displayName: 'Gemini 3 Flash (Preview)' },
]

function dedupeModels(models: Array<{ id: string; displayName: string }>): Array<{ id: string; displayName: string }> {
  const seen = new Set<string>()
  const out: Array<{ id: string; displayName: string }> = []
  for (const model of models) {
    const id = String(model.id ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      displayName: String(model.displayName ?? '').trim() || id,
    })
  }
  return out
}

function getProviderApiKeyOrEnv(providerId: string, envVars: string[]): string {
  const fromSecrets = getProviderApiKey(providerId)
  if (fromSecrets) return fromSecrets
  for (const envVar of envVars) {
    const v = (process.env[envVar] ?? '').trim()
    if (v) return v
  }
  return ''
}

function readCodexModelsFromCache(): Array<{ id: string; displayName: string }> {
  try {
    const cachePath = path.join(os.homedir(), '.codex', 'models_cache.json')
    if (!fs.existsSync(cachePath)) return []
    const raw = fs.readFileSync(cachePath, 'utf8')
    const parsed = JSON.parse(raw) as {
      models?: Array<{ slug?: string; display_name?: string; visibility?: string }>
    }
    const list = Array.isArray(parsed?.models) ? parsed.models : []
    return dedupeModels(
      list
        .map((entry) => ({
          id: String(entry?.slug ?? '').trim(),
          displayName: String(entry?.display_name ?? '').trim(),
          visibility: String(entry?.visibility ?? '').trim(),
        }))
        .filter((entry) => entry.id.length > 0)
        .filter((entry) => !entry.visibility || entry.visibility === 'list')
        .map(({ id, displayName }) => ({ id, displayName: displayName || id })),
    )
  } catch {
    return []
  }
}

async function queryCodexModelsViaExec(): Promise<{ id: string; displayName: string }[]> {
  return readCodexModelsFromCache()
}

async function queryClaudeModelsViaExec(): Promise<{ id: string; displayName: string }[]> {
  const apiKey = getProviderApiKeyOrEnv('claude', ['ANTHROPIC_API_KEY'])
  if (!apiKey) return FALLBACK_CLAUDE_MODELS
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return FALLBACK_CLAUDE_MODELS
    const data = (await res.json()) as { data?: Array<{ id?: string; display_name?: string }> }
    const fromApi = Array.isArray(data?.data)
      ? data.data
        .map((entry) => ({
          id: String(entry?.id ?? '').trim(),
          displayName: String(entry?.display_name ?? '').trim(),
        }))
        .filter((entry) => entry.id.startsWith('claude-'))
        .map((entry) => ({ id: entry.id, displayName: entry.displayName || entry.id }))
      : []
    if (fromApi.length === 0) return FALLBACK_CLAUDE_MODELS
    return dedupeModels([...fromApi, ...FALLBACK_CLAUDE_MODELS.filter((m) => ['opus', 'sonnet', 'haiku'].includes(m.id))])
  } catch {
    return FALLBACK_CLAUDE_MODELS
  }
}

async function getAvailableModels(): Promise<ModelsByProvider> {
  const [codex, claude, gemini, openrouter] = await Promise.all([
    queryCodexModelsViaExec().catch((err) => {
      console.error('[getAvailableModels] codex error:', err)
      return []
    }),
    queryClaudeModelsViaExec().catch((err) => {
      console.error('[getAvailableModels] claude error:', err)
      return []
    }),
    getGeminiAvailableModels().catch((err) => {
      console.error('[getAvailableModels] gemini error:', err)
      return []
    }),
    fetchOpenRouterModels().catch((err) => {
      console.error('[getAvailableModels] openrouter error:', err)
      return []
    }),
  ])
  console.log('[getAvailableModels] results:', {
    codex: codex.length,
    claude: claude.length,
    gemini: gemini.length,
    openrouter: openrouter.length
  })
  return { codex, claude, gemini, openrouter }
}

async function fetchOpenRouterModels(): Promise<{ id: string; displayName: string }[]> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []
    const data = (await res.json()) as {
      data?: Array<{ id?: string; name?: string; pricing?: { prompt?: string; completion?: string } }>
    }
    const models = Array.isArray(data?.data) ? data.data : []
    const free = models
      .filter((m) => typeof m?.id === 'string')
      .map((m) => ({
        id: String(m.id),
        displayName: String(m.id),
        isFree:
          String(m?.id).includes(':free') ||
          (m?.pricing?.prompt === '0' && m?.pricing?.completion === '0'),
      }))
    const picked = free.filter((m) => m.isFree).slice(0, 24)
    if (picked.length > 0) return picked.map(({ id, displayName }) => ({ id, displayName }))
    return free.slice(0, 24).map(({ id, displayName }) => ({ id, displayName }))
  } catch {
    return []
  }
}

async function getGeminiAvailableModels(): Promise<{ id: string; displayName: string }[]> {
  const apiKey = getProviderApiKeyOrEnv('gemini', ['GEMINI_API_KEY', 'GOOGLE_API_KEY'])
  if (apiKey) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, {
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) {
        const data = (await res.json()) as { models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }> }
        const fromApi = Array.isArray(data?.models)
          ? data.models
            .map((m) => {
              const name = String(m?.name ?? '').trim()
              const id = name.startsWith('models/') ? name.slice('models/'.length) : name
              return {
                id,
                displayName: String(m?.displayName ?? '').trim() || id,
                supportsGenerate: Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'),
              }
            })
            .filter((m) => m.id.startsWith('gemini-') && m.supportsGenerate)
            .map(({ id, displayName }) => ({ id, displayName }))
          : []
        if (fromApi.length > 0) return dedupeModels(fromApi)
      }
    } catch { /* fall through */ }
  }

  try {
    const result = await runCliCommand('gemini', ['list', 'models'], CLI_MODELS_QUERY_TIMEOUT_MS)
    const out = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const matches = out.match(/\bgemini-[a-z0-9][a-z0-9.-]*/gi) ?? []
    const fromCli = dedupeModels(matches.map((id) => ({ id: id.toLowerCase(), displayName: id.toLowerCase() })))
    if (fromCli.length > 0) return fromCli
  } catch { /* fall through */ }

  return FALLBACK_GEMINI_MODELS
}

function buildCommitMessageFromEntries(entries: GitStatusEntry[]): { subject: string; body: string } {
  const modified: string[] = []
  const added: string[] = []
  const deleted: string[] = []
  const renamed: Array<{ from: string; to: string }> = []
  for (const e of entries) {
    if (e.untracked) {
      added.push(e.relativePath)
    } else if (e.renamedFrom) {
      renamed.push({ from: e.renamedFrom, to: e.relativePath })
    } else if (e.indexStatus === 'D' || e.workingTreeStatus === 'D') {
      deleted.push(e.relativePath)
    } else if (e.indexStatus === 'A' || e.indexStatus === '?') {
      added.push(e.relativePath)
    } else {
      modified.push(e.relativePath)
    }
  }
  const total = modified.length + added.length + deleted.length + renamed.length
  const subjectParts: string[] = []
  if (modified.length) subjectParts.push(`${modified.length} modified`)
  if (added.length) subjectParts.push(`${added.length} added`)
  if (deleted.length) subjectParts.push(`${deleted.length} deleted`)
  if (renamed.length) subjectParts.push(`${renamed.length} renamed`)
  const subject = total > 0 ? `Commit workspace changes (${subjectParts.join(', ')})` : 'Commit workspace changes'

  const lines: string[] = []
  if (modified.length) {
    lines.push('Modified:', ...modified.map((p) => `  - ${p}`), '')
  }
  if (added.length) {
    lines.push('Added:', ...added.map((p) => `  - ${p}`), '')
  }
  if (deleted.length) {
    lines.push('Deleted:', ...deleted.map((p) => `  - ${p}`), '')
  }
  if (renamed.length) {
    lines.push('Renamed:', ...renamed.map((r) => `  - ${r.from} -> ${r.to}`), '')
  }
  const body = lines.join('\n').trim()
  return { subject, body: body || 'No changes' }
}

async function runGitCommand(root: string, args: string[]): Promise<{ ok: boolean; stdout?: string; stderr?: string; error?: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('git', ['-C', root, ...args], {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    })
    return { ok: true, stdout: stdout?.trim(), stderr: stderr?.trim() }
  } catch (err: unknown) {
    const stderr = err && typeof err === 'object' && 'stderr' in err ? String((err as { stderr?: unknown }).stderr ?? '') : ''
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg || stderr, stderr }
  }
}

async function runShellCommand(root: string, cmd: string, args: string[]): Promise<{ ok: boolean; stdout?: string; stderr?: string; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: root,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    proc.stdout?.setEncoding('utf8')
    proc.stdout?.on('data', (chunk: string) => { stdout += chunk })
    proc.stderr?.setEncoding('utf8')
    proc.stderr?.on('data', (chunk: string) => { stderr += chunk })
    proc.on('error', (err) => resolve({ ok: false, error: err.message }))
    proc.on('exit', (code) => {
      if (code === 0) resolve({ ok: true, stdout, stderr })
      else resolve({ ok: false, error: stderr || `Exit code ${code}`, stdout, stderr })
    })
  })
}

function normalizeSelectedGitPaths(selectedPaths?: string[]): string[] {
  if (!Array.isArray(selectedPaths)) return []
  const out: string[] = []
  for (const value of selectedPaths) {
    if (typeof value !== 'string') continue
    const normalized = normalizeRelativePath(value).trim()
    if (!normalized || normalized.startsWith('/')) continue
    const cleaned = normalized.split('/').filter((segment) => segment && segment !== '.' && segment !== '..').join('/')
    if (!cleaned) continue
    if (!out.includes(cleaned)) out.push(cleaned)
  }
  return out
}

function buildCommitSelection(entries: GitStatusEntry[], selectedPaths: string[]) {
  if (selectedPaths.length === 0) {
    return {
      selectedEntries: entries,
      pathspecs: [] as string[],
      hasSelection: false,
    }
  }
  const entryByPath = new Map(entries.map((entry) => [entry.relativePath, entry] as const))
  const selectedEntries: GitStatusEntry[] = []
  for (const relativePath of selectedPaths) {
    const entry = entryByPath.get(relativePath)
    if (entry) selectedEntries.push(entry)
  }
  const pathspecs: string[] = []
  for (const entry of selectedEntries) {
    if (!pathspecs.includes(entry.relativePath)) pathspecs.push(entry.relativePath)
    if (entry.renamedFrom && !pathspecs.includes(entry.renamedFrom)) pathspecs.push(entry.renamedFrom)
  }
  return {
    selectedEntries,
    pathspecs,
    hasSelection: true,
  }
}

function isNothingToCommitError(error?: string) {
  if (!error) return false
  const normalized = error.toLowerCase()
  return normalized.includes('nothing to commit') || normalized.includes('no changes')
}

async function gitCommit(workspaceRoot: string, selectedPaths?: string[]): Promise<{ ok: boolean; error?: string }> {
  const root = path.resolve(workspaceRoot)
  const status = await getGitStatus(root)
  if (!status.ok || status.clean) {
    return { ok: false, error: status.clean ? 'Nothing to commit.' : (status.error ?? 'Cannot read git status.') }
  }
  const normalizedSelection = normalizeSelectedGitPaths(selectedPaths)
  const selection = buildCommitSelection(status.entries, normalizedSelection)
  if (selection.hasSelection && selection.selectedEntries.length === 0) {
    return { ok: false, error: 'Selected files no longer have changes.' }
  }
  const commitEntries = selection.selectedEntries
  const addArgs = selection.hasSelection ? ['add', '-A', '--', ...selection.pathspecs] : ['add', '-A']
  const addResult = await runGitCommand(root, addArgs)
  if (!addResult.ok) return { ok: false, error: addResult.error ?? 'git add failed' }
  const message = buildCommitMessageFromEntries(commitEntries)
  const commitArgs = message.body ? ['commit', '-m', message.subject, '-m', message.body] : ['commit', '-m', message.subject]
  if (selection.hasSelection) commitArgs.push('--', ...selection.pathspecs)
  const commitResult = await runGitCommand(root, commitArgs)
  if (!commitResult.ok) return { ok: false, error: commitResult.error ?? 'git commit failed' }
  return { ok: true }
}

async function gitPush(workspaceRoot: string, selectedPaths?: string[]): Promise<{ ok: boolean; error?: string }> {
  const root = path.resolve(workspaceRoot)
  const normalizedSelection = normalizeSelectedGitPaths(selectedPaths)
  if (normalizedSelection.length > 0) {
    const commitResult = await gitCommit(root, normalizedSelection)
    if (!commitResult.ok && !isNothingToCommitError(commitResult.error)) {
      return commitResult
    }
  }
  const result = await runGitCommand(root, ['push'])
  return { ok: result.ok, error: result.error }
}

async function gitDeploy(workspaceRoot: string, _selectedPaths?: string[]): Promise<{ ok: boolean; error?: string }> {
  const root = path.resolve(workspaceRoot)
  const pkgPath = path.join(root, 'package.json')
  if (!fs.existsSync(pkgPath)) return { ok: false, error: 'No package.json found.' }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> }
  if (!pkg?.scripts?.deploy) return { ok: false, error: 'No deploy script in package.json.' }
  const result = await runShellCommand(root, 'npm', ['run', 'deploy'])
  return { ok: result.ok, error: result.error }
}

async function gitBuild(workspaceRoot: string, _selectedPaths?: string[]): Promise<{ ok: boolean; error?: string }> {
  const root = path.resolve(workspaceRoot)
  const pkgPath = path.join(root, 'package.json')
  if (!fs.existsSync(pkgPath)) return { ok: false, error: 'No package.json found.' }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> }
  if (!pkg?.scripts?.build) return { ok: false, error: 'No build script in package.json.' }
  const result = await runShellCommand(root, 'npm', ['run', 'build'])
  return { ok: result.ok, error: result.error }
}

async function gitRelease(workspaceRoot: string, _selectedPaths?: string[]): Promise<{ ok: boolean; error?: string }> {
  const root = path.resolve(workspaceRoot)
  const pkgPath = path.join(root, 'package.json')
  if (!fs.existsSync(pkgPath)) return { ok: false, error: 'No package.json found.' }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> }
  if (!pkg?.scripts?.['release:prepare']) return { ok: false, error: 'No release:prepare script in package.json.' }
  const result = await runShellCommand(root, 'npm', ['run', 'release:prepare'])
  return { ok: result.ok, error: result.error }
}

async function gitRollback(workspaceRoot: string, selectedPaths?: string[]): Promise<{ ok: boolean; error?: string }> {
  const root = path.resolve(workspaceRoot)
  const status = await getGitStatus(root)
  if (!status.ok) return { ok: false, error: status.error ?? 'Cannot read git status.' }
  if (status.clean) return { ok: false, error: 'Nothing to rollback.' }

  const normalizedSelection = normalizeSelectedGitPaths(selectedPaths)
  const selection = buildCommitSelection(status.entries, normalizedSelection)
  if (selection.hasSelection && selection.selectedEntries.length === 0) {
    return { ok: false, error: 'Selected files no longer have tracked changes.' }
  }

  const restoreArgs = selection.hasSelection
    ? ['restore', '--staged', '--worktree', '--', ...selection.pathspecs]
    : ['restore', '--staged', '--worktree', '.']
  const restoreResult = await runGitCommand(root, restoreArgs)
  if (!restoreResult.ok) return { ok: false, error: restoreResult.error ?? 'git restore failed' }

  return { ok: true }
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

function formatGitStatusForPrompt(status: GitStatusResult): string {
  if (!status.ok) return `Git status unavailable: ${status.error ?? 'Unknown error.'}`

  const lines: string[] = []
  lines.push(`Branch: ${status.branch}`)
  if (status.ahead > 0 || status.behind > 0) {
    lines.push(`Divergence: ahead ${status.ahead}, behind ${status.behind}`)
  }
  lines.push(`Summary: ${status.clean ? 'clean working tree' : `${status.stagedCount} staged, ${status.unstagedCount} changed, ${status.untrackedCount} untracked`}`)

  if (!status.clean) {
    lines.push('Changed files:')
    const visibleEntries = status.entries.slice(0, MAX_GIT_STATUS_FILES_IN_PROMPT)
    for (const entry of visibleEntries) {
      const statusCode = `${entry.indexStatus}${entry.workingTreeStatus}`
      if (entry.renamedFrom) {
        lines.push(`- ${statusCode} ${entry.renamedFrom} -> ${entry.relativePath}`)
      } else {
        lines.push(`- ${statusCode} ${entry.relativePath}`)
      }
    }
    if (status.entries.length > visibleEntries.length) {
      lines.push(`- ...and ${status.entries.length - visibleEntries.length} more`)
    }
  }

  return lines.join('\n')
}

async function getGitStatusPromptForAgent(agentWindowId: string): Promise<string | undefined> {
  const cwd = agentClientCwds.get(agentWindowId)
  if (!cwd) return undefined
  try {
    const status = await getGitStatus(cwd)
    return formatGitStatusForPrompt(status)
  } catch (err) {
    return `Git status unavailable: ${errorMessage(err)}`
  }
}

function forwardEvent(agentWindowId: string, evt: AgentEvent) {
  win?.webContents.send('agentorchestrator:event', { agentWindowId, evt })
  win?.webContents.send('fireharness:event', { agentWindowId, evt })
  notifyPluginPanelEvent(agentWindowId, evt as any)
  if (evt?.type === 'assistantCompleted') {
    notifyPluginPanelTurnComplete(agentWindowId)
  }
}

async function getOrCreateClient(agentWindowId: string, options: ConnectOptions): Promise<{ client: AgentClient; result: { threadId: string } }> {
  const provider = options.provider ?? 'codex'

  const existing = agentClients.get(agentWindowId)
  if (existing) {
    await (existing as { close: () => Promise<void> }).close()
    agentClients.delete(agentWindowId)
    agentClientCwds.delete(agentWindowId)
  }

  if (provider === 'gemini') {
    const client = new GeminiClient()
    client.on('event', (evt: GeminiClientEvent) => forwardEvent(agentWindowId, evt))
    const result = await client.connect({
      model: options.model,
      cwd: options.cwd,
      permissionMode: options.permissionMode,
      sandbox: options.sandbox,
      interactionMode: options.interactionMode,
      workspaceContext: options.workspaceContext,
      showWorkspaceContextInPrompt: options.showWorkspaceContextInPrompt,
      systemPrompt: options.systemPrompt,
      initialHistory: options.initialHistory,
      mcpConfigPath: mcpServerManager.getConfigPath(),
    }) as { threadId: string }
    agentClients.set(agentWindowId, client)
    agentClientCwds.set(agentWindowId, path.resolve(options.cwd || process.cwd()))
    return { client, result }
  }

  if (provider === 'claude') {
    const client = new ClaudeClient()
    client.on('event', (evt: ClaudeClientEvent) => forwardEvent(agentWindowId, evt))
    const result = await client.connect({
      cwd: options.cwd,
      model: options.model,
      permissionMode: options.permissionMode,
      sandbox: options.sandbox,
      interactionMode: options.interactionMode,
      workspaceContext: options.workspaceContext,
      showWorkspaceContextInPrompt: options.showWorkspaceContextInPrompt,
      systemPrompt: options.systemPrompt,
      initialHistory: options.initialHistory,
      mcpConfigPath: mcpServerManager.getConfigPath(),
    }) as { threadId: string }
    agentClients.set(agentWindowId, client)
    agentClientCwds.set(agentWindowId, path.resolve(options.cwd || process.cwd()))
    return { client, result }
  }

  if (provider === 'openrouter') {
    const client = new OpenRouterClient()
    client.on('event', (evt: OpenRouterClientEvent) => forwardEvent(agentWindowId, evt))
    const apiKey = getProviderApiKey('openrouter')
    if (!apiKey) throw new Error('OpenRouter API key is missing. Open Settings -> Connectivity and add it.')
    const result = await client.connect({
      cwd: options.cwd,
      model: options.model,
      apiKey,
      baseUrl: options.modelConfig?.openrouterBaseUrl,
      permissionMode: options.permissionMode,
      sandbox: options.sandbox,
      interactionMode: options.interactionMode,
      workspaceContext: options.workspaceContext,
      showWorkspaceContextInPrompt: options.showWorkspaceContextInPrompt,
      systemPrompt: options.systemPrompt,
      initialHistory: options.initialHistory,
      mcpServerManager,
      toolRestrictions: options.toolRestrictions,
    }) as { threadId: string }
    agentClients.set(agentWindowId, client)
    agentClientCwds.set(agentWindowId, path.resolve(options.cwd || process.cwd()))
    return { client, result }
  }

  if (provider === 'codex') {
    const openAiApiModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo']
    const useApi = openAiApiModels.includes(options.model)
    if (useApi) {
      const client = new OpenAIClient()
      client.on('event', (evt: OpenAIClientEvent) => forwardEvent(agentWindowId, evt))
      const apiKey = getProviderApiKey('codex')
      if (!apiKey) throw new Error('OpenAI API key is missing. Add it in Settings -> Connectivity (OpenAI card, API key).')
      const result = await client.connect({
        cwd: options.cwd,
        model: options.model,
        apiKey,
        baseUrl: options.modelConfig?.openaiBaseUrl ?? 'https://api.openai.com/v1',
        permissionMode: options.permissionMode,
        sandbox: options.sandbox,
        interactionMode: options.interactionMode,
        workspaceContext: options.workspaceContext,
        showWorkspaceContextInPrompt: options.showWorkspaceContextInPrompt,
        systemPrompt: options.systemPrompt,
        allowedCommandPrefixes: options.allowedCommandPrefixes,
        initialHistory: options.initialHistory,
        mcpServerManager,
        toolRestrictions: options.toolRestrictions,
      }) as { threadId: string }
      agentClients.set(agentWindowId, client)
      agentClientCwds.set(agentWindowId, path.resolve(options.cwd || process.cwd()))
      return { client, result }
    }
  }

  const client = new CodexAppServerClient()
  client.on('event', (evt: FireHarnessCodexEvent) => {
    forwardEvent(agentWindowId, evt)
    if (evt?.type === 'status' && evt.status === 'closed') {
      agentClients.delete(agentWindowId)
      agentClientCwds.delete(agentWindowId)
    }
  })
  const result = await client.connect(options)
  agentClients.set(agentWindowId, client)
  agentClientCwds.set(agentWindowId, path.resolve(options.cwd || process.cwd()))
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
    title: getMainWindowTitle(currentWindowWorkspaceRoot),
    icon: path.join(process.env.VITE_PUBLIC, process.platform === 'win32' ? 'favicon.ico' : 'appicon.png'),
    show: false,
    width: startupWidth,
    height: startupHeight,
    autoHideMenuBar: false,
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
  } else {
    win.loadFile(indexHtml)
  }

  win.webContents.on('did-finish-load', () => {
    win?.setTitle(getMainWindowTitle(currentWindowWorkspaceRoot))
  })

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
  pendingStartupWorkspaceRoot = readStartupWorkspaceRoot(process.argv)
  if (pendingStartupWorkspaceRoot.trim()) {
    currentWindowWorkspaceRoot = pendingStartupWorkspaceRoot
  }
  registerRuntimeDiagnosticsLogging()
  appendRuntimeLog('app-start', { version: app.getVersion(), platform: process.platform, electron: process.versions.electron })
  migrateLegacyLocalStorageIfNeeded()
  await createWindow()
  if (win) {
    setPluginHostWindow(win)
    setWorkspaceRootGetter(() => {
      if (currentWindowWorkspaceRoot.trim()) return currentWindowWorkspaceRoot
      if (pendingStartupWorkspaceRoot.trim()) return pendingStartupWorkspaceRoot
      const startupWorkspaceRoot = readStartupWorkspaceRoot(process.argv)
      if (startupWorkspaceRoot.trim()) return startupWorkspaceRoot
      for (const [root] of ownedWorkspaceLocks) return root
      const currentWorkingDirectory = process.cwd()
      if (isDirectory(currentWorkingDirectory)) return currentWorkingDirectory
      return ''
    })
    initializePluginHost(app.getAppPath(), getAppStorageDirPath)
      .then(() => {
        win?.webContents.send('barnaby:plugin-host:plugins-loaded')
      })
      .catch((e) => {
        console.error('[pluginHost] Initialization failed:', e)
      })
    mcpServerManager.startAll().catch((e) => {
      console.error('[mcpServerManager] Startup failed:', e)
    })
  }
})

app.on('window-all-closed', () => {
  win = null
  debugLogWindow = null
  closeSplashWindow()
  clearStartupRevealTimer()
  releaseAllWorkspaceLocks()
  shutdownPluginHost().catch(() => { })
  mcpServerManager.stopAll().catch(() => { })
  for (const client of agentClients.values()) {
    (client as { close: () => Promise<void> }).close().catch(() => { })
  }
  agentClients.clear()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  closeSplashWindow()
  clearStartupRevealTimer()
  releaseAllWorkspaceLocks()
  shutdownPluginHost().catch(() => { })
  for (const client of agentClients.values()) {
    (client as { close: () => Promise<void> }).close().catch(() => { })
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
  if (client) {
    const gitStatus = await getGitStatusPromptForAgent('default')
    const sendOptions = gitStatus ? { gitStatus } : undefined
    await (client as { sendUserMessage: (t: string, opts?: { gitStatus?: string }) => Promise<void> }).sendUserMessage(text, sendOptions)
  }
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
  agentClientCwds.delete('default')
  return {}
})

ipcMain.handle('agentorchestrator:connect', async (_evt, agentWindowId: string, options: ConnectOptions) => {
  const { result } = await getOrCreateClient(agentWindowId, options)
  return result
})

ipcMain.handle('agentorchestrator:sendMessage', async (_evt, agentWindowId: string, text: string) => {
  const client = agentClients.get(agentWindowId)
  if (client) {
    const gitStatus = await getGitStatusPromptForAgent(agentWindowId)
    const sendOptions = gitStatus ? { gitStatus } : undefined
    await (client as { sendUserMessage: (t: string, opts?: { gitStatus?: string }) => Promise<void> }).sendUserMessage(text, sendOptions)
  }
  return {}
})

/** Phase 4: Structured history — limit context to last N messages and truncate long assistant replies. */
function formatPriorMessagesForContext(messages: Array<{ role: string; content: string }>): string {
  if (!messages.length) return ''
  const history: HistoryMessage[] = messages
    .filter((m): m is { role: 'user' | 'assistant'; content: string } =>
      m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', text: (m.content ?? '').trim() }))
    .filter((m) => m.text.length > 0)
  const { history: truncated, droppedMessages } = truncateHistoryWithMeta(history, { maxMessages: 4 })
  if (!truncated.length) return ''
  const transcript = truncated
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}:\n${m.text}`)
    .join('\n\n')
  const header = droppedMessages > 0
    ? `Previous conversation (${droppedMessages} earlier messages omitted):\n\n`
    : 'Previous conversation:\n\n'
  return `${header}${transcript}\n\nUser continues: `
}

const CONCISE_RESPONSE_PREFIX =
  '[Response style: Be extremely brief. Prefer bullet points over paragraphs. Use single newlines between items, not blank lines. No multi-paragraph blocks.]\n\n'

ipcMain.handle('agentorchestrator:sendMessageEx', async (_evt, agentWindowId: string, payload: { text: string; imagePaths?: string[]; priorMessagesForContext?: Array<{ role: string; content: string }>; interactionMode?: string; responseStyle?: 'concise' | 'standard' | 'detailed' }) => {
  try {
    const client = agentClients.get(agentWindowId)
    if (!client) {
      throw new Error('Agent not connected. Try reconnecting the panel or switching the model.')
    }
    let text = typeof payload?.text === 'string' ? payload.text : ''
    const responseStyle = payload?.responseStyle === 'concise' || payload?.responseStyle === 'standard' || payload?.responseStyle === 'detailed' ? payload.responseStyle : undefined
    if (responseStyle === 'concise') {
      text = CONCISE_RESPONSE_PREFIX + text
    }
    const imagePaths = Array.isArray(payload?.imagePaths) ? payload.imagePaths.filter((p): p is string => typeof p === 'string' && p.trim().length > 0) : []
    const priorMessages = Array.isArray(payload?.priorMessagesForContext) ? payload.priorMessagesForContext : []
    const interactionMode = typeof payload?.interactionMode === 'string' ? payload.interactionMode : undefined
    const gitStatus = await getGitStatusPromptForAgent(agentWindowId)
    const sendOptions = (interactionMode || gitStatus) ? { interactionMode, gitStatus } : undefined
    if (client instanceof CodexAppServerClient) {
      if (priorMessages.length > 0) {
        const prefix = formatPriorMessagesForContext(priorMessages)
        if (prefix) text = prefix + text
      }
      if (gitStatus) {
        text = `[Git status]\n${gitStatus.trim()}\n\n${text}`
      }
    }
    if (imagePaths.length > 0) {
      const withImages = client as { sendUserMessageWithImages?: (t: string, paths: string[], opts?: { interactionMode?: string; gitStatus?: string }) => Promise<void> }
      if (typeof withImages.sendUserMessageWithImages !== 'function') {
        throw new Error('Selected provider does not support image attachments in this app yet.')
      }
      await withImages.sendUserMessageWithImages(text, imagePaths, sendOptions)
      return {}
    }
    await (client as { sendUserMessage: (t: string, opts?: { interactionMode?: string; gitStatus?: string }) => Promise<void> }).sendUserMessage(text, sendOptions)
    return {}
  } catch (err) {
    if (_evt.sender.isDestroyed()) return {}
    throw err
  }
})

ipcMain.handle('agentorchestrator:loadChatHistory', async () => {
  const loaded = readPersistedChatHistory()
  return loaded
})

ipcMain.handle('agentorchestrator:saveChatHistory', async (_evt, entries: unknown) => {
  return writePersistedChatHistory(entries)
})

ipcMain.handle('agentorchestrator:saveTranscriptFile', async (_evt, workspaceRoot: unknown, suggestedFileName: unknown, content: unknown) => {
  try {
    const resolvedWorkspaceRoot =
      typeof workspaceRoot === 'string' && workspaceRoot.trim()
        ? workspaceRoot.trim()
        : ''
    const safeFileName =
      typeof suggestedFileName === 'string' && suggestedFileName.trim()
        ? suggestedFileName.trim()
        : 'conversation-transcript.md'
    const body = typeof content === 'string' ? content : String(content ?? '')
    return await saveTranscriptFile(resolvedWorkspaceRoot, safeFileName, body)
  } catch (err) {
    return { ok: false as const, error: errorMessage(err) }
  }
})

ipcMain.handle('agentorchestrator:saveTranscriptDirect', async (_evt, workspaceRoot: unknown, fileName: unknown, content: unknown) => {
  try {
    const resolvedWorkspaceRoot =
      typeof workspaceRoot === 'string' && workspaceRoot.trim()
        ? workspaceRoot.trim()
        : ''
    const safeFileName =
      typeof fileName === 'string' && fileName.trim()
        ? fileName.trim()
        : 'conversation-transcript'
    const body = typeof content === 'string' ? content : String(content ?? '')
    return await saveTranscriptDirect(resolvedWorkspaceRoot, safeFileName, body)
  } catch (err) {
    return { ok: false as const, error: errorMessage(err) }
  }
})

ipcMain.handle('agentorchestrator:loadAppState', async () => {
  const persisted = readPersistedAppState()
  return withWorkspaceBundleSelection(persisted)
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

ipcMain.handle('agentorchestrator:setWindowWorkspaceTitle', async (_evt, workspaceRoot: unknown) => {
  currentWindowWorkspaceRoot = typeof workspaceRoot === 'string' ? workspaceRoot : ''
  const title = getMainWindowTitle(currentWindowWorkspaceRoot)
  if (win && !win.isDestroyed()) {
    win.setTitle(title)
  }
  return { ok: true, title }
})

ipcMain.handle('agentorchestrator:rendererReady', async () => {
  rendererStartupReady = true
  maybeRevealMainWindow()
  if (pendingStartupWorkspaceRoot) {
    const target = pendingStartupWorkspaceRoot
    currentWindowWorkspaceRoot = target
    pendingStartupWorkspaceRoot = ''
    setTimeout(() => {
      sendMenuAction('openWorkspace', { path: target })
    }, 50)
  }
  return { ok: true }
})

ipcMain.handle('agentorchestrator:getDiagnosticsInfo', async () => {
  return getDiagnosticsInfo()
})

ipcMain.handle('agentorchestrator:getLoadedPlugins', async () => {
  const plugins = getLoadedPlugins()
  return Array.from(plugins.entries()).map(([id, entry]) => ({
    pluginId: id,
    displayName: entry.plugin.displayName,
    version: entry.plugin.version,
    active: entry.active,
    licensed: typeof (entry.plugin as any).isLicensed === 'function' ? (entry.plugin as any).isLicensed() : true,
  }))
})

ipcMain.handle('agentorchestrator:startOrchestratorComparativeReview', async (_evt, goal: unknown, optionsRaw: unknown) => {
  const pluginEntry = getLoadedPlugins().get('orchestrator')
  if (!pluginEntry?.active) {
    return { ok: false, error: 'Orchestrator plugin is not active.' }
  }
  if (typeof goal !== 'string' || !goal.trim()) {
    return { ok: false, error: 'Goal text is required.' }
  }
  const startRun = (pluginEntry.plugin as any).startComparativeReview
  if (typeof startRun !== 'function') {
    return { ok: false, error: 'Orchestrator plugin does not support comparative review yet.' }
  }
  const options =
    optionsRaw && typeof optionsRaw === 'object' && !Array.isArray(optionsRaw)
      ? optionsRaw as {
          reviewerA?: { id?: string; label?: string; provider?: string; model?: string }
          reviewerB?: { id?: string; label?: string; provider?: string; model?: string }
        }
      : undefined
  try {
    const result = await startRun(goal.trim(), options)
    return { ok: true, ...(result && typeof result === 'object' ? result : {}) }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
})

ipcMain.handle('agentorchestrator:startOrchestratorGoalRun', async (_evt, goal: unknown) => {
  const pluginEntry = getLoadedPlugins().get('orchestrator')
  if (!pluginEntry?.active) {
    return { ok: false, error: 'Orchestrator plugin is not active.' }
  }
  if (typeof goal !== 'string' || !goal.trim()) {
    return { ok: false, error: 'Goal text is required.' }
  }
  const startRun = (pluginEntry.plugin as any).startGoalRun
  if (typeof startRun !== 'function') {
    return { ok: false, error: 'Orchestrator plugin does not support goal runs yet.' }
  }
  try {
    const result = await startRun(goal.trim())
    return { ok: true, ...(result && typeof result === 'object' ? result : {}) }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
})

ipcMain.handle('agentorchestrator:pauseOrchestratorRun', async () => {
  const pluginEntry = getLoadedPlugins().get('orchestrator')
  if (!pluginEntry?.active) {
    return { ok: false, error: 'Orchestrator plugin is not active.' }
  }
  const pauseRun = (pluginEntry.plugin as any).pauseCurrentRun
  if (typeof pauseRun !== 'function') {
    return { ok: false, error: 'Orchestrator plugin does not support pausing yet.' }
  }
  try {
    const result = await pauseRun()
    if (result && typeof result === 'object' && 'ok' in result) return result
    return { ok: Boolean(result) }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
})

ipcMain.handle('agentorchestrator:cancelOrchestratorRun', async () => {
  const pluginEntry = getLoadedPlugins().get('orchestrator')
  if (!pluginEntry?.active) {
    return { ok: false, error: 'Orchestrator plugin is not active.' }
  }
  const cancelRun = (pluginEntry.plugin as any).cancelCurrentRun
  if (typeof cancelRun !== 'function') {
    return { ok: false, error: 'Orchestrator plugin does not support cancellation yet.' }
  }
  try {
    const result = await cancelRun()
    if (result && typeof result === 'object' && 'ok' in result) return result
    return { ok: Boolean(result) }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
})

ipcMain.handle('agentorchestrator:getOrchestratorState', async () => {
  const pluginEntry = getLoadedPlugins().get('orchestrator')
  if (!pluginEntry?.active) return null
  const getState = (pluginEntry.plugin as any).getState
  if (typeof getState !== 'function') return null
  try {
    return await getState()
  } catch {
    return null
  }
})

ipcMain.handle('agentorchestrator:openRuntimeLog', async () => {
  return openRuntimeLogFile()
})

ipcMain.handle('agentorchestrator:openDebugOutputWindow', async () => {
  return openDebugOutputWindow()
})

ipcMain.handle('agentorchestrator:getDebugLogContent', async () => {
  try {
    const logPath = getDebugLogFilePath()
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    if (!fs.existsSync(logPath)) return { ok: true, content: '' }
    const content = fs.readFileSync(logPath, 'utf8')
    return { ok: true, content }
  } catch (err) {
    return { ok: false, content: '', error: errorMessage(err) }
  }
})

ipcMain.handle('agentorchestrator:openDiagnosticsPath', async (_evt, target: unknown) => {
  return openDiagnosticsPath(target)
})

ipcMain.handle('agentorchestrator:readDiagnosticsFile', async (_evt, target: unknown) => {
  return readDiagnosticsFile(target)
})

ipcMain.handle('agentorchestrator:writeDiagnosticsFile', async (_evt, target: unknown, content: unknown) => {
  return writeDiagnosticsFile(target, content)
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

ipcMain.handle('agentorchestrator:getOrchestratorLicenseKeyState', async () => {
  const secrets = readOrchestratorSecrets(getAppStorageDirPath)
  const key = (secrets.licenseKey ?? '').trim()
  if (!key) return { hasKey: false, valid: false, reason: 'No key entered' }
  const result = await validateLicenseKey(key, os.hostname(), app.getVersion())
  return {
    hasKey: true,
    valid: result.valid,
    reason: result.reason,
    email: result.payload?.email,
    tier: result.payload?.tier,
  }
})

ipcMain.handle('agentorchestrator:setOrchestratorLicenseKey', async (_evt, rawKey: unknown) => {
  const key = typeof rawKey === 'string' ? rawKey.trim() : ''
  const secrets = readOrchestratorSecrets(getAppStorageDirPath)
  secrets.licenseKey = key || undefined
  writeOrchestratorSecrets(getAppStorageDirPath, secrets)
  if (!key) return { ok: true, hasKey: false, valid: false }
  const result = await validateLicenseKey(key, os.hostname(), app.getVersion())
  return { ok: true, hasKey: true, valid: result.valid, reason: result.reason, email: result.payload?.email }
})

ipcMain.handle('agentorchestrator:syncOrchestratorSettings', async (_evt, raw: unknown) => {
  const data = raw as OrchestratorSettingsData
  if (!data || typeof data !== 'object' || Array.isArray(data)) return
  const sanitizePool = (
    value: unknown,
  ): Array<{ id: string; label: string; provider: string; model: string }> | undefined => {
    if (!Array.isArray(value)) return undefined
    const next: Array<{ id: string; label: string; provider: string; model: string }> = []
    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const row = item as Record<string, unknown>
      const id = typeof row.id === 'string' ? row.id.trim() : ''
      const label = typeof row.label === 'string' ? row.label.trim() : ''
      const provider = typeof row.provider === 'string' ? row.provider.trim() : ''
      const model = typeof row.model === 'string' ? row.model.trim() : ''
      if (!id || !label || !provider) continue
      next.push({ id, label, provider, model })
    }
    return next.length > 0 ? next : undefined
  }
  const sanitized: OrchestratorSettingsData = {}
  if (typeof data.orchestratorModel === 'string') sanitized.orchestratorModel = data.orchestratorModel
  if (typeof data.workerProvider === 'string') sanitized.workerProvider = data.workerProvider
  if (typeof data.workerModel === 'string') sanitized.workerModel = data.workerModel
  if (typeof data.maxParallelPanels === 'number' && data.maxParallelPanels >= 1 && data.maxParallelPanels <= 8) sanitized.maxParallelPanels = data.maxParallelPanels
  if (typeof data.maxTaskAttempts === 'number' && data.maxTaskAttempts >= 1 && data.maxTaskAttempts <= 10) sanitized.maxTaskAttempts = data.maxTaskAttempts
  const orchestratorPool = sanitizePool(data.orchestratorPool)
  const workerPool = sanitizePool(data.workerPool)
  if (orchestratorPool) sanitized.orchestratorPool = orchestratorPool
  if (workerPool) sanitized.workerPool = workerPool
  if (typeof data.comparativeReviewerAId === 'string' && data.comparativeReviewerAId.trim()) sanitized.comparativeReviewerAId = data.comparativeReviewerAId.trim()
  if (typeof data.comparativeReviewerBId === 'string' && data.comparativeReviewerBId.trim()) sanitized.comparativeReviewerBId = data.comparativeReviewerBId.trim()
  writeOrchestratorSettings(getAppStorageDirPath, sanitized)
})

ipcMain.handle('barnaby:repairStartMenuShortcut', async () => {
  if (process.platform !== 'win32') return { ok: false, error: 'Windows only' }
  try {
    const scriptPath = path.join(app.getAppPath(), 'scripts', 'shortcut-win.mjs')
    if (!fs.existsSync(scriptPath)) return { ok: false, error: 'Shortcut script not found' }
    const { execSync } = await import('node:child_process')
    execSync(`node "${scriptPath}" --force`, { stdio: 'pipe', env: { ...process.env } })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
})

ipcMain.handle('agentorchestrator:openPluginsFolder', async () => {
  const pluginsDir = path.join(os.homedir(), '.barnaby', 'plugins')
  try {
    if (!fs.existsSync(pluginsDir)) {
      fs.mkdirSync(pluginsDir, { recursive: true })
    }
    const err = await shell.openPath(pluginsDir)
    return err ? { ok: false, error: err } : { ok: true }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
})

ipcMain.handle('agentorchestrator:reloadLocalPlugins', async () => {
  try {
    await shutdownPluginHost()
    await initializePluginHost(app.getAppPath(), getAppStorageDirPath)
    win?.webContents.send('barnaby:plugin-host:plugins-loaded')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
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
  agentClientCwds.delete(agentWindowId)
  return {}
})

ipcMain.handle('agentorchestrator:browseMarkdownFile', async () => {
  const parent = win ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? undefined
  const result = await dialog.showOpenDialog(parent, {
    properties: ['openFile'],
    title: 'Import Markdown file',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  const content = await fs.promises.readFile(filePath, 'utf-8')
  return { filePath, content }
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

async function openTerminalInWorkspace(workspaceRoot: string): Promise<{ ok: boolean; error?: string }> {
  const folder = path.resolve(workspaceRoot)
  try {
    if (process.platform === 'win32') {
      const cmd = process.env.ComSpec ?? 'cmd.exe'
      await execFileAsync(cmd, ['/d', '/s', '/c', 'start', '', 'cmd', '/k', `cd /d "${folder}"`], {
        windowsHide: true,
      })
    } else if (process.platform === 'darwin') {
      const escaped = folder.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      await execFileAsync('osascript', [
        '-e',
        `tell application "Terminal" to do script "cd \\"${escaped}\\""`,
      ])
    } else {
      const child = spawn('gnome-terminal', ['--working-directory', folder], { detached: true, stdio: 'ignore' })
      child.on('error', () => {
        spawn('xterm', ['-e', `cd "${folder}" && exec ${process.env.SHELL ?? 'bash'}`], {
          detached: true,
          stdio: 'ignore',
        }).unref()
      })
      child.unref()
    }
    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

ipcMain.handle('agentorchestrator:openTerminalInWorkspace', async (_evt, workspaceRoot: string) => {
  return openTerminalInWorkspace(workspaceRoot)
})

ipcMain.handle('agentorchestrator:terminalSpawn', async (_evt, cwd: string) => {
  if (terminalPtyProcess) {
    try {
      terminalPtyProcess.kill()
    } catch {
      // ignore
    }
    terminalPtyProcess = null
  }
  const pty = getNodePty()
  if (!pty) {
    return { ok: false, error: 'Terminal unavailable: node-pty not loaded. Rebuild with: npx electron-rebuild' }
  }
  const shell = process.env[process.platform === 'win32' ? 'COMSPEC' : 'SHELL'] ?? (process.platform === 'win32' ? 'cmd.exe' : '/bin/bash')
  const resolvedCwd = path.resolve(cwd || process.env.HOME || process.env.USERPROFILE || process.cwd())
  try {
    terminalPtyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: resolvedCwd,
      env: process.env as Record<string, string>,
      useConptyDll: true,
      conptyInheritCursor: false,
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
})

ipcMain.on('agentorchestrator:terminalWrite', (_evt, data: string) => {
  if (terminalPtyProcess) terminalPtyProcess.write(data)
})

ipcMain.handle('agentorchestrator:terminalResize', (_evt, cols: number, rows: number) => {
  if (terminalPtyProcess) terminalPtyProcess.resize(cols, rows)
})

ipcMain.handle('agentorchestrator:terminalDestroy', () => {
  if (terminalPtyProcess) {
    try {
      terminalPtyProcess.kill()
    } catch {
      // ignore
    }
    terminalPtyProcess = null
  }
})

function normalizeWorkspaceConfigPrefixes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of raw) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result.slice(0, 64)
}

function sanitizeWorkspaceConfigSettings(folderPath: string, raw: unknown): WorkspaceConfigSettingsPayload {
  const source = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}) ?? {}
  return {
    path: typeof source.path === 'string' && source.path.trim() ? source.path.trim() : folderPath,
    defaultModel: typeof source.defaultModel === 'string' ? source.defaultModel.trim() : '',
    permissionMode: source.permissionMode === 'proceed-always' ? 'proceed-always' : 'verify-first',
    sandbox: source.sandbox === 'read-only' ? 'read-only' : 'workspace-write',
    workspaceContext: typeof source.workspaceContext === 'string' ? source.workspaceContext.trim() : '',
    showWorkspaceContextInPrompt: source.showWorkspaceContextInPrompt === true,
    systemPrompt: typeof source.systemPrompt === 'string' ? source.systemPrompt.trim() : '',
    allowedCommandPrefixes: normalizeWorkspaceConfigPrefixes(source.allowedCommandPrefixes),
    allowedAutoReadPrefixes: normalizeWorkspaceConfigPrefixes(source.allowedAutoReadPrefixes),
    allowedAutoWritePrefixes: normalizeWorkspaceConfigPrefixes(source.allowedAutoWritePrefixes),
    deniedAutoReadPrefixes: normalizeWorkspaceConfigPrefixes(source.deniedAutoReadPrefixes),
    deniedAutoWritePrefixes: normalizeWorkspaceConfigPrefixes(source.deniedAutoWritePrefixes),
    cursorAllowBuilds: source.cursorAllowBuilds === true,
  }
}

ipcMain.handle('agentorchestrator:writeWorkspaceConfig', async (_evt, folderPath: string, settings?: unknown) => {
  const trimmedFolder = typeof folderPath === 'string' ? folderPath.trim() : ''
  if (!trimmedFolder) throw new Error('Workspace folder path is required.')
  const resolvedFolder = resolveWorkspaceRootFromAnyPath(trimmedFolder)
  if (!isDirectory(resolvedFolder)) throw new Error('Workspace folder does not exist.')

  const configPath = path.join(resolvedFolder, WORKSPACE_CONFIG_FILENAME)
  const workspaceSettings = sanitizeWorkspaceConfigSettings(resolvedFolder, settings)
  const config = {
    version: 2,
    app: 'Barnaby',
    agentorchestrator: true,
    workspace: workspaceSettings,
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
  upsertWorkspaceBundleFolder(resolvedFolder, workspaceSettings)
  return true
})

ipcMain.handle('agentorchestrator:openWorkspaceInNewWindow', async (_evt, workspaceRoot: string) => {
  return openWorkspaceInNewBarnabyInstance(workspaceRoot)
})

ipcMain.handle('agentorchestrator:claimWorkspace', async (_evt, workspaceRoot: string) => {
  return acquireWorkspaceLock(workspaceRoot)
})

ipcMain.handle('agentorchestrator:releaseWorkspace', async (_evt, workspaceRoot: string) => {
  if (!workspaceRoot?.trim()) return false
  return releaseWorkspaceLock(workspaceRoot)
})

ipcMain.handle('agentorchestrator:forceClaimWorkspace', async (_evt, workspaceRoot: string) => {
  return forceClaimWorkspaceLock(workspaceRoot)
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

ipcMain.handle('agentorchestrator:openWorkspacePathInExplorer', async (_evt, workspaceRoot: string, relativePath: string) => {
  return openWorkspacePathInExplorer(workspaceRoot, relativePath)
})

ipcMain.handle('agentorchestrator:deleteWorkspaceFile', async (_evt, workspaceRoot: string, relativePath: string) => {
  return deleteWorkspaceFile(workspaceRoot, relativePath)
})

ipcMain.handle('agentorchestrator:pickWorkspaceSavePath', async (_evt, workspaceRoot: string, relativePath: string) => {
  return pickWorkspaceSavePath(workspaceRoot, relativePath)
})

ipcMain.handle('agentorchestrator:pickWorkspaceOpenPath', async (_evt, workspaceRoot: string) => {
  return pickWorkspaceOpenPath(workspaceRoot)
})

ipcMain.handle('agentorchestrator:getGitStatus', async (_evt, workspaceRoot: string) => {
  return getGitStatus(workspaceRoot)
})

ipcMain.handle('agentorchestrator:gitCommit', async (_evt, workspaceRoot: string, selectedPaths?: string[]) => {
  return gitCommit(workspaceRoot, selectedPaths)
})

ipcMain.handle('agentorchestrator:gitPush', async (_evt, workspaceRoot: string, selectedPaths?: string[]) => {
  return gitPush(workspaceRoot, selectedPaths)
})

ipcMain.handle('agentorchestrator:gitDeploy', async (_evt, workspaceRoot: string, selectedPaths?: string[]) => {
  return gitDeploy(workspaceRoot, selectedPaths)
})

ipcMain.handle('agentorchestrator:gitBuild', async (_evt, workspaceRoot: string, selectedPaths?: string[]) => {
  return gitBuild(workspaceRoot, selectedPaths)
})

ipcMain.handle('agentorchestrator:gitRelease', async (_evt, workspaceRoot: string, selectedPaths?: string[]) => {
  return gitRelease(workspaceRoot, selectedPaths)
})

ipcMain.handle('agentorchestrator:gitRollback', async (_evt, workspaceRoot: string, selectedPaths?: string[]) => {
  return gitRollback(workspaceRoot, selectedPaths)
})

ipcMain.on('agentorchestrator:setRecentWorkspaces', (_evt, list: string[]) => {
  recentWorkspaces = normalizeRecentWorkspaceFiles(list)
  setAppMenu()
})

ipcMain.on('agentorchestrator:setEditorMenuState', (_evt, enabled: boolean) => {
  const next = Boolean(enabled)
  if (editorMenuEnabled === next) return
  editorMenuEnabled = next
  setAppMenu()
})

ipcMain.on('agentorchestrator:setDockPanelMenuState', (_evt, state: Partial<Record<ViewMenuDockPanelId, unknown>>) => {
  const next = normalizeViewMenuDockState(state)
  if (viewMenuDockStateEquals(viewMenuDockState, next)) return
  viewMenuDockState = next
  setAppMenu()
})

ipcMain.handle('agentorchestrator:getProviderAuthStatus', async (_evt, config: ProviderConfigForAuth) => {
  return getProviderAuthStatus(config)
})

ipcMain.handle('agentorchestrator:pingModel', async (_evt, provider: string, modelId: string, cwd?: string) => {
  return pingModelById(provider, modelId, cwd)
})

ipcMain.handle('agentorchestrator:pingProvider', async (_evt, providerId: string) => {
  const start = Date.now()
  try {
    if (providerId === 'openrouter') {
      return { ok: true, detail: 'API provider (verified by key check)', durationMs: Date.now() - start }
    }
    if (providerId === 'claude') {
      const result = await runCliCommand('claude', ['auth', 'status'])
      const durationMs = Date.now() - start
      const out = `${result.stdout ?? ''}`.trim()
      try {
        const parsed = JSON.parse(out)
        if (parsed.loggedIn) return { ok: true, detail: `Authenticated as ${parsed.email ?? 'unknown'} (${parsed.subscriptionType ?? 'unknown'})`, durationMs }
        return { ok: false, detail: 'Not logged in', durationMs }
      } catch {
        return { ok: out.length > 0, detail: out.slice(0, 100) || 'No response', durationMs }
      }
    }
    if (providerId === 'codex') {
      const result = await runCliCommand('codex', ['login', 'status'])
      const durationMs = Date.now() - start
      const combined = `${result.stdout ?? ''} ${result.stderr ?? ''}`.trim()
      const loggedIn = /logged\s*in/i.test(combined)
      return { ok: loggedIn, detail: combined.slice(0, 100) || 'No response', durationMs }
    }
    if (providerId === 'gemini') {
      const result = await runCliCommand('gemini', ['--version'])
      const combined = `${result.stdout ?? ''} ${result.stderr ?? ''}`.trim()
      const durationMs = Date.now() - start
      return { ok: combined.length > 0, detail: combined.slice(0, 100) || 'CLI ready', durationMs }
    }
    const result = await runCliCommand(providerId, ['--version'])
    const out = `${result.stdout ?? ''}`.trim()
    const durationMs = Date.now() - start
    return { ok: out.length > 0, detail: out.slice(0, 100) || 'CLI found', durationMs }
  } catch (err) {
    return { ok: false, detail: errorMessage(err) || 'Ping failed', durationMs: Date.now() - start }
  }
})

ipcMain.handle('agentorchestrator:startProviderLogin', async (_evt, config: ProviderConfigForAuth) => {
  return launchProviderLogin(config)
})

ipcMain.handle('agentorchestrator:upgradeProviderCli', async (_evt, config: ProviderConfigForAuth) => {
  return launchProviderUpgrade(config)
})

ipcMain.handle('agentorchestrator:setProviderApiKey', async (_evt, providerId: string, apiKey: string) => {
  return setProviderApiKey(providerId, apiKey)
})

ipcMain.handle('agentorchestrator:getProviderApiKeyState', async (_evt, providerId: string) => {
  const hasKey = getProviderApiKey(providerId).length > 0
  return { hasKey }
})

ipcMain.handle('agentorchestrator:importProviderApiKeyFromEnv', async (_evt, providerId: string) => {
  return importProviderApiKeyFromEnv(providerId)
})

ipcMain.handle('agentorchestrator:resetApplicationData', async () => {
  try {
    const userData = app.getPath('userData')
    // appStatePath and chatHistoryPath
    const storageDir = path.join(userData, APP_STORAGE_DIRNAME)
    const appStatePath = path.join(storageDir, APP_STATE_FILENAME)
    const chatHistoryPath = path.join(storageDir, CHAT_HISTORY_FILENAME)
    const providerSecretsPath = path.join(storageDir, PROVIDER_SECRETS_FILENAME)

    if (fs.existsSync(appStatePath)) fs.unlinkSync(appStatePath)
    if (fs.existsSync(chatHistoryPath)) fs.unlinkSync(chatHistoryPath)
    if (fs.existsSync(providerSecretsPath)) fs.unlinkSync(providerSecretsPath)
  } catch (err) {
    console.error('Failed to reset application data:', err)
  }

  app.relaunch()
  app.exit(0)
})

// ── MCP Server management ──────────────────────────────────────────

ipcMain.handle('agentorchestrator:getMcpServers', async () => {
  return mcpServerManager.getStatuses()
})

ipcMain.handle('agentorchestrator:addMcpServer', async (_evt, name: string, config: McpServerConfig) => {
  mcpServerManager.addServer(name, config)
  if (config.enabled !== false) {
    await mcpServerManager.startServer(name, config)
  }
  return { ok: true }
})

ipcMain.handle('agentorchestrator:updateMcpServer', async (_evt, name: string, config: McpServerConfig) => {
  mcpServerManager.updateServer(name, config)
  await mcpServerManager.stopServer(name)
  if (config.enabled !== false) {
    await mcpServerManager.startServer(name, config)
  }
  return { ok: true }
})

ipcMain.handle('agentorchestrator:removeMcpServer', async (_evt, name: string) => {
  await mcpServerManager.stopServer(name)
  mcpServerManager.removeServer(name)
  return { ok: true }
})

ipcMain.handle('agentorchestrator:restartMcpServer', async (_evt, name: string) => {
  await mcpServerManager.restartServer(name)
  return { ok: true }
})

ipcMain.handle('agentorchestrator:getMcpServerTools', async (_evt, name: string) => {
  const statuses = mcpServerManager.getStatuses()
  const server = statuses.find((s) => s.name === name)
  return server?.tools ?? []
})

// ────────────────────────────────────────────────────────────────────

ipcMain.handle('agentorchestrator:getGeminiAvailableModels', async () => {
  return getGeminiAvailableModels()
})

ipcMain.handle('agentorchestrator:getAvailableModels', async () => {
  try {
    return await getAvailableModels()
  } catch (err) {
    console.error('[getAvailableModels]', err)
    throw err
  }
})

ipcMain.handle('agentorchestrator:findInPage', async (evt, text: string) => {
  const wc = evt.sender
  if (!wc || typeof text !== 'string' || !text.trim()) return
  wc.findInPage(text.trim(), { findNext: false })
})

ipcMain.handle('agentorchestrator:showContextMenu', async (evt, kind: unknown) => {
  const menuKind: ContextMenuKind | null =
    kind === 'input-selection' || kind === 'chat-selection' ? kind : null
  if (!menuKind) return { ok: false }

  const template: Electron.MenuItemConstructorOptions[] =
    menuKind === 'input-selection'
      ? [
        { label: 'Undo', role: 'undo' },
        { label: 'Redo', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', role: 'cut' },
        { label: 'Copy', role: 'copy' },
        { label: 'Paste', role: 'paste' },
        { type: 'separator' },
        { label: 'Select All', role: 'selectAll' },
      ]
      : [
        { label: 'Copy', role: 'copy' },
        { type: 'separator' },
        { label: 'Select All', role: 'selectAll' },
      ]

  const menu = Menu.buildFromTemplate(template)
  const contextWindow =
    BrowserWindow.fromWebContents(evt.sender) ??
    BrowserWindow.getFocusedWindow() ??
    BrowserWindow.getAllWindows()[0] ??
    undefined
  if (!contextWindow || contextWindow.isDestroyed()) return { ok: false }
  menu.popup({ window: contextWindow })
  return { ok: true }
})

function sendMenuAction(action: string, payload?: Record<string, unknown>) {
  const message = { action, ...payload }
  win?.webContents.send('agentorchestrator:menu', message)
  win?.webContents.send('fireharness:menu', message)
}

let aboutWindow: BrowserWindow | null = null

function createAboutWindow() {
  if (aboutWindow) {
    if (aboutWindow.isMinimized()) aboutWindow.restore()
    aboutWindow.focus()
    return
  }

  const publicRoot = process.env.VITE_PUBLIC ?? ''
  const splashImagePath = publicRoot ? path.join(publicRoot, 'splash.png') : ''
  let splashImageUrl = ''
  try {
    if (splashImagePath && fs.existsSync(splashImagePath)) {
      const splashImageBase64 = fs.readFileSync(splashImagePath).toString('base64')
      splashImageUrl = `data:image/png;base64,${splashImageBase64}`
    }
  } catch (err) {
    appendRuntimeLog('about-splash-base64-failed', { splashImagePath, error: errorMessage(err) }, 'warn')
  }

  const version = getReleaseVersion()
  const appName = 'Barnaby'
  const description = 'Barnaby is an autonomous agent desktop for developers. It orchestrates parallel agent loops directly through your local CLI subscriptions.'
  const blurb = 'No API keys, no middleman. Connect to Codex, Claude, and Gemini via your existing terminal sessions. Experience workspace-aware agents with flexible split layouts and intelligent provider routing.'
  const email = 'incendiosoftware@gmail.com'

  const isDark = nativeTheme.shouldUseDarkColors
  const theme = {
    bg: isDark ? '#0b0b0b' : '#f5f5f5',
    text: isDark ? '#e0e0e0' : '#171717',
    h1: isDark ? '#ffffff' : '#0a0a0a',
    version: isDark ? '#888' : '#525252',
    description: isDark ? '#ffffff' : '#0a0a0a',
    blurb: isDark ? '#aaa' : '#404040',
    contact: isDark ? '#666' : '#737373',
    link: isDark ? '#4daafc' : '#2563eb',
    border: isDark ? '#222' : '#e5e5e5'
  }

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>About ${appName}</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: ${theme.bg};
      color: ${theme.text};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      overflow: hidden;
      user-select: none;
    }
    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 32px;
      text-align: center;
    }
    .splash-container {
      width: 320px;
      margin-bottom: 24px;
    }
                .splash-container img { 
                    width: 100%; 
                    height: auto; 
                    object-fit: contain; 
                    max-width: 300px;
                    max-height: 300px;
                }    h1 {
      margin: 0 0 4px 0;
      font-size: 24px;
      font-weight: 700;
      color: ${theme.h1};
    }
    .version {
      color: ${theme.version};
      font-size: 13px;
      margin-bottom: 24px;
    }
    .content {
      max-width: 440px;
    }
    .description {
      font-size: 16px;
      line-height: 1.5;
      margin-bottom: 12px;
      font-weight: 600;
      color: ${theme.description};
    }
    .blurb {
      font-size: 14px;
      line-height: 1.5;
      color: ${theme.blurb};
      margin-bottom: 32px;
    }
    .contact {
      font-size: 12px;
      color: ${theme.contact};
      border-top: 1px solid ${theme.border};
      padding-top: 16px;
      width: 100%;
    }
    .contact a {
      color: ${theme.link};
      text-decoration: none;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="splash-container">
      ${splashImageUrl ? `<img src="${splashImageUrl}" alt="Barnaby Splash" />` : ''}
    </div>
    <h1>${appName}</h1>
    <div class="version">Version ${version}</div>
    <div class="content">
      <div class="description">${description}</div>
      <div class="blurb">${blurb}</div>
    </div>
    <div class="contact">
      Contact: <a href="mailto:${email}">${email}</a> | <a href="https://barnaby.build">barnaby.build</a>
    </div>
  </div>
</body>
</html>`

  aboutWindow = new BrowserWindow({
    width: 500,
    height: 540,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: `About ${appName}`,
    autoHideMenuBar: true,
    backgroundColor: theme.bg,
    parent: win ?? undefined,
    modal: !!win,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  aboutWindow.setMenuBarVisibility(false)
  aboutWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

  aboutWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  aboutWindow.once('ready-to-show', () => {
    aboutWindow?.show()
  })

  aboutWindow.on('closed', () => {
    aboutWindow = null
  })
}

function setAppMenu() {
  const recentSubmenu: Electron.MenuItemConstructorOptions[] =
    recentWorkspaces.length > 0
      ? recentWorkspaces.slice(0, 10).map((workspaceFilePath) => ({
        label: `${path.basename(path.dirname(workspaceFilePath)) || '(workspace)'} - ${workspaceFilePath}`,
        click: () => sendMenuAction('openWorkspace', { path: path.dirname(workspaceFilePath) }),
      }))
      : [{ label: '(none)', enabled: false }]

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'New Agent', accelerator: 'CmdOrCtrl+Shift+N', click: () => sendMenuAction('newAgentWindow') },
        { label: 'New Workspace', click: () => sendMenuAction('newWorkspace') },
        { label: 'Add Folder to Current Workspace', click: () => sendMenuAction('addFolderToWorkspace') },
        { label: 'New File', accelerator: 'CmdOrCtrl+N', click: () => sendMenuAction('newFile') },
        { type: 'separator' },
        { label: 'Open Workspace', click: () => sendMenuAction('openWorkspacePicker') },
        { label: 'Open File', click: () => sendMenuAction('openFile') },
        { label: 'Open Recent', submenu: recentSubmenu },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', enabled: editorMenuEnabled, click: () => sendMenuAction('saveEditorFile') },
        { label: 'Save As', accelerator: 'CmdOrCtrl+Shift+S', enabled: editorMenuEnabled, click: () => sendMenuAction('saveEditorFileAs') },
        { type: 'separator' },
        { label: 'Close', accelerator: 'CmdOrCtrl+W', click: () => sendMenuAction('closeFocused') },
        { label: 'Close Workspace', click: () => sendMenuAction('closeWorkspace') },
        { type: 'separator' },
        { label: 'Manage Workspaces', click: () => sendMenuAction('manageWorkspaces') },
        { label: 'Exit', role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', role: 'undo' },
        { label: 'Redo', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', role: 'cut' },
        { label: 'Copy', role: 'copy' },
        { label: 'Paste', role: 'paste' },
        { label: 'Find', accelerator: 'CmdOrCtrl+F', click: () => sendMenuAction('findInPage') },
        { label: 'Find in Files', accelerator: 'CmdOrCtrl+Shift+F', click: () => sendMenuAction('findInFiles') },
        { type: 'separator' },
        {
          label: 'Settings',
          submenu: [
            { label: 'Connectivity', click: () => sendMenuAction('openConnectivity') },
            { label: 'Models', click: () => sendMenuAction('openModelSetup') },
            { label: 'Agents', click: () => sendMenuAction('openAgents') },
            { label: 'Orchestrator', click: () => sendMenuAction('openOrchestrator') },
            { label: 'MCP Servers', click: () => sendMenuAction('openMcpServers') },
            { label: 'Diagnostics', click: () => sendMenuAction('openDiagnostics') },
            { label: 'Preferences', click: () => sendMenuAction('openPreferences') },
          ],
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Layout',
          submenu: [
            { label: 'Tile Vertical (V)', click: () => sendMenuAction('layoutVertical') },
            { label: 'Tile Horizontal (H)', click: () => sendMenuAction('layoutHorizontal') },
            { label: 'Tile / Grid', click: () => sendMenuAction('layoutGrid') },
            { type: 'separator' },
            { label: 'Reset Layout', click: () => sendMenuAction('layoutReset') },
            { label: 'Flip Layout', click: () => sendMenuAction('layoutFlip') },
            { label: 'Orchestrator Layout', click: () => sendMenuAction('layoutOrchestrator') },
          ],
        },
        { type: 'separator' },
        {
          label: 'Orchestrator',
          type: 'checkbox',
          checked: viewMenuDockState.orchestrator,
          click: () => sendMenuAction('toggleDockPanel', { panelId: 'orchestrator' }),
        },
        {
          label: 'Workspace Folder',
          type: 'checkbox',
          checked: viewMenuDockState['workspace-folder'],
          click: () => sendMenuAction('toggleDockPanel', { panelId: 'workspace-folder' }),
        },
        {
          label: 'Workspace Settings',
          type: 'checkbox',
          checked: viewMenuDockState['workspace-settings'],
          click: () => sendMenuAction('toggleDockPanel', { panelId: 'workspace-settings' }),
        },
        {
          label: 'Application Settings',
          type: 'checkbox',
          checked: viewMenuDockState['application-settings'],
          click: () => sendMenuAction('toggleDockPanel', { panelId: 'application-settings' }),
        },
        {
          label: 'Source Control',
          type: 'checkbox',
          checked: viewMenuDockState['source-control'],
          click: () => sendMenuAction('toggleDockPanel', { panelId: 'source-control' }),
        },
        {
          label: 'Terminal',
          type: 'checkbox',
          checked: viewMenuDockState.terminal,
          click: () => sendMenuAction('toggleDockPanel', { panelId: 'terminal' }),
        },
        {
          label: 'Debug Output',
          type: 'checkbox',
          checked: viewMenuDockState['debug-output'],
          click: () => sendMenuAction('toggleDockPanel', { panelId: 'debug-output' }),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Reset Zoom', click: () => sendMenuAction('resetZoom') },
        { label: 'Zoom In', click: () => sendMenuAction('zoomIn') },
        { label: 'Zoom Out', click: () => sendMenuAction('zoomOut') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Barnaby',
          click: () => {
            createAboutWindow()
          },
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
