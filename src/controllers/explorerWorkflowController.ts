/**
 * Workspace explorer + menu/find workflow handlers.
 * Use for: find in page, find in files, directory expand/collapse, explorer context menu.
 */

import type React from 'react'
import type { WorkspaceTreeNode } from '../types'
import { collectDirectoryPaths } from '../utils/appCore'

export interface ExplorerWorkflowApi {
  findInPage?: (query: string) => void
  listWorkspaceTree: (
    workspaceRoot: string,
    opts: { includeHidden?: boolean; includeNodeModules?: boolean },
  ) => Promise<{ nodes?: WorkspaceTreeNode[] }>
}

export interface ExplorerWorkflowControllerContext {
  workspaceRoot: string | null
  workspaceTree: WorkspaceTreeNode[]
  expandedDirectories: Record<string, boolean>
  setExpandedDirectories: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  setSelectedWorkspaceFile: (v: string | null | ((prev: string | null) => string | null)) => void
  setDockTab: (tab: 'settings' | 'orchestrator' | 'explorer' | 'git') => void
  setExplorerContextMenu: (v: { x: number; y: number; relativePath: string } | null) => void
  workspaceTreeRef: React.MutableRefObject<WorkspaceTreeNode[]>
  lastFindInPageQueryRef: React.MutableRefObject<string>
  lastFindInFilesQueryRef: React.MutableRefObject<string>
  selectedWorkspaceFileRef: React.MutableRefObject<string | null>
  showHiddenFilesRef: React.MutableRefObject<boolean>
  showNodeModulesRef: React.MutableRefObject<boolean>
  api: ExplorerWorkflowApi
  openEditorForRelativePath: (relativePath: string) => void | Promise<void>
  formatError: (err: unknown) => string
}

export interface ExplorerWorkflowController {
  findInPageFromMenu: () => void
  findInFilesFromMenu: () => Promise<void>
  collectWorkspaceFilePaths: (nodes: WorkspaceTreeNode[]) => string[]
  toggleDirectory: (relativePath: string) => void
  isDirectoryExpanded: (relativePath: string, depth: number) => boolean
  expandAllDirectories: () => void
  collapseAllDirectories: () => void
  openExplorerContextMenu: (x: number, y: number, relativePath: string) => void
  closeExplorerContextMenu: () => void
  openFileFromExplorerContextMenu: (relativePath: string) => void
}

function collectWorkspaceFilePaths(nodes: WorkspaceTreeNode[]): string[] {
  const paths: string[] = []
  const walk = (items: WorkspaceTreeNode[]) => {
    for (const item of items) {
      if (item.type === 'file') {
        paths.push(item.relativePath)
        continue
      }
      if (item.children?.length) {
        walk(item.children)
      }
    }
  }
  walk(nodes)
  return paths
}

export function createExplorerWorkflowController(
  ctx: ExplorerWorkflowControllerContext,
): ExplorerWorkflowController {
  const {
    workspaceRoot,
    workspaceTree,
    expandedDirectories,
    setExpandedDirectories,
    setSelectedWorkspaceFile,
    setDockTab,
    setExplorerContextMenu,
    workspaceTreeRef,
    lastFindInPageQueryRef,
    lastFindInFilesQueryRef,
    selectedWorkspaceFileRef,
    showHiddenFilesRef,
    showNodeModulesRef,
    api,
    openEditorForRelativePath,
    formatError,
  } = ctx

  function findInPageFromMenu() {
    const input = prompt('Find', lastFindInPageQueryRef.current)
    if (input === null) return
    const query = input.trim()
    if (!query) return
    lastFindInPageQueryRef.current = query
    void api.findInPage?.(query)
  }

  async function findInFilesFromMenu() {
    const input = prompt(
      'Find in Files (file name contains)',
      lastFindInFilesQueryRef.current || selectedWorkspaceFileRef.current || '',
    )
    if (input === null) return
    const query = input.trim()
    if (!query) return
    lastFindInFilesQueryRef.current = query

    let nodes = workspaceTreeRef.current
    if (nodes.length === 0 && workspaceRoot) {
      try {
        const result = await api.listWorkspaceTree(workspaceRoot, {
          includeHidden: showHiddenFilesRef.current,
          includeNodeModules: showNodeModulesRef.current,
        })
        nodes = result?.nodes ?? []
      } catch (err) {
        alert(`Could not scan workspace files: ${formatError(err)}`)
        return
      }
    }

    const normalized = query.toLowerCase()
    const matches = collectWorkspaceFilePaths(nodes).filter((relativePath) =>
      relativePath.toLowerCase().includes(normalized),
    )
    if (matches.length === 0) {
      alert(`No files found for "${query}".`)
      return
    }

    const first = matches[0]
    await openEditorForRelativePath(first)
    setSelectedWorkspaceFile(first)
    setDockTab('explorer')
  }

  function toggleDirectory(relativePath: string) {
    setExpandedDirectories((prev) => ({ ...prev, [relativePath]: !prev[relativePath] }))
  }

  function isDirectoryExpanded(relativePath: string, depth: number) {
    if (relativePath in expandedDirectories) return Boolean(expandedDirectories[relativePath])
    return depth < 1
  }

  function expandAllDirectories() {
    const next: Record<string, boolean> = {}
    for (const relativePath of collectDirectoryPaths(workspaceTree)) {
      next[relativePath] = true
    }
    setExpandedDirectories(next)
  }

  function collapseAllDirectories() {
    const next: Record<string, boolean> = {}
    for (const relativePath of collectDirectoryPaths(workspaceTree)) {
      next[relativePath] = false
    }
    setExpandedDirectories(next)
  }

  function openExplorerContextMenu(x: number, y: number, relativePath: string) {
    setSelectedWorkspaceFile(relativePath)
    setExplorerContextMenu({ x, y, relativePath })
  }

  function closeExplorerContextMenu() {
    setExplorerContextMenu(null)
  }

  function openFileFromExplorerContextMenu(relativePath: string) {
    void openEditorForRelativePath(relativePath)
    setExplorerContextMenu(null)
  }

  return {
    findInPageFromMenu,
    findInFilesFromMenu,
    collectWorkspaceFilePaths,
    toggleDirectory,
    isDirectoryExpanded,
    expandAllDirectories,
    collapseAllDirectories,
    openExplorerContextMenu,
    closeExplorerContextMenu,
    openFileFromExplorerContextMenu,
  }
}
