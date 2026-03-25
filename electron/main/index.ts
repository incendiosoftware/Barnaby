import './esmShim'
import { pathToFileURL, fileURLToPath } from 'node:url'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import {
  getMainWindow,
  setMainWindow,
  getSplashWindow,
  setSplashWindow,
  setMainWindowReadyToShow,
  setRendererStartupReady,
  maybeRevealMainWindow,
  createSplashWindow,
  closeSplashWindow,
  readStartupWorkspaceRoot,
  getMainWindowTitle,
  setStartupRevealTimer,
  clearStartupRevealTimer
} from './windowManager'
import {
  appendRuntimeLog,
  setDebugLogWindow,
  getAppStorageDirPath
} from './logger'
import {
  isDirectory,
  migrateLegacyLocalStorageIfNeeded,
} from './storageUtils'
import {
  registerRuntimeDiagnosticsLogging
} from './diagnostics'
import {
  workspaceLockInstanceId,
  ownedWorkspaceLocks,
  releaseAllWorkspaceLocks,
  ensureWorkspaceLockHeartbeatTimer
} from './workspaceManager'
import { setAppMenu, setMenuCreateWindowFn } from './menu'
import { McpServerManager } from './mcpClient'
import { initializePluginHost, shutdownPluginHost, setPluginHostWindow, setWorkspaceRootGetter, notifyPluginPanelEvent, notifyPluginPanelTurnComplete } from './pluginHost'
import { GeminiClient, GeminiClientEvent } from './geminiClient'
import { ClaudeClient, ClaudeClientEvent } from './claudeClient'
import { OpenRouterClient, OpenRouterClientEvent } from './openRouterClient'
import { OpenAIClient, OpenAIClientEvent } from './openaiClient'
import { CodexAppServerClient, FireHarnessCodexEvent } from './codexAppServerClient'
import { getProviderApiKey } from './providerSecrets'
import { STARTUP_SPLASH_TIMEOUT_MS } from './constants'
import type { AgentClient, AgentEvent, ConnectOptions } from './types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Handlers
import { registerChatHandlers } from './ipcHandlers/chat'
import { registerExplorerHandlers } from './ipcHandlers/explorer'
import { registerGitHandlers } from './ipcHandlers/git'
import { registerTerminalHandlers } from './ipcHandlers/terminal'
import { registerProviderHandlers } from './ipcHandlers/provider'
import { registerDiagnosticsHandlers } from './ipcHandlers/diagnostics'
import { registerWorkspaceHandlers } from './ipcHandlers/workspace'
import { registerAgentHandlers } from './ipcHandlers/agent'
import { registerAppHandlers, setCreateWindowFn } from './ipcHandlers/app'
import { registerOrchestratorHandlers } from './ipcHandlers/orchestrator'

// Global State
const agentClients = new Map<string, AgentClient>()
const agentClientCwds = new Map<string, string>()
let currentWindowWorkspaceRoot = ''
let pendingStartupWorkspaceRoot = ''
let editorMenuState = { canSave: false, canClose: false }
let dockPanelMenuState: any = {}
let recentWorkspaces: string[] = []

const mcpServerManager = new McpServerManager()

// Environment
process.env.DIST_ELECTRON = path.join(__dirname, '../')
process.env.DIST = path.join(process.env.DIST_ELECTRON, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const indexHtml = path.join(process.env.DIST, 'index.html')
// Vite production build emits preload as index.mjs (ESM); dev may use index.js
const _preloadDir = path.join(__dirname, '../preload')
const preload = existsSync(path.join(_preloadDir, 'index.mjs'))
  ? path.join(_preloadDir, 'index.mjs')
  : path.join(_preloadDir, 'index.js')

function isBareElectronHostLaunch() {
  if (!process.defaultApp) return false
  const args = process.argv.slice(2)
  return args.length === 0 && !process.env.VITE_DEV_SERVER_URL
}

export function forwardEvent(agentWindowId: string, evt: AgentEvent) {
  const win = getMainWindow()
  win?.webContents.send('agentorchestrator:event', { agentWindowId, evt })
  win?.webContents.send('fireharness:event', { agentWindowId, evt })
  notifyPluginPanelEvent(agentWindowId, evt as any)
  if (evt?.type === 'assistantCompleted') {
    notifyPluginPanelTurnComplete(agentWindowId)
  }
}

export async function getOrCreateClient(agentWindowId: string, options: ConnectOptions): Promise<{ client: AgentClient; result: { threadId: string } }> {
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

export async function createWindow() {
  clearStartupRevealTimer()
  const splashWin = getSplashWindow()
  if (splashWin && !splashWin.isDestroyed()) splashWin.close()
  setSplashWindow(null)

  setMainWindowReadyToShow(false)
  const splash = createSplashWindow()
  setSplashWindow(splash)

  const waitForRendererStartup = Boolean(splash)
  if (!waitForRendererStartup) {
    // skip splash
  } else {
    const timer = setTimeout(() => {
      setRendererStartupReady(true)
      maybeRevealMainWindow()
    }, STARTUP_SPLASH_TIMEOUT_MS)
    setStartupRevealTimer(timer)
  }

  const { width: workAreaWidth, height: workAreaHeight } = screen.getPrimaryDisplay().workAreaSize
  const startupWidth = Math.floor(workAreaWidth / 5)
  const startupHeight = Math.floor(workAreaHeight * 0.9)

  const win = new BrowserWindow({
    title: getMainWindowTitle(currentWindowWorkspaceRoot),
    icon: path.join(process.env.VITE_PUBLIC, process.platform === 'win32' ? 'favicon.ico' : 'appicon.png'),
    show: false,
    width: startupWidth,
    height: startupHeight,
    autoHideMenuBar: false,
    webPreferences: {
      preload,
    },
  })
  setMainWindow(win)

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(indexHtml)
  }

  win.webContents.on('did-finish-load', () => {
    win?.setTitle(getMainWindowTitle(currentWindowWorkspaceRoot))
  })

  win.once('ready-to-show', () => {
    setMainWindowReadyToShow(true)
    maybeRevealMainWindow()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  updateAppMenu()
}

function updateAppMenu() {
  setAppMenu(
    currentWindowWorkspaceRoot,
    editorMenuState,
    dockPanelMenuState,
    recentWorkspaces,
    () => getMainWindow()?.webContents.send('agentorchestrator:menu:saveFile'),
    () => getMainWindow()?.webContents.send('agentorchestrator:menu:saveFileAs'),
    () => getMainWindow()?.webContents.send('agentorchestrator:menu:openFile'),
    () => getMainWindow()?.webContents.send('agentorchestrator:menu:closeFile'),
    (id) => getMainWindow()?.webContents.send('agentorchestrator:menu:togglePanel', id)
  )
}

// IPC Initialization
registerChatHandlers()
registerExplorerHandlers()
registerGitHandlers()
registerTerminalHandlers()
registerProviderHandlers()
registerDiagnosticsHandlers()
registerWorkspaceHandlers(
  () => ({}), // getState placeholder
  (next) => { }, // updateState placeholder
  () => currentWindowWorkspaceRoot,
  (root) => {
    currentWindowWorkspaceRoot = root
    updateAppMenu()
  }
)
registerAgentHandlers(agentClients, getOrCreateClient)
registerAppHandlers((list) => {
  recentWorkspaces = list
  updateAppMenu()
})
registerOrchestratorHandlers()
setCreateWindowFn(() => { createWindow() })
setMenuCreateWindowFn(() => { createWindow() })

// App Lifecycle
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
  const win = getMainWindow()
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

function cleanupOnExit() {
  closeSplashWindow()
  clearStartupRevealTimer()
  releaseAllWorkspaceLocks()
  shutdownPluginHost().catch(() => { })
  for (const client of agentClients.values()) {
    (client as { close: () => Promise<void> }).close().catch(() => { })
  }
  agentClients.clear()
}

app.on('window-all-closed', () => {
  setMainWindow(null)
  setDebugLogWindow(null)
  mcpServerManager.stopAll().catch(() => { })
  cleanupOnExit()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  cleanupOnExit()
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})
