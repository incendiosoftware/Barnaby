import { ipcMain, dialog, BrowserWindow } from 'electron'
import path from 'node:path'
import {
  readWorkspaceTree,
  readWorkspaceFile,
  readWorkspaceTextFile,
  writeWorkspaceFile,
  openWorkspacePathInExplorer,
  deleteWorkspaceFile,
  pickWorkspaceSavePath,
  pickWorkspaceOpenPath
} from '../explorerManager'
import { getMainWindow } from '../windowManager'
import type { WorkspaceTreeOptions } from '../types'

export function registerExplorerHandlers() {
  ipcMain.handle('agentorchestrator:browseMarkdownFile', async () => {
    const win = getMainWindow()
    const parent = BrowserWindow.getFocusedWindow() ?? win ?? BrowserWindow.getAllWindows()[0] ?? undefined
    const result = await dialog.showOpenDialog(parent, {
      title: 'Select a Markdown file',
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('agentorchestrator:openFolderDialog', async (_evt, defaultPath?: string) => {
    const win = getMainWindow()
    const parent = BrowserWindow.getFocusedWindow() ?? win ?? BrowserWindow.getAllWindows()[0] ?? undefined
    const result = await dialog.showOpenDialog(parent, {
      title: 'Select a folder',
      defaultPath: typeof defaultPath === 'string' && defaultPath.trim() ? path.resolve(defaultPath.trim()) : undefined,
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
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
}
