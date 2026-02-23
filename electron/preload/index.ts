import { ipcRenderer, contextBridge, webFrame, type IpcRendererEvent } from 'electron'

export type FireHarnessCodexEvent =
  | { type: 'status'; status: 'starting' | 'ready' | 'error' | 'closed'; message?: string }
  | { type: 'assistantDelta'; delta: string }
  | { type: 'assistantCompleted' }
  | { type: 'usageUpdated'; usage: unknown }
  | { type: 'planUpdated'; plan: unknown }
  | { type: 'rawNotification'; method: string; params?: unknown }

export type CodexConnectOptions = {
  cwd: string
  model: string
  provider?: 'codex' | 'claude' | 'gemini' | 'openrouter'
  permissionMode?: 'verify-first' | 'proceed-always'
  approvalPolicy?: 'on-request' | 'never'
  sandbox?: 'read-only' | 'workspace-write'
  allowedCommandPrefixes?: string[]
  allowedAutoReadPrefixes?: string[]
  allowedAutoWritePrefixes?: string[]
  deniedAutoReadPrefixes?: string[]
  deniedAutoWritePrefixes?: string[]
  initialHistory?: Array<{ role: 'user' | 'assistant'; text: string }>
}

type WorkspaceTreeNode = {
  name: string
  relativePath: string
  type: 'file' | 'directory'
  children?: WorkspaceTreeNode[]
}

type WorkspaceTreeOptions = {
  includeHidden?: boolean
  includeNodeModules?: boolean
}

type ProviderName = 'codex' | 'claude' | 'gemini' | 'openrouter'
type ProviderAuthStatus = {
  provider: string
  installed: boolean
  authenticated: boolean
  detail: string
  checkedAt: number
}
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

type WorkspaceLockOwner = {
  pid: number
  hostname: string
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
      owner?: WorkspaceLockOwner | null
    }

type ContextMenuKind = 'input-selection' | 'chat-selection'

// --------- Expose a narrow API to the Renderer process ---------
const api = {
  connect(agentWindowId: string, options: CodexConnectOptions) {
    return ipcRenderer.invoke('agentorchestrator:connect', agentWindowId, options) as Promise<{ threadId: string }>
  },
  sendMessage(
    agentWindowId: string,
    text: string,
    imagePaths?: string[],
    priorMessagesForContext?: Array<{ role: string; content: string }>,
  ) {
    return ipcRenderer.invoke('agentorchestrator:sendMessageEx', agentWindowId, {
      text,
      imagePaths: imagePaths ?? [],
      priorMessagesForContext,
    }) as Promise<void>
  },
  loadChatHistory() {
    return ipcRenderer.invoke('agentorchestrator:loadChatHistory') as Promise<unknown[]>
  },
  saveChatHistory(entries: unknown[]) {
    return ipcRenderer.invoke('agentorchestrator:saveChatHistory', entries) as Promise<{
      ok: boolean
      count: number
      path: string
    }>
  },
  loadAppState() {
    return ipcRenderer.invoke('agentorchestrator:loadAppState') as Promise<unknown | null>
  },
  saveAppState(state: unknown) {
    return ipcRenderer.invoke('agentorchestrator:saveAppState', state) as Promise<{
      ok: boolean
      path: string
      savedAt: number
    }>
  },
  setWindowTheme(theme: 'light' | 'dark' | 'system') {
    return ipcRenderer.invoke('agentorchestrator:setWindowTheme', theme) as Promise<{
      ok: boolean
      themeSource: 'light' | 'dark' | 'system'
      shouldUseDarkColors: boolean
    }>
  },
  notifyRendererReady() {
    return ipcRenderer.invoke('agentorchestrator:rendererReady') as Promise<{ ok: boolean }>
  },
  getDiagnosticsInfo() {
    return ipcRenderer.invoke('agentorchestrator:getDiagnosticsInfo') as Promise<{
      userDataPath: string
      storageDir: string
      chatHistoryPath: string
      appStatePath: string
      runtimeLogPath: string
    }>
  },
  openRuntimeLog() {
    return ipcRenderer.invoke('agentorchestrator:openRuntimeLog') as Promise<{
      ok: boolean
      path: string
      error?: string
    }>
  },
  openDiagnosticsPath(target: 'userData' | 'storage' | 'chatHistory' | 'appState' | 'runtimeLog') {
    return ipcRenderer.invoke('agentorchestrator:openDiagnosticsPath', target) as Promise<{
      ok: boolean
      path: string
      error?: string
    }>
  },
  readDiagnosticsFile(target: 'chatHistory' | 'appState' | 'runtimeLog') {
    return ipcRenderer.invoke('agentorchestrator:readDiagnosticsFile', target) as Promise<{
      ok: boolean
      path: string
      content?: string
      writable?: boolean
      error?: string
    }>
  },
  writeDiagnosticsFile(target: 'chatHistory' | 'appState' | 'runtimeLog', content: string) {
    return ipcRenderer.invoke('agentorchestrator:writeDiagnosticsFile', target, content) as Promise<{
      ok: boolean
      path: string
      size?: number
      error?: string
    }>
  },
  openExternalUrl(url: string) {
    return ipcRenderer.invoke('agentorchestrator:openExternalUrl', url) as Promise<{
      ok: boolean
      error?: string
    }>
  },
  interrupt(agentWindowId: string) {
    return ipcRenderer.invoke('agentorchestrator:interrupt', agentWindowId) as Promise<void>
  },
  disconnect(agentWindowId: string) {
    return ipcRenderer.invoke('agentorchestrator:disconnect', agentWindowId) as Promise<void>
  },
  openFolderDialog() {
    return ipcRenderer.invoke('agentorchestrator:openFolderDialog') as Promise<string | null>
  },
  openTerminalInWorkspace(workspaceRoot: string) {
    return ipcRenderer.invoke('agentorchestrator:openTerminalInWorkspace', workspaceRoot) as Promise<{
      ok: boolean
      error?: string
    }>
  },
  terminalSpawn(cwd: string) {
    return ipcRenderer.invoke('agentorchestrator:terminalSpawn', cwd) as Promise<{ ok: boolean; error?: string }>
  },
  terminalWrite(data: string) {
    ipcRenderer.send('agentorchestrator:terminalWrite', data)
  },
  terminalResize(cols: number, rows: number) {
    ipcRenderer.invoke('agentorchestrator:terminalResize', cols, rows)
  },
  terminalDestroy() {
    return ipcRenderer.invoke('agentorchestrator:terminalDestroy') as Promise<void>
  },
  onTerminalData(cb: (data: string) => void) {
    const listener = (_evt: IpcRendererEvent, data: string) => cb(data)
    ipcRenderer.on('agentorchestrator:terminalData', listener)
    return () => ipcRenderer.off('agentorchestrator:terminalData', listener)
  },
  onTerminalExit(cb: () => void) {
    const listener = () => cb()
    ipcRenderer.on('agentorchestrator:terminalExit', listener)
    return () => ipcRenderer.off('agentorchestrator:terminalExit', listener)
  },
  writeWorkspaceConfig(folderPath: string) {
    return ipcRenderer.invoke('agentorchestrator:writeWorkspaceConfig', folderPath) as Promise<boolean>
  },
  claimWorkspace(workspaceRoot: string) {
    return ipcRenderer.invoke('agentorchestrator:claimWorkspace', workspaceRoot) as Promise<WorkspaceLockAcquireResult>
  },
  releaseWorkspace(workspaceRoot: string) {
    return ipcRenderer.invoke('agentorchestrator:releaseWorkspace', workspaceRoot) as Promise<boolean>
  },
  savePastedImage(dataUrl: string, mimeType?: string) {
    return ipcRenderer.invoke('agentorchestrator:savePastedImage', dataUrl, mimeType) as Promise<{
      path: string
      mimeType: string
    }>
  },
  listWorkspaceTree(workspaceRoot: string, options?: WorkspaceTreeOptions) {
    return ipcRenderer.invoke('agentorchestrator:listWorkspaceTree', workspaceRoot, options) as Promise<{
      nodes: WorkspaceTreeNode[]
      truncated: boolean
    }>
  },
  readWorkspaceFile(workspaceRoot: string, relativePath: string) {
    return ipcRenderer.invoke('agentorchestrator:readWorkspaceFile', workspaceRoot, relativePath) as Promise<{
      relativePath: string
      size: number
      truncated: boolean
      binary: boolean
      content: string
    }>
  },
  readWorkspaceTextFile(workspaceRoot: string, relativePath: string) {
    return ipcRenderer.invoke('agentorchestrator:readWorkspaceTextFile', workspaceRoot, relativePath) as Promise<{
      relativePath: string
      size: number
      binary: boolean
      content: string
    }>
  },
  writeWorkspaceFile(workspaceRoot: string, relativePath: string, content: string) {
    return ipcRenderer.invoke('agentorchestrator:writeWorkspaceFile', workspaceRoot, relativePath, content) as Promise<{
      relativePath: string
      size: number
    }>
  },
  pickWorkspaceSavePath(workspaceRoot: string, relativePath: string) {
    return ipcRenderer.invoke('agentorchestrator:pickWorkspaceSavePath', workspaceRoot, relativePath) as Promise<string | null>
  },
  pickWorkspaceOpenPath(workspaceRoot: string) {
    return ipcRenderer.invoke('agentorchestrator:pickWorkspaceOpenPath', workspaceRoot) as Promise<string | null>
  },
  getGitStatus(workspaceRoot: string) {
    return ipcRenderer.invoke('agentorchestrator:getGitStatus', workspaceRoot) as Promise<{
      ok: boolean
      branch: string
      ahead: number
      behind: number
      stagedCount: number
      unstagedCount: number
      untrackedCount: number
      clean: boolean
      entries: Array<{
        relativePath: string
        indexStatus: string
        workingTreeStatus: string
        staged: boolean
        unstaged: boolean
        untracked: boolean
        renamedFrom?: string
      }>
      checkedAt: number
      error?: string
    }>
  },
  gitCommit(workspaceRoot: string, selectedPaths?: string[]) {
    return ipcRenderer.invoke('agentorchestrator:gitCommit', workspaceRoot, selectedPaths) as Promise<{ ok: boolean; error?: string }>
  },
  gitPush(workspaceRoot: string, selectedPaths?: string[]) {
    return ipcRenderer.invoke('agentorchestrator:gitPush', workspaceRoot, selectedPaths) as Promise<{ ok: boolean; error?: string }>
  },
  gitDeploy(workspaceRoot: string, selectedPaths?: string[]) {
    return ipcRenderer.invoke('agentorchestrator:gitDeploy', workspaceRoot, selectedPaths) as Promise<{ ok: boolean; error?: string }>
  },
  gitBuild(workspaceRoot: string, selectedPaths?: string[]) {
    return ipcRenderer.invoke('agentorchestrator:gitBuild', workspaceRoot, selectedPaths) as Promise<{ ok: boolean; error?: string }>
  },
  gitRelease(workspaceRoot: string, selectedPaths?: string[]) {
    return ipcRenderer.invoke('agentorchestrator:gitRelease', workspaceRoot, selectedPaths) as Promise<{ ok: boolean; error?: string }>
  },
  setRecentWorkspaces(list: string[]) {
    ipcRenderer.send('agentorchestrator:setRecentWorkspaces', list)
  },
  setEditorMenuState(enabled: boolean) {
    ipcRenderer.send('agentorchestrator:setEditorMenuState', Boolean(enabled))
  },
  findInPage(text: string) {
    return ipcRenderer.invoke('agentorchestrator:findInPage', text) as Promise<void>
  },
  showContextMenu(kind: ContextMenuKind) {
    return ipcRenderer.invoke('agentorchestrator:showContextMenu', kind) as Promise<{ ok: boolean }>
  },
  getProviderAuthStatus(config: ProviderConfigForAuth) {
    return ipcRenderer.invoke('agentorchestrator:getProviderAuthStatus', config) as Promise<ProviderAuthStatus>
  },
  startProviderLogin(config: ProviderConfigForAuth) {
    return ipcRenderer.invoke('agentorchestrator:startProviderLogin', config) as Promise<{ started: boolean; detail: string }>
  },
  upgradeProviderCli(config: ProviderConfigForAuth) {
    return ipcRenderer.invoke('agentorchestrator:upgradeProviderCli', config) as Promise<{ started: boolean; detail: string }>
  },
  setProviderApiKey(providerId: string, apiKey: string) {
    return ipcRenderer.invoke('agentorchestrator:setProviderApiKey', providerId, apiKey) as Promise<{ ok: boolean; hasKey: boolean }>
  },
  getProviderApiKeyState(providerId: string) {
    return ipcRenderer.invoke('agentorchestrator:getProviderApiKeyState', providerId) as Promise<{ hasKey: boolean }>
  },
  importProviderApiKeyFromEnv(providerId: string) {
    return ipcRenderer.invoke('agentorchestrator:importProviderApiKeyFromEnv', providerId) as Promise<{
      ok: boolean
      hasKey: boolean
      imported: boolean
      detail: string
    }>
  },
  resetApplicationData() {
    return ipcRenderer.invoke('agentorchestrator:resetApplicationData') as Promise<void>
  },
  getGeminiAvailableModels() {
    return ipcRenderer.invoke('agentorchestrator:getGeminiAvailableModels') as Promise<{ id: string; displayName: string }[]>
  },
  getAvailableModels() {
    return ipcRenderer.invoke('agentorchestrator:getAvailableModels') as Promise<{
      codex: { id: string; displayName: string }[]
      claude: { id: string; displayName: string }[]
      gemini: { id: string; displayName: string }[]
      openrouter: { id: string; displayName: string }[]
    }>
  },
  onEvent(cb: (payload: { agentWindowId: string; evt: FireHarnessCodexEvent }) => void) {
    const listener = (_event: IpcRendererEvent, payload: { agentWindowId: string; evt: FireHarnessCodexEvent }) => cb(payload)
    ipcRenderer.on('agentorchestrator:event', listener)
    return () => ipcRenderer.off('agentorchestrator:event', listener)
  },
  onMenu(cb: (payload: { action: string; path?: string }) => void) {
    const listener = (_event: IpcRendererEvent, payload: { action: string; path?: string }) => cb(payload)
    ipcRenderer.on('agentorchestrator:menu', listener)
    return () => ipcRenderer.off('agentorchestrator:menu', listener)
  },
  onPluginHostRequest(cb: (payload: { channel: string; responseChannel: string; args: unknown[] }) => void) {
    const listener = (_event: IpcRendererEvent, payload: { channel: string; responseChannel: string; args: unknown[] }) => cb(payload)
    ipcRenderer.on('barnaby:plugin-host:request', listener)
    return () => ipcRenderer.off('barnaby:plugin-host:request', listener)
  },
  pluginHostRespond(responseChannel: string, result: { ok: boolean; data?: unknown; error?: string }) {
    return ipcRenderer.invoke(responseChannel, result) as Promise<void>
  },
  onPluginHostRecovery(cb: (payload: { pluginId: string; recoveryPrompt: string; stateFilePath: string; staleness: number }) => void) {
    const listener = (_event: IpcRendererEvent, payload: { pluginId: string; recoveryPrompt: string; stateFilePath: string; staleness: number }) => cb(payload)
    ipcRenderer.on('barnaby:plugin-host:recovery', listener)
    return () => ipcRenderer.off('barnaby:plugin-host:recovery', listener)
  },
  zoomIn() {
    const level = webFrame.getZoomLevel()
    webFrame.setZoomLevel(level + 1)
  },
  zoomOut() {
    const level = webFrame.getZoomLevel()
    webFrame.setZoomLevel(level - 1)
  },
  resetZoom() {
    webFrame.setZoomLevel(0)
  },
  getZoomLevel() {
    return webFrame.getZoomLevel()
  },
} as const

contextBridge.exposeInMainWorld('agentOrchestrator', api)
// Back-compat alias (older renderer code).
contextBridge.exposeInMainWorld('fireharness', api)

// --------- Preload scripts loading ---------
function domReady(condition: DocumentReadyState[] = ['complete', 'interactive']) {
  return new Promise(resolve => {
    if (condition.includes(document.readyState)) {
      resolve(true)
    } else {
      document.addEventListener('readystatechange', () => {
        if (condition.includes(document.readyState)) {
          resolve(true)
        }
      })
    }
  })
}

const safeDOM = {
  append(parent: HTMLElement, child: HTMLElement) {
    if (!Array.from(parent.children).find(e => e === child)) {
      return parent.appendChild(child)
    }
  },
  remove(parent: HTMLElement, child: HTMLElement) {
    if (Array.from(parent.children).find(e => e === child)) {
      return parent.removeChild(child)
    }
  },
}

/**
 * https://tobiasahlin.com/spinkit
 * https://connoratherton.com/loaders
 * https://projects.lukehaas.me/css-loaders
 * https://matejkustec.github.io/SpinThatShit
 */
function useLoading() {
  const className = `loaders-css__square-spin`
  const styleContent = `
@keyframes square-spin {
  25% { transform: perspective(100px) rotateX(180deg) rotateY(0); }
  50% { transform: perspective(100px) rotateX(180deg) rotateY(180deg); }
  75% { transform: perspective(100px) rotateX(0) rotateY(180deg); }
  100% { transform: perspective(100px) rotateX(0) rotateY(0); }
}
.${className} > div {
  animation-fill-mode: both;
  width: 50px;
  height: 50px;
  background: #fff;
  animation: square-spin 3s 0s cubic-bezier(0.09, 0.57, 0.49, 0.9) infinite;
}
.app-loading-wrap {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #282c34;
  z-index: 9;
}
    `
  const oStyle = document.createElement('style')
  const oDiv = document.createElement('div')

  oStyle.id = 'app-loading-style'
  oStyle.innerHTML = styleContent
  oDiv.className = 'app-loading-wrap'
  oDiv.innerHTML = `<div class="${className}"><div></div></div>`

  return {
    appendLoading() {
      safeDOM.append(document.head, oStyle)
      safeDOM.append(document.body, oDiv)
    },
    removeLoading() {
      safeDOM.remove(document.head, oStyle)
      safeDOM.remove(document.body, oDiv)
    },
  }
}

// ----------------------------------------------------------------------

const { appendLoading, removeLoading } = useLoading()
domReady().then(appendLoading)

window.onmessage = (ev) => {
  ev.data.payload === 'removeLoading' && removeLoading()
}

setTimeout(removeLoading, 4999)
