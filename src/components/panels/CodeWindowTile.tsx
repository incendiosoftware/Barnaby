/**
 * Code window tile - editor tabs, CodeMirror, settings host, toolbar.
 */

import React from 'react'
import { CodeMirrorEditor } from '../CodeMirrorEditor'
import type { ApplicationSettings, EditorPanelState, StandaloneTheme } from '../../types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void
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
  onMouseDown,
  draggingPanelId,
  dragOverTarget,
}: CodeWindowTileProps) {
  const panelSurfaceStyle: React.CSSProperties = {
    backgroundColor: 'var(--theme-bg-surface)',
    borderColor: 'var(--theme-border-default)',
    color: 'var(--theme-text-primary)',
  }
  const toolbarSurfaceStyle: React.CSSProperties = {
    backgroundColor: 'color-mix(in srgb, var(--theme-bg-surface) 88%, var(--theme-bg-base) 12%)',
    borderColor: 'var(--theme-border-default)',
  }
  const contentSurfaceStyle: React.CSSProperties = {
    backgroundColor: 'var(--theme-bg-surface)',
  }
  const statusTextStyle: React.CSSProperties = {
    color: 'var(--theme-text-secondary)',
  }
  const subtleTextStyle: React.CSSProperties = {
    color: 'var(--theme-text-tertiary)',
  }
  const markdownPreviewStyle: React.CSSProperties = {
    backgroundColor: 'var(--theme-bg-surface)',
    color: 'var(--theme-text-primary)',
  }
  const markdownChromeStyle: React.CSSProperties = {
    backgroundColor: 'color-mix(in srgb, var(--theme-bg-surface) 84%, var(--theme-bg-base) 16%)',
    borderColor: 'var(--theme-border-default)',
  }
  const activePanel =
    (focusedEditorId ? editorPanels.find((p) => p.id === focusedEditorId) : null) ??
    editorPanels[0] ??
    null
  const hasTabs = editorPanels.length > 0
  const isMarkdown = activePanel?.relativePath.toLowerCase().endsWith('.md') || activePanel?.relativePath.toLowerCase().endsWith('.markdown')
  const activePanelReadOnly = Boolean(activePanel?.diagnosticsReadOnly)
  const showingSettingsPanel = codeWindowTab === 'settings'
  const selectedTabButtonStyle: React.CSSProperties = {
    backgroundColor: 'var(--theme-accent-tint)',
    color: 'var(--theme-accent-muted)',
  }
  const idleTabButtonStyle: React.CSSProperties = {
    color: 'var(--theme-text-secondary)',
  }
  const toolbarButtonStyle: React.CSSProperties = {
    color: 'var(--theme-text-secondary)',
  }
  const toolbarButtonActiveStyle: React.CSSProperties = {
    backgroundColor: 'color-mix(in srgb, var(--theme-bg-elevated) 78%, var(--theme-bg-surface) 22%)',
    color: 'var(--theme-text-primary)',
  }
  const editModeButtonStyle: React.CSSProperties = activePanel?.editMode
    ? {
      borderColor: 'var(--theme-accent-strong)',
      backgroundColor: 'var(--theme-accent-tint)',
      color: 'var(--theme-accent-muted)',
    }
    : {
      borderColor: 'var(--theme-border-default)',
      backgroundColor: 'color-mix(in srgb, var(--theme-bg-surface) 94%, var(--theme-bg-base) 6%)',
      color: 'var(--theme-text-secondary)',
    }

  const markdownComponents: import('react-markdown').Components = {
    h1: ({ children }) => <h1 className="text-2xl font-bold mt-6 mb-4 pb-2 border-b" style={{ borderColor: 'var(--theme-border-default)' }}>{children}</h1>,
    h2: ({ children }) => <h2 className="text-xl font-bold mt-5 mb-3 pb-1 border-b" style={{ borderColor: 'var(--theme-border-default)' }}>{children}</h2>,
    h3: ({ children }) => <h3 className="text-lg font-bold mt-4 mb-2">{children}</h3>,
    p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
    ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-1">{children}</ol>,
    li: ({ children }) => <li>{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 pl-4 py-1 mb-4 italic" style={{ borderColor: 'var(--theme-border-strong)', color: 'var(--theme-text-secondary)' }}>
        {children}
      </blockquote>
    ),
    pre: ({ children }) => <pre className="p-4 rounded-lg overflow-x-auto mb-4 border text-[13px]" style={markdownChromeStyle}>{children}</pre>,
    code: (props: any) => props.inline
      ? <code className="px-1.5 py-0.5 rounded text-[0.9em] border" style={markdownChromeStyle}>{props.children}</code>
      : <code className="font-mono text-inherit">{props.children}</code>,
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:underline"
        style={{ color: 'var(--theme-accent-strong)' }}
      >
        {children}
      </a>
    ),
    table: ({ children }) => <div className="overflow-x-auto mb-4"><table className="w-full text-sm text-left border-collapse">{children}</table></div>,
    th: ({ children }) => <th className="px-4 py-2 border font-medium" style={markdownChromeStyle}>{children}</th>,
    td: ({ children }) => <td className="px-4 py-2 border" style={{ borderColor: 'var(--theme-border-default)' }}>{children}</td>,
  }

  return (
    <div
      className="relative h-full min-h-0 min-w-0 flex flex-col border rounded-lg overflow-hidden font-editor"
      style={panelSurfaceStyle}
      onMouseDown={onMouseDown}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onWheel={onZoomWheel}
    >
      <div
        data-code-window-dock-tab-bar="true"
        className="px-2.5 py-2 border-b flex items-center gap-1.5 shrink-0 select-none"
        style={toolbarSurfaceStyle}
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
            className="h-8 w-8 inline-flex items-center justify-center rounded-md border-0 text-xs font-medium transition-colors focus:outline-none"
            style={codeWindowTab === 'code' ? selectedTabButtonStyle : idleTabButtonStyle}
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
            className="h-8 w-8 inline-flex items-center justify-center rounded-md border-0 text-xs font-medium transition-colors focus:outline-none"
            style={codeWindowTab === 'settings' ? selectedTabButtonStyle : idleTabButtonStyle}
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
          className="ml-auto h-8 w-8 inline-flex items-center justify-center rounded-md border-0 bg-transparent text-xs font-medium transition-colors focus:outline-none"
          style={toolbarButtonStyle}
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
          className="h-9 w-9 inline-flex items-center justify-center rounded-md border-0 bg-transparent text-xs font-medium transition-colors focus:outline-none"
          style={toolbarButtonStyle}
          onClick={onCloseCodeWindow}
        >
          <svg width="16" height="16" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {draggingPanelId && dragOverTarget === 'dock-code' && (
        <div className="absolute inset-0 rounded-lg pointer-events-none z-10" style={DROP_ZONE_OVERLAY_STYLE} />
      )}
      {!showingSettingsPanel && hasTabs && activePanel && (
        <div className="px-2 py-2 border-b flex items-center gap-2 flex-wrap shrink-0" style={toolbarSurfaceStyle}>
          <span className="text-xs" style={subtleTextStyle}>Current file:</span>
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
            className="px-2 py-1 text-xs rounded border transition-colors"
            style={editModeButtonStyle}
            onClick={() => {
              const id = focusedEditorId ?? editorPanels[0]?.id ?? null
              if (!id) return
              const panel = editorPanels.find((p) => p.id === id)
              if (panel?.diagnosticsReadOnly) return
              onEditModeToggle(id)
              onFocusedEditorChange(id)
            }}
            disabled={activePanel.loading || activePanel.binary || activePanelReadOnly}
            title={activePanel.editMode ? 'Switch to view-only' : 'Enable editing'}
          >
            {activePanel.editMode ? 'View' : 'Edit'}
          </button>
          <button
            type="button"
            className={`${CODE_WINDOW_TOOLBAR_BUTTON} ${applicationSettings.editorWordWrap ? 'bg-neutral-200 text-neutral-800 dark:bg-neutral-700/80 dark:text-neutral-100' : ''}`}
            style={applicationSettings.editorWordWrap ? toolbarButtonActiveStyle : toolbarButtonStyle}
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
            style={toolbarButtonStyle}
            disabled={activePanel.loading || activePanel.saving || activePanel.binary || activePanelReadOnly || !activePanel.dirty}
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
            style={toolbarButtonStyle}
            disabled={activePanel.loading || activePanel.saving || activePanel.binary || activePanelReadOnly}
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
            style={toolbarButtonStyle}
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
      <div className="flex-1 min-h-0 overflow-hidden" style={contentSurfaceStyle}>
        {showingSettingsPanel && (
          <div ref={settingsHostRef} className="h-full min-h-0" />
        )}
        {!showingSettingsPanel && !hasTabs && (
          <div className="h-full flex items-center justify-center text-sm p-4 text-center" style={subtleTextStyle}>
            Double-click a file in the workspace to open it.
          </div>
        )}
        {!showingSettingsPanel && hasTabs && activePanel && activePanel.loading && (
          <div className="p-4 text-sm" style={statusTextStyle}>Loading file...</div>
        )}
        {!showingSettingsPanel && hasTabs && activePanel && !activePanel.loading && activePanel.error && (
          <div className="p-4 text-sm text-red-600 dark:text-red-400">{activePanel.error}</div>
        )}
        {!showingSettingsPanel && hasTabs && activePanel && !activePanel.loading && !activePanel.error && activePanel.binary && (
          <div className="p-4 text-sm" style={statusTextStyle}>
            Binary files are not editable in this editor.
          </div>
        )}
        {!showingSettingsPanel && hasTabs && activePanel && !activePanel.loading && !activePanel.error && !activePanel.binary && (
          <div className="h-full min-h-0 flex flex-col overflow-hidden">
            {!activePanel.editMode && isMarkdown ? (
              <div
                className="flex-1 overflow-auto p-6 md:p-8"
                style={{ ...markdownPreviewStyle, fontSize: `${14 * activePanel.fontScale}px` }}
              >
                <div className="max-w-4xl mx-auto">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {activePanel.content}
                  </ReactMarkdown>
                </div>
              </div>
            ) : (
              <CodeMirrorEditor
                value={activePanel.content}
                onChange={(v) => onEditorContentChange(activePanel.id, v)}
                readOnly={!activePanel.editMode}
                filename={activePanel.relativePath}
                wordWrap={applicationSettings.editorWordWrap}
                fontScale={activePanel.fontScale}
                darkMode={activeTheme.codeSyntax === 'dark'}
                onSave={() => onSave(activePanel.id)}
                onSaveAs={() => onSaveAs(activePanel.id)}
                onFocus={() => onFocusedEditorChange(activePanel.id)}
              />
            )}
          </div>
        )}
      </div>
      {!showingSettingsPanel && hasTabs && activePanel && (
        <div
          className="px-3 py-1.5 border-t text-[11px] flex items-center justify-between shrink-0"
          style={{ ...toolbarSurfaceStyle, ...subtleTextStyle }}
        >
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
