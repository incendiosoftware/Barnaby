import { ipcMain, shell } from 'electron'
import {
  getDiagnosticsInfo,
  openDiagnosticsPath,
  readDiagnosticsFile,
  writeDiagnosticsFile,
} from '../diagnostics'
import { getLoadedPlugins, openPluginsFolder, reloadLocalPlugins } from '../pluginHost'
import { getRuntimeLogFilePath, getDebugLogFilePath } from '../logger'
import { getMainWindow } from '../windowManager'
import fs from 'node:fs'

export function registerDiagnosticsHandlers() {
  ipcMain.handle('agentorchestrator:getDiagnosticsInfo', async () => {
    return getDiagnosticsInfo()
  })

  ipcMain.handle('agentorchestrator:getLoadedPlugins', async () => {
    return getLoadedPlugins()
  })

  ipcMain.handle('agentorchestrator:openPluginsFolder', async () => {
    return openPluginsFolder()
  })

  ipcMain.handle('agentorchestrator:reloadLocalPlugins', async () => {
    return reloadLocalPlugins()
  })

  ipcMain.handle('agentorchestrator:openRuntimeLog', async () => {
    const logPath = getRuntimeLogFilePath()
    return shell.openPath(logPath)
  })

  ipcMain.handle('agentorchestrator:openDebugOutputWindow', async () => {
    // This will be handled in index.ts or a separate debug window manager
    return { ok: false, error: 'Not implemented here' }
  })

  ipcMain.handle('agentorchestrator:getDebugLogContent', async () => {
    const logPath = getDebugLogFilePath()
    if (fs.existsSync(logPath)) {
      return fs.readFileSync(logPath, 'utf8')
    }
    return ''
  })

  ipcMain.handle('agentorchestrator:openDiagnosticsPath', async (_evt, target: any) => {
    return openDiagnosticsPath(target)
  })

  ipcMain.handle('agentorchestrator:readDiagnosticsFile', async (_evt, target: any) => {
    return readDiagnosticsFile(target)
  })

  ipcMain.handle('agentorchestrator:writeDiagnosticsFile', async (_evt, target: any, content: any) => {
    return writeDiagnosticsFile(target, content)
  })
}
