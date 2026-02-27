import type React from 'react'
import type { AgentPanelState, DockLayoutState, DockPanelId, DockZoneId, DropTargetHint, LayoutMode, PermissionMode, SandboxMode, WorkspaceSettings } from '../types'
import { getZoneForPanel, migratePanelsOnSplit, normalizeDockLayout } from '../utils/dockLayout'

export type DockDropTarget = { zoneId: DockZoneId; hint: DropTargetHint }
export type DragOverTarget = DockDropTarget | string | null

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
  getModelProvider: (model: string) => import('../types').ModelProvider
  setPanels: React.Dispatch<React.SetStateAction<AgentPanelState[]>>
  setLayoutMode: React.Dispatch<React.SetStateAction<LayoutMode>>
  setActivePanelId: React.Dispatch<React.SetStateAction<string>>
  setFocusedEditorId: React.Dispatch<React.SetStateAction<string | null>>
  setWorkspaceDockSide: React.Dispatch<React.SetStateAction<'left' | 'right'>>
  setDraggingPanelId: React.Dispatch<React.SetStateAction<string | null>>
  setDragOverTarget: React.Dispatch<React.SetStateAction<DragOverTarget>>
  setDockLayout: React.Dispatch<React.SetStateAction<DockLayoutState>>
}

export interface PanelLayoutController {
  DND_TYPE_DOCK: string
  DND_TYPE_AGENT: string
  createAgentPanel: (opts?: { sourcePanelId?: string; initialModel?: string }) => void
  splitAgentPanel: (sourcePanelId: string) => void
  reorderAgentPanel: (draggedId: string, targetId: string) => void
  handleDragStart: (e: React.DragEvent, type: 'workspace' | 'code' | 'agent' | 'dock', id: string) => void
  handleDragEnd: () => void
  handleDockDrop: (e: React.DragEvent, target: DockDropTarget | string | null) => void
  handleAgentDrop: (e: React.DragEvent, targetAgentId: string) => void
  handleDockDragOver: (e: React.DragEvent, target: DockDropTarget | null) => void
  /** @deprecated Use handleDockDragOver */
  handleDragOver: (
    e: React.DragEvent,
    opts: { acceptDock?: boolean; acceptAgent?: boolean; targetId?: string },
  ) => void
}

export function createPanelLayoutController(ctx: PanelLayoutControllerContext): PanelLayoutController {
  const DND_TYPE_DOCK = 'application/x-barnaby-dock-panel'
  const DND_TYPE_AGENT = 'application/x-barnaby-agent-panel'

  function createAgentPanel(opts?: { sourcePanelId?: string; initialModel?: string }) {
    if (ctx.panelsRef.current.length >= ctx.MAX_PANELS) return
    const sourcePanel = opts?.sourcePanelId ? ctx.panelsRef.current.find((panel) => panel.id === opts.sourcePanelId) : undefined
    const panelWorkspace = sourcePanel?.cwd || ctx.workspaceRoot
    const ws = ctx.workspaceSettingsByPath[panelWorkspace] ?? ctx.workspaceSettingsByPath[ctx.workspaceRoot]
    const id = ctx.newId()
    const startupModel = opts?.initialModel ?? sourcePanel?.model ?? ws?.defaultModel ?? ctx.DEFAULT_MODEL
    const p = ctx.makeDefaultPanel(id, panelWorkspace)
    p.model = startupModel
    p.provider = ctx.getModelProvider(startupModel)  // Lock provider based on initial model
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
    createAgentPanel({ sourcePanelId })
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
    type: 'workspace' | 'code' | 'agent' | 'dock',
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

  function handleDockDrop(e: React.DragEvent, target: DockDropTarget | string | null) {
    e.preventDefault()
    ctx.setDragOverTarget(null)
    const raw = e.dataTransfer.getData(DND_TYPE_DOCK)
    if (!raw) return
    try {
      const { type, id: draggedId } = JSON.parse(raw) as { type: string; id: string }
      if (type === 'workspace' || type === 'code') {
        ctx.setWorkspaceDockSide((prev) => (prev === 'right' ? 'left' : 'right'))
        return
      }
      if (type !== 'dock' || !target || typeof target === 'string') return
      const panelId = draggedId as DockPanelId
      const { zoneId: targetZoneId } = target

      ctx.setDockLayout((prev) => {
        const layout = normalizeDockLayout(prev)
        let zones = { ...layout.zones }
        const activeTab = { ...layout.activeTab }

        // Remove panel from ALL zones to ensure uniqueness
        for (const [zoneId, tabs] of Object.entries(zones)) {
          if (tabs?.includes(panelId)) {
            const next = tabs.filter((t) => t !== panelId)
            if (next.length === 0) delete zones[zoneId as DockZoneId]
            else zones[zoneId as DockZoneId] = next
            if (activeTab[zoneId as DockZoneId] === panelId) {
              activeTab[zoneId as DockZoneId] = next[0]
            }
          }
        }

        // Migrate panels when creating split zones
        zones = migratePanelsOnSplit(zones, targetZoneId)

        // Add panel to target zone
        const targetTabs = zones[targetZoneId] ?? []
        if (targetTabs.includes(panelId)) return prev
        zones[targetZoneId] = [...targetTabs, panelId]
        activeTab[targetZoneId] = panelId

        return { zones, activeTab }
      })
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

  function handleDockDragOver(e: React.DragEvent, target: DockDropTarget | null) {
    e.preventDefault()
    if (e.dataTransfer.types.includes(DND_TYPE_DOCK) && target) {
      e.dataTransfer.dropEffect = 'move'
      ctx.setDragOverTarget(target)
    }
  }

  function handleDragOver(
    e: React.DragEvent,
    opts: { acceptDock?: boolean; acceptAgent?: boolean; targetId?: string },
  ) {
    e.preventDefault()
    if (opts.acceptAgent && e.dataTransfer.types.includes(DND_TYPE_AGENT) && opts.targetId) {
      e.dataTransfer.dropEffect = 'move'
      ctx.setDragOverTarget(opts.targetId as any)
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
    handleDockDragOver,
    handleDragOver,
  }
}
