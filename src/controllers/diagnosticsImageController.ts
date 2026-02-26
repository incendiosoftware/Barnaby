import type React from 'react'
import type { EditorPanelState } from '../types'

export interface DiagnosticsImageApi {
  openDiagnosticsPath?: (target: 'chatHistory' | 'appState' | 'runtimeLog' | 'userData' | 'storage') => Promise<any>
  readDiagnosticsFile?: (target: 'chatHistory' | 'appState' | 'runtimeLog') => Promise<any>
  savePastedImage: (dataUrl: string, mimeType: string) => Promise<{ path: string; mimeType: string }>
}

export interface DiagnosticsImageControllerContext {
  api: DiagnosticsImageApi
  workspaceRoot: string
  editorPanelsRef: React.MutableRefObject<EditorPanelState[]>
  setDiagnosticsActionStatus: React.Dispatch<React.SetStateAction<string | null>>
  setShowCodeWindow: React.Dispatch<React.SetStateAction<boolean>>
  setEditorPanels: React.Dispatch<React.SetStateAction<EditorPanelState[]>>
  setFocusedEditor: (next: string | null) => void
  setPanels: React.Dispatch<React.SetStateAction<any[]>>
  formatError: (err: unknown) => string
  fileNameFromRelativePath: (path: string) => string
  newId: () => string
  MAX_EDITOR_PANELS: number
}

export interface DiagnosticsImageController {
  openDiagnosticsTarget: (
    target: 'userData' | 'storage' | 'chatHistory' | 'appState' | 'runtimeLog',
    label: string,
  ) => void
  handlePasteImage: (panelId: string, file: File) => Promise<void>
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed reading pasted image'))
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Failed reading pasted image'))
    }
    reader.readAsDataURL(file)
  })
}

export function createDiagnosticsImageController(ctx: DiagnosticsImageControllerContext): DiagnosticsImageController {
  function openDiagnosticsFileInEditor(
    target: 'chatHistory' | 'appState' | 'runtimeLog',
    label: string,
  ) {
    ctx.setDiagnosticsActionStatus(null)
    void (async () => {
      try {
        const result = await ctx.api.readDiagnosticsFile?.(target)
        if (!result?.ok || typeof result.content !== 'string') {
          ctx.setDiagnosticsActionStatus(result?.error ? `Could not open ${label}: ${result.error}` : `Could not open ${label}.`)
          return
        }
        const diagnosticsContent = result.content
        const existing = ctx.editorPanelsRef.current.find((p) => p.diagnosticsTarget === target)
        ctx.setShowCodeWindow(true)
        if (existing) {
          ctx.setEditorPanels((prev) =>
            prev.map((p) =>
              p.id !== existing.id
                ? p
                : {
                    ...p,
                    content: diagnosticsContent,
                    size: diagnosticsContent.length,
                    dirty: false,
                    diagnosticsReadOnly: result.writable === false,
                    error: undefined,
                  },
            ),
          )
          ctx.setFocusedEditor(existing.id)
          return
        }
        const panelId = `editor-${ctx.newId()}`
        const panelTitle = ctx.fileNameFromRelativePath(result.path || `${target}.txt`)
        const newPanel: EditorPanelState = {
          id: panelId,
          workspaceRoot: ctx.workspaceRoot,
          relativePath: result.path || target,
          title: panelTitle,
          fontScale: 1,
          content: diagnosticsContent,
          size: diagnosticsContent.length,
          loading: false,
          saving: false,
          dirty: false,
          binary: false,
          editMode: true,
          diagnosticsTarget: target,
          diagnosticsReadOnly: result.writable === false,
        }
        ctx.setEditorPanels((prev) => {
          if (prev.length < ctx.MAX_EDITOR_PANELS) return [...prev, newPanel]
          const oldestUneditedIdx = prev.findIndex((p) => !p.dirty)
          const next = oldestUneditedIdx >= 0 ? prev.filter((_, i) => i !== oldestUneditedIdx) : prev
          return [...next, newPanel]
        })
        ctx.setFocusedEditor(panelId)
      } catch (err) {
        ctx.setDiagnosticsActionStatus(`Could not open ${label}: ${ctx.formatError(err)}`)
      }
    })()
  }

  function openDiagnosticsTarget(
    target: 'userData' | 'storage' | 'chatHistory' | 'appState' | 'runtimeLog',
    label: string,
  ) {
    if (target === 'chatHistory' || target === 'appState' || target === 'runtimeLog') {
      openDiagnosticsFileInEditor(target, label)
      return
    }
    ctx.setDiagnosticsActionStatus(null)
    void (async () => {
      try {
        const result = await ctx.api.openDiagnosticsPath?.(target)
        if (!result?.ok) {
          ctx.setDiagnosticsActionStatus(result?.error ? `Could not open ${label}: ${result.error}` : `Could not open ${label}.`)
          return
        }
      } catch (err) {
        ctx.setDiagnosticsActionStatus(`Could not open ${label}: ${ctx.formatError(err)}`)
      }
    })()
  }

  async function handlePasteImage(panelId: string, file: File) {
    try {
      const dataUrl = await fileToDataUrl(file)
      const saved = await ctx.api.savePastedImage(dataUrl, file.type || 'image/png')
      ctx.setPanels((prev) =>
        prev.map((p) =>
          p.id !== panelId
            ? p
            : {
                ...p,
                attachments: [
                  ...p.attachments,
                  {
                    id: ctx.newId(),
                    path: saved.path,
                    label: file.name || `pasted-image.${saved.mimeType.includes('jpeg') ? 'jpg' : 'png'}`,
                    mimeType: saved.mimeType,
                  },
                ],
                status: 'Image attached',
              },
        ),
      )
    } catch (err) {
      const msg = ctx.formatError(err)
      ctx.setPanels((prev) =>
        prev.map((p) =>
          p.id !== panelId
            ? p
            : {
                ...p,
                messages: [...p.messages, { id: ctx.newId(), role: 'system', content: `Image paste failed: ${msg}`, format: 'text', createdAt: Date.now() }],
              },
        ),
      )
    }
  }

  return { openDiagnosticsTarget, handlePasteImage }
}
