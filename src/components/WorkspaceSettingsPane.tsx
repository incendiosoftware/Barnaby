/**
 * Workspace settings pane - folder path, default model, sandbox, permissions.
 */

import React from 'react'
import type { PermissionMode, SandboxMode, WorkspaceSettings, WorkspaceSettingsTextDraft } from '../types'
import { UI_INPUT_CLASS, UI_SELECT_CLASS } from '../constants'
import { CloseIcon } from './icons'

function sandboxModeDescription(mode: SandboxMode): string {
  if (mode === 'read-only') return 'Read project files only; no file edits or shell writes.'
  return 'Can edit files and run commands inside the workspace folder.'
}

export interface WorkspaceSettingsPaneProps {
  workspaceForm: WorkspaceSettings
  workspaceFormTextDraft: WorkspaceSettingsTextDraft
  modelOptions: string[]
  onPathChange: (path: string) => void
  onPathBlur: (path: string) => void
  onBrowse: () => void
  onDefaultModelChange: (value: string) => void
  onSandboxChange: (value: SandboxMode) => void
  onPermissionModeChange: (value: PermissionMode) => void
  onWorkspaceContextChange: (value: string) => void
  onShowWorkspaceContextInPromptChange: (value: boolean) => void
  onSystemPromptChange: (value: string) => void
  onTextDraftChange: (field: keyof WorkspaceSettingsTextDraft, value: string) => void
  onClose?: () => void
}

export function WorkspaceSettingsPane({
  workspaceForm,
  workspaceFormTextDraft,
  modelOptions,
  onPathChange,
  onPathBlur,
  onBrowse,
  onDefaultModelChange,
  onSandboxChange,
  onPermissionModeChange,
  onWorkspaceContextChange,
  onShowWorkspaceContextInPromptChange,
  onSystemPromptChange,
  onTextDraftChange,
  onClose,
}: WorkspaceSettingsPaneProps) {
  return (
    <div className="h-full min-h-0 flex flex-col bg-neutral-50 dark:bg-neutral-900">
      <div className="px-3 py-3 border-b border-neutral-200/80 dark:border-neutral-800 text-xs flex items-center justify-between gap-2">
        <span className="font-medium text-neutral-700 dark:text-neutral-300">Workspace settings</span>
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
      <div className="flex-1 overflow-auto px-3 py-3">
        <div className="space-y-3 text-xs">
          <div className="space-y-1.5">
            <label className="text-neutral-600 dark:text-neutral-300">Folder location</label>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                className={`w-full ${UI_INPUT_CLASS} font-mono text-xs`}
                value={workspaceForm.path}
                onChange={(e) => onPathChange(e.target.value)}
                onBlur={(e) => onPathBlur(e.target.value)}
              />
              <button
                type="button"
                className="h-8 w-8 inline-flex items-center justify-center rounded-md bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                onClick={onBrowse}
                title="Browse for workspace folder"
                aria-label="Browse for workspace folder"
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M2.5 4.5H6.2L7.4 5.7H13.5V11.8C13.5 12.4 13.1 12.8 12.5 12.8H3.5C2.9 12.8 2.5 12.4 2.5 11.8V4.5Z" stroke="currentColor" strokeWidth="1.1" />
                  <path d="M2.5 6.2H13.5" stroke="currentColor" strokeWidth="1.1" />
                </svg>
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-neutral-600 dark:text-neutral-300">Default model</label>
            <select
              className={`w-full ${UI_SELECT_CLASS}`}
              value={workspaceForm.defaultModel}
              onChange={(e) => onDefaultModelChange(e.target.value)}
            >
              {modelOptions.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-neutral-600 dark:text-neutral-300">Workspace context</label>
            <textarea
              className={`w-full max-w-full min-h-[64px] resize-y ${UI_INPUT_CLASS} text-xs`}
              value={workspaceForm.workspaceContext}
              onChange={(e) => onWorkspaceContextChange(e.target.value)}
              placeholder="Describe this workspace and its purpose."
            />
            <label className="inline-flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={workspaceForm.showWorkspaceContextInPrompt}
                onChange={(e) => onShowWorkspaceContextInPromptChange(e.target.checked)}
              />
              Show workspace context in prompt.
            </label>
          </div>
          <div className="space-y-1.5">
            <label className="text-neutral-600 dark:text-neutral-300">System prompt</label>
            <textarea
              className={`w-full max-w-full min-h-[96px] resize-y ${UI_INPUT_CLASS} text-xs`}
              value={workspaceForm.systemPrompt}
              onChange={(e) => onSystemPromptChange(e.target.value)}
              placeholder="Additional system instructions for agents in this workspace."
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-neutral-600 dark:text-neutral-300">Sandbox</label>
            <select
              className={`w-full ${UI_SELECT_CLASS}`}
              value={workspaceForm.sandbox}
              onChange={(e) => onSandboxChange(e.target.value as SandboxMode)}
            >
              <option value="read-only">Read only</option>
              <option value="workspace-write">Workspace write</option>
            </select>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {sandboxModeDescription(workspaceForm.sandbox)}
            </p>
          </div>
          {workspaceForm.sandbox !== 'read-only' && (
            <div className="space-y-1.5">
              <label className="text-neutral-600 dark:text-neutral-300">Permissions</label>
              <select
                className={`w-full ${UI_SELECT_CLASS}`}
                value={workspaceForm.permissionMode}
                onChange={(e) => onPermissionModeChange(e.target.value as PermissionMode)}
              >
                <option value="verify-first">Verify first (safer)</option>
                <option value="proceed-always">Proceed always (autonomous)</option>
              </select>
            </div>
          )}
          {workspaceForm.sandbox !== 'read-only' && workspaceForm.permissionMode === 'proceed-always' && (
            <>
              <div className="space-y-1.5">
                <label className="text-neutral-600 dark:text-neutral-300">Allowed command prefixes</label>
                <textarea
                  className={`w-full max-w-full min-h-[96px] resize-y ${UI_INPUT_CLASS} font-mono text-xs`}
                  value={workspaceFormTextDraft.allowedCommandPrefixes}
                  onChange={(e) => onTextDraftChange('allowedCommandPrefixes', e.target.value)}
                  placeholder={'npm run\nnpm test\ntsc\ngit status'}
                />
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  One prefix per line. Leave blank to allow all commands in Proceed always mode.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-neutral-600 dark:text-neutral-300">Allowed auto-read paths</label>
                <textarea
                  className={`w-full max-w-full min-h-[64px] resize-y ${UI_INPUT_CLASS} font-mono text-xs`}
                  value={workspaceFormTextDraft.allowedAutoReadPrefixes}
                  onChange={(e) => onTextDraftChange('allowedAutoReadPrefixes', e.target.value)}
                  placeholder={'(Leave blank to allow reading any file)'}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-neutral-600 dark:text-neutral-300">Allowed auto-write paths</label>
                <textarea
                  className={`w-full max-w-full min-h-[64px] resize-y ${UI_INPUT_CLASS} font-mono text-xs`}
                  value={workspaceFormTextDraft.allowedAutoWritePrefixes}
                  onChange={(e) => onTextDraftChange('allowedAutoWritePrefixes', e.target.value)}
                  placeholder={'(Leave blank to allow editing any file)'}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-neutral-600 dark:text-neutral-300">Denied auto-read paths</label>
                <textarea
                  className={`w-full max-w-full min-h-[64px] resize-y ${UI_INPUT_CLASS} font-mono text-xs`}
                  value={workspaceFormTextDraft.deniedAutoReadPrefixes}
                  onChange={(e) => onTextDraftChange('deniedAutoReadPrefixes', e.target.value)}
                  placeholder={'../\n.env'}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-neutral-600 dark:text-neutral-300">Denied auto-write paths</label>
                <textarea
                  className={`w-full max-w-full min-h-[64px] resize-y ${UI_INPUT_CLASS} font-mono text-xs`}
                  value={workspaceFormTextDraft.deniedAutoWritePrefixes}
                  onChange={(e) => onTextDraftChange('deniedAutoWritePrefixes', e.target.value)}
                  placeholder={'../\n.env'}
                />
              </div>
            </>
          )}
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Changes in this panel are saved immediately.
          </p>
        </div>
      </div>
    </div>
  )
}
