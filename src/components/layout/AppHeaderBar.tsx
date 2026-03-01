import React from 'react'
import type { ChatHistoryEntry, LayoutMode, ModelInterface, ConnectivityProvider } from '../../types'
import { PanelBottomIcon } from '../icons'

interface AppHeaderBarProps {
  workspaceDockButtonOnLeft: boolean
  toolsDockButtonsOnLeft: boolean
  leftDockToggleButton: React.ReactNode
  rightDockToggleButton: React.ReactNode
  headerDockToggleButtonClass: (isActive: boolean) => string
  showTerminalBar: boolean
  setShowTerminalBar: React.Dispatch<React.SetStateAction<boolean>>
  workspaceList: string[]
  workspaceRoot: string
  requestWorkspaceSwitch: (path: string, source: 'menu' | 'picker' | 'dropdown' | 'workspace-create') => void
  UI_INPUT_CLASS: string
  UI_ICON_BUTTON_CLASS: string
  openWorkspaceSettings: (mode: 'new' | 'edit') => void
  openManageWorkspaces: () => void
  historyDropdownRef: React.RefObject<HTMLDivElement>
  historyDropdownOpen: boolean
  setHistoryDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>
  workspaceScopedHistory: ChatHistoryEntry[]
  openChatFromHistory: (id: string) => void
  downloadHistoryTranscript: (id: string) => void | Promise<void>
  formatHistoryOptionLabel: (entry: ChatHistoryEntry) => string
  setDeleteHistoryIdPending: React.Dispatch<React.SetStateAction<string | null>>
  createAgentPanel: (opts?: { sourcePanelId?: string; initialModel?: string }) => void
  layoutMode: LayoutMode
  setLayoutMode: React.Dispatch<React.SetStateAction<LayoutMode>>
  modelInterfaces: ModelInterface[]
}

export function AppHeaderBar(props: AppHeaderBarProps) {
  const {
    workspaceDockButtonOnLeft,
    toolsDockButtonsOnLeft,
    leftDockToggleButton,
    rightDockToggleButton,
    headerDockToggleButtonClass,
    showTerminalBar,
    setShowTerminalBar,
    workspaceList,
    workspaceRoot,
    requestWorkspaceSwitch,
    UI_INPUT_CLASS,
    UI_ICON_BUTTON_CLASS,
    openWorkspaceSettings,
    openManageWorkspaces,
    historyDropdownRef,
    historyDropdownOpen,
    setHistoryDropdownOpen,
    workspaceScopedHistory,
    openChatFromHistory,
    downloadHistoryTranscript,
    formatHistoryOptionLabel,
    setDeleteHistoryIdPending,
    createAgentPanel,
    layoutMode,
    setLayoutMode,
    modelInterfaces,
  } = props

  const [newChatDropdownOpen, setNewChatDropdownOpen] = React.useState(false)
  const newChatDropdownRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (newChatDropdownRef.current && !newChatDropdownRef.current.contains(event.target as Node)) {
        setNewChatDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Group models by provider and select the first enabled model for each
  const defaultModelsByProvider: Partial<Record<ConnectivityProvider, string>> = {}
  for (const m of modelInterfaces) {
    if (m.enabled && !defaultModelsByProvider[m.provider]) {
      defaultModelsByProvider[m.provider] = m.id
    }
  }

  const providerLabels: Record<ConnectivityProvider, { label: string; desc: string }> = {
    codex: { label: 'OpenAI (Codex)', desc: 'CLI / API' },
    claude: { label: 'Anthropic Claude', desc: 'CLI' },
    gemini: { label: 'Google Gemini', desc: 'CLI' },
    openrouter: { label: 'OpenRouter', desc: 'API' },
  }

  return (
    <div data-app-header-bar="true" className="shrink-0 border-b border-neutral-200/80 dark:border-neutral-800 px-4 py-3 bg-white dark:bg-neutral-950">
      <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="flex items-center gap-0.5 shrink-0">
            {workspaceDockButtonOnLeft && leftDockToggleButton}
            <button
              type="button"
              className={headerDockToggleButtonClass(showTerminalBar)}
              onClick={() => setShowTerminalBar((prev) => !prev)}
              title={showTerminalBar ? 'Hide terminal' : 'Show terminal'}
              aria-label={showTerminalBar ? 'Hide terminal' : 'Show terminal'}
            >
              <PanelBottomIcon size={20} active={showTerminalBar} />
            </button>
            {toolsDockButtonsOnLeft && rightDockToggleButton}
          </div>
          <div className="mx-1.5 h-6 w-px bg-neutral-300/80 dark:bg-neutral-700/80" />
          <span className="text-neutral-600 dark:text-neutral-300">Workspace</span>
          <select
            className={`h-9 px-3 rounded-lg font-mono shadow-sm w-[34vw] max-w-[440px] min-w-[220px] ${UI_INPUT_CLASS}`}
            value={workspaceList.includes(workspaceRoot) ? workspaceRoot : workspaceList[0] ?? ''}
            onChange={(e) => requestWorkspaceSwitch(e.target.value, 'dropdown')}
          >
            {workspaceList.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`${UI_ICON_BUTTON_CLASS} shrink-0`}
            onClick={() => openWorkspaceSettings('new')}
            title="New workspace"
          >
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className={`${UI_ICON_BUTTON_CLASS} shrink-0`}
            onClick={openManageWorkspaces}
            title="Manage workspaces"
            aria-label="Manage workspaces"
          >
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <rect x="2.5" y="3" width="11" height="2" rx="0.8" stroke="currentColor" strokeWidth="1.1" />
              <rect x="2.5" y="7" width="11" height="2" rx="0.8" stroke="currentColor" strokeWidth="1.1" />
              <rect x="2.5" y="11" width="11" height="2" rx="0.8" stroke="currentColor" strokeWidth="1.1" />
              <circle cx="13.5" cy="4" r="1.2" fill="currentColor" />
              <circle cx="10.5" cy="8" r="1.2" fill="currentColor" />
              <circle cx="12" cy="12" r="1.2" fill="currentColor" />
            </svg>
          </button>
          <div className="mx-2 h-6 w-px bg-neutral-300/80 dark:bg-neutral-700/80" />
          <span className="text-neutral-600 dark:text-neutral-300">History</span>
          <div ref={historyDropdownRef} className="relative shrink-0">
            <button
              type="button"
              className={`h-9 px-3 rounded-lg shadow-sm w-[45vw] max-w-[540px] min-w-[270px] text-left flex items-center justify-between gap-2 ${UI_INPUT_CLASS}`}
              onClick={() => setHistoryDropdownOpen((o) => !o)}
            >
              <span className="truncate">Open chat...</span>
              <svg width="12" height="12" viewBox="0 0 10 10" className={`shrink-0 transition-transform ${historyDropdownOpen ? 'rotate-180' : ''}`}>
                <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </button>
            {historyDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg z-50 max-h-64 overflow-auto min-w-[270px]">
                {workspaceScopedHistory.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-neutral-500 dark:text-neutral-400">No conversations yet</div>
                ) : (
                  workspaceScopedHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-1.5 group px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer text-sm"
                      onClick={() => openChatFromHistory(entry.id)}
                    >
                      <span className="flex-1 min-w-0 truncate text-neutral-800 dark:text-neutral-200">
                        {formatHistoryOptionLabel(entry)}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-md text-neutral-500 hover:bg-emerald-100 hover:text-emerald-700 dark:text-neutral-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
                        onClick={(e) => {
                          e.stopPropagation()
                          void downloadHistoryTranscript(entry.id)
                        }}
                        title="Download transcript"
                        aria-label="Download transcript"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <path d="M6 1.8V7.4M6 7.4L3.8 5.2M6 7.4L8.2 5.2M2.2 9.4H9.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-md text-neutral-500 hover:bg-red-100 hover:text-red-700 dark:text-neutral-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteHistoryIdPending(entry.id)
                          setHistoryDropdownOpen(false)
                        }}
                        title="Delete conversation"
                        aria-label="Delete conversation"
                      >
                        <svg width="11" height="11" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <path d="M2 2L8 8M8 2L2 8" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          {/* Dropdown container */}
          <div ref={newChatDropdownRef} className="relative shrink-0">
            <button
              type="button"
              className={`${UI_ICON_BUTTON_CLASS} shrink-0`}
              onClick={() => setNewChatDropdownOpen((o) => !o)}
              title="New chat"
              aria-label="New chat"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
            {newChatDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl z-50 min-w-[220px] overflow-hidden">
                <div className="px-3 py-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200/70 dark:border-neutral-700">
                  Choose Provider
                </div>
                <div className="py-1 flex flex-col">
                  {Object.entries(defaultModelsByProvider).map(([p, modelId]) => {
                    const provider = p as ConnectivityProvider
                    const info = providerLabels[provider]
                    if (!info || !modelId) return null
                    return (
                      <button
                        key={provider}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-200/50 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 flex items-center justify-between group"
                        onClick={() => {
                          createAgentPanel({ initialModel: modelId })
                          setNewChatDropdownOpen(false)
                        }}
                      >
                        <span>{info.label}</span>
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity">{info.desc}</span>
                      </button>
                    )
                  })}
                  {Object.keys(defaultModelsByProvider).length === 0 && (
                    <div className="px-3 py-2 text-sm text-neutral-500 dark:text-neutral-400">
                      No models enabled
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div data-layout-toolbar="true" className="flex items-center gap-1">
            <button
              className={`h-9 w-9 inline-flex items-center justify-center rounded-lg ${layoutMode === 'vertical' ? 'bg-neutral-200 text-blue-700 dark:bg-neutral-700 dark:text-blue-200' : 'bg-transparent hover:bg-neutral-100 text-neutral-700 dark:hover:bg-neutral-700 dark:text-neutral-200'}`}
              onClick={() => setLayoutMode('vertical')}
              title="Tile Vertical"
              aria-label="Tile Vertical"
            >
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                <rect x="2.5" y="3" width="5.5" height="10" rx="1" stroke="currentColor" />
                <rect x="8" y="3" width="5.5" height="10" rx="1" stroke="currentColor" />
              </svg>
            </button>
            <button
              className={`h-9 w-9 inline-flex items-center justify-center rounded-lg ${layoutMode === 'horizontal' ? 'bg-neutral-200 text-blue-700 dark:bg-neutral-700 dark:text-blue-200' : 'bg-transparent hover:bg-neutral-100 text-neutral-700 dark:hover:bg-neutral-700 dark:text-neutral-200'}`}
              onClick={() => setLayoutMode('horizontal')}
              title="Tile Horizontal"
              aria-label="Tile Horizontal"
            >
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                <rect x="2.5" y="3" width="11" height="5" rx="1" stroke="currentColor" />
                <rect x="2.5" y="8" width="11" height="5" rx="1" stroke="currentColor" />
              </svg>
            </button>
            <button
              className={`h-9 w-9 inline-flex items-center justify-center rounded-lg ${layoutMode === 'grid' ? 'bg-neutral-200 text-blue-700 dark:bg-neutral-700 dark:text-blue-200' : 'bg-transparent hover:bg-neutral-100 text-neutral-700 dark:hover:bg-neutral-700 dark:text-neutral-200'}`}
              onClick={() => setLayoutMode('grid')}
              title="Tile Grid"
              aria-label="Tile Grid"
            >
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                <rect x="2.5" y="2.5" width="5" height="5" rx="1" stroke="currentColor" />
                <rect x="8.5" y="2.5" width="5" height="5" rx="1" stroke="currentColor" />
                <rect x="2.5" y="8.5" width="5" height="5" rx="1" stroke="currentColor" />
                <rect x="8.5" y="8.5" width="5" height="5" rx="1" stroke="currentColor" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-0.5 shrink-0">
            {!workspaceDockButtonOnLeft && leftDockToggleButton}
            {!toolsDockButtonsOnLeft && rightDockToggleButton}
          </div>
        </div>
      </div>
    </div>
  )
}
