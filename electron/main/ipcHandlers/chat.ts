import { ipcMain } from 'electron'
import { readPersistedChatHistory, writePersistedChatHistory, saveTranscriptFile, saveTranscriptDirect } from '../chatManager'

export function registerChatHandlers() {
  ipcMain.handle('agentorchestrator:loadChatHistory', async () => {
    return readPersistedChatHistory()
  })

  ipcMain.handle('agentorchestrator:saveChatHistory', async (_evt, entries: unknown) => {
    return writePersistedChatHistory(entries)
  })

  ipcMain.handle('agentorchestrator:saveTranscriptFile', async (_evt, workspaceRoot: string, suggestedFileName: string, content: string) => {
    return saveTranscriptFile(workspaceRoot, suggestedFileName, content)
  })

  ipcMain.handle('agentorchestrator:saveTranscriptDirect', async (_evt, workspaceRoot: string, fileName: string, content: string) => {
    return saveTranscriptDirect(workspaceRoot, fileName, content)
  })
}
