import { ipcMain } from 'electron'
import type { McpServerManager } from '../mcpClient'

export function registerMcpHandlers(mcpServerManager: McpServerManager) {
  ipcMain.handle('agentorchestrator:getMcpServers', async () => {
    return mcpServerManager.getServers()
  })

  ipcMain.handle('agentorchestrator:addMcpServer', async (_evt, server: any) => {
    return mcpServerManager.addServer(server)
  })

  ipcMain.handle('agentorchestrator:updateMcpServer', async (_evt, serverId: string, updates: any) => {
    return mcpServerManager.updateServer(serverId, updates)
  })

  ipcMain.handle('agentorchestrator:removeMcpServer', async (_evt, serverId: string) => {
    return mcpServerManager.removeServer(serverId)
  })

  ipcMain.handle('agentorchestrator:restartMcpServer', async (_evt, serverId: string) => {
    return mcpServerManager.restartServer(serverId)
  })

  ipcMain.handle('agentorchestrator:getMcpServerTools', async (_evt, serverId: string) => {
    return mcpServerManager.getServerTools(serverId)
  })
}
