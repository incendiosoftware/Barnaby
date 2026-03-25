import { app, Menu, shell, dialog, BrowserWindow } from 'electron'
import { getReleaseVersion } from './utils'
import {
  revealMainWindow,
  openWorkspaceInNewBarnabyInstance,
  getMainWindow,
  getWindowWorkspaceLabel
} from './windowManager'
import { releaseWorkspaceLock } from './workspaceManager'
import { openAgentHistoryFolder, openRuntimeLogFile } from './diagnostics'

let _createWindow: (() => void) | null = null
export function setMenuCreateWindowFn(fn: () => void) { _createWindow = fn }

export function setAppMenu(
  currentWorkspaceRoot: string,
  editorMenuState: any,
  dockPanelMenuState: any,
  recentWorkspaces: string[],
  onSaveFile: () => void,
  onSaveFileAs: () => void,
  onOpenFile: () => void,
  onCloseFile: () => void,
  onTogglePanel: (id: string) => void
) {
  const version = getReleaseVersion()
  const isMac = process.platform === 'darwin'

  const template: any[] = [
    ...(isMac
      ? [{
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      }]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => {
            _createWindow?.()
          },
        },
        { type: 'separator' },
        {
          label: 'Open File...',
          accelerator: 'CmdOrCtrl+O',
          click: onOpenFile,
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          enabled: editorMenuState.canSave,
          click: onSaveFile,
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          enabled: editorMenuState.canSave,
          click: onSaveFileAs,
        },
        {
          label: 'Close File',
          accelerator: 'CmdOrCtrl+W',
          enabled: editorMenuState.canClose,
          click: onCloseFile,
        },
        { type: 'separator' },
        {
          label: 'Open Workspace...',
          click: async () => {
            const result = await dialog.showOpenDialog(getMainWindow()!, {
              properties: ['openDirectory'],
            })
            if (!result.canceled && result.filePaths.length > 0) {
              openWorkspaceInNewBarnabyInstance(result.filePaths[0])
            }
          },
        },
        {
          label: 'Open Recent',
          submenu: recentWorkspaces.map((wsPath) => ({
            label: getWindowWorkspaceLabel(wsPath),
            click: () => openWorkspaceInNewBarnabyInstance(wsPath),
          })),
        },
        { type: 'separator' },
        {
          label: 'Close Workspace',
          click: () => {
            releaseWorkspaceLock(currentWorkspaceRoot)
            _createWindow?.()
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Orchestrator',
          type: 'checkbox',
          checked: dockPanelMenuState.orchestrator,
          click: () => onTogglePanel('orchestrator'),
        },
        {
          label: 'Workspace Explorer',
          type: 'checkbox',
          checked: dockPanelMenuState['workspace-folder'],
          click: () => onTogglePanel('workspace-folder'),
        },
        {
          label: 'Source Control',
          type: 'checkbox',
          checked: dockPanelMenuState['source-control'],
          click: () => onTogglePanel('source-control'),
        },
        {
          label: 'Terminal',
          type: 'checkbox',
          checked: dockPanelMenuState.terminal,
          click: () => onTogglePanel('terminal'),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
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
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front' }, { type: 'separator' }, { role: 'window' }]
          : [{ role: 'close' }]),
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'View License',
          click: async () => {
            await shell.openExternal('https://barnaby.build/license')
          },
        },
        {
          label: 'Documentation',
          click: async () => {
            await shell.openExternal('https://github.com/stuartemslie/barnaby-app#readme')
          },
        },
        { type: 'separator' },
        {
          label: 'Open Agent History Folder',
          click: () => openAgentHistoryFolder(),
        },
        {
          label: 'Open Runtime Log',
          click: () => openRuntimeLogFile(),
        },
        { type: 'separator' },
        {
          label: `Barnaby v${version}`,
          enabled: false,
        },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
