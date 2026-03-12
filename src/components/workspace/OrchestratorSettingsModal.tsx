import React from 'react'
import type { OrchestratorSettings } from '../../types'
import { MODAL_BACKDROP_CLASS, MODAL_CARD_CLASS, UI_BUTTON_PRIMARY_CLASS, UI_CLOSE_ICON_BUTTON_CLASS } from '../../constants'

type PoolItem = { id: string; label: string; provider: string; model: string }

export interface OrchestratorSettingsModalProps {
  visible: boolean
  onClose: () => void
  api: any
  loadedPlugins: Array<{ pluginId: string; displayName: string; version: string; active: boolean }>
  orchestratorSettings: OrchestratorSettings
  setOrchestratorSettings: React.Dispatch<React.SetStateAction<OrchestratorSettings>>
  orchestratorLicenseKeyState: { hasKey?: boolean } | null
  setOrchestratorLicenseKeyState: React.Dispatch<React.SetStateAction<{ hasKey: boolean } | null>>
  orchestratorLicenseKeyDraft: string
  setOrchestratorLicenseKeyDraft: React.Dispatch<React.SetStateAction<string>>
  orchestratorInstallStatus: string | null
  setOrchestratorInstallStatus: React.Dispatch<React.SetStateAction<string | null>>
  getModelOptions: (includeCurrent?: string) => string[]
}

const PROVIDER_OPTIONS = [
  { value: 'codex', label: 'Codex' },
  { value: 'claude', label: 'Claude' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'openrouter', label: 'OpenRouter' },
]

function upsertPoolRow(pool: PoolItem[], index: number, next: Partial<PoolItem>): PoolItem[] {
  return pool.map((item, i) => (i === index ? { ...item, ...next } : item))
}

export function OrchestratorSettingsModal({
  visible,
  onClose,
  api,
  loadedPlugins,
  orchestratorSettings,
  setOrchestratorSettings,
  orchestratorLicenseKeyState,
  setOrchestratorLicenseKeyState,
  orchestratorLicenseKeyDraft,
  setOrchestratorLicenseKeyDraft,
  orchestratorInstallStatus,
  setOrchestratorInstallStatus,
  getModelOptions,
}: OrchestratorSettingsModalProps) {
  const [savePending, setSavePending] = React.useState(false)
  if (!visible) return null

  const orchestratorPlugin = loadedPlugins.find((p) => p.pluginId === 'orchestrator')
  const workerPool = orchestratorSettings.workerPool
  const persistLicenseDraft = React.useCallback(async () => {
    const draft = orchestratorLicenseKeyDraft.trim()
    if (!draft) return
    await api.setOrchestratorLicenseKey?.(draft)
    const state = await api.getOrchestratorLicenseKeyState?.()
    setOrchestratorLicenseKeyState(state ?? { hasKey: true })
  }, [api, orchestratorLicenseKeyDraft, setOrchestratorLicenseKeyState])

  const handleSaveAndClose = React.useCallback(async () => {
    setSavePending(true)
    try {
      await persistLicenseDraft()
      onClose()
    } finally {
      setSavePending(false)
    }
  }, [onClose, persistLicenseDraft])

  return (
    <div className={MODAL_BACKDROP_CLASS}>
      <div className={`w-full max-w-2xl ${MODAL_CARD_CLASS}`}>
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div className="font-medium">Orchestrator Settings</div>
          <button
            className={UI_CLOSE_ICON_BUTTON_CLASS}
            onClick={onClose}
            title="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-5 max-h-[75vh] overflow-y-auto">
          <section className="space-y-3">
            <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Installation</div>
            <div className="space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-block w-2 h-2 rounded-full shrink-0 ${orchestratorPlugin?.active
                    ? 'bg-green-500 dark:bg-green-600'
                    : 'bg-neutral-300 dark:bg-neutral-600'
                    }`}
                />
                <span className="text-neutral-500 dark:text-neutral-400">
                  {orchestratorPlugin?.active
                    ? `Plugin: ${orchestratorPlugin.displayName ?? 'Orchestrator'} v${orchestratorPlugin.version ?? '?'}`
                    : 'Plugin: not installed'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  onClick={async () => {
                    setOrchestratorInstallStatus('Reloading local plugins...')
                    try {
                      const result = await api.reloadLocalPlugins?.()
                      setOrchestratorInstallStatus(result?.ok ? 'Local plugins reloaded' : result?.error ?? 'Reload failed')
                    } catch (e) {
                      setOrchestratorInstallStatus(String(e))
                    }
                    setTimeout(() => setOrchestratorInstallStatus(null), 4000)
                  }}
                >
                  Reload local plugins
                </button>
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
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">License code</label>
              <input
                type="text"
                className="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                placeholder={orchestratorLicenseKeyState?.hasKey ? 'License entered' : 'Enter license code'}
                value={orchestratorLicenseKeyDraft}
                onChange={(e) => setOrchestratorLicenseKeyDraft(e.target.value)}
                onBlur={async () => {
                  await persistLicenseDraft()
                }}
              />
              <button
                type="button"
                className={UI_BUTTON_PRIMARY_CLASS}
                onClick={() => void persistLicenseDraft()}
              >
                Save license
              </button>
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Execution Defaults</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
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
                  {PROVIDER_OPTIONS.map((provider) => (
                    <option key={provider.value} value={provider.value}>{provider.label}</option>
                  ))}
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
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Max parallel panels (1-8)</label>
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
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Max task attempts (1-10)</label>
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

          <section className="space-y-3">
            <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Worker Pool (Comparative)</div>
            <div className="space-y-2">
              {workerPool.map((item, index) => (
                <div key={item.id} className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2 grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <input
                    type="text"
                    className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                    value={item.label}
                    onChange={(e) =>
                      setOrchestratorSettings((prev) => ({ ...prev, workerPool: upsertPoolRow(prev.workerPool, index, { label: e.target.value }) }))
                    }
                  />
                  <select
                    className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                    value={item.provider}
                    onChange={(e) =>
                      setOrchestratorSettings((prev) => ({ ...prev, workerPool: upsertPoolRow(prev.workerPool, index, { provider: e.target.value }) }))
                    }
                  >
                    {PROVIDER_OPTIONS.map((provider) => (
                      <option key={provider.value} value={provider.value}>{provider.label}</option>
                    ))}
                  </select>
                  <select
                    className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                    value={item.model}
                    onChange={(e) =>
                      setOrchestratorSettings((prev) => ({ ...prev, workerPool: upsertPoolRow(prev.workerPool, index, { model: e.target.value }) }))
                    }
                  >
                    <option value="">Default model</option>
                    {getModelOptions().map((id) => (
                      <option key={id} value={id}>{id}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200"
                    disabled={workerPool.length <= 2}
                    onClick={() => {
                      setOrchestratorSettings((prev) => {
                        const nextPool = prev.workerPool.filter((_, i) => i !== index)
                        const nextA = nextPool.some((row) => row.id === prev.comparativeReviewerAId) ? prev.comparativeReviewerAId : (nextPool[0]?.id ?? '')
                        const nextB = nextPool.some((row) => row.id === prev.comparativeReviewerBId) ? prev.comparativeReviewerBId : (nextPool[1]?.id ?? nextPool[0]?.id ?? '')
                        return { ...prev, workerPool: nextPool, comparativeReviewerAId: nextA, comparativeReviewerBId: nextB }
                      })
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                onClick={() => {
                  setOrchestratorSettings((prev) => {
                    const nextId = `worker-custom-${Date.now()}`
                    return {
                      ...prev,
                      workerPool: [...prev.workerPool, { id: nextId, label: 'Custom Reviewer', provider: 'codex', model: '' }],
                    }
                  })
                }}
              >
                Add worker profile
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Orchestrator Pool</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              Available for plugin-managed orchestrator selection.
            </div>
            <div className="space-y-2">
              {orchestratorSettings.orchestratorPool.map((item, index) => (
                <div key={item.id} className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                    value={item.label}
                    onChange={(e) =>
                      setOrchestratorSettings((prev) => ({ ...prev, orchestratorPool: upsertPoolRow(prev.orchestratorPool, index, { label: e.target.value }) }))
                    }
                  />
                  <select
                    className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                    value={item.provider}
                    onChange={(e) =>
                      setOrchestratorSettings((prev) => ({ ...prev, orchestratorPool: upsertPoolRow(prev.orchestratorPool, index, { provider: e.target.value }) }))
                    }
                  >
                    {PROVIDER_OPTIONS.map((provider) => (
                      <option key={provider.value} value={provider.value}>{provider.label}</option>
                    ))}
                  </select>
                  <select
                    className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                    value={item.model}
                    onChange={(e) =>
                      setOrchestratorSettings((prev) => ({ ...prev, orchestratorPool: upsertPoolRow(prev.orchestratorPool, index, { model: e.target.value }) }))
                    }
                  >
                    <option value="">Default model</option>
                    {getModelOptions().map((id) => (
                      <option key={id} value={id}>{id}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>
        </div>
        <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-end gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            onClick={onClose}
            disabled={savePending}
          >
            Cancel
          </button>
          <button
            type="button"
            className={UI_BUTTON_PRIMARY_CLASS}
            onClick={() => void handleSaveAndClose()}
            disabled={savePending}
          >
            {savePending ? 'Saving...' : 'Save and close'}
          </button>
        </div>
      </div>
    </div>
  )
}
