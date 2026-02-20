import { ipcRenderer, contextBridge, type IpcRendererEvent } from 'electron'

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
  provider?: 'codex' | 'gemini'
  permissionMode?: 'verify-first' | 'proceed-always'
  approvalPolicy?: 'on-request' | 'never'
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access'
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

// --------- Expose a narrow API to the Renderer process ---------
const api = {
  connect(agentWindowId: string, options: CodexConnectOptions) {
    return ipcRenderer.invoke('agentorchestrator:connect', agentWindowId, options) as Promise<{ threadId: string }>
  },
  sendMessage(agentWindowId: string, text: string) {
    return ipcRenderer.invoke('agentorchestrator:sendMessage', agentWindowId, text) as Promise<void>
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
  writeWorkspaceConfig(folderPath: string) {
    return ipcRenderer.invoke('agentorchestrator:writeWorkspaceConfig', folderPath) as Promise<boolean>
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
  setRecentWorkspaces(list: string[]) {
    ipcRenderer.send('agentorchestrator:setRecentWorkspaces', list)
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
