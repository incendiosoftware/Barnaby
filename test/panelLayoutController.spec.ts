import type React from 'react'
import { describe, expect, it } from 'vitest'
import { createPanelLayoutController, type DockDropTarget } from '../src/controllers/panelLayoutController'
import type { AgentPanelState, DockLayoutState, LayoutMode, ModelProvider, PermissionMode, SandboxMode, WorkspaceSettings } from '../src/types'

function makeController(initialLayout: DockLayoutState) {
  let dockLayout = initialLayout
  let dragOverTarget: DockDropTarget | string | null = null

  const controller = createPanelLayoutController({
    panelsRef: { current: [] as AgentPanelState[] },
    workspaceRoot: 'E:\\Barnaby',
    workspaceSettingsByPath: {} as Record<string, WorkspaceSettings>,
    MAX_PANELS: 5,
    DEFAULT_MODEL: 'gpt-5',
    newId: () => 'new-panel',
    makeDefaultPanel: () => ({}) as AgentPanelState,
    withModelBanner: (messages: any[]) => messages,
    parseInteractionMode: () => 'agent',
    clampPanelSecurityForWorkspace: (
      _cwd: string,
      sandbox: SandboxMode,
      permissionMode: PermissionMode,
    ) => ({ sandbox, permissionMode }),
    getModelProvider: () => 'openai' as ModelProvider,
    setPanels: () => {},
    setLayoutMode: (_next: React.SetStateAction<LayoutMode>) => {},
    setActivePanelId: () => {},
    setFocusedEditorId: () => {},
    setWorkspaceDockSide: () => {},
    setDraggingPanelId: () => {},
    setDragOverTarget: (next) => {
      dragOverTarget = typeof next === 'function' ? next(dragOverTarget) : next
    },
    setDockLayout: (next) => {
      dockLayout = typeof next === 'function' ? next(dockLayout) : next
    },
  })

  return {
    controller,
    getDockLayout: () => dockLayout,
  }
}

function makeDockDropEvent(panelId: string): React.DragEvent {
  const payload = JSON.stringify({ type: 'dock', id: panelId })
  return {
    preventDefault: () => {},
    dataTransfer: {
      getData: (type: string) => (type === 'application/x-barnaby-dock-panel' ? payload : ''),
      types: ['application/x-barnaby-dock-panel'],
    },
  } as unknown as React.DragEvent
}

describe('panelLayoutController dock splitting', () => {
  it('splits right dock when dragging a tab to right-bottom from single-zone right', () => {
    const { controller, getDockLayout } = makeController({
      zones: {
        right: ['application-settings', 'source-control'],
      },
      activeTab: {
        right: 'application-settings',
      },
    })

    controller.handleDockDrop(makeDockDropEvent('source-control'), { zoneId: 'right-bottom', hint: 'bottom' })

    const next = getDockLayout()
    expect(next.zones.right).toBeUndefined()
    expect(next.zones['right-top']).toEqual(['application-settings'])
    expect(next.zones['right-bottom']).toEqual(['source-control'])
  })

  it('splits bottom dock when dragging a tab to bottom-right from single-zone bottom', () => {
    const { controller, getDockLayout } = makeController({
      zones: {
        bottom: ['terminal', 'debug-output'],
      },
      activeTab: {
        bottom: 'terminal',
      },
    })

    controller.handleDockDrop(makeDockDropEvent('debug-output'), { zoneId: 'bottom-right', hint: 'right' })

    const next = getDockLayout()
    expect(next.zones.bottom).toBeUndefined()
    expect(next.zones['bottom-left']).toEqual(['terminal'])
    expect(next.zones['bottom-right']).toEqual(['debug-output'])
  })

  it('keeps existing right tabs on opposite side when dropping a tab from another dock into right split target', () => {
    const { controller, getDockLayout } = makeController({
      zones: {
        'left-top': ['orchestrator'],
        right: ['application-settings'],
      },
      activeTab: {
        'left-top': 'orchestrator',
        right: 'application-settings',
      },
    })

    controller.handleDockDrop(makeDockDropEvent('orchestrator'), { zoneId: 'right-bottom', hint: 'bottom' })

    const next = getDockLayout()
    expect(next.zones['left-top']).toBeUndefined()
    expect(next.zones.right).toBeUndefined()
    expect(next.zones['right-top']).toEqual(['application-settings'])
    expect(next.zones['right-bottom']).toEqual(['orchestrator'])
  })
})
