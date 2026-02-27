/**
 * Dock layout utilities - migration, zone helpers, drop target resolution.
 */

import type { DockLayoutState, DockPanelId, DockZoneId, DropTargetHint } from '../types'
import { DEFAULT_DOCK_LAYOUT } from '../constants'

/** Normalize layout to new zones format. Migrates legacy visible/leftTopTab etc. */
export function normalizeDockLayout(layout: DockLayoutState | null | undefined): DockLayoutState {
  if (!layout) return DEFAULT_DOCK_LAYOUT
  if (layout.zones && Object.keys(layout.zones).length > 0) return layout

  // Migrate from legacy format
  const zones: DockLayoutState['zones'] = {}
  const activeTab: DockLayoutState['activeTab'] = {}

  const visible = layout.visible ?? ({} as Record<DockPanelId, boolean>)
  const leftTopTab = (layout.leftTopTab ?? 'orchestrator') as DockPanelId
  const leftBottomTab = layout.leftBottomTab ?? 'workspace-folder'
  const rightTab = layout.rightTab ?? 'application-settings'
  const bottomTab = layout.bottomTab ?? 'terminal'
  const leftBottomTabs = layout.leftBottomTabs ?? ['workspace-folder', 'workspace-settings']
  const rightTabs = layout.rightTabs ?? ['application-settings', 'source-control']
  const bottomTabs = layout.bottomTabs ?? ['terminal', 'debug-output']

  if ((visible as Record<DockPanelId, boolean>).orchestrator) {
    zones['left-top'] = [leftTopTab === 'orchestrator' ? 'orchestrator' : leftTopTab]
    activeTab['left-top'] = (zones['left-top']![0])
  }
  const leftBottomVisible = leftBottomTabs.filter((id) => (visible as Record<DockPanelId, boolean>)[id])
  if (leftBottomVisible.length > 0) {
    zones['left-bottom'] = leftBottomVisible
    activeTab['left-bottom'] = leftBottomTab as DockPanelId
  }
  const rightVisible = rightTabs.filter((id) => (visible as Record<DockPanelId, boolean>)[id])
  if (rightVisible.length > 0) {
    zones.right = rightVisible
    activeTab.right = rightTab as DockPanelId
  }
  const bottomVisible = bottomTabs.filter((id) => (visible as Record<DockPanelId, boolean>)[id])
  if (bottomVisible.length > 0) {
    zones.bottom = bottomVisible
    activeTab.bottom = bottomTab as DockPanelId
  }

  return { zones: zones as DockLayoutState['zones'], activeTab }
}

/** Get all zones that have at least one panel. */
export function getVisibleZones(layout: DockLayoutState): DockZoneId[] {
  const zones = layout.zones ?? {}
  return (Object.keys(zones) as DockZoneId[]).filter((id) => {
    const tabs = zones[id]
    return tabs && tabs.length > 0
  })
}

/** Get the zone that contains a given panel. */
export function getZoneForPanel(layout: DockLayoutState, panelId: DockPanelId): DockZoneId | null {
  const zones = layout.zones ?? {}
  for (const [zoneId, tabs] of Object.entries(zones)) {
    if (tabs?.includes(panelId)) return zoneId as DockZoneId
  }
  return null
}

export type SideDockZones = { top: boolean; bottom: boolean }
export type BottomDockZones = { left: boolean; right: boolean }

/**
 * Migrate panels from single zone to split zones when creating a split.
 * E.g., when creating 'left-top', if 'left' exists with panels, move them to 'left-bottom'
 * so the dropped tab can occupy the requested side.
 */
export function migratePanelsOnSplit(
  zones: DockLayoutState['zones'],
  targetZoneId: DockZoneId,
): DockLayoutState['zones'] {
  const updatedZones = { ...zones }

  // Left dock: migrate 'left' → 'left-top' or 'left-bottom'
  if (targetZoneId === 'left-top' || targetZoneId === 'left-bottom') {
    if (updatedZones.left && updatedZones.left.length > 0) {
      // Move existing tabs to the opposite split side.
      const destination = targetZoneId === 'left-top' ? 'left-bottom' : 'left-top'
      updatedZones[destination] = [...(updatedZones[destination] ?? []), ...updatedZones.left]
      delete updatedZones.left
    }
  }

  // Right dock: migrate 'right' → 'right-top' or 'right-bottom'
  if (targetZoneId === 'right-top' || targetZoneId === 'right-bottom') {
    if (updatedZones.right && updatedZones.right.length > 0) {
      // Move existing tabs to the opposite split side.
      const destination = targetZoneId === 'right-top' ? 'right-bottom' : 'right-top'
      updatedZones[destination] = [...(updatedZones[destination] ?? []), ...updatedZones.right]
      delete updatedZones.right
    }
  }

  // Bottom dock: migrate 'bottom' → 'bottom-left' or 'bottom-right'
  if (targetZoneId === 'bottom-left' || targetZoneId === 'bottom-right') {
    if (updatedZones.bottom && updatedZones.bottom.length > 0) {
      // Move existing tabs to the opposite split side.
      const destination = targetZoneId === 'bottom-left' ? 'bottom-right' : 'bottom-left'
      updatedZones[destination] = [...(updatedZones[destination] ?? []), ...updatedZones.bottom]
      delete updatedZones.bottom
    }
  }

  return updatedZones
}

/** Resolve drop target from mouse position within a dock rect. Returns { zoneId, hint }. */
export function resolveDropTarget(
  dockSide: 'left' | 'right' | 'bottom',
  rect: DOMRect,
  clientX: number,
  clientY: number,
  existingZones: SideDockZones | BottomDockZones,
): { zoneId: DockZoneId; hint: DropTargetHint } {
  const relX = (clientX - rect.left) / rect.width
  const relY = (clientY - rect.top) / rect.height

  if (dockSide === 'left' || dockSide === 'right') {
    const zones = existingZones as SideDockZones
    if (relY < 0.25) return { zoneId: dockSide === 'left' ? 'left-top' : 'right-top', hint: zones.top ? 'center' : 'top' }
    if (relY > 0.75) return { zoneId: dockSide === 'left' ? 'left-bottom' : 'right-bottom', hint: zones.bottom ? 'center' : 'bottom' }
    if (zones.top && zones.bottom) {
      return relY < 0.5
        ? { zoneId: dockSide === 'left' ? 'left-top' : 'right-top', hint: 'center' }
        : { zoneId: dockSide === 'left' ? 'left-bottom' : 'right-bottom', hint: 'center' }
    }
    if (zones.top) return { zoneId: dockSide === 'left' ? 'left-top' : 'right-top', hint: 'center' }
    if (zones.bottom) return { zoneId: dockSide === 'left' ? 'left-bottom' : 'right-bottom', hint: 'center' }
    return { zoneId: dockSide === 'left' ? 'left-top' : 'right-top', hint: 'center' }
  }

  const zones = existingZones as BottomDockZones
  if (relX < 0.25) return { zoneId: 'bottom-left', hint: zones.left ? 'center' : 'left' }
  if (relX > 0.75) return { zoneId: 'bottom-right', hint: zones.right ? 'center' : 'right' }
  if (zones.left && zones.right) {
    return relX < 0.5
      ? { zoneId: 'bottom-left', hint: 'center' }
      : { zoneId: 'bottom-right', hint: 'center' }
  }
  if (zones.left) return { zoneId: 'bottom-left', hint: 'center' }
  if (zones.right) return { zoneId: 'bottom-right', hint: 'center' }
  return { zoneId: 'bottom', hint: 'center' }
}
