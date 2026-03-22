import { app, BrowserWindow, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { errorMessage } from './logger'
import { getChatHistoryFilePath } from './storageUtils'
import { getMainWindow } from './windowManager'
import { MAX_PERSISTED_CHAT_HISTORY_ENTRIES } from './constants'
import type { PersistedChatHistoryEntry } from './types'

export function sanitizePersistedChatHistory(entries: unknown): PersistedChatHistoryEntry[] {
  if (!Array.isArray(entries)) return []
  const next: PersistedChatHistoryEntry[] = []
  for (const item of entries) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const messages = Array.isArray(record.messages) ? record.messages : []
    if (messages.length === 0) continue

    next.push({
      id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: typeof record.title === 'string' && record.title.trim() ? record.title.trim() : 'Untitled Chat',
      savedAt: typeof record.savedAt === 'number' && Number.isFinite(record.savedAt) ? record.savedAt : Date.now(),
      workspaceRoot: typeof record.workspaceRoot === 'string' ? record.workspaceRoot.trim() : '',
      model: typeof record.model === 'string' ? record.model.trim() : '',
      permissionMode: record.permissionMode === 'proceed-always' ? 'proceed-always' : 'verify-first',
      sandbox: record.sandbox === 'read-only' || record.sandbox === 'workspace-write'
        ? record.sandbox
        : 'workspace-write',
      fontScale: typeof record.fontScale === 'number' && Number.isFinite(record.fontScale) ? record.fontScale : 1,
      messages,
    } as PersistedChatHistoryEntry)
  }
  return next
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_PERSISTED_CHAT_HISTORY_ENTRIES)
}

export function readPersistedChatHistory() {
  const historyPath = getChatHistoryFilePath()
  if (!fs.existsSync(historyPath)) return []
  try {
    const raw = fs.readFileSync(historyPath, 'utf8')
    if (!raw.trim()) return []
    const parsed = JSON.parse(raw) as { entries?: unknown } | unknown[]
    const candidate =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'entries' in parsed ? parsed.entries : parsed
    return sanitizePersistedChatHistory(candidate)
  } catch (err) {
    console.warn('[Barnaby] Failed to read persisted chat history:', errorMessage(err))
    return []
  }
}

export function writePersistedChatHistory(entries: unknown) {
  const historyPath = getChatHistoryFilePath()
  const historyDir = path.dirname(historyPath)
  const sanitized = sanitizePersistedChatHistory(entries)
  const payload = {
    version: 1,
    savedAt: Date.now(),
    entries: sanitized,
  }
  fs.mkdirSync(historyDir, { recursive: true })
  fs.writeFileSync(historyPath, JSON.stringify(payload, null, 2), 'utf8')
  return {
    ok: true,
    count: sanitized.length,
    path: historyPath,
  }
}

export function sanitizeFileNameSegment(value: string, fallback = 'conversation-transcript') {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return cleaned || fallback
}

export async function saveTranscriptFile(workspaceRoot: string, suggestedFileName: string, content: string) {
  const win = getMainWindow()
  const parent = BrowserWindow.getFocusedWindow() ?? win ?? BrowserWindow.getAllWindows()[0] ?? undefined
  const defaultFileName = `${sanitizeFileNameSegment(suggestedFileName)}.md`
  let defaultDir = app.getPath('downloads')
  const trimmedRoot = workspaceRoot.trim()
  if (trimmedRoot) {
    try {
      const resolvedRoot = path.resolve(trimmedRoot)
      if (fs.existsSync(resolvedRoot) && fs.statSync(resolvedRoot).isDirectory()) {
        defaultDir = path.join(resolvedRoot, '.barnaby', 'saved-chats')
      }
    } catch {
      // fallback to Downloads
    }
  }
  const defaultPath = path.join(defaultDir, defaultFileName)
  const result = await dialog.showSaveDialog(parent, {
    title: 'Save conversation transcript',
    defaultPath,
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'Text', extensions: ['txt'] },
    ],
  })
  if (result.canceled || !result.filePath) {
    return { ok: false as const, canceled: true as const }
  }
  fs.mkdirSync(path.dirname(result.filePath), { recursive: true })
  fs.writeFileSync(result.filePath, String(content ?? ''), 'utf8')
  return { ok: true as const, path: result.filePath }
}

export async function saveTranscriptDirect(workspaceRoot: string, fileName: string, content: string) {
  const trimmedRoot = workspaceRoot.trim()
  let targetDir = path.join(app.getPath('downloads'), '.barnaby', 'downloads', 'chats')
  if (trimmedRoot) {
    try {
      const resolvedRoot = path.resolve(trimmedRoot)
      if (fs.existsSync(resolvedRoot) && fs.statSync(resolvedRoot).isDirectory()) {
        targetDir = path.join(resolvedRoot, '.barnaby', 'downloads', 'chats')
      }
    } catch {
      // fallback
    }
  }
  const safeFileName = sanitizeFileNameSegment(fileName)
  const filePath = path.join(targetDir, `${safeFileName}.md`)
  fs.mkdirSync(targetDir, { recursive: true })
  fs.writeFileSync(filePath, String(content ?? ''), 'utf8')
  return { ok: true as const, path: filePath }
}
