import { ipcMain } from 'electron'
import { CodexAppServerClient } from '../codexAppServerClient'

export function registerFireHarnessHandlers(
  agentClients: Map<string, any>,
  forwardEvent: (agentWindowId: string, evt: any) => void
) {
  ipcMain.handle('fireharness:connect', async (_evt, agentWindowId: string, options: any) => {
    const client = new CodexAppServerClient()
    return client.connect(options)
  })

  ipcMain.handle('fireharness:sendMessage', async (_evt, agentWindowId: string, message: any) => {
    const client = agentClients.get(agentWindowId) as CodexAppServerClient | undefined
    if (!client) throw new Error('FireHarness not connected.')
    return client.sendUserMessage(message.text)
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
