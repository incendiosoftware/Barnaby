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
    const rowPadding = 8 + depth * 12
    if (node.type === 'file') {
      const selected = selectedWorkspaceFile === node.relativePath
      return (
        <button
          key={node.relativePath}
          type="button"
          role="treeitem"
          aria-selected={selected}
          className={`w-full appearance-none border-0 bg-transparent text-left flex items-center gap-1.5 truncate select-none focus:outline-none ${selected
            ? 'bg-blue-600 text-white dark:bg-blue-600 dark:text-white'
            : 'text-neutral-800 hover:bg-neutral-200/50 dark:text-neutral-300 dark:hover:bg-neutral-800/50'
            }`}
          style={{ paddingLeft: `${rowPadding + 16}px`, height: '22px', fontSize: '13px' }}
          onClick={() => onSelectFile(node.relativePath)}
          onDoubleClick={() => onOpenFile(node.relativePath)}
          onContextMenu={(e) => {
            e.preventDefault()
            onCloseGitContextMenu()
            onOpenContextMenu(e.clientX, e.clientY, node.relativePath)
          }}
          title={node.relativePath}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="opacity-70 shrink-0">
            <path d="M13.85 4.44l-3.28-3.3a.5.5 0 00-.35-.14H3.5A1.5 1.5 0 002 2.5v11A1.5 1.5 0 003.5 15h9a1.5 1.5 0 001.5-1.5V4.79a.5.5 0 00-.15-.35zM10.5 2.21L12.79 4.5H10.5V2.21zM13 13.5a.5.5 0 01-.5.5h-9a.5.5 0 01-.5-.5v-11a.5.5 0 01.5-.5h6.5v3.5A.5.5 0 0010.5 6H13v7.5z" />
          </svg>
          <span className="truncate leading-none mb-[1px]">{node.name}</span>
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
          className="w-full appearance-none border-0 bg-transparent text-left flex items-center gap-1.5 truncate select-none focus:outline-none text-neutral-800 hover:bg-neutral-200/50 dark:text-neutral-300 dark:hover:bg-neutral-800/50"
          style={{ paddingLeft: `${rowPadding}px`, height: '22px', fontSize: '13px' }}
          onClick={() => onToggleDirectory(node.relativePath)}
          title={node.relativePath}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className={`opacity-70 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}>
            <path d="M5.5 3.5v9l5-4.5-5-4.5z" fillRule="evenodd" clipRule="evenodd" />
          </svg>
          <span className="truncate leading-none mb-[1px]">{node.name}</span>
        </button>
        {expanded && (
          <div role="group">
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
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
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
