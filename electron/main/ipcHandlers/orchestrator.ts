import { ipcMain } from 'electron'
import {
  readOrchestratorSecrets,
  writeOrchestratorSecrets,
  readOrchestratorSettings,
  writeOrchestratorSettings
} from '../orchestratorStorage'
import { getAppStorageDirPath } from '../logger'

export function registerOrchestratorHandlers() {
  ipcMain.handle('agentorchestrator:getOrchestratorLicenseKeyState', async () => {
    const secrets = readOrchestratorSecrets(getAppStorageDirPath)
    return { hasKey: Boolean(secrets.licenseKey) }
  })

  ipcMain.handle('agentorchestrator:setOrchestratorLicenseKey', async (_evt, key: string) => {
    const secrets = readOrchestratorSecrets(getAppStorageDirPath)
    secrets.licenseKey = (key ?? '').trim()
    writeOrchestratorSecrets(getAppStorageDirPath, secrets)
    return { ok: true, hasKey: Boolean(secrets.licenseKey) }
  })

  ipcMain.handle('agentorchestrator:syncOrchestratorSettings', async (_evt, settings: any) => {
    writeOrchestratorSettings(getAppStorageDirPath, settings)
    return { ok: true }
  })

  // These will be implemented or passed from index.ts as they require complex orchestrator logic
  /*
  ipcMain.handle('agentorchestrator:startOrchestratorComparativeReview', ...)
  ipcMain.handle('agentorchestrator:startOrchestratorGoalRun', ...)
  ipcMain.handle('agentorchestrator:pauseOrchestratorRun', ...)
  ipcMain.handle('agentorchestrator:cancelOrchestratorRun', ...)
  ipcMain.handle('agentorchestrator:getOrchestratorState', ...)
  */
}
