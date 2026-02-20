import { app, BrowserWindow, shell, ipcMain, Menu, dialog } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { CodexAppServerClient, type CodexConnectOptions, type FireHarnessCodexEvent } from './codexAppServerClient'
import { GeminiClient, type GeminiClientEvent } from './geminiClient'

const WORKSPACE_CONFIG_FILENAME = '.agentorchestrator.json'
const MAX_EXPLORER_NODES = 2500
const MAX_FILE_PREVIEW_BYTES = 1024 * 1024
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

type ConnectOptions = CodexConnectOptions & {
  provider?: 'codex' | 'gemini'
  modelConfig?: Record<string, string>
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

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
let recentWorkspaces: string[] = []
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

const agentClients = new Map<string, AgentClient>()

function normalizeRelativePath(p: string) {
  return p.replace(/\\/g, '/')
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
    const apiKey = options.modelConfig?.apiKey ?? ''
    const client = new GeminiClient()
    client.on('event', (evt: GeminiClientEvent) => forwardEvent(agentWindowId, evt))
    const result = await client.connect({ model: options.model, apiKey }) as { threadId: string }
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
  win = new BrowserWindow({
    title: 'Agent Orchestrator',
    icon: path.join(process.env.VITE_PUBLIC, 'appicon.png'),
    show: false,
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

  // Maximize on start (then show) to feel IDE-like.
  win.once('ready-to-show', () => {
    try {
      win?.maximize()
    } finally {
      win?.show()
    }
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  setAppMenu()
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  win = null
  for (const client of agentClients.values()) {
    (client as { close: () => Promise<void> }).close().catch(() => {})
  }
  agentClients.clear()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  for (const client of agentClients.values()) {
    (client as { close: () => Promise<void> }).close().catch(() => {})
  }
  agentClients.clear()
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
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

ipcMain.handle('agentorchestrator:listWorkspaceTree', async (_evt, workspaceRoot: string, options?: WorkspaceTreeOptions) => {
  return readWorkspaceTree(workspaceRoot, options)
})

ipcMain.handle('agentorchestrator:readWorkspaceFile', async (_evt, workspaceRoot: string, relativePath: string) => {
  return readWorkspaceFile(workspaceRoot, relativePath)
})

ipcMain.handle('agentorchestrator:getGitStatus', async (_evt, workspaceRoot: string) => {
  return getGitStatus(workspaceRoot)
})

ipcMain.on('agentorchestrator:setRecentWorkspaces', (_evt, list: string[]) => {
  recentWorkspaces = Array.isArray(list) ? list : []
  setAppMenu()
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
        { label: 'Model setup...', click: () => sendMenuAction('openModelSetup') },
      ],
    },
    {
      label: 'Layout',
      submenu: [
        { label: 'Split Vertical (V)', click: () => sendMenuAction('layoutVertical') },
        { label: 'Split Horizontal (H)', click: () => sendMenuAction('layoutHorizontal') },
        { label: 'Tile / Grid', click: () => sendMenuAction('layoutGrid') },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Agent Orchestrator',
          click: () => {
            const parent = win ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
            const opts: Electron.MessageBoxOptions = {
              type: 'info',
              title: 'About Agent Orchestrator',
              icon: path.join(process.env.VITE_PUBLIC, 'appicon.png'),
              message: 'Agent Orchestrator',
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
