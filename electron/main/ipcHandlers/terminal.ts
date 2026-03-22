import { ipcMain } from 'electron'
import {
  terminalSpawn,
  terminalWrite,
  terminalResize,
  terminalDestroy
} from '../terminalManager'

export function registerTerminalHandlers() {
  ipcMain.handle('agentorchestrator:terminalSpawn', (_evt, cwd: string) => {
    return terminalSpawn(cwd)
  })

  ipcMain.on('agentorchestrator:terminalWrite', (_evt, data: string) => {
    terminalWrite(data)
  })

  ipcMain.handle('agentorchestrator:terminalResize', (_evt, cols: number, rows: number) => {
    terminalResize(cols, rows)
  })

  ipcMain.handle('agentorchestrator:terminalDestroy', () => {
    terminalDestroy()
  })
}
