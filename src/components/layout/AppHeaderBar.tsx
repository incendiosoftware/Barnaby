import React from 'react'
import type { LayoutMode, ModelInterface, ConnectivityProvider } from '../../types'
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
  onOpenChatHistory: () => void
  createAgentPanel: (opts?: { sourcePanelId?: string; initialModel?: string }) => void
  layoutMode: LayoutMode
  setLayoutMode: React.Dispatch<React.SetStateAction<LayoutMode>>
  modelInterfaces: ModelInterface[]
  workspaceDefaultModel: string
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
    onOpenChatHistory,
    createAgentPanel,
    layoutMode,
    setLayoutMode,
    modelInterfaces,
    workspaceDefaultModel,
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

  // Group models by provider and select the default or first enabled model for each
  const defaultModelsByProvider: Partial<Record<ConnectivityProvider, string>> = {}
  for (const m of modelInterfaces) {
    if (m.enabled) {
      if (m.isDefault || !defaultModelsByProvider[m.provider]) {
        defaultModelsByProvider[m.provider] = m.id
      }
    }
  }

  const providerLabels: Record<ConnectivityProvider, { label: string; desc: string }> = {
    codex: { label: 'OpenAI (Codex)', desc: 'CLI / API' },
    claude: { label: 'Anthropic Claude', desc: 'CLI' },
    gemini: { label: 'Google Gemini', desc: 'CLI' },
    openrouter: { label: 'OpenRouter', desc: 'API' },
  }

  const headerStyle: React.CSSProperties = {
    borderColor: 'var(--theme-border-default)',
    backgroundColor: 'var(--theme-bg-surface)',
    color: 'var(--theme-text-primary)',
  }
  const separatorStyle: React.CSSProperties = {
    backgroundColor: 'var(--theme-border-default)',
  }
  const subtleLabelStyle: React.CSSProperties = {
    color: 'var(--theme-text-secondary)',
  }
  const dropdownStyle: React.CSSProperties = {
    borderColor: 'var(--theme-border-default)',
    backgroundColor: 'color-mix(in srgb, var(--theme-bg-surface) 94%, var(--theme-bg-base) 6%)',
    color: 'var(--theme-text-primary)',
  }

  return (
    <div data-app-header-bar="true" className="shrink-0 border-b px-4 py-3" style={headerStyle}>
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
          <div className="mx-1.5 h-6 w-px" style={separatorStyle} />
          <span style={subtleLabelStyle}>Workspace</span>
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
          <div className="mx-2 h-6 w-px" style={separatorStyle} />
          <button
            type="button"
            className={`h-9 px-3 rounded-lg shadow-sm text-left flex items-center gap-2 ${UI_INPUT_CLASS}`}
            onClick={onOpenChatHistory}
            title="Open chat history"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
              <path d="M8 4.5V8.5L10.5 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-xs">History</span>
          </button>
          {/* Dropdown container */}
          <div ref={newChatDropdownRef} className="relative shrink-0">
            <button
              type="button"
              className={`${UI_ICON_BUTTON_CLASS} shrink-0 border-0`}
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
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-200/50 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 flex items-center justify-between group"
                    onClick={() => {
                      createAgentPanel()
                      setNewChatDropdownOpen(false)
                    }}
                  >
                    <span>Default</span>
                    <span className="text-[10px] text-neutral-400 dark:text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity">{workspaceDefaultModel}</span>
                  </button>
                  <div className="mx-3 my-1 border-b border-neutral-200/70 dark:border-neutral-700"></div>
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
              className={`h-9 w-9 inline-flex items-center justify-center rounded-lg border-0 ${layoutMode === 'vertical' ? 'bg-neutral-200 text-blue-700 dark:bg-neutral-700 dark:text-blue-200' : 'bg-transparent hover:bg-neutral-100 text-neutral-700 dark:hover:bg-neutral-700 dark:text-neutral-200'}`}
              onClick={() => setLayoutMode('vertical')}
              title="Tile Vertical"
              aria-label="Tile Vertical"
            >
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                <rect x="2.5" y="3" width="5" height="10" rx="1" fill="currentColor" />
                <rect x="8.5" y="3" width="5" height="10" rx="1" fill="currentColor" />
              </svg>
            </button>
            <button
              className={`h-9 w-9 inline-flex items-center justify-center rounded-lg border-0 ${layoutMode === 'horizontal' ? 'bg-neutral-200 text-blue-700 dark:bg-neutral-700 dark:text-blue-200' : 'bg-transparent hover:bg-neutral-100 text-neutral-700 dark:hover:bg-neutral-700 dark:text-neutral-200'}`}
              onClick={() => setLayoutMode('horizontal')}
              title="Tile Horizontal"
              aria-label="Tile Horizontal"
            >
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                <rect x="2.5" y="3" width="11" height="4.5" rx="1" fill="currentColor" />
                <rect x="2.5" y="8.5" width="11" height="4.5" rx="1" fill="currentColor" />
              </svg>
            </button>
            <button
              className={`h-9 w-9 inline-flex items-center justify-center rounded-lg border-0 ${layoutMode === 'grid' ? 'bg-neutral-200 text-blue-700 dark:bg-neutral-700 dark:text-blue-200' : 'bg-transparent hover:bg-neutral-100 text-neutral-700 dark:hover:bg-neutral-700 dark:text-neutral-200'}`}
              onClick={() => setLayoutMode('grid')}
              title="Tile Grid"
              aria-label="Tile Grid"
            >
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" fill="currentColor" />
                <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" fill="currentColor" />
                <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" fill="currentColor" />
                <rect x="9" y="9" width="4.5" height="4.5" rx="1" fill="currentColor" />
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
