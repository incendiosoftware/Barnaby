/**
 * Git status and operations pane - branch info, file list, commit/push/deploy.
 */

import React from 'react'
import type { GitOperation, GitStatusEntry, GitStatusState } from '../types'
import {
  BuildIcon,
  CloseIcon,
  CommitIcon,
  DeployIcon,
  PushIcon,
  RefreshIcon,
  ReleaseIcon,
  SpinnerIcon,
} from './icons'

function gitStatusText(entry: GitStatusEntry): string {
  if (entry.untracked) return '??'
  return `${entry.indexStatus}${entry.workingTreeStatus}`
}

function gitEntryClass(entry: GitStatusEntry): string {
  if (entry.untracked) return 'border border-amber-300 text-amber-900 dark:border-amber-800 dark:text-amber-200'
  if (entry.staged && entry.unstaged) return 'border border-purple-300 text-purple-900 dark:border-purple-800 dark:text-purple-200'
  if (entry.staged) return 'border border-green-300 text-green-900 dark:border-green-800 dark:text-green-200'
  if (entry.unstaged) return 'border border-orange-300 text-orange-900 dark:border-orange-800 dark:text-orange-200'
  return 'border border-neutral-300 text-neutral-800 dark:border-neutral-700 dark:text-neutral-100'
}

function isDeletedGitEntry(entry: GitStatusEntry): boolean {
  if (entry.untracked) return false
  return entry.indexStatus === 'D' || entry.workingTreeStatus === 'D'
}

import { formatCheckedAt } from '../utils/appCore'

export interface GitPaneProps {
  gitStatus: GitStatusState | null
  gitStatusLoading: boolean
  gitStatusError: string | null
  gitOperationPending: GitOperation | null
  gitOperationSuccess: { op: GitOperation; at: number } | null
  workspaceRoot: string
  resolvedSelectedPaths: string[]
  onRunOperation: (op: GitOperation) => void
  onRefresh: () => void
  onEntryClick: (entry: GitStatusEntry, event: React.MouseEvent<HTMLButtonElement>) => void
  onEntryDoubleClick: (relativePath: string) => void
  onEntryContextMenu: (event: React.MouseEvent<HTMLButtonElement>, entry: GitStatusEntry) => void
  onClose?: () => void
}

export function GitPane({
  gitStatus,
  gitStatusLoading,
  gitStatusError,
  gitOperationPending,
  gitOperationSuccess,
  workspaceRoot,
  resolvedSelectedPaths,
  onRunOperation,
  onRefresh,
  onEntryClick,
  onEntryDoubleClick,
  onEntryContextMenu,
  onClose,
}: GitPaneProps) {
  const canShowEntries = Boolean(gitStatus?.ok)
  const entries = gitStatus?.entries ?? []
  const selectedPathSet = new Set(resolvedSelectedPaths)
  const hasSelection = resolvedSelectedPaths.length > 0
  const hasChanges = Boolean(gitStatus?.ok && !gitStatus?.clean)
  const canCommit = hasSelection ? resolvedSelectedPaths.length > 0 : hasChanges
  const busy = Boolean(gitOperationPending)
  const commitTitle = hasSelection ? `Commit selected changes (${resolvedSelectedPaths.length})` : 'Commit all changes'
  const pushTitle = hasSelection ? `Push (commit selected ${resolvedSelectedPaths.length} first)` : 'Push'
  const iconBtnClass =
    'h-8 w-8 inline-flex items-center justify-center rounded-md border-0 bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <div className="h-full min-h-0 flex flex-col bg-neutral-50 dark:bg-neutral-900">
      <div className="px-3 py-3 border-b border-neutral-200/80 dark:border-neutral-800 text-xs flex items-center justify-between gap-2">
        <span className="font-medium text-neutral-700 dark:text-neutral-300 truncate">Git</span>
        <div className="flex items-center gap-1 shrink-0">
          {onClose && (
            <button
              type="button"
              className="h-6 w-6 inline-flex items-center justify-center rounded border-0 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:text-neutral-200 dark:hover:bg-neutral-700"
              onClick={onClose}
              title="Close"
              aria-label="Close"
            >
              <CloseIcon size={12} />
            </button>
          )}
          <button
            type="button"
            className={iconBtnClass}
            title={commitTitle}
            aria-label={commitTitle}
            disabled={!canCommit || busy}
            onClick={() => void onRunOperation('commit')}
          >
            <CommitIcon size={18} />
          </button>
          <button
            type="button"
            className={iconBtnClass}
            title={pushTitle}
            aria-label={pushTitle}
            disabled={busy || !gitStatus?.ok}
            onClick={() => void onRunOperation('push')}
          >
            <PushIcon size={18} />
          </button>
          <button
            type="button"
            className={iconBtnClass}
            title="Deploy"
            aria-label="Deploy"
            disabled={busy || !workspaceRoot}
            onClick={() => void onRunOperation('deploy')}
          >
            <DeployIcon size={18} />
          </button>
          <button
            type="button"
            className={iconBtnClass}
            title="Build"
            aria-label="Build"
            disabled={busy || !workspaceRoot}
            onClick={() => void onRunOperation('build')}
          >
            <BuildIcon size={18} />
          </button>
          <button
            type="button"
            className={iconBtnClass}
            title="Release"
            aria-label="Release"
            disabled={busy || !workspaceRoot}
            onClick={() => void onRunOperation('release')}
          >
            <ReleaseIcon size={18} />
          </button>
          <button
            type="button"
            className={iconBtnClass}
            title="Refresh"
            aria-label="Refresh"
            disabled={busy}
            onClick={onRefresh}
          >
            <RefreshIcon size={18} />
          </button>
        </div>
      </div>
      {(gitOperationPending || gitOperationSuccess) && (
        <div
          className={`px-3 py-2 text-xs flex items-center gap-2 ${
            gitOperationPending
              ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 border-b border-blue-200/60 dark:border-blue-800/50'
              : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 border-b border-emerald-200/60 dark:border-emerald-800/50'
          }`}
        >
          {gitOperationPending ? (
            <>
              <SpinnerIcon size={14} className="animate-spin shrink-0" />
              <span>
                {gitOperationPending === 'commit' && 'Committing…'}
                {gitOperationPending === 'push' && 'Pushing…'}
                {gitOperationPending === 'deploy' && 'Deploying…'}
                {gitOperationPending === 'build' && 'Building…'}
                {gitOperationPending === 'release' && 'Releasing…'}
              </span>
            </>
          ) : gitOperationSuccess ? (
            <>
              <svg width="18" height="18" viewBox="0 0 14 14" fill="none" className="shrink-0" aria-hidden>
                <path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>
                {gitOperationSuccess.op === 'commit' && 'Commit done'}
                {gitOperationSuccess.op === 'push' && 'Push done'}
                {gitOperationSuccess.op === 'deploy' && 'Deploy done'}
                {gitOperationSuccess.op === 'build' && 'Build done'}
                {gitOperationSuccess.op === 'release' && 'Release done'}
              </span>
            </>
          ) : null}
        </div>
      )}
      <div className="px-3 py-3 border-b border-neutral-200/80 dark:border-neutral-800 text-xs space-y-1.5">
        <div className="font-mono truncate" title={gitStatus?.branch ?? '(unknown)'}>
          Branch: {gitStatus?.branch ?? '(unknown)'}
        </div>
        <div className="flex flex-wrap gap-1 text-[11px]">
          <span className="px-2 py-0.5 rounded bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200">
            Staged {gitStatus?.stagedCount ?? 0}
          </span>
          <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-200">
            Changed {gitStatus?.unstagedCount ?? 0}
          </span>
          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
            Untracked {gitStatus?.untrackedCount ?? 0}
          </span>
        </div>
        <div className="text-neutral-500 dark:text-neutral-400">
          Ahead {gitStatus?.ahead ?? 0}, behind {gitStatus?.behind ?? 0} | Updated {formatCheckedAt(gitStatus?.checkedAt)}
        </div>
        {hasSelection && (
          <div className="text-blue-700 dark:text-blue-300">
            Selected {resolvedSelectedPaths.length} {resolvedSelectedPaths.length === 1 ? 'file' : 'files'}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-0.5">
        {gitStatusLoading && <p className="text-xs text-neutral-500 dark:text-neutral-400 px-1">Loading git status...</p>}
        {!gitStatusLoading && gitStatusError && <p className="text-xs text-red-600 dark:text-red-400 px-1">{gitStatusError}</p>}
        {!gitStatusLoading && canShowEntries && gitStatus?.clean && (
          <div className="m-1 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 px-3 py-4 text-xs text-neutral-500 dark:text-neutral-400">
            Working tree clean.
          </div>
        )}
        {!gitStatusLoading &&
          canShowEntries &&
          entries.map((entry) => {
            const selected = selectedPathSet.has(entry.relativePath)
            return (
              <button
                key={`${entry.relativePath}-${entry.indexStatus}-${entry.workingTreeStatus}`}
                type="button"
                aria-selected={selected}
                className={`w-full text-left px-2.5 py-1 rounded-md text-xs font-mono border text-neutral-800 dark:text-neutral-200 ${
                  selected
                    ? 'bg-blue-50/90 border-blue-300 dark:bg-blue-950/30 dark:border-blue-800'
                    : 'border-transparent bg-transparent hover:bg-blue-50/70 dark:hover:bg-blue-900/20 active:bg-blue-100/70 dark:active:bg-blue-900/40 hover:border-blue-200 dark:hover:border-blue-900/60'
                }`}
                onClick={(e) => onEntryClick(entry, e)}
                onDoubleClick={() => !isDeletedGitEntry(entry) && void onEntryDoubleClick(entry.relativePath)}
                onContextMenu={(e) => onEntryContextMenu(e, entry)}
                title={entry.relativePath}
              >
                <div className="flex items-start gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] shrink-0 ${gitEntryClass(entry)}`}>
                    {gitStatusText(entry)}
                  </span>
                  <span className={`truncate flex-1 ${isDeletedGitEntry(entry) ? 'line-through opacity-70' : ''}`}>
                    {entry.relativePath}
                  </span>
                </div>
                {entry.renamedFrom && (
                  <div className="pl-8 text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                    from {entry.renamedFrom}
                  </div>
                )}
              </button>
            )
          })}
      </div>
    </div>
  )
}
