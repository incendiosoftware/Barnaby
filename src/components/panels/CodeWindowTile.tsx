/**
 * Code window tile - editor tabs, CodeMirror, settings host, toolbar.
 */

import React from 'react'
import { CodeMirrorEditor } from '../CodeMirrorEditor'
import type { ApplicationSettings, EditorPanelState, StandaloneTheme } from '../../types'
import { CODE_WINDOW_TOOLBAR_BUTTON, CODE_WINDOW_TOOLBAR_BUTTON_SM, UI_SELECT_CLASS } from '../../constants'

const DROP_ZONE_OVERLAY_STYLE = {
  backgroundColor: "color-mix(in srgb, var(--theme-accent-500) 28%, transparent)" as const,
}

export interface CodeWindowTileProps {
  editorPanels: EditorPanelState[]
  focusedEditorId: string | null
  codeWindowTab: 'code' | 'settings'
  showWorkspaceWindow: boolean
  workspaceDockSide: 'left' | 'right'
  applicationSettings: ApplicationSettings
  activeTheme: StandaloneTheme
  settingsHostRef: React.RefObject<HTMLDivElement>
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onZoomWheel: (e: React.WheelEvent) => void
  onDockSideToggle: () => void
  onCloseCodeWindow: () => void
  onCodeWindowTabChange: (tab: 'code' | 'settings') => void
  onFocusedEditorChange: (id: string) => void
  onEditorTabChange: (id: string) => void
  onEditModeToggle: (id: string) => void
  onWordWrapToggle: () => void
  onSave: (id: string) => void
  onSaveAs: (id: string) => void
  onCloseEditor: (id: string) => void
  onEditorContentChange: (id: string, value: string) => void
  onMouseDownCapture: (e: React.MouseEvent) => void
  draggingPanelId: string | null
  dragOverTarget: string | { zoneId: string; hint: string } | null
}

export function CodeWindowTile({
  editorPanels,
  focusedEditorId,
  codeWindowTab,
  showWorkspaceWindow,
  workspaceDockSide,
  applicationSettings,
  activeTheme,
  settingsHostRef,
  onDragOver,
  onDrop,
  onDragStart,
  onDragEnd,
  onZoomWheel,
  onDockSideToggle,
  onCloseCodeWindow,
  onCodeWindowTabChange,
  onFocusedEditorChange,
  onEditorTabChange,
  onEditModeToggle,
  onWordWrapToggle,
  onSave,
  onSaveAs,
  onCloseEditor,
  onEditorContentChange,
  onMouseDownCapture,
  draggingPanelId,
  dragOverTarget,
}: CodeWindowTileProps) {
  const activePanel =
    (focusedEditorId ? editorPanels.find((p) => p.id === focusedEditorId) : null) ??
    editorPanels[0] ??
    null
  const hasTabs = editorPanels.length > 0
  const showingSettingsPanel = codeWindowTab === 'settings'

  return (
    <div
      className="relative h-full min-h-0 min-w-0 flex flex-col border border-neutral-200/80 dark:border-neutral-800 rounded-lg overflow-hidden bg-neutral-50 dark:bg-neutral-900 font-editor"
      onMouseDownCapture={onMouseDownCapture}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onWheel={onZoomWheel}
    >
      <div
        data-code-window-dock-tab-bar="true"
        className="px-2.5 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-1.5 bg-neutral-100 dark:bg-neutral-900/80 shrink-0 select-none"
        draggable={showWorkspaceWindow}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            title="Code"
            aria-label="Code"
            className={`h-8 w-8 inline-flex items-center justify-center rounded-md text-xs border font-medium ${
              codeWindowTab === 'code'
                ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-100'
                : 'border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
            }`}
            onClick={() => onCodeWindowTabChange('code')}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 5L3.5 8 6 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 5L12.5 8 10 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 5.7L7 10.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            title="Settings"
            aria-label="Settings"
            className={`h-8 w-8 inline-flex items-center justify-center rounded-md text-xs border font-medium ${
              codeWindowTab === 'settings'
                ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-100'
                : 'border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
            }`}
            onClick={() => onCodeWindowTabChange('settings')}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 5.8A2.2 2.2 0 1 1 8 10.2A2.2 2.2 0 0 1 8 5.8Z" stroke="currentColor" strokeWidth="1.2" />
              <path d="M13.1 8.7V7.3L11.8 6.9C11.7 6.6 11.6 6.4 11.4 6.1L12 4.9L11.1 4L9.9 4.6C9.6 4.4 9.4 4.3 9.1 4.2L8.7 2.9H7.3L6.9 4.2C6.6 4.3 6.4 4.4 6.1 4.6L4.9 4L4 4.9L4.6 6.1C4.4 6.4 4.3 6.6 4.2 6.9L2.9 7.3V8.7L4.2 9.1C4.3 9.4 4.4 9.6 4.6 9.9L4 11.1L4.9 12L6.1 11.4C6.4 11.6 6.6 11.7 6.9 11.8L7.3 13.1H8.7L9.1 11.8C9.4 11.7 9.6 11.6 9.9 11.4L11.1 12L12 11.1L11.4 9.9C11.6 9.6 11.7 9.4 11.8 9.1L13.1 8.7Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          title={`Move dock to ${workspaceDockSide === 'right' ? 'left' : 'right'} side`}
            aria-label={`Move dock to ${workspaceDockSide === 'right' ? 'left' : 'right'} side`}
          className="ml-auto h-8 w-8 inline-flex items-center justify-center rounded-md text-xs border font-medium border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200"
          onClick={onDockSideToggle}
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 5.5H11.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
            <path d="M5.5 3.5L3 5.5L5.5 7.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13 10.5H4.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
            <path d="M10.5 8.5L13 10.5L10.5 12.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          title={showingSettingsPanel ? 'Close settings window' : 'Close code window'}
          aria-label={showingSettingsPanel ? 'Close settings window' : 'Close code window'}
          className="h-8 w-8 inline-flex items-center justify-center rounded-md text-xs border font-medium border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200"
          onClick={onCloseCodeWindow}
        >
          <svg width="12" height="12" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {draggingPanelId && dragOverTarget === 'dock-code' && (
        <div className="absolute inset-0 rounded-lg pointer-events-none z-10" style={DROP_ZONE_OVERLAY_STYLE} />
      )}
      {!showingSettingsPanel && hasTabs && activePanel && (
        <div className="px-2 py-2 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center gap-2 flex-wrap bg-neutral-100 dark:bg-neutral-900/80 shrink-0">
          <span className="text-xs text-neutral-600 dark:text-neutral-400">Current file:</span>
          <select
            className={`flex-1 min-w-0 max-w-[240px] text-[11px] font-mono ${UI_SELECT_CLASS} dark:border-neutral-700/80 dark:bg-neutral-800/80 dark:text-neutral-200`}
            value={focusedEditorId ?? ''}
            onChange={(e) => {
              const id = e.target.value
              if (id) onEditorTabChange(id)
            }}
            title={activePanel.relativePath}
          >
            {editorPanels.map((tab) => (
              <option key={tab.id} value={tab.id} title={tab.relativePath + (tab.dirty ? ' (unsaved)' : '')}>
                {tab.title}{tab.dirty ? ' *' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`px-2 py-1 text-xs rounded border ${
              activePanel.editMode
                ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-100'
                : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700/80 dark:bg-transparent dark:text-neutral-300 dark:hover:bg-neutral-800/80 dark:hover:border-neutral-600'
            }`}
            onClick={() => {
              const id = focusedEditorId ?? editorPanels[0]?.id ?? null
              if (!id) return
              const panel = editorPanels.find((p) => p.id === id)
              const nextMode = !(panel?.editMode ?? false)
              onEditModeToggle(id)
              onFocusedEditorChange(id)
            }}
            disabled={activePanel.loading || activePanel.binary}
            title={activePanel.editMode ? 'Switch to view-only' : 'Enable editing'}
          >
            {activePanel.editMode ? 'View' : 'Edit'}
          </button>
          <button
            type="button"
            className={`${CODE_WINDOW_TOOLBAR_BUTTON} ${applicationSettings.editorWordWrap ? 'shadow-inner bg-neutral-200 border-neutral-400 text-neutral-800 dark:bg-neutral-700/80 dark:border-neutral-600 dark:text-neutral-100' : ''}`}
            onClick={onWordWrapToggle}
            aria-label={applicationSettings.editorWordWrap ? 'Word wrap on' : 'Word wrap off'}
            title={applicationSettings.editorWordWrap ? 'Word wrap on (click to turn off)' : 'Word wrap off (click to turn on)'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M5 4L2 8l3 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M11 4l3 4-3 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 6L7 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className={CODE_WINDOW_TOOLBAR_BUTTON}
            disabled={activePanel.loading || activePanel.saving || activePanel.binary || !activePanel.dirty}
            onClick={() => {
              const id = focusedEditorId ?? editorPanels[0]?.id ?? null
              if (!id) return
              onFocusedEditorChange(id)
              onSave(id)
            }}
            aria-label="Save"
            title="Save (Ctrl+S)"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M3 3.5C3 2.95 3.45 2.5 4 2.5H10.7L13 4.8V12.5C13 13.05 12.55 13.5 12 13.5H4C3.45 13.5 3 13.05 3 12.5V3.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              <path d="M5 2.5H10V6H5V2.5Z" stroke="currentColor" strokeWidth="1.2" />
              <path d="M5.2 9.5H10.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className={CODE_WINDOW_TOOLBAR_BUTTON}
            disabled={activePanel.loading || activePanel.saving || activePanel.binary}
            onClick={() => {
              const id = focusedEditorId ?? editorPanels[0]?.id ?? null
              if (!id) return
              onFocusedEditorChange(id)
              onSaveAs(id)
            }}
            aria-label="Save As"
            title="Save As (Ctrl+Shift+S)"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M3 3.5C3 2.95 3.45 2.5 4 2.5H10.7L13 4.8V12.5C13 13.05 12.55 13.5 12 13.5H4C3.45 13.5 3 13.05 3 12.5V3.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              <path d="M5 2.5H10V6H5V2.5Z" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8 8.4V12.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M6.1 10.3H9.9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className={CODE_WINDOW_TOOLBAR_BUTTON_SM}
            onClick={() => {
              const id = focusedEditorId ?? editorPanels[0]?.id ?? null
              if (!id) return
              onFocusedEditorChange(id)
              onCloseEditor(id)
            }}
            title="Close tab"
          >
            <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
              <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden bg-neutral-50 dark:bg-neutral-900">
        {showingSettingsPanel && (
          <div ref={settingsHostRef} className="h-full min-h-0" />
        )}
        {!showingSettingsPanel && !hasTabs && (
          <div className="h-full flex items-center justify-center text-sm text-neutral-500 dark:text-neutral-400 p-4 text-center">
            Double-click a file in the workspace to open it.
          </div>
        )}
        {!showingSettingsPanel && hasTabs && activePanel && activePanel.loading && (
          <div className="p-4 text-sm text-neutral-600 dark:text-neutral-400">Loading file...</div>
        )}
        {!showingSettingsPanel && hasTabs && activePanel && !activePanel.loading && activePanel.error && (
          <div className="p-4 text-sm text-red-600 dark:text-red-400">{activePanel.error}</div>
        )}
        {!showingSettingsPanel && hasTabs && activePanel && !activePanel.loading && !activePanel.error && activePanel.binary && (
          <div className="p-4 text-sm text-neutral-600 dark:text-neutral-400">
            Binary files are not editable in this editor.
          </div>
        )}
        {!showingSettingsPanel && hasTabs && activePanel && !activePanel.loading && !activePanel.error && !activePanel.binary && (
          <div className="h-full min-h-0 flex flex-col overflow-hidden">
            <CodeMirrorEditor
              value={activePanel.content}
              onChange={(v) => onEditorContentChange(activePanel.id, v)}
              readOnly={!activePanel.editMode}
              filename={activePanel.relativePath}
              wordWrap={applicationSettings.editorWordWrap}
              fontScale={activePanel.fontScale}
              darkMode={activeTheme.mode === 'dark'}
              onSave={() => onSave(activePanel.id)}
              onSaveAs={() => onSaveAs(activePanel.id)}
              onFocus={() => onFocusedEditorChange(activePanel.id)}
            />
          </div>
        )}
      </div>
      {!showingSettingsPanel && hasTabs && activePanel && (
        <div className="px-3 py-1.5 border-t border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center justify-between shrink-0">
          <span>{Math.round(activePanel.size / 1024)} KB</span>
          <span>
            {activePanel.saving
              ? 'Saving...'
              : activePanel.dirty
                ? 'Unsaved changes'
                : activePanel.savedAt
                  ? `Saved ${new Date(activePanel.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Saved'}
          </span>
        </div>
      )}
    </div>
  )
}
