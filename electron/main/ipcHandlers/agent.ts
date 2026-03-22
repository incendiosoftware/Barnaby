import { ipcMain, BrowserWindow } from 'electron'
import {
  pingModelById,
  getAvailableModels,
  getGeminiAvailableModels
} from '../modelManager'
import type { AgentClient, ConnectOptions } from '../types'

export function registerAgentHandlers(
  agentClients: Map<string, AgentClient>,
  getOrCreateClient: (id: string, options: ConnectOptions) => Promise<any>
) {
  ipcMain.handle('agentorchestrator:connect', async (_evt, agentWindowId: string, options: ConnectOptions) => {
    return getOrCreateClient(agentWindowId, options)
  })

  ipcMain.handle('agentorchestrator:sendMessage', async (_evt, agentWindowId: string, text: string, attachments?: any[]) => {
    const client = agentClients.get(agentWindowId)
    if (!client) throw new Error('Agent not connected.')
    return client.sendMessage(text, attachments)
  })

  ipcMain.handle('agentorchestrator:interrupt', async (_evt, agentWindowId: string) => {
    const client = agentClients.get(agentWindowId)
    if (!client) return { ok: false, error: 'Agent not connected.' }
    await client.interrupt()
    return { ok: true }
  })

  ipcMain.handle('agentorchestrator:disconnect', async (_evt, agentWindowId: string) => {
    const client = agentClients.get(agentWindowId)
    if (client) {
      await client.close()
      agentClients.delete(agentWindowId)
    }
    return { ok: true }
  })

  ipcMain.handle('agentorchestrator:getAvailableModels', async () => {
    return getAvailableModels()
  })

  ipcMain.handle('agentorchestrator:getGeminiAvailableModels', async () => {
    return getGeminiAvailableModels()
  })

  ipcMain.handle('agentorchestrator:pingModel', async (_evt, provider: string, modelId: string, cwd?: string) => {
    return pingModelById(provider, modelId, cwd)
  })

  ipcMain.handle('agentorchestrator:pingProvider', async (_evt, config: any) => {
    const { getProviderAuthStatus } = require('../providerManager')
    return getProviderAuthStatus(config)
  })
}
