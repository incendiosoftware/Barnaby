/**
 * Docked app settings panel — renders inside the right-dock code window
 * via createPortal. Contains Models, Preferences, Connectivity, Agents,
 * Orchestrator, MCP Servers, and Diagnostics tabs.
 */
import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { SpinnerIcon } from '../icons'
import {
  APP_SETTINGS_VIEWS,
  UI_CLOSE_ICON_BUTTON_CLASS,
  UI_INPUT_CLASS,
  UI_SELECT_CLASS,
  UI_BUTTON_PRIMARY_CLASS,
  FONT_OPTIONS,
  MONO_FONT_OPTIONS,
  FONT_SIZE_OPTIONS,
  THEME_EDITABLE_FIELDS,
  CONNECTIVITY_PROVIDERS,
  DEFAULT_BUILTIN_PROVIDER_CONFIGS,
  PROVIDERS_WITH_DUAL_MODE,
  PROVIDERS_CLI_ONLY,
  PROVIDERS_API_ONLY,
  API_CONFIG_BY_PROVIDER,
  PROVIDER_SUBSCRIPTION_URLS,
} from '../../constants'
import { THEMES } from '../../constants/themes'
import { PROVIDERS_WITH_DEDICATED_PING } from '../../controllers/providerConnectivityController'
import type {
  AppSettingsView,
  ApplicationSettings,
  ConnectivityMode,
  ConnectivityProvider,
  CustomProviderConfig,
  ModelCatalogRefreshStatus,
  ModelConfig,
  ModelInterface,
  ModelProvider,
  OrchestratorSettings,
  ProviderAuthStatus,
  ProviderConfig,
  ProviderConfigCli,
  ProviderRegistry,
  StandaloneTheme,
  ThemeEditableField,
  ThemeOverrideValues,
  ThemeOverrides,
} from '../../types'
import {
  cloneTheme,
  extractHexColor,
  formatCheckedAt,
  formatError,
  getModelPingKey,
  resolveProviderConfigs,
  syncModelConfigWithCatalog,
} from '../../utils/appCore'

export interface DockedAppSettingsProps {
  portalTarget: HTMLDivElement | null
  visible: boolean
  appSettingsView: AppSettingsView
  setAppSettingsView: (v: AppSettingsView) => void
  onClose: () => void
  api: any
  workspaceRoot: string

  modelConfig: ModelConfig
  setModelConfig: React.Dispatch<React.SetStateAction<ModelConfig>>
  providerRegistry: ProviderRegistry
  setProviderRegistry: React.Dispatch<React.SetStateAction<ProviderRegistry>>
  modelCatalogRefreshPending: boolean
  setModelCatalogRefreshPending: React.Dispatch<React.SetStateAction<boolean>>
  modelCatalogRefreshStatus: ModelCatalogRefreshStatus | null
  setModelCatalogRefreshStatus: React.Dispatch<React.SetStateAction<ModelCatalogRefreshStatus | null>>
  modelPingResults: Record<string, any>
  setModelPingResults: React.Dispatch<React.SetStateAction<any>>
  modelPingPending: Set<string>
  setModelPingPending: React.Dispatch<React.SetStateAction<Set<string>>>
  editingModel: ModelInterface | null
  setEditingModel: React.Dispatch<React.SetStateAction<ModelInterface | null>>
  modelForm: any
  setModelForm: React.Dispatch<React.SetStateAction<any>>
  modelFormStatus: string | null
  setModelFormStatus: React.Dispatch<React.SetStateAction<string | null>>

  applicationSettings: ApplicationSettings
  setApplicationSettings: React.Dispatch<React.SetStateAction<ApplicationSettings>>
  themeOverrides: ThemeOverrides
  setThemeOverrides: React.Dispatch<React.SetStateAction<ThemeOverrides>>
  themeCatalog: StandaloneTheme[]
  selectedThemeEditorId: string
  setSelectedThemeEditorId: React.Dispatch<React.SetStateAction<string>>
  themeEditorDraft: StandaloneTheme | null
  setThemeEditorDraft: React.Dispatch<React.SetStateAction<StandaloneTheme | null>>
  themeEditorStatus: string | null
  setThemeEditorStatus: React.Dispatch<React.SetStateAction<string | null>>
  repairShortcutStatus: string | null
  setRepairShortcutStatus: React.Dispatch<React.SetStateAction<string | null>>

  resolvedProviderConfigs: ProviderConfig[]
  providerAuthByName: Partial<Record<string, ProviderAuthStatus>>
  providerAuthLoadingByName: Record<string, boolean>
  providerAuthActionByName: Record<string, string | null>
  providerVerifiedByName: Record<string, boolean>
  setProviderVerifiedByName: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  providerPingDurationByName: Record<string, number | null>
  setProviderPingDurationByName: React.Dispatch<React.SetStateAction<Record<string, number | null>>>
  providerPanelOpenByName: Record<string, boolean>
  setProviderPanelOpenByName: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  providerApiKeyDraftByName: Record<string, string>
  setProviderApiKeyDraftByName: React.Dispatch<React.SetStateAction<Record<string, string>>>
  providerApiKeyStateByName: Record<string, boolean>
  editingProvider: any
  setEditingProvider: React.Dispatch<React.SetStateAction<any>>
  showProviderSetupModal: boolean
  setShowProviderSetupModal: React.Dispatch<React.SetStateAction<boolean>>

  refreshProviderAuthStatus: (config: ProviderConfig) => Promise<ProviderAuthStatus | null>
  refreshProviderApiAuthStatus: (providerId: string) => Promise<any>
  refreshAllProviderAuthStatuses: () => Promise<void>
  saveProviderApiKey: (providerId: string, explicitValue?: string) => Promise<void>
  clearProviderApiKey: (providerId: string) => Promise<void>
  importProviderApiKeyFromEnv: (providerId: string) => Promise<void>
  startProviderLoginFlow: (config: ProviderConfig) => Promise<void>
  startProviderUpgradeFlow: (config: ProviderConfig) => Promise<void>

  loadedPlugins: any[]
  orchestratorSettings: OrchestratorSettings
  setOrchestratorSettings: React.Dispatch<React.SetStateAction<OrchestratorSettings>>
  orchestratorLicenseKeyState: any
  setOrchestratorLicenseKeyState: React.Dispatch<React.SetStateAction<any>>
  orchestratorLicenseKeyDraft: string
  setOrchestratorLicenseKeyDraft: React.Dispatch<React.SetStateAction<string>>
  orchestratorInstallStatus: string | null
  setOrchestratorInstallStatus: React.Dispatch<React.SetStateAction<string | null>>

  mcpServers: any[]
  setMcpServers: React.Dispatch<React.SetStateAction<any>>
  mcpPanelOpenByName: Record<string, boolean>
  setMcpPanelOpenByName: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  mcpEditingServer: any
  setMcpEditingServer: React.Dispatch<React.SetStateAction<any>>
  mcpJsonDraft: string
  setMcpJsonDraft: React.Dispatch<React.SetStateAction<string>>
  mcpJsonError: string | null
  setMcpJsonError: React.Dispatch<React.SetStateAction<string | null>>
  mcpAddMode: any
  setMcpAddMode: React.Dispatch<React.SetStateAction<any>>
  refreshMcpServers: () => Promise<void>

  diagnosticsInfo: any
  setDiagnosticsInfo: React.Dispatch<React.SetStateAction<any>>
  diagnosticsError: string | null
  setDiagnosticsError: React.Dispatch<React.SetStateAction<string | null>>
  diagnosticsActionStatus: string | null
  setDiagnosticsActionStatus: React.Dispatch<React.SetStateAction<string | null>>
  openDiagnosticsTarget: (target: 'chatHistory' | 'appState' | 'runtimeLog' | 'userData' | 'storage', label: string) => void

  getModelOptions: (includeCurrent?: string) => string[]
  getModelOptionsGrouped: (includeCurrent?: string, enabledOnly?: boolean) => any[]

  showOnlyResponsiveModels: boolean
  setShowOnlyResponsiveModels: React.Dispatch<React.SetStateAction<boolean>>
}

export function DockedAppSettings(props: DockedAppSettingsProps) {
  const {
    portalTarget, visible, appSettingsView, setAppSettingsView, onClose, api, workspaceRoot,
    modelConfig, setModelConfig, providerRegistry, setProviderRegistry,
    modelCatalogRefreshPending, setModelCatalogRefreshPending,
    modelCatalogRefreshStatus, setModelCatalogRefreshStatus,
    modelPingResults, setModelPingResults, modelPingPending, setModelPingPending,
    editingModel, setEditingModel, modelForm, setModelForm, modelFormStatus, setModelFormStatus,
    applicationSettings, setApplicationSettings,
    themeOverrides, setThemeOverrides, themeCatalog,
    selectedThemeEditorId, setSelectedThemeEditorId,
    themeEditorDraft, setThemeEditorDraft, themeEditorStatus, setThemeEditorStatus,
    repairShortcutStatus, setRepairShortcutStatus,
    resolvedProviderConfigs,
    providerAuthByName, providerAuthLoadingByName, providerAuthActionByName,
    providerVerifiedByName, setProviderVerifiedByName,
    providerPingDurationByName, setProviderPingDurationByName,
    providerPanelOpenByName, setProviderPanelOpenByName,
    providerApiKeyDraftByName, setProviderApiKeyDraftByName,
    providerApiKeyStateByName,
    editingProvider, setEditingProvider,
    showProviderSetupModal, setShowProviderSetupModal,
    refreshProviderAuthStatus, refreshProviderApiAuthStatus,
    refreshAllProviderAuthStatuses,
    saveProviderApiKey, clearProviderApiKey, importProviderApiKeyFromEnv,
    startProviderLoginFlow, startProviderUpgradeFlow,
    loadedPlugins,
    orchestratorSettings, setOrchestratorSettings,
    orchestratorLicenseKeyState, setOrchestratorLicenseKeyState,
    orchestratorLicenseKeyDraft, setOrchestratorLicenseKeyDraft,
    orchestratorInstallStatus, setOrchestratorInstallStatus,
    mcpServers, setMcpServers,
    mcpPanelOpenByName, setMcpPanelOpenByName,
    mcpEditingServer, setMcpEditingServer,
    mcpJsonDraft, setMcpJsonDraft, mcpJsonError, setMcpJsonError,
    mcpAddMode, setMcpAddMode, refreshMcpServers,
    diagnosticsInfo, setDiagnosticsInfo,
    diagnosticsError, setDiagnosticsError,
    diagnosticsActionStatus, setDiagnosticsActionStatus,
    openDiagnosticsTarget,
    getModelOptions,
    getModelOptionsGrouped,
    showOnlyResponsiveModels,
    setShowOnlyResponsiveModels,
  } = props

  const closeAppSettings = onClose
  const showDockedAppSettings = visible
  const codeWindowSettingsHostRef = { current: portalTarget }

  const settingsCard = (
    <div
      className="h-full min-h-0 flex flex-col bg-white dark:bg-neutral-950 text-neutral-950 dark:text-neutral-100"
    >
      <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0">
        <div className="font-medium">Settings</div>
        <button
          className={UI_CLOSE_ICON_BUTTON_CLASS}
          onClick={() => closeAppSettings()}
          title="Close"
        >
          <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
            <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2 shrink-0 flex-wrap">
        {APP_SETTINGS_VIEWS.map((view) => (
          <button
            key={view}
            type="button"
            className={`px-3 py-1.5 rounded-md text-xs border ${appSettingsView === view
              ? 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100'
              : 'border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
              }`}
            onClick={() => setAppSettingsView(view)}
          >
            {view === 'connectivity' && 'Connectivity'}
            {view === 'models' && 'Models'}
            {view === 'preferences' && 'Preferences'}
            {view === 'agents' && 'Agents'}
            {view === 'orchestrator' && 'Orchestrator'}
            {view === 'mcp-servers' && 'MCP Servers'}
            {view === 'diagnostics' && 'Runtime Logs'}
          </button>
        ))}
      </div>
      <div className="p-4 overflow-auto flex-1 space-y-5">
        {appSettingsView === 'models' && (
          <>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Add and configure model interfaces. Panel routing supports Codex, Claude, and Gemini.
            </p>
            {api.getAvailableModels && (
              <div className="flex items-center gap-2 mb-4">
                <button
                  type="button"
                  className={`px-2.5 py-1.5 rounded-md border text-xs inline-flex items-center gap-2 ${modelCatalogRefreshPending
                    ? 'border-blue-400 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                    : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700'
                    }`}
                  onClick={async () => {
                    setModelCatalogRefreshPending(true)
                    setModelCatalogRefreshStatus(null)
                    setModelPingResults({})
                    setModelPingPending(new Set())
                    try {
                      const available = await api.getAvailableModels()
                      let nextModelConfig: ModelConfig
                      try {
                        nextModelConfig = syncModelConfigWithCatalog(modelConfig, available, providerRegistry)
                      } catch (syncErr) {
                        setModelCatalogRefreshStatus({ kind: 'error', message: `Config sync failed: ${formatError(syncErr)}` })
                        return
                      }
                      setModelConfig(nextModelConfig)

                      const seenModelPingKeys = new Set<string>()
                      const allModels: { provider: ModelProvider; id: string }[] = nextModelConfig.interfaces
                        .map((m) => ({ provider: m.provider, id: String(m.id ?? '').trim() }))
                        .filter((m) => m.id.length > 0)
                        .filter((m) => {
                          const key = getModelPingKey(m.provider, m.id)
                          if (seenModelPingKeys.has(key)) return false
                          seenModelPingKeys.add(key)
                          return true
                        })

                      if (allModels.length === 0) {
                        setModelCatalogRefreshStatus({ kind: 'error', message: 'No models available to test. Enable providers and try again.' })
                        return
                      }
                      const total = allModels.length
                      setModelCatalogRefreshStatus({ kind: 'success', message: `Found ${total} model${total === 1 ? '' : 's'}. Testing each...` })

                      // Kick off pings for all configured models in parallel (max 4 at a time).
                      setModelPingPending(new Set(allModels.map((m) => getModelPingKey(m.provider, m.id))))

                      const CONCURRENCY = 4
                      const queue = [...allModels]
                      let active = 0
                      let done = 0
                      const runNext = () => {
                        while (active < CONCURRENCY && queue.length > 0) {
                          const item = queue.shift()!
                          active++
                          const modelPingKey = getModelPingKey(item.provider, item.id)
                            ; (api.pingModel ? api.pingModel(item.provider, item.id, workspaceRoot) : Promise.resolve({ ok: true, durationMs: 0 }))
                              .then((result: any) => {
                                setModelPingResults((prev: any) => ({ ...prev, [modelPingKey]: result }))
                                setModelPingPending((prev: Set<string>) => { const next = new Set(prev); next.delete(modelPingKey); return next })
                              })
                              .catch(() => {
                                setModelPingResults((prev: any) => ({ ...prev, [modelPingKey]: { ok: false, durationMs: 0, error: 'Ping failed' } }))
                                setModelPingPending((prev: Set<string>) => { const next = new Set(prev); next.delete(modelPingKey); return next })
                              })
                              .finally(() => {
                                active--
                                done++
                                if (done === allModels.length) {
                                  setModelCatalogRefreshStatus((prev: ModelCatalogRefreshStatus | null) => prev?.kind === 'success' ? { kind: 'success', message: `${total} model${total === 1 ? '' : 's'} tested.` } : prev)
                                } else {
                                  runNext()
                                }
                              })
                        }
                      }
                      runNext()
                    } catch (err) {
                      setModelCatalogRefreshStatus({ kind: 'error', message: `Provider refresh failed: ${formatError(err)}` })
                    } finally {
                      setModelCatalogRefreshPending(false)
                    }
                  }}
                  disabled={modelCatalogRefreshPending}
                >
                  {modelCatalogRefreshPending && (
                    <SpinnerIcon size={14} className="animate-spin" />
                  )}
                  {modelCatalogRefreshPending ? 'Refreshing models...' : 'Refresh models from providers'}
                </button>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {modelCatalogRefreshPending ? 'Querying provider CLIs/APIs now...' : 'Queries local provider CLIs/APIs'}
                </span>
                {modelCatalogRefreshStatus && (
                  <span
                    className={`text-xs ${modelCatalogRefreshStatus.kind === 'error'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                  >
                    {modelCatalogRefreshStatus.message}
                  </span>
                )}
              </div>
            )}
            {editingModel ? (
              <div className="space-y-4">
                <div className="grid grid-cols-[120px_1fr] items-center gap-2 text-sm">
                  <span className="text-neutral-600 dark:text-neutral-300">ID</span>
                  <input
                    className={`${UI_INPUT_CLASS} font-mono text-sm`}
                    value={modelForm.id}
                    onChange={(e) => setModelForm((p: any) => ({ ...p, id: e.target.value }))}
                    placeholder="e.g. gemini-2.0-flash"
                  />
                  <span className="text-neutral-600 dark:text-neutral-300">Display name</span>
                  <input
                    className={UI_INPUT_CLASS}
                    value={modelForm.displayName}
                    onChange={(e) => setModelForm((p: any) => ({ ...p, displayName: e.target.value }))}
                    placeholder="e.g. Gemini 2.0 Flash"
                  />
                  <span className="text-neutral-600 dark:text-neutral-400">Provider</span>
                  <select
                    className={UI_SELECT_CLASS}
                    value={modelForm.provider}
                    onChange={(e) => setModelForm((p: any) => ({ ...p, provider: e.target.value as ModelProvider }))}
                  >
                    <option value="codex">OpenAI (Codex CLI / OpenAI API)</option>
                    <option value="claude">Claude (CLI subscription)</option>
                    <option value="gemini">Gemini (CLI subscription)</option>
                    <option value="openrouter">OpenRouter (API)</option>
                  </select>
                  <span className="text-neutral-600 dark:text-neutral-400">Enabled</span>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={modelForm.enabled}
                      onChange={(e) => setModelForm((p: any) => ({ ...p, enabled: e.target.checked }))}
                    />
                    Show in model selector
                  </label>
                </div>
                <div className="flex gap-2">
                  <button
                    className={UI_BUTTON_PRIMARY_CLASS}
                    onClick={() => {
                      const nextId = modelForm.id.trim()
                      if (!nextId) {
                        setModelFormStatus('Model ID is required.')
                        return
                      }
                      const duplicate = modelConfig.interfaces.find(
                        (m) => m.id === nextId && m.id !== editingModel.id,
                      )
                      if (duplicate) {
                        setModelFormStatus(`Model ID "${nextId}" already exists.`)
                        return
                      }
                      const nextModel: ModelInterface = {
                        ...modelForm,
                        id: nextId,
                        displayName: modelForm.displayName.trim() || nextId,
                      }
                      const idx = modelConfig.interfaces.findIndex((m) => m.id === editingModel.id)
                      const next = [...modelConfig.interfaces]
                      if (idx >= 0) next[idx] = nextModel
                      else next.push(nextModel)
                      setModelConfig({ interfaces: next })
                      setModelFormStatus('Saved.')
                      setEditingModel(null)
                    }}
                  >
                    Save
                  </button>
                  <button
                    className="px-3 py-1.5 text-sm rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                    onClick={() => {
                      setModelFormStatus(null)
                      setEditingModel(null)
                    }}
                  >
                    Cancel
                  </button>
                </div>
                {modelFormStatus && (
                  <div className="text-xs text-neutral-600 dark:text-neutral-400">{modelFormStatus}</div>
                )}
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showOnlyResponsiveModels}
                      onChange={(e) => setShowOnlyResponsiveModels(e.target.checked)}
                    />
                    <span>Show only responsive models</span>
                  </label>
                </div>
                <div className="space-y-2">
                  {getModelOptionsGrouped(undefined, false).flatMap((grp: any) =>
                    grp.modelIds.map((id: string) => {
                      const m = modelConfig.interfaces.find((x) => x.id === id)
                      if (!m) return null

                      // Filter by responsiveness if enabled
                      if (showOnlyResponsiveModels) {
                        const modelPingKey = getModelPingKey(m.provider, m.id)
                        const ping = modelPingResults[modelPingKey]
                        const pending = modelPingPending.has(modelPingKey)
                        // Hide if pending (still testing) or if ping failed
                        if (pending || (ping && !ping.ok)) return null
                      }

                      return (
                        <div
                          key={m.id}
                          className="flex items-center justify-between px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                        >
                          <div className="min-w-0 flex items-center gap-2">
                            {(() => {
                              const modelPingKey = getModelPingKey(m.provider, m.id)
                              const ping = modelPingResults[modelPingKey]
                              const pending = modelPingPending.has(modelPingKey)
                              if (pending) return (
                                <svg className="h-2.5 w-2.5 shrink-0 animate-spin text-neutral-400" viewBox="0 0 16 16" fill="none" aria-label="Testing...">
                                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
                                  <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                              )
                              if (!ping) return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-neutral-300 dark:bg-neutral-600" title="Not tested" />
                              return <span
                                className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${ping.ok ? 'bg-emerald-500' : 'bg-red-500'}`}
                                title={ping.ok ? `Working (${ping.durationMs}ms)` : (ping.error ?? 'Failed')}
                              />
                            })()}
                            <span className="font-medium break-all">{m.id}</span>
                            <span className="text-xs text-neutral-500 dark:text-neutral-400">{grp.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <label
                              className="inline-flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-300"
                              title="Show this model in agent window model selectors"
                            >
                              <input
                                type="checkbox"
                                checked={m.enabled}
                                onChange={(e) => {
                                  const nextEnabled = e.target.checked
                                  setModelConfig((prev) => ({
                                    interfaces: prev.interfaces.map((x) =>
                                      x.id === m.id ? { ...x, enabled: nextEnabled } : x,
                                    ),
                                  }))
                                }}
                              />
                              Visible
                            </label>
                            <button
                              className="h-7 w-7 inline-flex items-center justify-center rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                              title="Edit model"
                              aria-label={`Edit ${m.id}`}
                              onClick={() => {
                                setModelFormStatus(null)
                                setModelForm({ ...m })
                                setEditingModel(m)
                              }}
                            >
                              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                                <path
                                  d="M2 11.5V14h2.5l6.7-6.7-2.5-2.5L2 11.5ZM12.7 5.2a.8.8 0 0 0 0-1.1L11 2.3a.8.8 0 0 0-1.1 0L8.8 3.4l2.5 2.5 1.4-1.4Z"
                                  fill="currentColor"
                                />
                              </svg>
                            </button>
                            <button
                              className="h-7 w-7 inline-flex items-center justify-center rounded border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                              title="Remove model"
                              aria-label={`Remove ${m.id}`}
                              onClick={() => {
                                setModelConfig({
                                  interfaces: modelConfig.interfaces.filter((x) => x.id !== m.id),
                                })
                              }}
                            >
                              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                                <path
                                  d="M6 2.5h4L10.5 4H13v1H3V4h2.5L6 2.5ZM4.5 6h7l-.5 7h-6l-.5-7Z"
                                  fill="currentColor"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )
                    }),
                  )}
                </div>
                <button
                  className="mt-4 px-3 py-1.5 text-sm rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  onClick={() => {
                    setModelFormStatus(null)
                    setModelForm({
                      id: '',
                      displayName: '',
                      provider: 'gemini',
                      enabled: true,
                    })
                    setEditingModel({ id: '_new', displayName: '', provider: 'gemini', enabled: true })
                  }}
                >
                  + Add model
                </button>
              </>
            )}
          </>
        )}

        {appSettingsView === 'preferences' && (
          <>
            {typeof navigator !== 'undefined' && /Win/i.test(navigator.userAgent) && (
              <section className="space-y-2">
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Windows shortcut</div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  Repair or recreate the Start menu shortcut (with icon). Pin the shortcut to taskbar for the correct icon—do not pin the running window.
                </p>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  onClick={async () => {
                    try {
                      const result = await api.repairStartMenuShortcut?.()
                      if (result?.ok) {
                        setRepairShortcutStatus('Shortcut repaired.')
                      } else {
                        setRepairShortcutStatus(result?.error ?? 'Failed')
                      }
                    } catch (e) {
                      setRepairShortcutStatus(String(e))
                    }
                    setTimeout(() => setRepairShortcutStatus(null), 4000)
                  }}
                >
                  Repair Start menu shortcut
                </button>
                {repairShortcutStatus && (
                  <div className="text-xs text-neutral-600 dark:text-neutral-400">{repairShortcutStatus}</div>
                )}
              </section>
            )}
            <section className="space-y-2">
              <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Startup</div>
              <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={applicationSettings.restoreSessionOnStartup}
                  onChange={(e) =>
                    setApplicationSettings((prev) => ({
                      ...prev,
                      restoreSessionOnStartup: e.target.checked,
                    }))
                  }
                />
                Restore windows, layout, chats, and editor tabs after restart or crash
              </label>
            </section>

            <section className="space-y-2">
              <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Chat</div>
              <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={Boolean(applicationSettings.showResponseDurationAfterPrompt)}
                  onChange={(e) =>
                    setApplicationSettings((prev) => ({
                      ...prev,
                      showResponseDurationAfterPrompt: e.target.checked,
                    }))
                  }
                />
                Display response duration in seconds after each prompt completes
              </label>
            </section>

            <section className="space-y-3">
              <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Appearance</div>
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 space-y-3">
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-2">
                  Fonts per type (Cursor-style: chat, code, thinking, editor)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-neutral-600 dark:text-neutral-400 mb-1">Chat</div>
                    <div className="flex gap-1.5">
                      <select
                        className={`${UI_SELECT_CLASS} flex-1 min-w-0`}
                        value={applicationSettings.fontChat}
                        onChange={(e) =>
                          setApplicationSettings((prev) => ({ ...prev, fontChat: e.target.value }))
                        }
                      >
                        {FONT_OPTIONS.map((f) => (
                          <option key={f.id} value={f.id}>{f.label}</option>
                        ))}
                      </select>
                      <select
                        className={`${UI_SELECT_CLASS} w-[58px] shrink-0`}
                        value={applicationSettings.fontChatSize}
                        onChange={(e) =>
                          setApplicationSettings((prev) => ({ ...prev, fontChatSize: Number(e.target.value) }))
                        }
                      >
                        {FONT_SIZE_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-600 dark:text-neutral-400 mb-1">Code blocks & terminal</div>
                    <div className="flex gap-1.5">
                      <select
                        className={`${UI_SELECT_CLASS} flex-1 min-w-0`}
                        value={applicationSettings.fontCode}
                        onChange={(e) =>
                          setApplicationSettings((prev) => ({ ...prev, fontCode: e.target.value }))
                        }
                      >
                        {MONO_FONT_OPTIONS.map((f) => (
                          <option key={f.id} value={f.id}>{f.label}</option>
                        ))}
                      </select>
                      <select
                        className={`${UI_SELECT_CLASS} w-[58px] shrink-0`}
                        value={applicationSettings.fontCodeSize}
                        onChange={(e) =>
                          setApplicationSettings((prev) => ({ ...prev, fontCodeSize: Number(e.target.value) }))
                        }
                      >
                        {FONT_SIZE_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-600 dark:text-neutral-400 mb-1">Thinking / reasoning</div>
                    <div className="flex gap-1.5">
                      <select
                        className={`${UI_SELECT_CLASS} flex-1 min-w-0`}
                        value={applicationSettings.fontThinking}
                        onChange={(e) =>
                          setApplicationSettings((prev) => ({ ...prev, fontThinking: e.target.value }))
                        }
                      >
                        {FONT_OPTIONS.map((f) => (
                          <option key={f.id} value={f.id}>{f.label}</option>
                        ))}
                      </select>
                      <select
                        className={`${UI_SELECT_CLASS} w-[58px] shrink-0`}
                        value={applicationSettings.fontThinkingSize}
                        onChange={(e) =>
                          setApplicationSettings((prev) => ({ ...prev, fontThinkingSize: Number(e.target.value) }))
                        }
                      >
                        {FONT_SIZE_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-600 dark:text-neutral-400 mb-1">Editor</div>
                    <div className="flex gap-1.5">
                      <select
                        className={`${UI_SELECT_CLASS} flex-1 min-w-0`}
                        value={applicationSettings.fontEditor}
                        onChange={(e) =>
                          setApplicationSettings((prev) => ({ ...prev, fontEditor: e.target.value }))
                        }
                      >
                        {MONO_FONT_OPTIONS.map((f) => (
                          <option key={f.id} value={f.id}>{f.label}</option>
                        ))}
                      </select>
                      <select
                        className={`${UI_SELECT_CLASS} w-[58px] shrink-0`}
                        value={applicationSettings.fontEditorSize}
                        onChange={(e) =>
                          setApplicationSettings((prev) => ({ ...prev, fontEditorSize: Number(e.target.value) }))
                        }
                      >
                        {FONT_SIZE_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="text-xs text-neutral-600 dark:text-neutral-400 mb-2 pt-1">Theme</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {themeCatalog.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setApplicationSettings((prev) => ({
                          ...prev,
                          themeId: t.id,
                        }))
                        setSelectedThemeEditorId(t.id)
                        setThemeEditorDraft(cloneTheme(t))
                        setThemeEditorStatus(null)
                      }}
                      className={`px-3 py-2 rounded-md border text-left text-sm ${applicationSettings.themeId === t.id
                        ? 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100'
                        : 'border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
                        }`}
                    >
                      <span>{t.name}</span>
                    </button>
                  ))}
                </div>
                <label className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(applicationSettings.customiseStandardThemes)}
                    onChange={(e) =>
                      setApplicationSettings((prev) => ({
                        ...prev,
                        customiseStandardThemes: e.target.checked,
                      }))
                    }
                  />
                  <span className="text-sm text-neutral-700 dark:text-neutral-300">Customise standard themes</span>
                </label>
                {(applicationSettings.themeId === 'custom' || applicationSettings.customiseStandardThemes) && (
                  <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
                    <div className="text-xs text-neutral-600 dark:text-neutral-400">
                      Theme fields
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      {applicationSettings.themeId === 'custom'
                        ? 'Custom theme starts from Default Light. Adjust colours below and save.'
                        : 'Click a theme above to populate editable color fields, then save changes back to that theme.'}
                    </div>
                    {themeEditorDraft ? (
                      <>
                        <div className="text-xs text-neutral-600 dark:text-neutral-400">
                          Editing <span className="font-medium text-neutral-800 dark:text-neutral-200">{themeEditorDraft.name}</span> ({themeEditorDraft.id})
                        </div>
                        <div className="space-y-3 pr-1">
                          {(() => {
                            const groups = new Map<string, typeof THEME_EDITABLE_FIELDS>()
                            for (const field of THEME_EDITABLE_FIELDS) {
                              const g = field.group ?? 'Other'
                              if (!groups.has(g)) groups.set(g, [])
                              groups.get(g)!.push(field)
                            }
                            return Array.from(groups.entries()).map(([groupName, fields]) => (
                              <div key={groupName} className="space-y-2">
                                <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                                  {groupName}
                                </div>
                                {fields.map((field) => (
                                  <div key={field.key} className="grid grid-cols-[220px_44px_1fr] items-center gap-2">
                                    <span className="text-xs text-neutral-600 dark:text-neutral-300">{field.label}</span>
                                    <input
                                      type="color"
                                      className="h-8 w-11 rounded border border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800"
                                      value={extractHexColor(themeEditorDraft[field.key]) ?? '#000000'}
                                      onChange={(e) =>
                                        setThemeEditorDraft((prev) =>
                                          prev
                                            ? {
                                              ...prev,
                                              [field.key]: e.target.value,
                                            }
                                            : prev,
                                        )
                                      }
                                    />
                                    <input
                                      className={`${UI_INPUT_CLASS} text-xs font-mono`}
                                      value={themeEditorDraft[field.key]}
                                      onChange={(e) =>
                                        setThemeEditorDraft((prev) =>
                                          prev
                                            ? {
                                              ...prev,
                                              [field.key]: e.target.value,
                                            }
                                            : prev,
                                        )
                                      }
                                      placeholder="#000000 or rgba(...)"
                                    />
                                  </div>
                                ))}
                              </div>
                            ))
                          })()}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            className={UI_BUTTON_PRIMARY_CLASS}
                            onClick={() => {
                              const baseTheme = THEMES.find((theme) => theme.id === themeEditorDraft.id)
                              if (!baseTheme) {
                                setThemeEditorStatus('Selected theme is unavailable.')
                                return
                              }
                              const nextOverride: ThemeOverrideValues = {}
                              for (const field of THEME_EDITABLE_FIELDS) {
                                const nextValue = String(themeEditorDraft[field.key] ?? '').trim()
                                if (nextValue && nextValue !== baseTheme[field.key]) {
                                  nextOverride[field.key] = nextValue
                                }
                              }
                              setThemeOverrides((prev) => {
                                const next = { ...prev }
                                if (Object.keys(nextOverride).length === 0) delete next[themeEditorDraft.id]
                                else next[themeEditorDraft.id] = nextOverride
                                return next
                              })
                              setThemeEditorStatus(`Saved changes to ${themeEditorDraft.name}.`)
                            }}
                          >
                            Save theme
                          </button>
                          <button
                            type="button"
                            className="px-3 py-1.5 text-sm rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                            onClick={() => {
                              const baseTheme = THEMES.find((theme) => theme.id === themeEditorDraft.id)
                              if (!baseTheme) return
                              setThemeEditorDraft(cloneTheme(baseTheme))
                              setThemeOverrides((prev) => {
                                if (!prev[themeEditorDraft.id]) return prev
                                const next = { ...prev }
                                delete next[themeEditorDraft.id]
                                return next
                              })
                              setThemeEditorStatus(`Reset ${themeEditorDraft.name} to defaults.`)
                            }}
                          >
                            Reset theme
                          </button>
                          {themeEditorStatus && (
                            <span className="text-xs text-neutral-600 dark:text-neutral-400">{themeEditorStatus}</span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">Select a theme to edit its fields.</div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {appSettingsView === 'connectivity' && (
          <>
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Provider Connectivity</div>
                <button
                  type="button"
                  className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  onClick={() => void refreshAllProviderAuthStatuses()}
                >
                  Re-check all
                </button>
              </div>
              <div className="text-xs text-neutral-600 dark:text-neutral-400">
                Barnaby supports both local CLI providers and API providers. These checks run when opened (OpenRouter is excluded to avoid rate limits). Use Re-check on a provider to validate it.
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 italic">
                Fallback connectivity is used only when the primary method has reached its usage limits.
              </p>
              <div className="flex flex-col gap-4">
                {resolvedProviderConfigs.map((config) => {
                  const status = providerAuthByName[config.id]
                  const loading = providerAuthLoadingByName[config.id]
                  const action = providerAuthActionByName[config.id]
                  const isDual = PROVIDERS_WITH_DUAL_MODE.includes(config.id as ConnectivityProvider)
                  const primary = providerRegistry.overrides[config.id]?.primary ?? 'cli'
                  const fallbackEnabled = providerRegistry.overrides[config.id]?.fallbackEnabled ?? false
                  const fallback = providerRegistry.overrides[config.id]?.fallback ?? (primary === 'cli' ? 'api' : 'cli')
                  const configuredNeedsCli = !isDual
                    ? config.type === 'cli'
                    : primary === 'cli' || (fallbackEnabled && fallback === 'cli')
                  const configuredNeedsApi = !isDual
                    ? config.type === 'api'
                    : primary === 'api' || (fallbackEnabled && fallback === 'api')
                  const activeNeedsCli = !isDual ? config.type === 'cli' : primary === 'cli'
                  const activeNeedsApi = !isDual ? config.type === 'api' : primary === 'api'
                  const providerEnabled = Boolean(config.enabled)
                  const statusLabel = !providerEnabled
                    ? 'Disabled'
                    : !status
                      ? 'Unknown'
                      : !status.installed
                        ? 'Not installed'
                        : status.authenticated
                          ? (providerVerifiedByName[config.id] ? 'Connected' : 'Authenticated')
                          : 'Login required'
                  const rawStatusDetail = status?.detail?.trim() ?? ''
                  const detailLooksLikeConnected = /^connected[.!]?$/i.test(rawStatusDetail)
                  const statusDetail = !providerEnabled
                    ? 'Provider disabled.'
                    : rawStatusDetail && !detailLooksLikeConnected
                      ? rawStatusDetail
                      : (activeNeedsApi && !activeNeedsCli ? 'Click Test API to validate.' : 'No status yet.')
                  const statusClass = !providerEnabled
                    ? 'border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400'
                    : !status
                      ? 'border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300'
                      : !status.installed
                        ? 'border-red-300 text-red-700 dark:border-red-800 dark:text-red-300'
                        : status.authenticated
                          ? (providerVerifiedByName[config.id]
                            ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300'
                            : 'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300')
                          : 'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300'
                  const isBuiltIn = config.isBuiltIn ?? CONNECTIVITY_PROVIDERS.includes(config.id as ConnectivityProvider)
                  const override = providerRegistry.overrides[config.id]
                  const panelOpen = providerPanelOpenByName[config.id] ?? false
                  return (
                    <details
                      key={config.id}
                      open={panelOpen}
                      onToggle={(e) => {
                        const next = e.currentTarget.open
                        setProviderPanelOpenByName((prev) => (prev[config.id] === next ? prev : { ...prev, [config.id]: next }))
                      }}
                      className={`group rounded-lg border border-neutral-300 dark:border-neutral-700 p-3 bg-neutral-100 dark:bg-neutral-900/60 shadow-sm ${!config.enabled ? 'opacity-60' : ''}`}
                    >
                      <summary className="list-none cursor-pointer flex items-center justify-between gap-3 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/80 hover:bg-neutral-50 dark:hover:bg-neutral-800 px-2.5 py-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          {(() => {
                            const cVerified = providerVerifiedByName[config.id]
                            const dotCls = !providerEnabled
                              ? 'bg-neutral-400 dark:bg-neutral-500'
                              : !status
                                ? 'bg-neutral-400 dark:bg-neutral-500'
                                : !status.installed
                                  ? 'bg-red-500'
                                  : status.authenticated
                                    ? (cVerified ? 'bg-emerald-500' : 'bg-amber-500')
                                    : 'bg-amber-500'
                            const dotTitle = !providerEnabled
                              ? 'Disabled'
                              : !status
                                ? 'Checking...'
                                : !status.installed
                                  ? status.detail ?? 'CLI not found'
                                  : status.authenticated
                                    ? (cVerified ? status.detail ?? 'Connected' : 'Authenticated. Waiting for first response to verify.')
                                    : status.detail ?? 'Login required'
                            return (
                              <span
                                className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${dotCls}`}
                                title={dotTitle}
                              />
                            )
                          })()}
                          <span className="font-medium text-sm text-neutral-800 dark:text-neutral-200 truncate">
                            {config.displayName}
                            {!isBuiltIn && (
                              <span className="text-[10px] text-neutral-500 dark:text-neutral-400 ml-1">(custom)</span>
                            )}
                          </span>
                          <div className={`px-2 py-0.5 rounded-full text-[11px] border ${statusClass}`}>{statusLabel}</div>
                          {providerPingDurationByName[config.id] != null && (
                            <span className="text-[10px] text-neutral-500 dark:text-neutral-400" title="Startup ping round-trip time">
                              {providerPingDurationByName[config.id]! < 1000
                                ? `${providerPingDurationByName[config.id]}ms`
                                : `${(providerPingDurationByName[config.id]! / 1000).toFixed(1)}s`}
                            </span>
                          )}
                        </div>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 12 12"
                          fill="none"
                          className="text-neutral-500 dark:text-neutral-400 transition-transform group-open:rotate-180"
                          aria-hidden
                        >
                          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </summary>
                      <div className="mt-2 pt-2 border-t border-neutral-200 dark:border-neutral-700 space-y-2 rounded-md bg-white/80 dark:bg-neutral-950/60 px-2.5 pb-2">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-3 flex-wrap">
                            <label className="flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                checked={config.enabled}
                                onChange={(e) => {
                                  const id = config.id
                                  if (isBuiltIn) {
                                    setProviderRegistry((prev: ProviderRegistry) => ({
                                      ...prev,
                                      overrides: {
                                        ...prev.overrides,
                                        [id]: { ...prev.overrides[id], enabled: e.target.checked },
                                      },
                                    }))
                                  } else {
                                    setProviderRegistry((prev: ProviderRegistry) => ({
                                      ...prev,
                                      customProviders: prev.customProviders.map((p: CustomProviderConfig) =>
                                        p.id === id ? { ...p, enabled: e.target.checked } : p,
                                      ),
                                    }))
                                  }
                                }}
                                className="rounded border-neutral-300"
                              />
                              <span className="text-sm text-neutral-700 dark:text-neutral-300">Enabled</span>
                            </label>
                          </div>
                          {!isBuiltIn && (
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className="px-2 py-1 text-xs rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                onClick={() => {
                                  setEditingProvider(config as CustomProviderConfig)
                                  setShowProviderSetupModal(true)
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="px-2 py-1 text-xs rounded border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                                onClick={() => {
                                  setProviderRegistry((prev: ProviderRegistry) => ({
                                    ...prev,
                                    customProviders: prev.customProviders.filter((p: CustomProviderConfig) => p.id !== config.id),
                                  }))
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                        {isBuiltIn && (
                          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 items-center text-xs">
                            <span className="text-neutral-500 dark:text-neutral-400">Display name</span>
                            <input
                              type="text"
                              className={`${UI_INPUT_CLASS} text-sm`}
                              value={override?.displayName ?? ''}
                              onChange={(e) =>
                                setProviderRegistry((prev: ProviderRegistry) => ({
                                  ...prev,
                                  overrides: {
                                    ...prev.overrides,
                                    [config.id]: { ...prev.overrides[config.id], displayName: e.target.value || undefined },
                                  },
                                }))
                              }
                              placeholder={
                                CONNECTIVITY_PROVIDERS.includes(config.id as ConnectivityProvider)
                                  ? DEFAULT_BUILTIN_PROVIDER_CONFIGS[config.id as ConnectivityProvider].displayName
                                  : config.displayName
                              }
                            />
                            {/* Primary / Fallback connectivity mode — shown for all built-in providers */}
                            <span className="text-neutral-500 dark:text-neutral-400">Primary</span>
                            <select
                              className={`${UI_SELECT_CLASS} text-sm`}
                              value={
                                PROVIDERS_API_ONLY.includes(config.id as ConnectivityProvider)
                                  ? 'api'
                                  : (override?.primary ?? 'cli')
                              }
                              onChange={(e) => {
                                if (!PROVIDERS_WITH_DUAL_MODE.includes(config.id as ConnectivityProvider)) return
                                setProviderRegistry((prev: ProviderRegistry) => ({
                                  ...prev,
                                  overrides: {
                                    ...prev.overrides,
                                    [config.id]: {
                                      ...prev.overrides[config.id],
                                      primary: e.target.value as ConnectivityMode,
                                      fallback: (e.target.value as ConnectivityMode) === (override?.fallback ?? 'api')
                                        ? (e.target.value === 'cli' ? 'api' : 'cli')
                                        : override?.fallback,
                                    },
                                  },
                                }))
                              }}
                              disabled={PROVIDERS_CLI_ONLY.includes(config.id as ConnectivityProvider) || PROVIDERS_API_ONLY.includes(config.id as ConnectivityProvider)}
                            >
                              {!PROVIDERS_API_ONLY.includes(config.id as ConnectivityProvider) && <option value="cli">CLI</option>}
                              {!PROVIDERS_CLI_ONLY.includes(config.id as ConnectivityProvider) && <option value="api">API</option>}
                            </select>
                            {PROVIDERS_WITH_DUAL_MODE.includes(config.id as ConnectivityProvider) && (
                              <>
                                <span className="text-neutral-500 dark:text-neutral-400 col-span-2">
                                  <label className="inline-flex items-center gap-1.5">
                                    <input
                                      type="checkbox"
                                      checked={override?.fallbackEnabled ?? false}
                                      onChange={(e) =>
                                        setProviderRegistry((prev: ProviderRegistry) => ({
                                          ...prev,
                                          overrides: {
                                            ...prev.overrides,
                                            [config.id]: { ...prev.overrides[config.id], fallbackEnabled: e.target.checked },
                                          },
                                        }))
                                      }
                                      className="rounded border-neutral-300"
                                    />
                                    Fallback
                                  </label>
                                </span>
                                {override?.fallbackEnabled && (
                                  <>
                                    <span className="text-neutral-500 dark:text-neutral-400">Fallback mode</span>
                                    <select
                                      className={`${UI_SELECT_CLASS} text-sm`}
                                      value={
                                        (() => {
                                          const p = override?.primary ?? 'cli'
                                          const f = override?.fallback ?? (p === 'cli' ? 'api' : 'cli')
                                          return f === p ? (p === 'cli' ? 'api' : 'cli') : f
                                        })()
                                      }
                                      onChange={(e) =>
                                        setProviderRegistry((prev: ProviderRegistry) => ({
                                          ...prev,
                                          overrides: {
                                            ...prev.overrides,
                                            [config.id]: { ...prev.overrides[config.id], fallback: e.target.value as ConnectivityMode },
                                          },
                                        }))
                                      }
                                    >
                                      {(override?.primary ?? 'cli') !== 'cli' && <option value="cli">CLI</option>}
                                      {(override?.primary ?? 'cli') !== 'api' && <option value="api">API</option>}
                                    </select>
                                  </>
                                )}
                              </>
                            )}
                            {(() => {
                              const isDual = PROVIDERS_WITH_DUAL_MODE.includes(config.id as ConnectivityProvider)
                              const primary = override?.primary ?? 'cli'
                              const fallbackEnabled = override?.fallbackEnabled ?? false
                              const fallback = override?.fallback ?? (primary === 'cli' ? 'api' : 'cli')
                              const needsCli = !isDual ? config.type === 'cli' : primary === 'cli' || (fallbackEnabled && fallback === 'cli')
                              const needsApi = !isDual ? config.type === 'api' : primary === 'api' || (fallbackEnabled && fallback === 'api')
                              return needsCli ? (
                                <>
                                  <span className="text-neutral-500 dark:text-neutral-400">CLI path</span>
                                  <input
                                    type="text"
                                    className={`${UI_INPUT_CLASS} text-sm font-mono`}
                                    value={override?.cliPath ?? ''}
                                    onChange={(e) =>
                                      setProviderRegistry((prev: ProviderRegistry) => ({
                                        ...prev,
                                        overrides: {
                                          ...prev.overrides,
                                          [config.id]: { ...prev.overrides[config.id], cliPath: e.target.value || undefined },
                                        },
                                      }))
                                    }
                                    placeholder="Use system PATH"
                                  />
                                </>
                              ) : null
                            })()}
                            {(() => {
                              const isDual = PROVIDERS_WITH_DUAL_MODE.includes(config.id as ConnectivityProvider)
                              const primary = override?.primary ?? 'cli'
                              const fallbackEnabled = override?.fallbackEnabled ?? false
                              const fallback = override?.fallback ?? (primary === 'cli' ? 'api' : 'cli')
                              const needsApi = !isDual ? config.type === 'api' : primary === 'api' || (fallbackEnabled && fallback === 'api')
                              return needsApi ? (
                                <>
                                  <span className="text-neutral-500 dark:text-neutral-400">API base URL</span>
                                  <input
                                    type="text"
                                    className={`${UI_INPUT_CLASS} text-sm font-mono`}
                                    value={override?.apiBaseUrl ?? ''}
                                    onChange={(e) =>
                                      setProviderRegistry((prev: ProviderRegistry) => ({
                                        ...prev,
                                        overrides: {
                                          ...prev.overrides,
                                          [config.id]: { ...prev.overrides[config.id], apiBaseUrl: e.target.value || undefined },
                                        },
                                      }))
                                    }
                                    placeholder={'apiBaseUrl' in config ? config.apiBaseUrl : (override?.apiBaseUrl || 'https://...')}
                                  />
                                  <span className="text-neutral-500 dark:text-neutral-400">API key</span>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="password"
                                      className={`${UI_INPUT_CLASS} text-sm font-mono w-full`}
                                      value={providerApiKeyDraftByName[config.id] ?? ''}
                                      onChange={(e) =>
                                        setProviderApiKeyDraftByName((prev) => ({ ...prev, [config.id]: e.target.value }))
                                      }
                                      placeholder={providerApiKeyStateByName[config.id] ? 'Key saved (enter to replace)' : (config.id === 'openrouter' ? 'sk-or-v1-...' : config.id === 'codex' ? 'sk-...' : 'API key')}
                                    />
                                    <button
                                      type="button"
                                      className="px-2 py-1 text-xs rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                      onClick={() => void saveProviderApiKey(config.id)}
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      className="px-2 py-1 text-xs rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                      onClick={() => void importProviderApiKeyFromEnv(config.id)}
                                      title={`Import ${config.id.toUpperCase()}_API_KEY from environment`}
                                    >
                                      Import Env
                                    </button>
                                    <button
                                      type="button"
                                      className="px-2 py-1 text-xs rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                      onClick={() => void clearProviderApiKey(config.id)}
                                    >
                                      Clear
                                    </button>
                                  </div>
                                </>
                              ) : null
                            })()}
                          </div>
                        )}
                        {(activeNeedsCli || activeNeedsApi) && (
                          <>
                            <div className="text-xs text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap break-words">
                              {loading ? `Checking ${config.displayName}...` : statusDetail}
                            </div>
                            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                              Checked: {status?.checkedAt ? formatCheckedAt(status.checkedAt) : 'Never'}
                            </div>
                          </>
                        )}
                        {config.enabled && (activeNeedsCli || activeNeedsApi) && (
                          <div className="flex items-center gap-2 flex-wrap">
                            {activeNeedsCli && (
                              <>
                                <button
                                  type="button"
                                  className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 text-xs disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                  disabled={loading}
                                  onClick={async () => {
                                    const authStart = Date.now()
                                    const s = await refreshProviderAuthStatus(config)
                                    const authDurationMs = Date.now() - authStart
                                    if (!s?.authenticated) return
                                    if (PROVIDERS_WITH_DEDICATED_PING.has(config.id) && api.pingProvider) {
                                      try {
                                        const ping = await api.pingProvider(config.id)
                                        setProviderPingDurationByName((prev) => ({ ...prev, [config.id]: ping.durationMs }))
                                        if (ping.ok) setProviderVerifiedByName((prev) => prev[config.id] ? prev : { ...prev, [config.id]: true })
                                      } catch { /* ignore */ }
                                    } else {
                                      setProviderPingDurationByName((prev) => ({ ...prev, [config.id]: authDurationMs }))
                                      setProviderVerifiedByName((prev) => prev[config.id] ? prev : { ...prev, [config.id]: true })
                                    }
                                  }}
                                >
                                  {loading ? 'Checking...' : 'Re-check'}
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 text-xs disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                  disabled={loading}
                                  onClick={() => void startProviderLoginFlow(config)}
                                >
                                  {status?.authenticated ? 'Re-authenticate' : 'Open login'}
                                </button>
                                {config.type === 'cli' &&
                                  ((config as ProviderConfigCli).upgradeCommand || (config as ProviderConfigCli).upgradePackage) && (
                                    <button
                                      type="button"
                                      className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 text-xs disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                      disabled={loading}
                                      onClick={() => void startProviderUpgradeFlow(config)}
                                      title={
                                        (config as ProviderConfigCli).upgradePackage
                                          ? `Clean reinstall: npm uninstall -g ${(config as ProviderConfigCli).upgradePackage}; npm install -g ${(config as ProviderConfigCli).upgradePackage}@latest`
                                          : (config as ProviderConfigCli).upgradeCommand
                                      }
                                    >
                                      Upgrade CLI
                                    </button>
                                  )}
                              </>
                            )}
                            {activeNeedsApi && (
                              <>
                                <button
                                  type="button"
                                  className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 text-xs disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                  disabled={loading}
                                  onClick={() => void refreshProviderApiAuthStatus(config.id)}
                                >
                                  {loading ? 'Checking...' : 'Test API'}
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 text-xs disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                  onClick={() =>
                                    void startProviderLoginFlow(
                                      API_CONFIG_BY_PROVIDER[config.id]
                                        ? {
                                          id: config.id,
                                          displayName: config.displayName,
                                          enabled: config.enabled,
                                          type: 'api' as const,
                                          apiBaseUrl: API_CONFIG_BY_PROVIDER[config.id].apiBaseUrl,
                                          loginUrl: API_CONFIG_BY_PROVIDER[config.id].loginUrl,
                                        }
                                        : config,
                                    )
                                  }
                                >
                                  Open keys page
                                </button>
                              </>
                            )}
                            {PROVIDER_SUBSCRIPTION_URLS[config.id] && (
                              <button
                                type="button"
                                className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 text-xs disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                title="View subscription limits and purchase credits"
                                onClick={() => void api.openExternalUrl?.(PROVIDER_SUBSCRIPTION_URLS[config.id])}
                              >
                                View limits
                              </button>
                            )}
                            {action && <span className="text-xs text-neutral-600 dark:text-neutral-400">{action}</span>}
                          </div>
                        )}
                      </div>
                    </details>
                  )
                })}
              </div>
              <button
                type="button"
                className="mt-2 px-3 py-1.5 text-sm rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                onClick={() => {
                  setEditingProvider({
                    id: '',
                    displayName: '',
                    enabled: true,
                    type: 'cli',
                    cliCommand: '',
                    authCheckCommand: '--version',
                  })
                  setShowProviderSetupModal(true)
                }}
              >
                + Add provider
              </button>
            </section>
          </>
        )}

        {appSettingsView === 'agents' && (
          <>
            <section className="space-y-3">
              <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Agents</div>
              <div className="space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="response-style"
                    checked={applicationSettings.responseStyle === 'concise'}
                    onChange={() =>
                      setApplicationSettings((prev) => ({
                        ...prev,
                        responseStyle: 'concise',
                      }))
                    }
                  />
                  <span>
                    <span className="font-medium">Concise</span>
                    <span className="block text-xs text-neutral-500 dark:text-neutral-400">Show direct answers only; hide progress traces.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="response-style"
                    checked={applicationSettings.responseStyle === 'standard'}
                    onChange={() =>
                      setApplicationSettings((prev) => ({
                        ...prev,
                        responseStyle: 'standard',
                      }))
                    }
                  />
                  <span>
                    <span className="font-medium">Standard</span>
                    <span className="block text-xs text-neutral-500 dark:text-neutral-400">Hide repetitive progress; keep useful in-turn context.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="response-style"
                    checked={applicationSettings.responseStyle === 'detailed'}
                    onChange={() =>
                      setApplicationSettings((prev) => ({
                        ...prev,
                        responseStyle: 'detailed',
                      }))
                    }
                  />
                  <span>
                    <span className="font-medium">Detailed</span>
                    <span className="block text-xs text-neutral-500 dark:text-neutral-400">Show all progress and intermediary reasoning updates.</span>
                  </span>
                </label>
              </div>
            </section>
          </>
        )}

        {appSettingsView === 'orchestrator' && (
          <>
            <section className="space-y-3">
              <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Installation</div>
              <div className="space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-block w-2 h-2 rounded-full shrink-0 ${loadedPlugins?.some((p) => p.pluginId === 'orchestrator' && p.active)
                      ? 'bg-green-500 dark:bg-green-600'
                      : 'bg-neutral-300 dark:bg-neutral-600'
                      }`}
                  />
                  <span className="text-neutral-500 dark:text-neutral-400">
                    {loadedPlugins?.some((p) => p.pluginId === 'orchestrator' && p.active)
                      ? `Plugin: ${loadedPlugins.find((p) => p.pluginId === 'orchestrator')?.displayName ?? 'Orchestrator'} v${loadedPlugins.find((p) => p.pluginId === 'orchestrator')?.version ?? '?'}`
                      : 'Plugin: not installed'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                    onClick={async () => {
                      setOrchestratorInstallStatus('Installing...')
                      try {
                        const result = await api.installOrchestratorPlugin?.()
                        setOrchestratorInstallStatus(result?.ok ? 'Installed successfully' : result?.error ?? 'Install failed')
                      } catch (e) {
                        setOrchestratorInstallStatus(String(e))
                      }
                      setTimeout(() => setOrchestratorInstallStatus(null), 4000)
                    }}
                  >
                    Install from npm
                  </button>
                  {loadedPlugins?.some((p) => p.pluginId === 'orchestrator' && p.active) && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                      onClick={async () => {
                        setOrchestratorInstallStatus('Uninstalling...')
                        try {
                          const result = await api.uninstallOrchestratorPlugin?.()
                          setOrchestratorInstallStatus(result?.ok ? 'Uninstalled' : result?.error ?? 'Uninstall failed')
                        } catch (e) {
                          setOrchestratorInstallStatus(String(e))
                        }
                        setTimeout(() => setOrchestratorInstallStatus(null), 4000)
                      }}
                    >
                      Uninstall
                    </button>
                  )}
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                    onClick={async () => {
                      const result = await api.openPluginsFolder?.()
                      if (!result?.ok && result?.error) {
                        setOrchestratorInstallStatus(result.error)
                        setTimeout(() => setOrchestratorInstallStatus(null), 4000)
                      }
                    }}
                  >
                    Open plugins folder
                  </button>
                </div>
                {orchestratorInstallStatus && (
                  <div className="text-xs text-neutral-600 dark:text-neutral-400">{orchestratorInstallStatus}</div>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">License</div>
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                The Orchestrator is a paid add-on. Enter your license code to enable it.
              </p>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">License code</label>
                <input
                  type="text"
                  className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                  placeholder={orchestratorLicenseKeyState?.hasKey ? 'License entered' : 'Enter license code'}
                  value={orchestratorLicenseKeyDraft}
                  onChange={(e) => setOrchestratorLicenseKeyDraft(e.target.value)}
                  onBlur={async () => {
                    if (orchestratorLicenseKeyDraft.trim()) {
                      await api.setOrchestratorLicenseKey?.(orchestratorLicenseKeyDraft.trim())
                      setOrchestratorLicenseKeyState({ hasKey: true })
                    }
                  }}
                />
                <button
                  type="button"
                  className={UI_BUTTON_PRIMARY_CLASS}
                  onClick={async () => {
                    await api.setOrchestratorLicenseKey?.(orchestratorLicenseKeyDraft.trim())
                    const state = await api.getOrchestratorLicenseKeyState?.()
                    setOrchestratorLicenseKeyState(state ?? null)
                  }}
                >
                  Save license
                </button>
              </div>
            </section>

            <section className="space-y-3">
              <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Models</div>
              <div className="space-y-2 text-sm">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Orchestrator model</label>
                  <select
                    className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                    value={orchestratorSettings.orchestratorModel}
                    onChange={(e) => setOrchestratorSettings((p) => ({ ...p, orchestratorModel: e.target.value }))}
                  >
                    <option value="">Default</option>
                    {getModelOptions().map((id) => (
                      <option key={id} value={id}>{id}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Worker provider</label>
                  <select
                    className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                    value={orchestratorSettings.workerProvider}
                    onChange={(e) => setOrchestratorSettings((p) => ({ ...p, workerProvider: e.target.value }))}
                  >
                    <option value="codex">Codex</option>
                    <option value="claude">Claude</option>
                    <option value="gemini">Gemini</option>
                    <option value="openrouter">OpenRouter</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Worker model</label>
                  <select
                    className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                    value={orchestratorSettings.workerModel}
                    onChange={(e) => setOrchestratorSettings((p) => ({ ...p, workerModel: e.target.value }))}
                  >
                    <option value="">Default</option>
                    {getModelOptions().map((id) => (
                      <option key={id} value={id}>{id}</option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Execution</div>
              <div className="space-y-2 text-sm">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Max parallel panels (1–8)</label>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                    value={orchestratorSettings.maxParallelPanels}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10)
                      if (!Number.isNaN(v) && v >= 1 && v <= 8) {
                        setOrchestratorSettings((p) => ({ ...p, maxParallelPanels: v }))
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Max task attempts (1–10)</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                    value={orchestratorSettings.maxTaskAttempts}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10)
                      if (!Number.isNaN(v) && v >= 1 && v <= 10) {
                        setOrchestratorSettings((p) => ({ ...p, maxTaskAttempts: v }))
                      }
                    }}
                  />
                </div>
              </div>
            </section>
          </>
        )}

        {appSettingsView === 'mcp-servers' && (
          <>
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">MCP Servers</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                    onClick={() => void refreshMcpServers()}
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    className="px-2.5 py-1.5 rounded-md border border-blue-400 bg-blue-50 text-blue-800 hover:bg-blue-100 text-xs dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-900/50"
                    onClick={() => {
                      setMcpAddMode(true)
                      setMcpEditingServer(null)
                      setMcpJsonDraft('')
                      setMcpJsonError(null)
                    }}
                  >
                    Add Server
                  </button>
                </div>
              </div>
              <div className="text-xs text-neutral-600 dark:text-neutral-400">
                MCP (Model Context Protocol) servers provide additional tools to agents. Paste server config JSON below in Claude Desktop format. Tools are automatically available to API-based providers (OpenRouter, OpenAI).
              </div>

              {mcpAddMode && (
                <div className="rounded-lg border border-blue-300 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-3 space-y-2">
                  <div className="text-xs font-medium text-blue-800 dark:text-blue-200">Add MCP Server</div>
                  <textarea
                    className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-xs font-mono dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 resize-y"
                    rows={8}
                    value={mcpJsonDraft}
                    onChange={(e) => { setMcpJsonDraft(e.target.value); setMcpJsonError(null) }}
                    placeholder={'{\n  "azure-sql": {\n    "command": "npx",\n    "args": ["-y", "@azure/mssql-mcp-server"],\n    "env": {\n      "MSSQL_CONNECTION_STRING": "Server=tcp:..."\n    }\n  }\n}'}
                    spellCheck={false}
                  />
                  {mcpJsonError && (
                    <div className="text-xs text-red-600 dark:text-red-400">{mcpJsonError}</div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      className="px-2.5 py-1.5 rounded-md border border-blue-400 bg-blue-50 text-blue-800 hover:bg-blue-100 text-xs dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-900/50"
                      onClick={async () => {
                        try {
                          let parsed = JSON.parse(mcpJsonDraft.trim()) as Record<string, unknown>
                          if (parsed.mcpServers && typeof parsed.mcpServers === 'object' && !Array.isArray(parsed.mcpServers)) {
                            parsed = parsed.mcpServers as Record<string, unknown>
                          }
                          const keys = Object.keys(parsed)
                          if (keys.length === 0) { setMcpJsonError('JSON must have at least one server key.'); return }
                          for (const key of keys) {
                            const val = parsed[key] as Record<string, unknown>
                            if (!val || typeof val !== 'object' || typeof val.command !== 'string' || !val.command) {
                              setMcpJsonError(`Server "${key}" is missing a "command" field.`); return
                            }
                            await api.addMcpServer(key, {
                              command: val.command as string,
                              args: Array.isArray(val.args) ? val.args.map(String) : undefined,
                              env: val.env && typeof val.env === 'object' ? val.env as Record<string, string> : undefined,
                              enabled: true,
                            })
                          }
                          setMcpAddMode(false)
                          setMcpJsonDraft('')
                          setMcpJsonError(null)
                          void refreshMcpServers()
                        } catch {
                          setMcpJsonError('Invalid JSON. Paste a valid config object.')
                        }
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                      onClick={() => { setMcpAddMode(false); setMcpJsonDraft(''); setMcpJsonError(null) }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
                {mcpServers.length === 0 && !mcpAddMode && (
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 italic py-2">
                    No MCP servers configured. Click "Add Server" and paste a JSON config block.
                  </div>
                )}
                {mcpServers.map((server) => {
                  const panelOpen = mcpPanelOpenByName[server.name] ?? false
                  const isEditing = mcpEditingServer === server.name
                  const statusLabel = server.config.enabled === false
                    ? 'Disabled'
                    : server.connected
                      ? 'Connected'
                      : server.error
                        ? 'Error'
                        : 'Disconnected'
                  const statusClass = server.config.enabled === false
                    ? 'border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400'
                    : server.connected
                      ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300'
                      : server.error
                        ? 'border-red-300 text-red-700 dark:border-red-800 dark:text-red-300'
                        : 'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300'
                  return (
                    <details
                      key={server.name}
                      open={panelOpen}
                      onToggle={(e) => {
                        const next = e.currentTarget.open
                        setMcpPanelOpenByName((prev) => (prev[server.name] === next ? prev : { ...prev, [server.name]: next }))
                      }}
                      className={`group rounded-lg border border-neutral-300 dark:border-neutral-700 p-3 bg-neutral-100 dark:bg-neutral-900/60 shadow-sm ${server.config.enabled === false ? 'opacity-60' : ''}`}
                    >
                      <summary className="list-none cursor-pointer flex items-center justify-between gap-3 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/80 hover:bg-neutral-50 dark:hover:bg-neutral-800 px-2.5 py-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-medium text-sm text-neutral-800 dark:text-neutral-200 truncate">{server.name}</span>
                          <div className={`px-2 py-0.5 rounded-full text-[11px] border ${statusClass}`}>{statusLabel}</div>
                          {server.connected && (
                            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                              {server.toolCount} tool{server.toolCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 12 12"
                          fill="none"
                          className="text-neutral-500 dark:text-neutral-400 transition-transform group-open:rotate-180"
                          aria-hidden
                        >
                          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </summary>
                      <div className="mt-2 pt-2 border-t border-neutral-200 dark:border-neutral-700 space-y-2 rounded-md bg-white/80 dark:bg-neutral-950/60 px-2.5 pb-2">
                        {!isEditing && (
                          <>
                            <pre className="text-xs font-mono text-neutral-800 dark:text-neutral-200 bg-neutral-50 dark:bg-neutral-900 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all border border-neutral-200 dark:border-neutral-700">
                              {JSON.stringify({ [server.name]: { command: server.config.command, ...(server.config.args?.length ? { args: server.config.args } : {}), ...(server.config.env && Object.keys(server.config.env).length ? { env: server.config.env } : {}) } }, null, 2)}
                            </pre>
                            {server.error && (
                              <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-2 py-1 rounded border border-red-200 dark:border-red-900">
                                {server.error}
                              </div>
                            )}
                            {server.connected && server.tools.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Available Tools</div>
                                <div className="flex flex-wrap gap-1">
                                  {server.tools.map((t: any) => (
                                    <span
                                      key={t.name}
                                      className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300"
                                      title={t.description ?? t.name}
                                    >
                                      {t.name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="flex gap-1.5 pt-1 flex-wrap">
                              <button
                                type="button"
                                className="px-2 py-1 text-xs rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                onClick={() => {
                                  setMcpEditingServer(server.name)
                                  const configObj: Record<string, unknown> = { command: server.config.command }
                                  if (server.config.args?.length) configObj.args = server.config.args
                                  if (server.config.env && Object.keys(server.config.env).length) configObj.env = server.config.env
                                  setMcpJsonDraft(JSON.stringify({ [server.name]: configObj }, null, 2))
                                  setMcpJsonError(null)
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="px-2 py-1 text-xs rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                onClick={async () => {
                                  await api.restartMcpServer(server.name)
                                  void refreshMcpServers()
                                }}
                              >
                                Restart
                              </button>
                              <button
                                type="button"
                                className="px-2 py-1 text-xs rounded border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                                onClick={async () => {
                                  await api.removeMcpServer(server.name)
                                  void refreshMcpServers()
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          </>
                        )}
                        {isEditing && (
                          <div className="space-y-2">
                            <textarea
                              className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-xs font-mono dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 resize-y"
                              rows={8}
                              value={mcpJsonDraft}
                              onChange={(e) => { setMcpJsonDraft(e.target.value); setMcpJsonError(null) }}
                              spellCheck={false}
                            />
                            {mcpJsonError && (
                              <div className="text-xs text-red-600 dark:text-red-400">{mcpJsonError}</div>
                            )}
                            <div className="flex gap-2 pt-1">
                              <button
                                type="button"
                                className="px-2.5 py-1.5 rounded-md border border-blue-400 bg-blue-50 text-blue-800 hover:bg-blue-100 text-xs dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-900/50"
                                onClick={async () => {
                                  try {
                                    let parsed = JSON.parse(mcpJsonDraft.trim()) as Record<string, unknown>
                                    if (parsed.mcpServers && typeof parsed.mcpServers === 'object' && !Array.isArray(parsed.mcpServers)) {
                                      parsed = parsed.mcpServers as Record<string, unknown>
                                    }
                                    const keys = Object.keys(parsed)
                                    if (keys.length !== 1) { setMcpJsonError('Edit JSON must have exactly one server key.'); return }
                                    const newName = keys[0]
                                    const val = parsed[newName] as Record<string, unknown>
                                    if (!val || typeof val !== 'object' || typeof val.command !== 'string' || !val.command) {
                                      setMcpJsonError('Missing "command" field.'); return
                                    }
                                    if (newName !== server.name) {
                                      await api.removeMcpServer(server.name)
                                    }
                                    const fn = newName !== server.name ? api.addMcpServer : api.updateMcpServer
                                    await fn(newName, {
                                      command: val.command as string,
                                      args: Array.isArray(val.args) ? val.args.map(String) : undefined,
                                      env: val.env && typeof val.env === 'object' ? val.env as Record<string, string> : undefined,
                                      enabled: server.config.enabled,
                                    })
                                    setMcpEditingServer(null)
                                    setMcpJsonDraft('')
                                    setMcpJsonError(null)
                                    void refreshMcpServers()
                                  } catch {
                                    setMcpJsonError('Invalid JSON.')
                                  }
                                }}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="px-2.5 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                onClick={() => { setMcpEditingServer(null); setMcpJsonDraft(''); setMcpJsonError(null) }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </details>
                  )
                })}
              </div>
            </section>
          </>
        )}

        {appSettingsView === 'diagnostics' && (
          <>
            <section className="space-y-3">
              <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Chat timeline</div>
              <div className="space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(applicationSettings.verboseDiagnostics)}
                    onChange={(e) =>
                      setApplicationSettings((prev) => ({
                        ...prev,
                        verboseDiagnostics: e.target.checked,
                      }))
                    }
                  />
                  Verbose diagnostics
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">(show all activity, reasoning, and operation events)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(applicationSettings.showDebugNotesInTimeline)}
                    onChange={(e) =>
                      setApplicationSettings((prev) => ({
                        ...prev,
                        showDebugNotesInTimeline: e.target.checked,
                      }))
                    }
                  />
                  Inject debug notes into chat timeline
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(applicationSettings.enableMessageSizeLog)}
                    onChange={(e) =>
                      setApplicationSettings((prev) => ({
                        ...prev,
                        enableMessageSizeLog: e.target.checked,
                      }))
                    }
                  />
                  Enable message size logging
                  {applicationSettings.enableMessageSizeLog && (
                    <button type="button" className="text-xs text-blue-600 hover:underline dark:text-blue-400" onClick={() => openDiagnosticsTarget('runtimeLog', 'runtime log')}>
                      [View Log]
                    </button>
                  )}
                </label>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3 dark:border-neutral-700 dark:bg-neutral-900/50">
                <div className="text-xs text-neutral-600 dark:text-neutral-400">
                  Diagnostics message colors are now configured per theme in <span className="font-medium">Preferences → Appearance → Theme fields</span>.
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Runtime Logs</div>
              <div className="text-xs text-neutral-600 dark:text-neutral-400">
                Runtime logs and persisted state are stored in your Barnaby user data folder.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="px-2.5 py-1.5 rounded-md border border-neutral-200 bg-neutral-100 hover:bg-neutral-200 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-300"
                  onClick={() => void api.openDebugOutputWindow?.()}
                >
                  Open Debug Output Window
                </button>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  Separate window for live crash-resistant log monitoring
                </span>
              </div>
              {diagnosticsActionStatus && (
                <div className="text-xs text-neutral-600 dark:text-neutral-400">{diagnosticsActionStatus}</div>
              )}

              <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
                <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Danger Zone</div>
                <button
                  type="button"
                  className="px-2.5 py-1.5 rounded-md border border-red-200 bg-red-50 hover:bg-red-100 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:hover:bg-red-900/40 dark:text-red-400"
                  onClick={() => {
                    if (confirm('Are you sure you want to reset all application settings and data? This will clear your chat history, preferences, and local state, then restart the application as a fresh install. This action cannot be undone.')) {
                      try {
                        window.localStorage.clear()
                        void api.resetApplicationData?.()
                      } catch (err) {
                        alert(`Failed to reset: ${err}`)
                      }
                    }
                  }}
                >
                  Reset application to factory defaults
                </button>
              </div>

              {diagnosticsError && (
                <div className="text-xs text-red-600 dark:text-red-400">{diagnosticsError}</div>
              )}
              {diagnosticsInfo && (
                <div className="space-y-1 text-xs font-mono text-neutral-700 dark:text-neutral-300">
                  <div><span className="font-semibold">userData</span>: <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300 break-all text-left" onClick={() => openDiagnosticsTarget('userData', 'userData folder')}>{diagnosticsInfo.userDataPath}</button></div>
                  <div><span className="font-semibold">storage</span>: <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300 break-all text-left" onClick={() => openDiagnosticsTarget('storage', 'storage folder')}>{diagnosticsInfo.storageDir}</button></div>
                  <div><span className="font-semibold">runtime log</span>: <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300 break-all text-left" onClick={() => openDiagnosticsTarget('runtimeLog', 'runtime log')}>{diagnosticsInfo.runtimeLogPath}</button></div>
                  {diagnosticsInfo.debugLogPath && <div><span className="font-semibold">debug log</span>: <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300 break-all text-left" onClick={() => api.openDiagnosticsPath?.('debugLog')}>{diagnosticsInfo.debugLogPath}</button></div>}
                  {diagnosticsInfo.crashDumpsPath && <div><span className="font-semibold">crash dumps</span>: <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300 break-all text-left" onClick={() => api.openDiagnosticsPath?.('crashDumps')}>{diagnosticsInfo.crashDumpsPath}</button></div>}
                  <div><span className="font-semibold">app state</span>: <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300 break-all text-left" onClick={() => openDiagnosticsTarget('appState', 'app state')}>{diagnosticsInfo.appStatePath}</button></div>
                  <div><span className="font-semibold">chat history</span>: <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300 break-all text-left" onClick={() => openDiagnosticsTarget('chatHistory', 'chat history')}>{diagnosticsInfo.chatHistoryPath}</button></div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )


  return showDockedAppSettings && codeWindowSettingsHostRef.current
    ? createPortal(settingsCard, codeWindowSettingsHostRef.current)
    : null
}
