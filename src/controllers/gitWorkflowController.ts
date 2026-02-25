/**
 * Git workflow handlers - status refresh, selection, operations, context menu.
 * Use for: git status, commit/push/deploy/build/release, entry selection, context menu.
 */

import type React from 'react'
import type { GitOperation, GitStatusEntry, GitStatusState } from '../types'

export interface GitWorkflowApi {
  getGitStatus: (workspaceRoot: string) => Promise<GitStatusState>
  gitCommit: (workspaceRoot: string, paths?: string[]) => Promise<{ ok: boolean; error?: string }>
  gitPush: (workspaceRoot: string, paths?: string[]) => Promise<{ ok: boolean; error?: string }>
  gitDeploy: (workspaceRoot: string, paths?: string[]) => Promise<{ ok: boolean; error?: string }>
  gitBuild: (workspaceRoot: string, paths?: string[]) => Promise<{ ok: boolean; error?: string }>
  gitRelease: (workspaceRoot: string, paths?: string[]) => Promise<{ ok: boolean; error?: string }>
}

export interface GitWorkflowControllerContext {
  workspaceRoot: string | null
  gitStatus: { entries: GitStatusEntry[] } | null
  selectedGitPaths: string[]
  gitSelectionAnchorPath: string | null
  gitOperationPending: GitOperation | null
  setGitStatus: React.Dispatch<React.SetStateAction<GitStatusState | null>>
  setGitStatusLoading: (v: boolean | ((prev: boolean) => boolean)) => void
  setGitStatusError: (v: string | null | ((prev: string | null) => string | null)) => void
  setGitOperationPending: (v: GitOperation | null | ((prev: GitOperation | null) => GitOperation | null)) => void
  setGitOperationSuccess: React.Dispatch<React.SetStateAction<{ op: GitOperation; at: number } | null>>
  setGitContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; relativePath: string; deleted: boolean } | null>>
  setSelectedWorkspaceFile: (v: string | null | ((prev: string | null) => string | null)) => void
  setSelectedGitPaths: React.Dispatch<React.SetStateAction<string[]>>
  setGitSelectionAnchorPath: (v: string | null | ((prev: string | null) => string | null)) => void
  setExplorerContextMenu: (v: { x: number; y: number; relativePath: string } | null) => void
  api: GitWorkflowApi
  formatError: (err: unknown) => string
}

export interface GitWorkflowController {
  refreshGitStatus: () => Promise<void>
  resolveGitSelection: (candidatePaths?: string[]) => string[]
  runGitOperation: (op: GitOperation, candidatePaths?: string[]) => Promise<void>
  selectSingleGitEntry: (relativePath: string) => void
  handleGitEntryClick: (entry: GitStatusEntry, event: React.MouseEvent<HTMLButtonElement>) => void
  openGitContextMenu: (event: React.MouseEvent<HTMLButtonElement>, entry: GitStatusEntry) => void
}

export function createGitWorkflowController(ctx: GitWorkflowControllerContext): GitWorkflowController {
  const {
    workspaceRoot,
    gitStatus,
    selectedGitPaths,
    gitSelectionAnchorPath,
    gitOperationPending,
    setGitStatus,
    setGitStatusLoading,
    setGitStatusError,
    setGitOperationPending,
    setGitOperationSuccess,
    setGitContextMenu,
    setSelectedWorkspaceFile,
    setSelectedGitPaths,
    setGitSelectionAnchorPath,
    setExplorerContextMenu,
    api,
    formatError,
  } = ctx

  async function refreshGitStatus() {
    if (!workspaceRoot) {
      setGitStatus(null)
      setGitStatusError(null)
      return
    }
    setGitStatusLoading(true)
    setGitStatusError(null)
    try {
      const result = await api.getGitStatus(workspaceRoot)
      setGitStatus(result)
      setGitStatusError(result.ok ? null : result.error ?? 'Unable to load git status.')
    } catch (err) {
      setGitStatus(null)
      setGitStatusError(formatError(err))
    } finally {
      setGitStatusLoading(false)
    }
  }

  function resolveGitSelection(candidatePaths?: string[]) {
    const entries = gitStatus?.entries ?? []
    if (entries.length === 0) return []
    const source = candidatePaths && candidatePaths.length > 0 ? candidatePaths : selectedGitPaths
    if (source.length === 0) return []
    const valid = new Set(entries.map((entry) => entry.relativePath))
    const resolved: string[] = []
    for (const path of source) {
      if (!valid.has(path)) continue
      if (!resolved.includes(path)) resolved.push(path)
    }
    return resolved
  }

  async function runGitOperation(op: GitOperation, candidatePaths?: string[]) {
    if (!workspaceRoot || gitOperationPending) return
    const selectedPaths = resolveGitSelection(candidatePaths)
    setGitOperationPending(op)
    setGitOperationSuccess(null)
    setGitStatusError(null)
    try {
      const fn =
        op === 'commit'
          ? api.gitCommit
          : op === 'push'
            ? api.gitPush
            : op === 'deploy'
              ? api.gitDeploy
              : op === 'build'
                ? api.gitBuild
                : api.gitRelease
      const result = await fn(workspaceRoot, selectedPaths.length > 0 ? selectedPaths : undefined)
      if (result.ok) {
        setGitContextMenu(null)
        setGitOperationSuccess({ op, at: Date.now() })
        void refreshGitStatus()
      } else {
        setGitStatusError(result.error ?? `${op} failed`)
      }
    } catch (err) {
      setGitStatusError(`${op}: ${formatError(err)}`)
    } finally {
      setGitOperationPending(null)
    }
  }

  function selectSingleGitEntry(relativePath: string) {
    setSelectedWorkspaceFile(relativePath)
    setSelectedGitPaths([relativePath])
    setGitSelectionAnchorPath(relativePath)
  }

  function handleGitEntryClick(entry: GitStatusEntry, event: React.MouseEvent<HTMLButtonElement>) {
    const entries = gitStatus?.entries ?? []
    const clickedPath = entry.relativePath
    const additive = event.metaKey || event.ctrlKey
    setSelectedWorkspaceFile(clickedPath)

    if (event.shiftKey) {
      const anchorPath = gitSelectionAnchorPath ?? selectedGitPaths[selectedGitPaths.length - 1] ?? clickedPath
      const anchorIndex = entries.findIndex((item) => item.relativePath === anchorPath)
      const clickedIndex = entries.findIndex((item) => item.relativePath === clickedPath)
      if (anchorIndex >= 0 && clickedIndex >= 0) {
        const start = Math.min(anchorIndex, clickedIndex)
        const end = Math.max(anchorIndex, clickedIndex)
        const rangePaths = entries.slice(start, end + 1).map((item) => item.relativePath)
        setSelectedGitPaths((prev) => (additive ? [...new Set([...prev, ...rangePaths])] : rangePaths))
        setGitSelectionAnchorPath(anchorPath)
        return
      }
    }

    if (additive) {
      setSelectedGitPaths((prev) => {
        if (prev.includes(clickedPath)) return prev.filter((path) => path !== clickedPath)
        return [...prev, clickedPath]
      })
      setGitSelectionAnchorPath(clickedPath)
      return
    }

    selectSingleGitEntry(clickedPath)
  }

  function openGitContextMenu(event: React.MouseEvent<HTMLButtonElement>, entry: GitStatusEntry) {
    event.preventDefault()
    if (!selectedGitPaths.includes(entry.relativePath)) {
      selectSingleGitEntry(entry.relativePath)
    } else {
      setSelectedWorkspaceFile(entry.relativePath)
    }
    setExplorerContextMenu(null)
    setGitContextMenu({
      x: event.clientX,
      y: event.clientY,
      relativePath: entry.relativePath,
      deleted: !entry.untracked && (entry.indexStatus === 'D' || entry.workingTreeStatus === 'D'),
    })
  }

  return {
    refreshGitStatus,
    resolveGitSelection,
    runGitOperation,
    selectSingleGitEntry,
    handleGitEntryClick,
    openGitContextMenu,
  }
}
