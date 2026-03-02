/**
 * Editor panel - single file editor with toolbar, CodeMirror, status bar.
 * Use for: standalone editor pane (e.g. in grid layout).
 */

import React from 'react'
import { CodeMirrorEditor } from '../CodeMirrorEditor'
import type { ApplicationSettings, EditorPanelState, StandaloneTheme } from '../../types'
import { UI_CLOSE_ICON_BUTTON_CLASS, UI_TOOLBAR_ICON_BUTTON_CLASS } from '../../constants'

export interface EditorPanelProps {
  panel: EditorPanelState
  isFocused: boolean
  applicationSettings: ApplicationSettings
  activeTheme: StandaloneTheme
  onFocus: () => void
  onWheel: (e: React.WheelEvent) => void
  onSave: () => void
  onSaveAs: () => void
  onClose: () => void
  onContentChange: (value: string) => void
}

export function EditorPanel({
  panel,
  isFocused,
  applicationSettings,
  activeTheme,
  onFocus,
  onWheel,
  onSave,
  onSaveAs,
  onClose,
  onContentChange,
}: EditorPanelProps) {
  const saveDisabled = panel.loading || panel.saving || panel.binary || !panel.dirty
  const saveAsDisabled = panel.loading || panel.saving || panel.binary

  return (
    <div
      className={[
        'h-full min-h-0 min-w-0 flex flex-col rounded-xl border bg-white dark:bg-neutral-950 overflow-hidden outline-none shadow-sm',
        isFocused
          ? 'border-blue-400 dark:border-blue-600 ring-2 ring-blue-100 dark:ring-blue-900/40'
          : 'border-neutral-200/90 dark:border-neutral-800',
      ].join(' ')}
      tabIndex={0}
      onFocusCapture={onFocus}
      onMouseDownCapture={onFocus}
      onWheel={onWheel}
    >
      <div className="px-3 py-2.5 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate" title={panel.relativePath}>
            {panel.title}{panel.dirty ? ' *' : ''}
          </div>
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono truncate" title={panel.relativePath}>
            {panel.relativePath}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={UI_TOOLBAR_ICON_BUTTON_CLASS}
            disabled={saveDisabled}
            onClick={onSave}
            aria-label="Save"
            title="Save (Ctrl+S)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3.5C3 2.95 3.45 2.5 4 2.5H10.7L13 4.8V12.5C13 13.05 12.55 13.5 12 13.5H4C3.45 13.5 3 13.05 3 12.5V3.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              <path d="M5 2.5H10V6H5V2.5Z" stroke="currentColor" strokeWidth="1.2" />
              <path d="M5.2 9.5H10.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className={UI_TOOLBAR_ICON_BUTTON_CLASS}
            disabled={saveAsDisabled}
            onClick={onSaveAs}
            aria-label="Save As"
            title="Save As (Ctrl+Shift+S)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3.5C3 2.95 3.45 2.5 4 2.5H10.7L13 4.8V12.5C13 13.05 12.55 13.5 12 13.5H4C3.45 13.5 3 13.05 3 12.5V3.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              <path d="M5 2.5H10V6H5V2.5Z" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8 8.4V12.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M6.1 10.3H9.9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className={UI_CLOSE_ICON_BUTTON_CLASS}
            onClick={onClose}
            title="Close editor"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden bg-neutral-50 dark:bg-neutral-900">
        {panel.loading && (
          <div className="p-4 text-sm text-neutral-600 dark:text-neutral-400">Loading file...</div>
        )}
        {!panel.loading && panel.error && (
          <div className="p-4 text-sm text-red-600 dark:text-red-400">{panel.error}</div>
        )}
        {!panel.loading && !panel.error && panel.binary && (
          <div className="p-4 text-sm text-neutral-600 dark:text-neutral-400">
            Binary files are not editable in this editor.
          </div>
        )}
        {!panel.loading && !panel.error && !panel.binary && (
          <div className="h-full min-h-0 flex flex-col overflow-hidden">
            <CodeMirrorEditor
              value={panel.content}
              onChange={onContentChange}
              readOnly={false}
              filename={panel.relativePath}
              wordWrap={applicationSettings.editorWordWrap}
              fontScale={panel.fontScale}
              darkMode={activeTheme.codeSyntax === 'dark'}
              onSave={onSave}
              onSaveAs={onSaveAs}
              onFocus={onFocus}
            />
          </div>
        )}
      </div>
      <div className="px-3 py-1.5 border-t border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center justify-between">
        <span>{Math.round(panel.size / 1024)} KB</span>
        <span>
          {panel.saving
            ? 'Saving...'
            : panel.dirty
              ? 'Unsaved changes'
              : panel.savedAt
                ? `Saved ${new Date(panel.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Saved'}
        </span>
      </div>
    </div>
  )
}
