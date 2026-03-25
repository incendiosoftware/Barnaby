/**
 * Barnaby Plugin Host – main-process runtime.
 *
 * Discovers, loads, and manages plugin lifecycles. Forwards plugin API
 * calls to the renderer process via IPC so plugins can control panels
 * and interact with the workspace.
 */
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import { app, ipcMain, shell, BrowserWindow } from 'electron'
import type {
  BarnabyPlugin,
  BarnabyPluginHostApi,
  PluginLifecycleConfig,
  PluginId,
  PanelCreateOptions,
  PanelInfo,
  PanelMessage,
  AgentEvent,
  Disposable,
  WorkspaceFileInfo,
  WorkspaceTreeNode,
  DockPaneProps,
} from './pluginHostTypes'
import { readOrchestratorSecrets, readOrchestratorSettings } from './orchestratorStorage'

const PLUGIN_HEARTBEAT_CHECK_INTERVAL_MS = 10_000
const PLUGIN_STALE_GRACE_PERIOD_MS = 5_000

type PluginEntry = {
  plugin: BarnabyPlugin
  lifecycleConfig: PluginLifecycleConfig | null
  active: boolean
}

let mainWindow: BrowserWindow | null = null
const loadedPlugins = new Map<PluginId, PluginEntry>()
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let workspaceRootGetter: (() => string) | null = null
let appStorageDirGetter: (() => string) | null = null

const panelEventHandlers = new Map<string, Set<(evt: AgentEvent) => void>>()
const anyPanelEventHandlers = new Set<(panelId: string, evt: AgentEvent) => void>()
const panelTurnCompleteHandlers = new Map<string, Set<() => void>>()

export function setPluginHostWindow(win: BrowserWindow | null) {
  mainWindow = win
}

export function setWorkspaceRootGetter(getter: () => string) {
  workspaceRootGetter = getter
}

function sendToRenderer(channel: string, ...args: unknown[]) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(channel, ...args)
}

function invokeRenderer<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      reject(new Error('No renderer window available'))
      return
    }
    const responseChannel = `${channel}:response:${Date.now()}-${Math.random().toString(16).slice(2)}`
    const timeout = setTimeout(() => {
      ipcMain.removeHandler(responseChannel)
      reject(new Error(`Plugin host IPC timeout on ${channel}`))
    }, 30_000)
    ipcMain.handleOnce(responseChannel, (_evt, result: { ok: boolean; data?: T; error?: string }) => {
      clearTimeout(timeout)
      if (result.ok) resolve(result.data as T)
      else reject(new Error(result.error ?? 'Unknown renderer error'))
    })
    sendToRenderer('barnaby:plugin-host:request', { channel, responseChannel, args })
  })
}

function buildHostApi(): BarnabyPluginHostApi {
  return {
    async createPanel(options?: PanelCreateOptions): Promise<string> {
      return invokeRenderer<string>('plugin:createPanel', options ?? {})
    },

    async closePanel(panelId: string): Promise<void> {
      return invokeRenderer<void>('plugin:closePanel', panelId)
    },

    async sendMessage(panelId: string, message: string, attachments?: string[]): Promise<void> {
      return invokeRenderer<void>('plugin:sendMessage', panelId, message, attachments ?? [])
    },

    async interruptPanel(panelId: string): Promise<void> {
      return invokeRenderer<void>('plugin:interruptPanel', panelId)
    },

    async getPanelInfo(panelId: string): Promise<PanelInfo | null> {
      return invokeRenderer<PanelInfo | null>('plugin:getPanelInfo', panelId)
    },

    async getPanelMessages(panelId: string): Promise<PanelMessage[]> {
      return invokeRenderer<PanelMessage[]>('plugin:getPanelMessages', panelId)
    },

    async listPanels(): Promise<PanelInfo[]> {
      return invokeRenderer<PanelInfo[]>('plugin:listPanels')
    },

    onPanelEvent(panelId: string, handler: (evt: AgentEvent) => void): Disposable {
      if (!panelEventHandlers.has(panelId)) panelEventHandlers.set(panelId, new Set())
      panelEventHandlers.get(panelId)!.add(handler)
      return {
        dispose() {
          panelEventHandlers.get(panelId)?.delete(handler)
        },
      }
    },

    onAnyPanelEvent(handler: (panelId: string, evt: AgentEvent) => void): Disposable {
      anyPanelEventHandlers.add(handler)
      return {
        dispose() {
          anyPanelEventHandlers.delete(handler)
        },
      }
    },

    onPanelTurnComplete(panelId: string, handler: () => void): Disposable {
      if (!panelTurnCompleteHandlers.has(panelId)) panelTurnCompleteHandlers.set(panelId, new Set())
      panelTurnCompleteHandlers.get(panelId)!.add(handler)
      return {
        dispose() {
          panelTurnCompleteHandlers.get(panelId)?.delete(handler)
        },
      }
    },

    async readFile(relativePath: string): Promise<WorkspaceFileInfo> {
      const root = workspaceRootGetter?.() ?? ''
      if (!root) throw new Error('No workspace root set')
      const fullPath = path.join(root, relativePath)
      const stat = fs.statSync(fullPath)
      const content = fs.readFileSync(fullPath, 'utf-8')
      return { relativePath, size: stat.size, content }
    },

    async writeFile(relativePath: string, content: string): Promise<{ relativePath: string; size: number }> {
      const root = workspaceRootGetter?.() ?? ''
      if (!root) throw new Error('No workspace root set')
      const fullPath = path.join(root, relativePath)
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, content, 'utf-8')
      const stat = fs.statSync(fullPath)
      return { relativePath, size: stat.size }
    },

    async listFiles(options?: { includeHidden?: boolean }): Promise<{ nodes: WorkspaceTreeNode[]; truncated: boolean }> {
      return invokeRenderer<{ nodes: WorkspaceTreeNode[]; truncated: boolean }>('plugin:listFiles', options ?? {})
    },

    getWorkspaceRoot(): string {
      return workspaceRootGetter?.() ?? ''
    },

    registerDockPane(_pluginId: PluginId, _render: (props: DockPaneProps) => any): void {
      sendToRenderer('barnaby:plugin-host:dock-pane-registered', { pluginId: _pluginId })
    },

    getSetting(key: string): unknown {
      const appStorageDir = appStorageDirGetter?.()
      if (appStorageDir) {
        const appSettings = readOrchestratorSettings(() => appStorageDir)
        const appKeyMap: Record<string, keyof typeof appSettings> = {
          'orchestrator.orchestratorModel': 'orchestratorModel',
          'orchestrator.workerProvider': 'workerProvider',
          'orchestrator.workerModel': 'workerModel',
          'orchestrator.maxParallelPanels': 'maxParallelPanels',
          'orchestrator.maxTaskAttempts': 'maxTaskAttempts',
          'orchestrator.orchestratorPool': 'orchestratorPool',
          'orchestrator.workerPool': 'workerPool',
          'orchestrator.comparativeReviewerAId': 'comparativeReviewerAId',
          'orchestrator.comparativeReviewerBId': 'comparativeReviewerBId',
        }
        const appKey = appKeyMap[key]
        if (appKey && appSettings[appKey] !== undefined) return appSettings[appKey]
      }
      try {
        const root = workspaceRootGetter?.() ?? ''
        if (!root) return undefined
        const configPath = path.join(root, '.barnaby', 'plugin-settings.json')
        if (!fs.existsSync(configPath)) return undefined
        const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        return data[key]
      } catch {
        return undefined
      }
    },

    setSetting(key: string, value: unknown): void {
      try {
        const root = workspaceRootGetter?.() ?? ''
        if (!root) return
        const configDir = path.join(root, '.barnaby')
        const configPath = path.join(configDir, 'plugin-settings.json')
        fs.mkdirSync(configDir, { recursive: true })
        let data: Record<string, unknown> = {}
        try {
          data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        } catch { /* fresh file */ }
        data[key] = value
        fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8')
      } catch {
        // best-effort
      }
    },

    getOrchestratorLicenseKeyState(): { hasKey: boolean } {
      const appStorageDir = appStorageDirGetter?.()
      if (!appStorageDir) return { hasKey: false }
      const secrets = readOrchestratorSecrets(() => appStorageDir)
      const key = (secrets.licenseKey ?? '').trim()
      return { hasKey: key.length > 0 }
    },

    log(pluginId: PluginId, level: 'info' | 'warn' | 'error', message: string): void {
      const prefix = `[plugin:${pluginId}]`
      if (level === 'error') console.error(prefix, message)
      else if (level === 'warn') console.warn(prefix, message)
      else console.log(prefix, message)
    },
  }
}

export function notifyPluginPanelEvent(panelId: string, evt: AgentEvent) {
  const handlers = panelEventHandlers.get(panelId)
  if (handlers) {
    for (const h of handlers) {
      try { h(evt) } catch (e) { console.error('[pluginHost] panel event handler error:', e) }
    }
  }
  for (const h of anyPanelEventHandlers) {
    try { h(panelId, evt) } catch (e) { console.error('[pluginHost] anyPanel event handler error:', e) }
  }
}

export function notifyPluginPanelTurnComplete(panelId: string) {
  const handlers = panelTurnCompleteHandlers.get(panelId)
  if (handlers) {
    for (const h of handlers) {
      try { h() } catch (e) { console.error('[pluginHost] turn complete handler error:', e) }
    }
  }
}

function discoverPlugins(appRoot: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const seenPackageNames = new Set<string>()

  const addPluginPath = (pluginPath: string, packageName?: string) => {
    const normalized = path.resolve(pluginPath)
    if (seen.has(normalized)) return
    seen.add(normalized)
    if (packageName) seenPackageNames.add(packageName)
    found.push(normalized)
  }

  const tryAddPluginPackage = (pluginPath: string) => {
    const pkgJsonPath = path.join(pluginPath, 'package.json')
    if (!fs.existsSync(pkgJsonPath)) return
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))
      const entryFile = pkg.main ?? 'index.js'
      const entryPath = path.join(pluginPath, entryFile)
      const packageName = typeof pkg.name === 'string' ? pkg.name : undefined
      if (packageName && seenPackageNames.has(packageName)) return
      if (pkg.barnaby?.plugin === true && fs.existsSync(entryPath)) {
        addPluginPath(pluginPath, packageName)
      }
    } catch {
      // skip malformed package
    }
  }

  const discoverNodeModulesPlugins = (nodeModulesPath: string) => {
    if (!fs.existsSync(nodeModulesPath)) return
    try {
      const entries = fs.readdirSync(nodeModulesPath, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
        const entryPath = path.join(nodeModulesPath, entry.name)
        if (entry.name.startsWith('@')) {
          try {
            const scopedEntries = fs.readdirSync(entryPath, { withFileTypes: true })
            for (const scopedEntry of scopedEntries) {
              if (!scopedEntry.isDirectory() && !scopedEntry.isSymbolicLink()) continue
              tryAddPluginPackage(path.join(entryPath, scopedEntry.name))
            }
          } catch {
            // skip unreadable scope directory
          }
          continue
        }
        tryAddPluginPackage(entryPath)
      }
    } catch {
      // skip unreadable node_modules directory
    }
  }

  const homePluginDir = path.join(os.homedir(), '.barnaby', 'plugins')
  if (fs.existsSync(homePluginDir)) {
    try {
      const entries = fs.readdirSync(homePluginDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
        if (entry.name === 'node_modules') continue
        tryAddPluginPackage(path.join(homePluginDir, entry.name))
      }
    } catch {
      // not readable
    }

    discoverNodeModulesPlugins(path.join(homePluginDir, 'node_modules'))
  }

  return found
}

export async function initializePluginHost(appRoot: string, getAppStorageDirPath?: () => string): Promise<void> {
  appStorageDirGetter = getAppStorageDirPath ?? null
  console.log(`[pluginHost] Initializing plugin host (appRoot: ${appRoot})`)
  const pluginPaths = discoverPlugins(appRoot)
  console.log(`[pluginHost] Discovered ${pluginPaths.length} plugin(s): ${pluginPaths.join(', ') || '(none)'}`)
  const hostApi = buildHostApi()

  for (const pluginPath of pluginPaths) {
    try {
      const pkgJson = JSON.parse(fs.readFileSync(path.join(pluginPath, 'package.json'), 'utf-8'))
      const entryFile = pkgJson.main ?? 'index.js'
      const entryPath = path.resolve(pluginPath, entryFile)
      const pluginModule = await import(pathToFileURL(entryPath).href)
      const plugin: BarnabyPlugin = pluginModule.default ?? pluginModule
      if (!plugin.pluginId || typeof plugin.activate !== 'function') {
        console.warn(`[pluginHost] Skipping invalid plugin at ${pluginPath}`)
        continue
      }
      if (loadedPlugins.has(plugin.pluginId)) {
        console.warn(`[pluginHost] Duplicate plugin ID "${plugin.pluginId}" at ${pluginPath}, skipping`)
        continue
      }
      await plugin.activate(hostApi)
      const lifecycleConfig = plugin.getLifecycleConfig?.() ?? null
      loadedPlugins.set(plugin.pluginId, { plugin, lifecycleConfig, active: true })
      console.log(`[pluginHost] Activated plugin: ${plugin.displayName} v${plugin.version}`)
    } catch (e) {
      console.error(`[pluginHost] Failed to load plugin at ${pluginPath}:`, e)
    }
  }

  startHeartbeatMonitor()
}

function startHeartbeatMonitor() {
  if (heartbeatTimer) return

  heartbeatTimer = setInterval(() => {
    for (const [pluginId, entry] of loadedPlugins) {
      if (!entry.active || !entry.lifecycleConfig) continue

      const config = entry.lifecycleConfig
      try {
        if (!fs.existsSync(config.stateFilePath)) continue
        const stateRaw = fs.readFileSync(config.stateFilePath, 'utf-8')
        const state = JSON.parse(stateRaw)
        const heartbeat = state[config.heartbeatField]
        if (typeof heartbeat !== 'number' || !Number.isFinite(heartbeat)) continue

        const staleness = Date.now() - heartbeat
        if (staleness > config.staleThresholdMs + PLUGIN_STALE_GRACE_PERIOD_MS) {
          console.warn(`[pluginHost] Plugin "${pluginId}" heartbeat is stale (${Math.round(staleness / 1000)}s). Sending recovery signal.`)
          sendToRenderer('barnaby:plugin-host:recovery', {
            pluginId,
            recoveryPrompt: config.recoveryPrompt,
            stateFilePath: config.stateFilePath,
            staleness,
          })
        }
      } catch {
        // state file not readable or not JSON; skip
      }
    }
  }, PLUGIN_HEARTBEAT_CHECK_INTERVAL_MS)

  if (typeof heartbeatTimer.unref === 'function') {
    heartbeatTimer.unref()
  }
}

export async function shutdownPluginHost(): Promise<void> {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }

  for (const [pluginId, entry] of loadedPlugins) {
    if (!entry.active) continue
    try {
      await entry.plugin.deactivate?.()
      entry.active = false
      console.log(`[pluginHost] Deactivated plugin: ${pluginId}`)
    } catch (e) {
      console.error(`[pluginHost] Error deactivating plugin "${pluginId}":`, e)
    }
  }
  loadedPlugins.clear()
  panelEventHandlers.clear()
  anyPanelEventHandlers.clear()
  panelTurnCompleteHandlers.clear()
}

export function getLoadedPlugins() {
  return Array.from(loadedPlugins.values()).map((entry) => ({
    pluginId: entry.plugin.pluginId,
    displayName: entry.plugin.displayName,
    version: entry.plugin.version,
    active: entry.active,
  }))
}

export async function openPluginsFolder() {
  const homePluginDir = path.join(os.homedir(), '.barnaby', 'plugins')
  fs.mkdirSync(homePluginDir, { recursive: true })
  return shell.openPath(homePluginDir)
}

export async function reloadLocalPlugins() {
  const appRoot = app.getAppPath()
  await shutdownPluginHost()
  await initializePluginHost(appRoot, appStorageDirGetter ?? undefined)
  return { ok: true, count: loadedPlugins.size }
}
