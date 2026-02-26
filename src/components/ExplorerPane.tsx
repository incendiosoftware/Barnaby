/**
 * Workspace file explorer pane - file tree with expand/collapse and context menu.
 */

import React from 'react'
import type { ExplorerPrefs, WorkspaceTreeNode } from '../types'
import { CloseIcon, CollapseAllIcon, ExpandAllIcon, RefreshIcon } from './icons'

export interface ExplorerPaneProps {
  workspaceTree: WorkspaceTreeNode[]
  workspaceTreeLoading: boolean
  workspaceTreeError: string | null
  workspaceTreeTruncated: boolean
  showHiddenFiles: boolean
  showNodeModules: boolean
  onExplorerPrefsChange: (prefs: ExplorerPrefs) => void
  onRefresh: () => void
  onExpandAll: () => void
  onCollapseAll: () => void
  expandedDirectories: Record<string, boolean>
  isDirectoryExpanded: (relativePath: string, depth: number) => boolean
  onToggleDirectory: (relativePath: string) => void
  selectedWorkspaceFile: string | null
  onSelectFile: (relativePath: string) => void
  onOpenFile: (relativePath: string) => void
  onOpenContextMenu: (x: number, y: number, relativePath: string) => void
  onCloseGitContextMenu: () => void
  onClose?: () => void
}

export function ExplorerPane({
  workspaceTree,
  workspaceTreeLoading,
  workspaceTreeError,
  workspaceTreeTruncated,
  showHiddenFiles,
  showNodeModules,
  onExplorerPrefsChange,
  onRefresh,
  onExpandAll,
  onCollapseAll,
  expandedDirectories,
  isDirectoryExpanded,
  onToggleDirectory,
  selectedWorkspaceFile,
  onSelectFile,
  onOpenFile,
  onOpenContextMenu,
  onCloseGitContextMenu,
  onClose,
}: ExplorerPaneProps) {
  function renderExplorerNode(node: WorkspaceTreeNode, depth = 0): React.ReactNode {
    const rowPadding = 8 + depth * 10
    if (node.type === 'file') {
      const selected = selectedWorkspaceFile === node.relativePath
      return (
        <button
          key={node.relativePath}
          type="button"
          role="treeitem"
          aria-selected={selected}
          className={`w-full appearance-none text-left py-1 pr-2 rounded-md text-xs font-mono flex items-center gap-2 truncate border border-transparent bg-transparent hover:bg-transparent active:bg-transparent outline-none focus-visible:ring-1 focus-visible:ring-blue-400/60 ${
            selected
              ? 'border-blue-300 text-blue-800 dark:border-blue-800 dark:text-blue-100'
              : 'text-neutral-700 hover:border-neutral-300 dark:text-neutral-300 dark:hover:border-neutral-700'
          }`}
          style={{ paddingLeft: `${rowPadding}px` }}
          onClick={() => onSelectFile(node.relativePath)}
          onDoubleClick={() => onOpenFile(node.relativePath)}
          onContextMenu={(e) => {
            e.preventDefault()
            onCloseGitContextMenu()
            onOpenContextMenu(e.clientX, e.clientY, node.relativePath)
          }}
          title={node.relativePath}
        >
          <span className="text-neutral-400 dark:text-neutral-500">•</span>
          <span className="truncate">{node.name}</span>
        </button>
      )
    }

    const expanded = isDirectoryExpanded(node.relativePath, depth)
    return (
      <div key={node.relativePath}>
        <button
          type="button"
          role="treeitem"
          aria-expanded={expanded}
          className="w-full appearance-none text-left py-1 pr-2 rounded-md text-xs font-mono flex items-center gap-2 truncate border border-transparent bg-transparent hover:bg-transparent active:bg-transparent outline-none focus-visible:ring-1 focus-visible:ring-blue-400/60 text-neutral-700 hover:border-neutral-300 dark:text-neutral-200 dark:hover:border-neutral-700"
          style={{ paddingLeft: `${rowPadding}px` }}
          onClick={() => onToggleDirectory(node.relativePath)}
          title={node.relativePath}
        >
          <span className="w-3 text-neutral-500 dark:text-neutral-400">{expanded ? '▾' : '▸'}</span>
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && (
          <div role="group" className="ml-3 border-l border-neutral-200/70 dark:border-neutral-800/80 pl-1">
            {node.children?.map((child) => renderExplorerNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-neutral-50 dark:bg-neutral-900">
      <div className="px-3 py-2.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-neutral-700 dark:text-neutral-300">Workspace folder</span>
          {onClose && (
            <button
              type="button"
              className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:text-neutral-200 dark:hover:bg-neutral-700"
              onClick={onClose}
              title="Close"
              aria-label="Close"
            >
              <CloseIcon size={12} />
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-400">
              <input
                type="checkbox"
                checked={showHiddenFiles}
                onChange={(e) =>
                  onExplorerPrefsChange({
                    showHiddenFiles: e.target.checked,
                    showNodeModules,
                  })
                }
              />
              Hidden
            </label>
            <label className="inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-400">
              <input
                type="checkbox"
                checked={showNodeModules}
                onChange={(e) =>
                  onExplorerPrefsChange({
                    showHiddenFiles,
                    showNodeModules: e.target.checked,
                  })
                }
              />
              node_modules
            </label>
          </div>
          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              className="h-7 w-7 inline-flex items-center justify-center rounded bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              onClick={onRefresh}
              title="Refresh workspace folder"
              aria-label="Refresh workspace folder"
            >
              <RefreshIcon size={16} />
            </button>
            <button
              type="button"
              className="h-7 w-7 inline-flex items-center justify-center rounded bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              onClick={onExpandAll}
              title="Expand all"
              aria-label="Expand all"
            >
              <ExpandAllIcon size={16} />
            </button>
            <button
              type="button"
              className="h-7 w-7 inline-flex items-center justify-center rounded bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              onClick={onCollapseAll}
              title="Collapse all"
              aria-label="Collapse all"
            >
              <CollapseAllIcon size={16} />
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto px-2 pb-2">
        {workspaceTreeLoading && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 px-1">Loading workspace folder...</p>
        )}
        {!workspaceTreeLoading && workspaceTreeError && (
          <p className="text-xs text-red-600 dark:text-red-400 px-1">{workspaceTreeError}</p>
        )}
        {!workspaceTreeLoading && !workspaceTreeError && workspaceTree.length === 0 && (
          <div className="m-1 px-2 py-3 text-xs text-neutral-500 dark:text-neutral-400">
            No files found in this workspace.
          </div>
        )}
        {!workspaceTreeLoading && !workspaceTreeError && (
          <div role="tree" aria-label="Workspace folder">
            {workspaceTree.map((node) => renderExplorerNode(node))}
          </div>
        )}
      </div>
      {workspaceTreeTruncated && (
        <div className="px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
          File list truncated for performance. Use a smaller workspace for full tree view.
        </div>
      )}
    </div>
  )
}
