import { ipcMain } from 'electron'
import type { CodexAppServerClient } from '../codexAppServerClient'

export function registerFireHarnessHandlers(
  agentClients: Map<string, any>
) {
  ipcMain.handle('fireharness:connect', async (_evt, agentWindowId: string, options: any) => {
    const { CodexAppServerClient } = require('../codexAppServerClient')
    const { forwardEvent } = require('../index') // This might be circular, better pass it in
    const client = new CodexAppServerClient()
    // Need to handle event forwarding correctly
    return client.connect(options)
  })

  ipcMain.handle('fireharness:sendMessage', async (_evt, agentWindowId: string, message: any) => {
    const client = agentClients.get(agentWindowId) as CodexAppServerClient | undefined
    if (!client) throw new Error('FireHarness not connected.')
    return client.sendMessage(message.text, message.attachments)
  })

  ipcMain.handle('fireharness:disconnect', async (_evt, agentWindowId: string) => {
    const client = agentClients.get(agentWindowId)
    if (client) {
      await client.close()
      agentClients.delete(agentWindowId)
    }
    return { ok: true }
  })
}
