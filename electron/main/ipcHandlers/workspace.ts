import { ipcMain, nativeTheme } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import {
  upsertWorkspaceBundleFolder,
  acquireWorkspaceLock,
  releaseWorkspaceLock,
  forceClaimWorkspace,
  syncWorkspaceBundleFromState,
  withWorkspaceBundleSelection,
  resolveWorkspaceRootFromAnyPath,
  sanitizeWorkspaceConfigSettings
} from '../workspaceManager'
import { readPersistedAppState, writePersistedAppState, isDirectory } from '../storageUtils'
import { getMainWindow, getMainWindowTitle, openWorkspaceInNewBarnabyInstance, setRendererStartupReady, maybeRevealMainWindow } from '../windowManager'
import { WORKSPACE_CONFIG_FILENAME } from '../constants'

export function registerWorkspaceHandlers(
  getState: () => any,
  updateState: (next: any) => void,
  getCurrentRoot: () => string,
  setCurrentRoot: (root: string) => void
) {
  ipcMain.handle('agentorchestrator:loadAppState', async () => {
    const raw = readPersistedAppState()
    return withWorkspaceBundleSelection(raw, getCurrentRoot())
  })

  ipcMain.handle('agentorchestrator:saveAppState', async (_evt, state: any) => {
    updateState(state)
    const result = writePersistedAppState(state)
    syncWorkspaceBundleFromState(state)
    return result
  })

  ipcMain.handle('agentorchestrator:setWindowTheme', (_evt, theme: 'dark' | 'light') => {
    nativeTheme.themeSource = theme
  })

  ipcMain.handle('agentorchestrator:setWindowWorkspaceTitle', (_evt, workspaceRoot: string) => {
    const win = getMainWindow()
    if (win) {
      win.setTitle(getMainWindowTitle(workspaceRoot))
      setCurrentRoot(workspaceRoot)
    }
  })

  ipcMain.handle('agentorchestrator:rendererReady', () => {
    setRendererStartupReady(true)
    maybeRevealMainWindow()
  })

  ipcMain.handle('agentorchestrator:writeWorkspaceConfig', async (_evt, folderPath: string, settings?: any) => {
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

  ipcMain.handle('agentorchestrator:claimWorkspace', async (_evt, workspaceRoot: string) => {
    return acquireWorkspaceLock(workspaceRoot)
  })

  ipcMain.handle('agentorchestrator:releaseWorkspace', async (_evt, workspaceRoot: string) => {
    return releaseWorkspaceLock(workspaceRoot)
  })

  ipcMain.handle('agentorchestrator:forceClaimWorkspace', async (_evt, workspaceRoot: string) => {
    return forceClaimWorkspace(workspaceRoot)
  })

  ipcMain.handle('agentorchestrator:openWorkspaceInNewWindow', async (_evt, workspaceRoot: string) => {
    return openWorkspaceInNewBarnabyInstance(workspaceRoot)
  })
}
