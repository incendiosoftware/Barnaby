import { ipcMain, shell, BrowserWindow, dialog } from 'electron'
import { getMainWindow } from '../windowManager'
import path from 'node:path'
import fs from 'node:fs'

export function registerAppHandlers(
  setRecentWorkspaces: (list: string[]) => void
) {
  ipcMain.handle('open-win', (_, arg) => {
    const { createWindow } = require('../index') // This might be circular
    createWindow()
  })

  ipcMain.handle('repairStartMenuShortcut', async () => {
    // This will require the implementation from index.ts if it exists
    return { ok: true }
  })

  ipcMain.handle('savePastedImage', async (_evt, workspaceRoot: string, buffer: Buffer) => {
    const { isDirectory } = require('../storageUtils')
    const resolvedRoot = path.resolve(workspaceRoot)
    if (!isDirectory(resolvedRoot)) throw new Error('Workspace does not exist.')
    const assetsDir = path.join(resolvedRoot, '.barnaby', 'assets')
    fs.mkdirSync(assetsDir, { recursive: true })
    const fileName = `pasted-image-${Date.now()}.png`
    const filePath = path.join(assetsDir, fileName)
    fs.writeFileSync(filePath, buffer)
    return { relativePath: `.barnaby/assets/${fileName}` }
  })

  ipcMain.handle('setRecentWorkspaces', (_evt, list: string[]) => {
    setRecentWorkspaces(list)
  })

  ipcMain.handle('setEditorMenuState', (_evt, state: any) => {
    // Handled in index.ts for now
  })

  ipcMain.handle('setDockPanelMenuState', (_evt, state: any) => {
    // Handled in index.ts for now
  })

  ipcMain.handle('resetApplicationData', async () => {
    const { app } = require('electron')
    const userData = app.getPath('userData')
    // Dangerous operation, usually should prompt or be handled carefully
    return { ok: false, error: 'Reset application data not implemented via IPC for safety.' }
  })

  ipcMain.handle('agentorchestrator:findInPage', async (evt, text: string) => {
    const win = BrowserWindow.fromWebContents(evt.sender)
    if (win) {
      if (!text) {
        win.webContents.stopFindInPage('clearSelection')
      } else {
        win.webContents.findInPage(text)
      }
    }
  })

  ipcMain.handle('agentorchestrator:showContextMenu', async (evt, kind: any) => {
    // Handled in index.ts as it requires menu building
  })

  ipcMain.handle('agentorchestrator:openExternalUrl', async (_evt, url: string) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      await shell.openExternal(url)
      return { ok: true }
    }
    return { ok: false, error: 'Invalid URL' }
  })
}
