import { ipcMain } from 'electron'
import {
  getGitStatus,
  gitCommit,
  gitPush,
  gitDeploy,
  gitBuild,
  gitRelease,
  gitRollback
} from '../gitManager'

export function registerGitHandlers() {
  ipcMain.handle('agentorchestrator:getGitStatus', async (_evt, workspaceRoot: string) => {
    return getGitStatus(workspaceRoot)
  })

  ipcMain.handle('agentorchestrator:gitCommit', async (_evt, workspaceRoot: string, selectedPaths?: string[]) => {
    return gitCommit(workspaceRoot, selectedPaths)
  })

  ipcMain.handle('agentorchestrator:gitPush', async (_evt, workspaceRoot: string, selectedPaths?: string[]) => {
    return gitPush(workspaceRoot, selectedPaths)
  })

  ipcMain.handle('agentorchestrator:gitDeploy', async (_evt, workspaceRoot: string, selectedPaths?: string[]) => {
    return gitDeploy(workspaceRoot, selectedPaths)
  })

  ipcMain.handle('agentorchestrator:gitBuild', async (_evt, workspaceRoot: string, selectedPaths?: string[]) => {
    return gitBuild(workspaceRoot, selectedPaths)
  })

  ipcMain.handle('agentorchestrator:gitRelease', async (_evt, workspaceRoot: string, selectedPaths?: string[]) => {
    return gitRelease(workspaceRoot, selectedPaths)
  })

  ipcMain.handle('agentorchestrator:gitRollback', async (_evt, workspaceRoot: string, selectedPaths?: string[]) => {
    return gitRollback(workspaceRoot, selectedPaths)
  })
}
