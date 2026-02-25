/**
 * App-level modal dialogs: Provider Setup, Setup Wizard,
 * Workspace Picker, and Workspace Settings.
 */
import React from 'react'
import {
  MODAL_BACKDROP_CLASS,
  MODAL_CARD_CLASS,
  UI_CLOSE_ICON_BUTTON_CLASS,
  UI_INPUT_CLASS,
  UI_BUTTON_PRIMARY_CLASS,
  UI_BUTTON_SECONDARY_CLASS,
  UI_SELECT_CLASS,
  CONNECTIVITY_PROVIDERS,
  SETUP_WIZARD_DONE_STORAGE_KEY,
  DEFAULT_MODEL,
  DEFAULT_WORKSPACE_ALLOWED_COMMAND_PREFIXES,
  DEFAULT_WORKSPACE_ALLOWED_AUTO_READ_PREFIXES,
  DEFAULT_WORKSPACE_ALLOWED_AUTO_WRITE_PREFIXES,
  DEFAULT_WORKSPACE_DENIED_AUTO_READ_PREFIXES,
  DEFAULT_WORKSPACE_DENIED_AUTO_WRITE_PREFIXES,
  PROVIDER_SUBSCRIPTION_URLS,
} from '../../constants'
import { PROVIDERS_WITH_DEDICATED_PING } from '../../controllers/providerConnectivityController'
import type {
  ConnectivityProvider,
  CustomProviderConfig,
  ModelConfig,
  PermissionMode,
  ProviderAuthStatus,
  ProviderConfigCli,
  ProviderConfig,
  ProviderRegistry,
  SandboxMode,
  WorkspaceSettings as WorkspaceSettingsType,
} from '../../types'
import {
  isLockedWorkspacePrompt,
  normalizeWorkspacePathForCompare,
} from '../../utils/appCore'

export interface AppModalsProps {
  api: any

  showProviderSetupModal: boolean
  setShowProviderSetupModal: React.Dispatch<React.SetStateAction<boolean>>
  editingProvider: any
  setEditingProvider: React.Dispatch<React.SetStateAction<any>>
  providerRegistry: ProviderRegistry
  setProviderRegistry: React.Dispatch<React.SetStateAction<ProviderRegistry>>

  showSetupWizard: boolean
  setShowSetupWizard: React.Dispatch<React.SetStateAction<boolean>>
  setupWizardStep: 'providers' | 'connect'
  setSetupWizardStep: React.Dispatch<React.SetStateAction<'providers' | 'connect'>>
  setupWizardSelection: Record<ConnectivityProvider, boolean>
  setSetupWizardSelection: React.Dispatch<React.SetStateAction<Record<ConnectivityProvider, boolean>>>
  setupWizardStatus: string | null
  setSetupWizardStatus: React.Dispatch<React.SetStateAction<string | null>>
  setupWizardFinishing: boolean

  resolvedProviderConfigs: ProviderConfig[]
  providerAuthByName: Partial<Record<string, ProviderAuthStatus>>
  providerAuthLoadingByName: Record<string, boolean>
  providerVerifiedByName: Record<string, boolean>
  setProviderVerifiedByName: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  providerPingDurationByName: Record<string, number | null>
  setProviderPingDurationByName: React.Dispatch<React.SetStateAction<Record<string, number | null>>>
  providerApiKeyDraftByName: Record<string, string>
  setProviderApiKeyDraftByName: React.Dispatch<React.SetStateAction<Record<string, string>>>
  providerApiKeyStateByName: Record<string, boolean>

  saveProviderApiKey: (providerId: string, explicitValue?: string) => Promise<void>
  importProviderApiKeyFromEnv: (providerId: string) => Promise<void>
  refreshProviderAuthStatus: (config: ProviderConfig) => Promise<ProviderAuthStatus | null>
  startProviderLoginFlow: (config: ProviderConfig) => Promise<void>
  startProviderUpgradeFlow: (config: ProviderConfig) => Promise<void>
  runSetupConnectivityChecks: (selected: ConnectivityProvider[]) => Promise<(ProviderAuthStatus | null)[]>
  finishSetupWizard: () => Promise<void>

  deleteHistoryIdPending: string | null
  setDeleteHistoryIdPending: React.Dispatch<React.SetStateAction<string | null>>
  deleteAllHistoryChecked: boolean
  setDeleteAllHistoryChecked: React.Dispatch<React.SetStateAction<boolean>>
  deleteThisAndOlderChecked: boolean
  setDeleteThisAndOlderChecked: React.Dispatch<React.SetStateAction<boolean>>
  deleteHistoryEntry: (historyId: string, opts: { deleteAll?: boolean; deleteThisAndOlder?: boolean }) => Promise<void>

  pendingWorkspaceSwitch: any
  setPendingWorkspaceSwitch: React.Dispatch<React.SetStateAction<any>>

  showWorkspacePicker: boolean
  workspacePickerPrompt: string | null
  setWorkspacePickerPrompt: React.Dispatch<React.SetStateAction<string | null>>
  workspacePickerOpening: string | null
  setWorkspacePickerOpening: React.Dispatch<React.SetStateAction<string | null>>
  workspacePickerError: string | null
  setWorkspacePickerError: React.Dispatch<React.SetStateAction<string | null>>
  workspaceList: string[]
  setWorkspaceList: React.Dispatch<React.SetStateAction<string[]>>
  workspaceRoot: string
  workspaceSettingsByPath: Record<string, any>
  setWorkspaceSettingsByPath: React.Dispatch<React.SetStateAction<any>>

  openWorkspacePicker: (prompt?: string | null) => void
  closeWorkspacePicker: () => void
  requestWorkspaceSwitch: (targetRoot: string, source: 'menu' | 'picker' | 'dropdown' | 'workspace-create') => void
  confirmWorkspaceSwitch: () => Promise<void>

  showWorkspaceModal: boolean
  setShowWorkspaceModal: React.Dispatch<React.SetStateAction<boolean>>
  workspaceModalMode: string
  workspaceForm: any
  setWorkspaceForm: React.Dispatch<React.SetStateAction<any>>
  workspaceFormTextDraft: any
  workspaceSettings: any
  browseForWorkspaceIntoForm: () => Promise<void>
  sandboxModeDescription: (mode: SandboxMode) => string
  modelConfig: ModelConfig
  getModelOptions: (includeCurrent?: string) => string[]
}

export function AppModals(props: AppModalsProps) {
  const {
    api,
    showProviderSetupModal, setShowProviderSetupModal,
    editingProvider, setEditingProvider,
    providerRegistry, setProviderRegistry,
    showSetupWizard, setShowSetupWizard,
    setupWizardStep, setSetupWizardStep,
    setupWizardSelection, setSetupWizardSelection,
    setupWizardStatus, setSetupWizardStatus, setupWizardFinishing,
    resolvedProviderConfigs,
    providerAuthByName, providerAuthLoadingByName,
    providerVerifiedByName, setProviderVerifiedByName,
    providerPingDurationByName, setProviderPingDurationByName,
    providerApiKeyDraftByName, setProviderApiKeyDraftByName,
    providerApiKeyStateByName,
    saveProviderApiKey, importProviderApiKeyFromEnv,
    refreshProviderAuthStatus, startProviderLoginFlow, startProviderUpgradeFlow,
    runSetupConnectivityChecks, finishSetupWizard,
    deleteHistoryIdPending, setDeleteHistoryIdPending,
    deleteAllHistoryChecked, setDeleteAllHistoryChecked,
    deleteThisAndOlderChecked, setDeleteThisAndOlderChecked,
    deleteHistoryEntry,
    pendingWorkspaceSwitch, setPendingWorkspaceSwitch,
    showWorkspacePicker,
    workspacePickerPrompt, setWorkspacePickerPrompt,
    workspacePickerOpening, setWorkspacePickerOpening,
    workspacePickerError, setWorkspacePickerError,
    workspaceList, setWorkspaceList,
    workspaceRoot, workspaceSettingsByPath, setWorkspaceSettingsByPath,
    openWorkspacePicker, closeWorkspacePicker,
    requestWorkspaceSwitch, confirmWorkspaceSwitch,
    showWorkspaceModal, setShowWorkspaceModal,
    workspaceModalMode, workspaceForm, setWorkspaceForm,
    workspaceFormTextDraft, workspaceSettings,
    browseForWorkspaceIntoForm, sandboxModeDescription,
    modelConfig, getModelOptions,
  } = props

  return (
    <>
      {showProviderSetupModal && editingProvider && (
        <div className={MODAL_BACKDROP_CLASS}>
          <div className={`w-full max-w-lg ${MODAL_CARD_CLASS}`}>
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div className="font-medium">{editingProvider.id ? 'Edit provider' : 'Add provider'}</div>
              <button
                className={UI_CLOSE_ICON_BUTTON_CLASS}
                onClick={() => {
                  setShowProviderSetupModal(false)
                  setEditingProvider(null)
                }}
                title="Close"
              >
                <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4 text-sm">
              <p className="text-neutral-600 dark:text-neutral-400">
                Add a custom CLI provider. The CLI must be installed on your system. Auth check runs the command with the given args; success means connected.
              </p>
              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <span className="text-neutral-600 dark:text-neutral-300">ID</span>
                <input
                  className={`${UI_INPUT_CLASS} font-mono`}
                  value={editingProvider.id}
                  onChange={(e) => setEditingProvider((p: any) => (p ? { ...p, id: e.target.value } : p))}
                  placeholder="e.g. ollama"
                  disabled={!!providerRegistry.customProviders.find((p) => p.id === editingProvider.id)}
                />
                <span className="text-neutral-600 dark:text-neutral-300">Display name</span>
                <input
                  className={UI_INPUT_CLASS}
                  value={editingProvider.displayName}
                  onChange={(e) => setEditingProvider((p: any) => (p ? { ...p, displayName: e.target.value } : p))}
                  placeholder="e.g. Ollama"
                />
                <span className="text-neutral-600 dark:text-neutral-300">CLI command</span>
                <input
                  className={`${UI_INPUT_CLASS} font-mono`}
                  value={editingProvider.cliCommand}
                  onChange={(e) => setEditingProvider((p: any) => (p ? { ...p, cliCommand: e.target.value } : p))}
                  placeholder="e.g. ollama"
                />
                <span className="text-neutral-600 dark:text-neutral-300">CLI path</span>
                <input
                  className={`${UI_INPUT_CLASS} font-mono`}
                  value={editingProvider.cliPath ?? ''}
                  onChange={(e) => setEditingProvider((p: any) => (p ? { ...p, cliPath: e.target.value || undefined } : p))}
                  placeholder="Optional; uses PATH if empty"
                />
                <span className="text-neutral-600 dark:text-neutral-300">Auth check args</span>
                <input
                  className={`${UI_INPUT_CLASS} font-mono`}
                  value={editingProvider.authCheckCommand ?? ''}
                  onChange={(e) => setEditingProvider((p: any) => (p ? { ...p, authCheckCommand: e.target.value || undefined } : p))}
                  placeholder="e.g. list or --version"
                />
                <span className="text-neutral-600 dark:text-neutral-300">Login command</span>
                <input
                  className={`${UI_INPUT_CLASS} font-mono`}
                  value={editingProvider.loginCommand ?? ''}
                  onChange={(e) => setEditingProvider((p: any) => (p ? { ...p, loginCommand: e.target.value || undefined } : p))}
                  placeholder="e.g. ollama serve"
                />
                <span className="text-neutral-600 dark:text-neutral-400">Enabled</span>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editingProvider.enabled}
                    onChange={(e) => setEditingProvider((p: any) => (p ? { ...p, enabled: e.target.checked } : p))}
                  />
                  Show in connectivity
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  className={UI_BUTTON_PRIMARY_CLASS}
                  onClick={() => {
                    if (!editingProvider.id.trim() || !editingProvider.cliCommand.trim()) return
                    const existingIdx = providerRegistry.customProviders.findIndex((p: CustomProviderConfig) => p.id === editingProvider.id)
                    const next: CustomProviderConfig = {
                      ...editingProvider,
                      id: editingProvider.id.trim(),
                      displayName: editingProvider.displayName.trim() || editingProvider.id,
                      cliCommand: editingProvider.cliCommand.trim(),
                      loginCommand: editingProvider.loginCommand?.trim() || editingProvider.cliCommand.trim(),
                    }
                    if (existingIdx >= 0) {
                      setProviderRegistry((prev: ProviderRegistry) => ({
                        ...prev,
                        customProviders: prev.customProviders.map((p: CustomProviderConfig, i: number) => (i === existingIdx ? next : p)),
                      }))
                    } else if (!providerRegistry.customProviders.some((p: CustomProviderConfig) => p.id === next.id)) {
                      setProviderRegistry((prev: ProviderRegistry) => ({
                        ...prev,
                        customProviders: [...prev.customProviders, next],
                      }))
                    }
                    setShowProviderSetupModal(false)
                    setEditingProvider(null)
                  }}
                >
                  Save
                </button>
                <button
                  className={UI_BUTTON_SECONDARY_CLASS}
                  onClick={() => {
                    setShowProviderSetupModal(false)
                    setEditingProvider(null)
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSetupWizard && (
        <div className={MODAL_BACKDROP_CLASS}>
          <div className={`w-full max-w-2xl ${MODAL_CARD_CLASS}`}>
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div className="font-medium">Welcome Setup</div>
              <button
                className={UI_CLOSE_ICON_BUTTON_CLASS}
                onClick={() => {
                  setShowSetupWizard(false)
                  openWorkspacePicker('Select a workspace folder to get started.')
                }}
                title="Skip setup"
              >
                <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="text-sm text-neutral-700 dark:text-neutral-300">
                {setupWizardStep === 'providers'
                  ? 'Choose which providers you want to use. You can change this later in Settings.'
                  : 'Set up connectivity for the selected providers. Finish is enabled once at least one provider is connected.'}
              </div>
              {setupWizardStep === 'providers' ? (
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: 'codex', label: 'OpenAI' },
                    { id: 'claude', label: 'Claude' },
                    { id: 'gemini', label: 'Gemini' },
                    { id: 'openrouter', label: 'OpenRouter (Free Models)' },
                  ] as Array<{ id: ConnectivityProvider; label: string }>).map((item) => (
                    <label key={item.id} className="flex items-center gap-2 rounded border border-neutral-200 dark:border-neutral-800 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={setupWizardSelection[item.id]}
                        onChange={(e) =>
                          setSetupWizardSelection((prev: Record<ConnectivityProvider, boolean>) => ({
                            ...prev,
                            [item.id]: e.target.checked,
                          }))
                        }
                      />
                      <span className="text-sm text-neutral-800 dark:text-neutral-200">{item.label}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="space-y-2 max-h-[50vh] overflow-auto">
                  {CONNECTIVITY_PROVIDERS.filter((id) => setupWizardSelection[id]).map((providerId) => {
                    const config = resolvedProviderConfigs.find((c) => c.id === providerId)
                    if (!config) return null
                    const status = providerAuthByName[providerId]
                    const loading = providerAuthLoadingByName[providerId]
                    const providerEnabled = Boolean(config.enabled)
                    const statusText = !providerEnabled
                      ? 'Disabled'
                      : !status
                      ? 'Unknown'
                      : !status.installed
                        ? 'Not installed'
                        : status.authenticated
                          ? (providerVerifiedByName[providerId] ? 'Connected' : 'Authenticated')
                          : 'Setup required'
                    const rawStatusDetail = status?.detail?.trim() ?? ''
                    const statusDetail = !providerEnabled
                      ? 'Provider disabled.'
                      : /^connected[.!]?$/i.test(rawStatusDetail)
                        ? 'Ready.'
                        : (rawStatusDetail || 'No status yet.')
                    return (
                      <div key={providerId} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 font-medium text-sm text-neutral-800 dark:text-neutral-200">
                            <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${
                              !providerEnabled ? 'bg-neutral-400 dark:bg-neutral-500'
                              : !status ? 'bg-neutral-400 dark:bg-neutral-500'
                              : !status.installed ? 'bg-red-500'
                              : status.authenticated
                                ? (providerVerifiedByName[providerId] ? 'bg-emerald-500' : 'bg-amber-500')
                                : 'bg-amber-500'
                            }`} title={
                              !providerEnabled ? 'Disabled'
                              : !status ? 'Checking...'
                              : !status.installed ? (status.detail ?? 'CLI not found')
                              : status.authenticated
                                ? (providerVerifiedByName[providerId] ? (status.detail ?? 'Connected') : 'Authenticated. Waiting for first response to verify.')
                                : (status.detail ?? 'Login required')
                            } />
                            {providerId === 'openrouter' ? 'OpenRouter (Free Models)' : config.displayName}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-neutral-600 dark:text-neutral-400">{statusText}</span>
                            {providerPingDurationByName[providerId] != null && (
                              <span className="text-[10px] text-neutral-500 dark:text-neutral-400" title="Ping round-trip time">
                                {providerPingDurationByName[providerId]! < 1000
                                  ? `${providerPingDurationByName[providerId]}ms`
                                  : `${(providerPingDurationByName[providerId]! / 1000).toFixed(1)}s`}
                              </span>
                            )}
                          </div>
                        </div>
                        {config.type === 'api' && (
                          <div className="flex items-center gap-2">
                            <input
                              type="password"
                              className={`${UI_INPUT_CLASS} text-sm font-mono flex-1`}
                              value={providerApiKeyDraftByName[providerId] ?? ''}
                              onChange={(e) =>
                                setProviderApiKeyDraftByName((prev) => ({ ...prev, [providerId]: e.target.value }))
                              }
                              placeholder={providerApiKeyStateByName[providerId] ? 'Key saved (enter to replace)' : (providerId === 'codex' ? 'sk-...' : 'sk-or-v1-...')}
                            />
                            <button className={UI_BUTTON_SECONDARY_CLASS} onClick={() => void saveProviderApiKey(providerId)}>Save</button>
                            <button className={UI_BUTTON_SECONDARY_CLASS} onClick={() => void importProviderApiKeyFromEnv(providerId)}>Import Env</button>
                          </div>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            className={UI_BUTTON_SECONDARY_CLASS}
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
                            className={UI_BUTTON_SECONDARY_CLASS}
                            disabled={loading}
                            onClick={() => void startProviderLoginFlow(config)}
                          >
                            {config.type === 'api' ? 'Open keys page' : status?.authenticated ? 'Re-authenticate' : 'Open login'}
                          </button>
                          {config.type === 'cli' &&
                            ((config as ProviderConfigCli).upgradeCommand || (config as ProviderConfigCli).upgradePackage) && (
                            <button
                              className={UI_BUTTON_SECONDARY_CLASS}
                              disabled={loading}
                              onClick={() => void startProviderUpgradeFlow(config)}
                              title={
                                (config as ProviderConfigCli).upgradePackage
                                  ? `Clean reinstall: npm uninstall -g ${(config as ProviderConfigCli).upgradePackage}; npm install -g ${(config as ProviderConfigCli).upgradePackage}@latest`
                                  : (config as ProviderConfigCli).upgradeCommand
                              }
                            >
                              {status?.installed ? 'Upgrade CLI' : 'Install CLI'}
                            </button>
                          )}
                          {PROVIDER_SUBSCRIPTION_URLS[providerId] && (
                            <button
                              className={UI_BUTTON_SECONDARY_CLASS}
                              title="View subscription limits and purchase credits"
                              onClick={() => void api.openExternalUrl?.(PROVIDER_SUBSCRIPTION_URLS[providerId])}
                            >
                              View limits
                            </button>
                          )}
                        </div>
                        <div className="text-xs text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap">{statusDetail}</div>
                      </div>
                    )
                  })}
                </div>
              )}
              {setupWizardStatus && (
                <div className="text-xs rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100">
                  {setupWizardStatus}
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <button
                type="button"
                className={UI_BUTTON_SECONDARY_CLASS}
                onClick={() => {
                  setShowSetupWizard(false)
                  localStorage.setItem(SETUP_WIZARD_DONE_STORAGE_KEY, '1')
                  openWorkspacePicker('Select a workspace folder to get started.')
                }}
              >
                Skip for now
              </button>
              <div className="flex items-center gap-2">
                {setupWizardStep === 'connect' && (
                  <button
                    type="button"
                    className={UI_BUTTON_SECONDARY_CLASS}
                    onClick={() => setSetupWizardStep('providers')}
                    disabled={setupWizardFinishing}
                  >
                    Back
                  </button>
                )}
                {setupWizardStep === 'providers' ? (
                  <button
                    type="button"
                    className={UI_BUTTON_PRIMARY_CLASS}
                    onClick={() => {
                      const selected = CONNECTIVITY_PROVIDERS.filter((id) => setupWizardSelection[id])
                      if (selected.length === 0) {
                        setSetupWizardStatus('Select at least one provider to continue.')
                        return
                      }
                      setSetupWizardStatus(null)
                      setSetupWizardStep('connect')
                      void runSetupConnectivityChecks(selected)
                    }}
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    type="button"
                    className={UI_BUTTON_PRIMARY_CLASS}
                    onClick={() => void finishSetupWizard()}
                    disabled={setupWizardFinishing}
                  >
                    {setupWizardFinishing ? 'Finishing...' : 'Finish setup'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteHistoryIdPending && (
        <div className={MODAL_BACKDROP_CLASS}>
          <div className={`w-full max-w-md ${MODAL_CARD_CLASS}`}>
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div className="font-medium">Delete conversation</div>
              <button
                className={UI_CLOSE_ICON_BUTTON_CLASS}
                onClick={() => {
                  setDeleteHistoryIdPending(null)
                  setDeleteAllHistoryChecked(false)
                  setDeleteThisAndOlderChecked(false)
                }}
                title="Close"
              >
                <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="p-4 text-sm text-neutral-700 dark:text-neutral-300 space-y-3">
              <p>This conversation will be permanently deleted. Continue?</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteAllHistoryChecked}
                  onChange={(e) => setDeleteAllHistoryChecked(e.target.checked)}
                />
                <span>Delete all conversation history</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteThisAndOlderChecked}
                  onChange={(e) => setDeleteThisAndOlderChecked(e.target.checked)}
                />
                <span>Delete this and old conversations</span>
              </label>
            </div>
            <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-end gap-2">
              <button
                type="button"
                className={UI_BUTTON_SECONDARY_CLASS}
                onClick={() => {
                  setDeleteHistoryIdPending(null)
                  setDeleteAllHistoryChecked(false)
                  setDeleteThisAndOlderChecked(false)
                }}
              >
                No
              </button>
              <button
                type="button"
                className={UI_BUTTON_PRIMARY_CLASS}
                onClick={() =>
                  deleteHistoryEntry(deleteHistoryIdPending, {
                    deleteAll: deleteAllHistoryChecked,
                    deleteThisAndOlder: deleteThisAndOlderChecked,
                  })
                }
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingWorkspaceSwitch && (
        <div className={MODAL_BACKDROP_CLASS}>
          <div className={`w-full max-w-lg ${MODAL_CARD_CLASS}`}>
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div className="font-medium">Switch workspace?</div>
              <button
                className={UI_CLOSE_ICON_BUTTON_CLASS}
                onClick={() => setPendingWorkspaceSwitch(null)}
                title="Close"
              >
                <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="text-neutral-700 dark:text-neutral-300">
                This will close current windows for this workspace and load the saved layout + chat history for:
              </div>
              <div className="font-mono text-xs rounded-md border border-neutral-300 dark:border-neutral-700 px-3 py-2 break-all">
                {pendingWorkspaceSwitch.targetRoot}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-end gap-2">
              <button
                type="button"
                className={UI_BUTTON_SECONDARY_CLASS}
                onClick={() => setPendingWorkspaceSwitch(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={UI_BUTTON_PRIMARY_CLASS}
                onClick={() => void confirmWorkspaceSwitch()}
              >
                Switch workspace
              </button>
            </div>
          </div>
        </div>
      )}

      {showWorkspacePicker && (
        <div className={MODAL_BACKDROP_CLASS}>
          <div className={`w-full max-w-xl max-h-[90vh] flex flex-col ${MODAL_CARD_CLASS}`}>
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0 bg-white dark:bg-neutral-950">
              <div className="font-medium text-neutral-900 dark:text-neutral-100">Open workspace</div>
              {!isLockedWorkspacePrompt(workspacePickerPrompt) && (
                <button
                  className={UI_CLOSE_ICON_BUTTON_CLASS}
                  onClick={closeWorkspacePicker}
                  title="Close"
                >
                  <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                    <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
            <div className="p-4 min-h-0 flex-1 overflow-auto">
              {workspacePickerPrompt && (
                <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100">
                  <div>{workspacePickerPrompt}</div>
                  {isLockedWorkspacePrompt(workspacePickerPrompt) && (
                    <button
                      type="button"
                      className="mt-2 px-3 py-1.5 text-xs rounded border border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-800/60"
                      disabled={Boolean(workspacePickerOpening)}
                      onClick={async () => {
                        setWorkspacePickerError(null)
                        for (const p of workspaceList) {
                          setWorkspacePickerOpening(p)
                          try {
                            const result = await api.claimWorkspace?.(p)
                            if (result?.ok) {
                              setWorkspacePickerPrompt(null)
                              requestWorkspaceSwitch(p, 'picker')
                              return
                            }
                          } catch { /* try next */ }
                        }
                        setWorkspacePickerOpening(null)
                        setWorkspacePickerError('Could not override locks. Try closing other Barnaby instances manually.')
                      }}
                    >
                      Force unlock and open
                    </button>
                  )}
                </div>
              )}
              {workspacePickerError && (
                <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-100 whitespace-pre-wrap">
                  {workspacePickerError}
                </div>
              )}
              <div className="space-y-1">
                {workspaceList.map((p) => (
                  (() => {
                    const isCurrent =
                      normalizeWorkspacePathForCompare(p) === normalizeWorkspacePathForCompare(workspaceRoot)
                    const isOpening = workspacePickerOpening === p
                    return (
                      <button
                        key={p}
                        type="button"
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded text-sm font-mono border ${
                          isCurrent
                            ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-100'
                            : 'border-neutral-300 bg-neutral-50 text-neutral-900 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900/70 dark:text-neutral-100 dark:hover:bg-neutral-800/80'
                        } ${workspacePickerOpening ? 'disabled:opacity-70 disabled:cursor-not-allowed' : ''}`}
                        onClick={() => {
                          requestWorkspaceSwitch(p, 'picker')
                        }}
                        disabled={Boolean(workspacePickerOpening)}
                        aria-busy={isOpening || undefined}
                      >
                        <span className="truncate text-left">{p}</span>
                        {isOpening && <span className="shrink-0 text-[10px] uppercase tracking-wide">Opening...</span>}
                      </button>
                    )
                  })()
                ))}
              </div>
              <button
                type="button"
                className="mt-3 w-full rounded-md border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 hover:bg-neutral-100 disabled:opacity-70 disabled:cursor-not-allowed dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                onClick={async () => {
                  if (workspacePickerOpening) return
                  const selected = await api.openFolderDialog?.()
                  if (!selected) return
                  setWorkspaceList((prev) => (prev.includes(selected) ? prev : [selected, ...prev]))
                  setWorkspaceSettingsByPath((prev: any) => ({
                    ...prev,
                    [selected]: {
                      path: selected,
                      defaultModel: DEFAULT_MODEL,
                      permissionMode: 'verify-first',
                      sandbox: 'workspace-write',
                      allowedCommandPrefixes: [...DEFAULT_WORKSPACE_ALLOWED_COMMAND_PREFIXES],
                      allowedAutoReadPrefixes: [...DEFAULT_WORKSPACE_ALLOWED_AUTO_READ_PREFIXES],
                      allowedAutoWritePrefixes: [...DEFAULT_WORKSPACE_ALLOWED_AUTO_WRITE_PREFIXES],
                      deniedAutoReadPrefixes: [...DEFAULT_WORKSPACE_DENIED_AUTO_READ_PREFIXES],
                      deniedAutoWritePrefixes: [...DEFAULT_WORKSPACE_DENIED_AUTO_WRITE_PREFIXES],
                    },
                  }))
                  requestWorkspaceSwitch(selected, 'picker')
                  try {
                    await api.writeWorkspaceConfig?.(selected)
                  } catch {}
                }}
                disabled={Boolean(workspacePickerOpening)}
              >
                + Select folder...
              </button>
            </div>
          </div>
        </div>
      )}

      {showWorkspaceModal && (
        <div className={MODAL_BACKDROP_CLASS}>
          <div className={`w-full max-w-2xl ${MODAL_CARD_CLASS}`}>
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div className="font-medium">
                {workspaceModalMode === 'new' ? 'New workspace settings' : 'Edit workspace settings'}
              </div>
              <button
                className={UI_CLOSE_ICON_BUTTON_CLASS}
                onClick={() => setShowWorkspaceModal(false)}
                title="Close"
              >
                <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4 text-sm">
              <div className="grid grid-cols-[140px_1fr_auto] items-center gap-2">
                <span className="text-neutral-600 dark:text-neutral-300">Folder location</span>
                <input
                  className={`w-full ${UI_INPUT_CLASS} font-mono`}
                  value={workspaceForm.path}
                  onChange={(e) => setWorkspaceForm((prev: any) => ({ ...prev, path: e.target.value }))}
                  onBlur={(e) => {
                    const next = workspaceSettings.normalizeWorkspaceSettingsForm({ ...workspaceForm, path: e.target.value })
                    if (!next.path) return
                    void workspaceSettings.persistWorkspaceSettings(next, { requestSwitch: true })
                  }}
                />
                <button
                  type="button"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  onClick={browseForWorkspaceIntoForm}
                  title="Browse for workspace folder"
                  aria-label="Browse for workspace folder"
                >
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M2.5 4.5H6.2L7.4 5.7H13.5V11.8C13.5 12.4 13.1 12.8 12.5 12.8H3.5C2.9 12.8 2.5 12.4 2.5 11.8V4.5Z" stroke="currentColor" strokeWidth="1.1" />
                    <path d="M2.5 6.2H13.5" stroke="currentColor" strokeWidth="1.1" />
                  </svg>
                </button>
              </div>
              <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                <span className="text-neutral-600 dark:text-neutral-300">Default model</span>
                <select
                  className={UI_SELECT_CLASS}
                  value={workspaceForm.defaultModel}
                  onChange={(e) =>
                    workspaceSettings.updateWorkspaceModalForm((prev: any) => ({ ...prev, defaultModel: e.target.value }))
                  }
                >
                  {getModelOptions(workspaceForm.defaultModel).map((id) => {
                    const mi = modelConfig.interfaces.find((m) => m.id === id)
                    return (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                <span className="text-neutral-600 dark:text-neutral-300">Sandbox</span>
                <div className="space-y-1">
                  <select
                    className={`w-full ${UI_SELECT_CLASS}`}
                    value={workspaceForm.sandbox}
                    onChange={(e) =>
                      workspaceSettings.updateWorkspaceModalForm((prev: any) => {
                        const nextSandbox = e.target.value as SandboxMode
                        return {
                          ...prev,
                          sandbox: nextSandbox,
                          // In read-only mode, approval policy is irrelevant; keep safest mode persisted.
                          permissionMode: nextSandbox === 'read-only' ? 'verify-first' : prev.permissionMode,
                        }
                      })
                    }
                  >
                    <option value="read-only">Read only</option>
                    <option value="workspace-write">Workspace write</option>
                  </select>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    {sandboxModeDescription(workspaceForm.sandbox)}
                  </p>
                </div>
              </div>
              {workspaceForm.sandbox !== 'read-only' && (
                <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                  <span className="text-neutral-600 dark:text-neutral-300">Permissions</span>
                  <select
                    className={UI_SELECT_CLASS}
                    value={workspaceForm.permissionMode}
                    onChange={(e) =>
                      workspaceSettings.updateWorkspaceModalForm((prev: any) => ({
                        ...prev,
                        permissionMode: e.target.value as PermissionMode,
                      }))
                    }
                  >
                    <option value="verify-first">Verify first (safer)</option>
                    <option value="proceed-always">Proceed always (autonomous)</option>
                  </select>
                </div>
              )}
              {workspaceForm.sandbox !== 'read-only' && workspaceForm.permissionMode === 'proceed-always' && (
                <div className="grid grid-cols-[140px_1fr] items-start gap-2">
                  <span className="text-neutral-600 dark:text-neutral-300 pt-1">Allowed prefixes</span>
                  <div className="space-y-1">
                    <textarea
                      className={`w-full min-h-[96px] ${UI_INPUT_CLASS} font-mono text-xs`}
                      value={workspaceFormTextDraft.allowedCommandPrefixes}
                      onChange={(e) => workspaceSettings.updateWorkspaceModalTextDraft('allowedCommandPrefixes', e.target.value)}
                      placeholder={'npm run build:dist:raw\nnpx vite build'}
                    />
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      One prefix per line. Leave blank to allow all commands.
                    </p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <span className="text-neutral-600 dark:text-neutral-300">Timeline controls</span>
                <div className="col-start-2 text-xs text-neutral-500 dark:text-neutral-400">
                  Debug and trace visibility is now configured in Application Settings.
                </div>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2">
              <div>
                {workspaceModalMode === 'edit' && workspaceList.includes(workspaceForm.path) && (
                  <button
                    className="px-3 py-1.5 text-sm rounded border border-red-300 bg-white text-red-600 hover:bg-red-50 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/30"
                    onClick={() => {
                      if (confirm(`Delete workspace "${workspaceForm.path}"?`)) {
                        void workspaceSettings.deleteWorkspace(workspaceForm.path)
                      }
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400">Changes save automatically.</span>
                <button
                  className="px-3 py-1.5 text-sm rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  onClick={() => setShowWorkspaceModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </>
  )
}
