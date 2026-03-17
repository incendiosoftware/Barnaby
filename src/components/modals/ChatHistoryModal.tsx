import React, { useMemo, useState } from 'react'
import {
  MODAL_BACKDROP_CLASS,
  MODAL_CARD_CLASS,
  UI_CLOSE_ICON_BUTTON_CLASS,
  UI_INPUT_CLASS,
  UI_SELECT_CLASS,
} from '../../constants'
import type { ChatHistoryEntry } from '../../types'
import { normalizeWorkspacePathForCompare } from '../../utils/appCore'

export interface ChatHistoryModalProps {
  open: boolean
  onClose: () => void
  chatHistory: ChatHistoryEntry[]
  workspaceRoot: string
  openChatFromHistory: (id: string) => void
  downloadHistoryTranscript: (id: string) => void | Promise<void>
  setDeleteHistoryIdPending: React.Dispatch<React.SetStateAction<string | null>>
  renameChatHistoryEntry: (id: string, newTitle: string) => void
}

export function ChatHistoryModal(props: ChatHistoryModalProps) {
  const {
    open,
    onClose,
    chatHistory,
    workspaceRoot,
    openChatFromHistory,
    downloadHistoryTranscript,
    setDeleteHistoryIdPending,
    renameChatHistoryEntry,
  } = props

  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const SCOPE_CURRENT = '__current__'
  const SCOPE_ALL = '__all__'
  const [workspaceFilter, setWorkspaceFilter] = useState<string>(SCOPE_CURRENT)

  const normalizedRoot = useMemo(
    () => normalizeWorkspacePathForCompare(workspaceRoot || ''),
    [workspaceRoot],
  )

  const uniqueWorkspaces = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of chatHistory) {
      const norm = normalizeWorkspacePathForCompare(e.workspaceRoot || '')
      if (!map.has(norm)) map.set(norm, e.workspaceRoot)
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [chatHistory])

  const showWorkspaceColumn = workspaceFilter !== SCOPE_CURRENT

  const filtered = useMemo(() => {
    let entries = chatHistory
    if (workspaceFilter === SCOPE_CURRENT) {
      entries = entries.filter(
        (e) => normalizeWorkspacePathForCompare(e.workspaceRoot || '') === normalizedRoot,
      )
    } else if (workspaceFilter !== SCOPE_ALL) {
      entries = entries.filter(
        (e) => normalizeWorkspacePathForCompare(e.workspaceRoot || '') === workspaceFilter,
      )
    }
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) => {
      if (e.title.toLowerCase().includes(q)) return true
      if (e.model.toLowerCase().includes(q)) return true
      if (e.workspaceRoot.toLowerCase().includes(q)) return true
      for (const m of e.messages) {
        if (typeof m.content === 'string' && m.content.toLowerCase().includes(q)) return true
      }
      return false
    })
  }, [chatHistory, workspaceFilter, normalizedRoot, query])

  if (!open) return null

  function handleOpen(id: string) {
    openChatFromHistory(id)
    onClose()
  }

  function formatDate(ts: number) {
    const dt = new Date(ts)
    if (!Number.isFinite(dt.getTime())) return ''
    return dt.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function commitRename() {
    if (editingId && editTitle.trim()) {
      renameChatHistoryEntry(editingId, editTitle.trim())
    }
    setEditingId(null)
  }

  function shortWorkspace(ws: string) {
    const parts = ws.replace(/\\/g, '/').split('/')
    return parts[parts.length - 1] || ws
  }

  return (
    <div className={MODAL_BACKDROP_CLASS} onClick={onClose}>
      <div
        className={`w-full max-w-3xl max-h-[85vh] flex flex-col ${MODAL_CARD_CLASS}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0">
          <div className="font-medium">Chat History</div>
          <button className={UI_CLOSE_ICON_BUTTON_CLASS} onClick={onClose} title="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-3 flex items-center gap-3 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
          <div className="relative flex-1 min-w-0">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500 pointer-events-none"
              width="14" height="14" viewBox="0 0 16 16" fill="none"
            >
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <input
              autoFocus
              className={`w-full pl-8 ${UI_INPUT_CLASS}`}
              placeholder="Search conversations..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className={`text-xs shrink-0 max-w-[180px] ${UI_SELECT_CLASS}`}
            value={workspaceFilter}
            onChange={(e) => setWorkspaceFilter(e.target.value)}
          >
            <option value={SCOPE_CURRENT}>Current workspace</option>
            <option value={SCOPE_ALL}>All workspaces</option>
            {uniqueWorkspaces.length > 1 && (
              <>
                <option disabled>───────────</option>
                {uniqueWorkspaces.map(([norm, raw]) => (
                  <option key={norm} value={norm}>{shortWorkspace(raw)}</option>
                ))}
              </>
            )}
          </select>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--theme-text-tertiary)' }}>
              {query ? 'No conversations match your search.' : 'No conversations yet.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10" style={{ backgroundColor: 'var(--theme-bg-surface)' }}>
                <tr className="text-left text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                  <th className="px-4 py-2 font-medium">Title</th>
                  <th className="px-2 py-2 font-medium w-[140px]">Date</th>
                  <th className="px-2 py-2 font-medium w-[100px]">Model</th>
                  {showWorkspaceColumn && <th className="px-2 py-2 font-medium w-[120px]">Workspace</th>}
                  <th className="px-2 py-2 font-medium w-[80px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr
                    key={entry.id}
                    className="group cursor-pointer hover:bg-neutral-100/60 dark:hover:bg-neutral-800/40 border-b border-neutral-100 dark:border-neutral-800/50"
                    onClick={() => handleOpen(entry.id)}
                  >
                    <td className="px-4 py-2">
                      {editingId === entry.id ? (
                        <input
                          autoFocus
                          className={`w-full text-sm px-1.5 py-0.5 rounded border border-blue-400 dark:border-blue-600 bg-white dark:bg-neutral-900 outline-none`}
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename()
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          onBlur={commitRename}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div className="truncate max-w-[340px]" title={entry.title}>
                          {entry.title}
                        </div>
                      )}
                      <div className="text-[11px] mt-0.5" style={{ color: 'var(--theme-text-tertiary)' }}>
                        {entry.messages.length} message{entry.messages.length !== 1 ? 's' : ''}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                      {formatDate(entry.savedAt)}
                    </td>
                    <td className="px-2 py-2">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-mono bg-neutral-100 dark:bg-neutral-800" style={{ color: 'var(--theme-text-secondary)' }}>
                        {entry.model}
                      </span>
                    </td>
                    {showWorkspaceColumn && (
                      <td className="px-2 py-2 text-xs font-mono" style={{ color: 'var(--theme-text-secondary)' }} title={entry.workspaceRoot}>
                        {shortWorkspace(entry.workspaceRoot)}
                      </td>
                    )}
                    <td className="px-2 py-2 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-md border-0 text-neutral-500 hover:bg-blue-100 hover:text-blue-700 dark:text-neutral-400 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingId(entry.id)
                            setEditTitle(entry.title)
                          }}
                          title="Rename conversation"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M7.5 2.5L9.5 4.5M1.5 10.5H3.5L9.5 4.5L7.5 2.5L1.5 8.5V10.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-md border-0 text-neutral-500 hover:bg-emerald-100 hover:text-emerald-700 dark:text-neutral-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
                          onClick={(e) => {
                            e.stopPropagation()
                            void downloadHistoryTranscript(entry.id)
                          }}
                          title="Download transcript"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M6 1.8V7.4M6 7.4L3.8 5.2M6 7.4L8.2 5.2M2.2 9.4H9.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-md border-0 text-neutral-500 hover:bg-red-100 hover:text-red-700 dark:text-neutral-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteHistoryIdPending(entry.id)
                            onClose()
                          }}
                          title="Delete conversation"
                        >
                          <svg width="11" height="11" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                            <path d="M2 2L8 8M8 2L2 8" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-4 py-2 border-t border-neutral-200 dark:border-neutral-800 text-xs shrink-0 flex items-center justify-between" style={{ color: 'var(--theme-text-tertiary)' }}>
          <span>{filtered.length} conversation{filtered.length !== 1 ? 's' : ''}</span>
          <span>Search matches title, model, workspace, and message content</span>
        </div>
      </div>
    </div>
  )
}
