/**
 * Editor file operations - open, save, close, create.
 * Use for: opening files from explorer/menu, saving, save-as, closing panels.
 */

import type React from 'react'
import type { EditorPanelState } from '../types'

export interface EditorFileApi {
  readWorkspaceTextFile: (workspaceRoot: string, relativePath: string) => Promise<{
    relativePath: string
    content: string
    size: number
    binary?: boolean
  }>
  writeWorkspaceFile: (workspaceRoot: string, relativePath: string, content: string) => Promise<{
    relativePath: string
    size: number
  }>
  writeDiagnosticsFile?: (target: 'chatHistory' | 'appState' | 'runtimeLog', content: string) => Promise<{ ok: boolean; error?: string; size?: number }>
  pickWorkspaceOpenPath: (workspaceRoot: string) => Promise<string | null>
  pickWorkspaceSavePath: (workspaceRoot: string, suggestedPath: string) => Promise<string | null>
}

export interface EditorFileControllerContext {
  workspaceRoot: string | null
  setShowCodeWindow: (v: boolean | ((prev: boolean) => boolean)) => void
  setCodeWindowTab: (tab: 'code' | 'settings') => void
  setEditorPanels: React.Dispatch<React.SetStateAction<EditorPanelState[]>>
  setFocusedEditor: (next: string | null) => void
  setSelectedWorkspaceFile: (v: string | null | ((prev: string | null) => string | null)) => void
  editorPanelsRef: React.MutableRefObject<EditorPanelState[]>
  focusedEditorIdRef: React.MutableRefObject<string | null>
  api: EditorFileApi
  refreshWorkspaceTree: () => void | Promise<void>
  fileNameFromRelativePath: (relativePath: string) => string
  formatError: (err: unknown) => string
  newId: () => string
  MAX_EDITOR_PANELS: number
  MAX_EDITOR_FILE_SIZE_BYTES: number
}

export interface EditorFileController {
  openEditorForRelativePath: (relativePath: string) => Promise<void>
  updateEditorContent: (editorId: string, nextContent: string) => void
  saveEditorPanel: (editorId: string) => Promise<void>
  saveEditorPanelAs: (editorId: string) => Promise<void>
  closeEditorPanel: (editorId: string) => void
  createNewFileFromMenu: () => Promise<void>
  openFileFromMenu: () => Promise<void>
}

export function createEditorFileController(ctx: EditorFileControllerContext): EditorFileController {
  const {
    workspaceRoot,
    setShowCodeWindow,
    setCodeWindowTab,
    setEditorPanels,
    setFocusedEditor,
    setSelectedWorkspaceFile,
    editorPanelsRef,
    focusedEditorIdRef,
    api,
    refreshWorkspaceTree,
    fileNameFromRelativePath,
    formatError,
    newId,
    MAX_EDITOR_PANELS,
    MAX_EDITOR_FILE_SIZE_BYTES,
  } = ctx

  async function openEditorForRelativePath(relativePath: string) {
    if (!workspaceRoot || !relativePath) return
    setCodeWindowTab('code')
    setShowCodeWindow(true)
    const existing = editorPanelsRef.current.find((p) => p.workspaceRoot === workspaceRoot && p.relativePath === relativePath)
    if (existing) {
      setFocusedEditor(existing.id)
      return
    }

    const panels = editorPanelsRef.current
    if (panels.length >= MAX_EDITOR_PANELS) {
      const hasUnedited = panels.some((p) => !p.dirty)
      if (!hasUnedited) {
        alert(
          `Maximum ${MAX_EDITOR_PANELS} code files open. All files have unsaved changes. Save or close some files to open more.`,
        )
        return
      }
    }

    const id = `editor-${newId()}`
    const title = fileNameFromRelativePath(relativePath)
    const newPanel: EditorPanelState = {
      id,
      workspaceRoot,
      relativePath,
      title,
      fontScale: 1,
      content: '',
      size: 0,
      loading: true,
      saving: false,
      dirty: false,
      binary: false,
      editMode: true,
    }
    setEditorPanels((prev) => {
      if (prev.length < MAX_EDITOR_PANELS) return [...prev, newPanel]
      const oldestUneditedIdx = prev.findIndex((p) => !p.dirty)
      const next = oldestUneditedIdx >= 0 ? prev.filter((_, i) => i !== oldestUneditedIdx) : prev
      return [...next, newPanel]
    })
    setFocusedEditor(id)
    try {
      const result = await api.readWorkspaceTextFile(workspaceRoot, relativePath)
      if (result.size > MAX_EDITOR_FILE_SIZE_BYTES && !result.binary) {
        setEditorPanels((prev) =>
          prev.map((p) =>
            p.id !== id
              ? p
              : {
                  ...p,
                  loading: false,
                  error: `File too large (${Math.round(result.size / 1024)} KB). Maximum ${Math.round(MAX_EDITOR_FILE_SIZE_BYTES / 1024)} KB.`,
                },
          ),
        )
        return
      }
      setEditorPanels((prev) =>
        prev.map((p) =>
          p.id !== id
            ? p
            : {
                ...p,
                title: fileNameFromRelativePath(result.relativePath),
                relativePath: result.relativePath,
                content: result.content,
                size: result.size,
                binary: Boolean(result.binary),
                loading: false,
                dirty: false,
                error: result.binary ? 'Binary files cannot be edited in this editor.' : undefined,
              },
        ),
      )
    } catch (err) {
      setEditorPanels((prev) =>
        prev.map((p) =>
          p.id !== id
            ? p
            : {
                ...p,
                loading: false,
                error: formatError(err),
              },
        ),
      )
    }
  }

  function updateEditorContent(editorId: string, nextContent: string) {
    setEditorPanels((prev) =>
      prev.map((p) =>
        p.id !== editorId
          ? p
          : p.diagnosticsReadOnly
            ? p
          : {
              ...p,
              content: nextContent,
              dirty: true,
              error: undefined,
            },
      ),
    )
  }

  async function saveEditorPanel(editorId: string) {
    const panel = editorPanelsRef.current.find((p) => p.id === editorId)
    if (!panel || panel.loading || panel.binary) return
    if (panel.diagnosticsReadOnly) return
    setEditorPanels((prev) => prev.map((p) => (p.id === editorId ? { ...p, saving: true, error: undefined } : p)))
    try {
      if (panel.diagnosticsTarget) {
        const result = await api.writeDiagnosticsFile?.(panel.diagnosticsTarget, panel.content)
        if (!result?.ok) throw new Error(result?.error || 'Failed to save diagnostics file')
        setEditorPanels((prev) =>
          prev.map((p) =>
            p.id !== editorId
              ? p
              : {
                  ...p,
                  size: typeof result.size === 'number' ? result.size : p.content.length,
                  saving: false,
                  dirty: false,
                  savedAt: Date.now(),
                },
          ),
        )
        return
      }
      const result = await api.writeWorkspaceFile(panel.workspaceRoot, panel.relativePath, panel.content)
      setEditorPanels((prev) =>
        prev.map((p) =>
          p.id !== editorId
            ? p
            : {
                ...p,
                relativePath: result.relativePath,
                title: fileNameFromRelativePath(result.relativePath),
                size: result.size,
                saving: false,
                dirty: false,
                savedAt: Date.now(),
              },
        ),
      )
      setSelectedWorkspaceFile(result.relativePath)
      void refreshWorkspaceTree()
    } catch (err) {
      setEditorPanels((prev) =>
        prev.map((p) =>
          p.id !== editorId
            ? p
            : {
                ...p,
                saving: false,
                error: formatError(err),
              },
        ),
      )
    }
  }

  async function saveEditorPanelAs(editorId: string) {
    const panel = editorPanelsRef.current.find((p) => p.id === editorId)
    if (!panel || panel.loading || panel.binary) return
    if (panel.diagnosticsTarget) {
      setEditorPanels((prev) =>
        prev.map((p) =>
          p.id !== editorId
            ? p
            : {
                ...p,
                error: 'Save As is not available for diagnostics files.',
              },
        ),
      )
      return
    }

    try {
      const nextRelativePath = await api.pickWorkspaceSavePath(panel.workspaceRoot, panel.relativePath)
      if (!nextRelativePath) return

      setEditorPanels((prev) => prev.map((p) => (p.id === editorId ? { ...p, saving: true, error: undefined } : p)))
      const result = await api.writeWorkspaceFile(panel.workspaceRoot, nextRelativePath, panel.content)
      setEditorPanels((prev) =>
        prev.map((p) =>
          p.id !== editorId
            ? p
            : {
                ...p,
                relativePath: result.relativePath,
                title: fileNameFromRelativePath(result.relativePath),
                size: result.size,
                saving: false,
                dirty: false,
                savedAt: Date.now(),
              },
        ),
      )
      setSelectedWorkspaceFile(result.relativePath)
      void refreshWorkspaceTree()
    } catch (err) {
      setEditorPanels((prev) =>
        prev.map((p) =>
          p.id !== editorId
            ? p
            : {
                ...p,
                saving: false,
                error: formatError(err),
              },
        ),
      )
    }
  }

  function closeEditorPanel(editorId: string) {
    const panel = editorPanelsRef.current.find((p) => p.id === editorId)
    if (!panel) return
    if (panel.dirty && !confirm(`Close "${panel.title}" without saving changes?`)) return
    const panels = editorPanelsRef.current
    const idx = panels.findIndex((p) => p.id === editorId)
    setEditorPanels((prev) => prev.filter((p) => p.id !== editorId))
    if (focusedEditorIdRef.current === editorId) {
      const remaining = panels.filter((p) => p.id !== editorId)
      const nextIdx = Math.min(idx, Math.max(0, remaining.length - 1))
      setFocusedEditor(remaining[nextIdx]?.id ?? null)
    }
  }

  async function createNewFileFromMenu() {
    if (!workspaceRoot) return
    try {
      const relativePath = await api.pickWorkspaceSavePath(workspaceRoot, 'untitled.txt')
      if (!relativePath) return
      await api.writeWorkspaceFile(workspaceRoot, relativePath, '')
      await openEditorForRelativePath(relativePath)
      setSelectedWorkspaceFile(relativePath)
      void refreshWorkspaceTree()
    } catch (err) {
      alert(`Could not create file: ${formatError(err)}`)
    }
  }

  async function openFileFromMenu() {
    if (!workspaceRoot) return
    try {
      const relativePath = await api.pickWorkspaceOpenPath(workspaceRoot)
      if (!relativePath) return
      await openEditorForRelativePath(relativePath)
      setSelectedWorkspaceFile(relativePath)
    } catch (err) {
      alert(`Could not open file: ${formatError(err)}`)
    }
  }

  return {
    openEditorForRelativePath,
    updateEditorContent,
    saveEditorPanel,
    saveEditorPanelAs,
    closeEditorPanel,
    createNewFileFromMenu,
    openFileFromMenu,
  }
}
