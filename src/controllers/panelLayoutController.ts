import type React from 'react'
import type { AgentPanelState, LayoutMode, PermissionMode, SandboxMode, WorkspaceSettings } from '../types'

export interface PanelLayoutControllerContext {
  panelsRef: React.MutableRefObject<AgentPanelState[]>
  workspaceRoot: string
  workspaceSettingsByPath: Record<string, WorkspaceSettings>
  MAX_PANELS: number
  DEFAULT_MODEL: string
  newId: () => string
  makeDefaultPanel: (id: string, cwd: string, historyId?: string) => AgentPanelState
  withModelBanner: (messages: any[], model: string) => any[]
  parseInteractionMode: (raw: string | undefined) => any
  clampPanelSecurityForWorkspace: (
    cwd: string,
    sandbox: SandboxMode,
    permissionMode: PermissionMode,
  ) => { sandbox: SandboxMode; permissionMode: PermissionMode }
  setPanels: React.Dispatch<React.SetStateAction<AgentPanelState[]>>
  setLayoutMode: React.Dispatch<React.SetStateAction<LayoutMode>>
  setActivePanelId: React.Dispatch<React.SetStateAction<string>>
  setFocusedEditorId: React.Dispatch<React.SetStateAction<string | null>>
  setWorkspaceDockSide: React.Dispatch<React.SetStateAction<'left' | 'right'>>
  setDraggingPanelId: React.Dispatch<React.SetStateAction<string | null>>
  setDragOverTarget: React.Dispatch<React.SetStateAction<string | null>>
}

export interface PanelLayoutController {
  DND_TYPE_DOCK: string
  DND_TYPE_AGENT: string
  createAgentPanel: (sourcePanelId?: string) => void
  splitAgentPanel: (sourcePanelId: string) => void
  reorderAgentPanel: (draggedId: string, targetId: string) => void
  handleDragStart: (e: React.DragEvent, type: 'workspace' | 'code' | 'agent', id: string) => void
  handleDragEnd: () => void
  handleDockDrop: (e: React.DragEvent) => void
  handleAgentDrop: (e: React.DragEvent, targetAgentId: string) => void
  handleDragOver: (
    e: React.DragEvent,
    opts: { acceptDock?: boolean; acceptAgent?: boolean; targetId?: string },
  ) => void
}

export function createPanelLayoutController(ctx: PanelLayoutControllerContext): PanelLayoutController {
  const DND_TYPE_DOCK = 'application/x-barnaby-dock-panel'
  const DND_TYPE_AGENT = 'application/x-barnaby-agent-panel'

  function createAgentPanel(sourcePanelId?: string) {
    if (ctx.panelsRef.current.length >= ctx.MAX_PANELS) return
    const sourcePanel = sourcePanelId ? ctx.panelsRef.current.find((panel) => panel.id === sourcePanelId) : undefined
    const panelWorkspace = sourcePanel?.cwd || ctx.workspaceRoot
    const ws = ctx.workspaceSettingsByPath[panelWorkspace] ?? ctx.workspaceSettingsByPath[ctx.workspaceRoot]
    const id = ctx.newId()
    const startupModel = sourcePanel?.model ?? ws?.defaultModel ?? ctx.DEFAULT_MODEL
    const p = ctx.makeDefaultPanel(id, panelWorkspace)
    p.model = startupModel
    p.messages = ctx.withModelBanner(p.messages, startupModel)
    p.interactionMode = ctx.parseInteractionMode(sourcePanel?.interactionMode)
    p.permissionMode = sourcePanel?.permissionMode ?? ws?.permissionMode ?? p.permissionMode
    p.sandbox = sourcePanel?.sandbox ?? ws?.sandbox ?? p.sandbox
    const clampedSecurity = ctx.clampPanelSecurityForWorkspace(panelWorkspace, p.sandbox, p.permissionMode)
    p.sandbox = clampedSecurity.sandbox
    p.permissionMode = clampedSecurity.permissionMode
    p.fontScale = sourcePanel?.fontScale ?? p.fontScale
    const nextPanelCount = ctx.panelsRef.current.length + 1
    ctx.setPanels((prev) => {
      if (prev.length >= ctx.MAX_PANELS) return prev
      return [...prev, p]
    })
    if (nextPanelCount > 3) ctx.setLayoutMode('grid')
    ctx.setActivePanelId(id)
    ctx.setFocusedEditorId(null)
  }

  function splitAgentPanel(sourcePanelId: string) {
    createAgentPanel(sourcePanelId)
  }

  function reorderAgentPanel(draggedId: string, targetId: string) {
    if (draggedId === targetId) return
    ctx.setPanels((prev) => {
      const draggedIdx = prev.findIndex((p) => p.id === draggedId)
      const targetIdx = prev.findIndex((p) => p.id === targetId)
      if (draggedIdx === -1 || targetIdx === -1) return prev
      const next = [...prev]
      const [removed] = next.splice(draggedIdx, 1)
      const insertIdx = targetIdx > draggedIdx ? targetIdx - 1 : targetIdx
      next.splice(insertIdx, 0, removed)
      return next
    })
  }

  function handleDragStart(
    e: React.DragEvent,
    type: 'workspace' | 'code' | 'agent',
    id: string,
  ) {
    ctx.setDraggingPanelId(id)
    e.dataTransfer.setData(type === 'agent' ? DND_TYPE_AGENT : DND_TYPE_DOCK, JSON.stringify({ type, id }))
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd() {
    ctx.setDraggingPanelId(null)
    ctx.setDragOverTarget(null)
  }

  function handleDockDrop(e: React.DragEvent) {
    e.preventDefault()
    ctx.setDragOverTarget(null)
    const raw = e.dataTransfer.getData(DND_TYPE_DOCK)
    if (!raw) return
    try {
      const { type } = JSON.parse(raw) as { type: string; id: string }
      if (type === 'workspace' || type === 'code') {
        ctx.setWorkspaceDockSide((prev) => (prev === 'right' ? 'left' : 'right'))
      }
    } catch {
      // ignore
    }
  }

  function handleAgentDrop(e: React.DragEvent, targetAgentId: string) {
    e.preventDefault()
    ctx.setDragOverTarget(null)
    const raw = e.dataTransfer.getData(DND_TYPE_AGENT)
    if (!raw) return
    try {
      const { id: draggedId } = JSON.parse(raw) as { type: string; id: string }
      reorderAgentPanel(draggedId, targetAgentId)
    } catch {
      // ignore
    }
  }

  function handleDragOver(
    e: React.DragEvent,
    opts: { acceptDock?: boolean; acceptAgent?: boolean; targetId?: string },
  ) {
    e.preventDefault()
    if (opts.acceptDock && e.dataTransfer.types.includes(DND_TYPE_DOCK) && opts.targetId) {
      e.dataTransfer.dropEffect = 'move'
      ctx.setDragOverTarget(opts.targetId)
    } else if (opts.acceptAgent && e.dataTransfer.types.includes(DND_TYPE_AGENT) && opts.targetId) {
      e.dataTransfer.dropEffect = 'move'
      ctx.setDragOverTarget(opts.targetId)
    }
  }

  return {
    DND_TYPE_DOCK,
    DND_TYPE_AGENT,
    createAgentPanel,
    splitAgentPanel,
    reorderAgentPanel,
    handleDragStart,
    handleDragEnd,
    handleDockDrop,
    handleAgentDrop,
    handleDragOver,
  }
}
