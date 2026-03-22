import { ipcMain } from 'electron'
import {
  getProviderAuthStatus,
  launchProviderLogin,
  launchProviderUpgrade
} from '../providerManager'
import {
  getProviderApiKey,
  setProviderApiKey,
  importProviderApiKeyFromEnv
} from '../providerSecrets'

export function registerProviderHandlers() {
  ipcMain.handle('agentorchestrator:getProviderAuthStatus', async (_evt, config: any) => {
    return getProviderAuthStatus(config)
  })

  ipcMain.handle('agentorchestrator:startProviderLogin', async (_evt, config: any) => {
    return launchProviderLogin(config)
  })

  ipcMain.handle('agentorchestrator:upgradeProviderCli', async (_evt, config: any) => {
    return launchProviderUpgrade(config)
  })

  ipcMain.handle('agentorchestrator:setProviderApiKey', async (_evt, providerId: string, apiKey: string) => {
    return setProviderApiKey(providerId, apiKey)
  })

  ipcMain.handle('agentorchestrator:getProviderApiKeyState', async (_evt, providerId: string) => {
    const key = getProviderApiKey(providerId)
    return { hasKey: key.length > 0 }
  })

  ipcMain.handle('agentorchestrator:importProviderApiKeyFromEnv', async (_evt, providerId: string) => {
    return importProviderApiKeyFromEnv(providerId)
  })
}
