import type {
  AvailableCatalogModels,
  ConnectivityProvider,
  ModelConfig,
  ModelInterface,
  ModelProvider,
  ProviderConfig,
  ProviderRegistry,
} from '../types'
import {
  CONNECTIVITY_PROVIDERS,
  DEFAULT_BUILTIN_PROVIDER_CONFIGS,
  DEFAULT_MODEL_INTERFACES,
} from '../constants'

export function getModelProvider(modelId: string): ConnectivityProvider {
  if (modelId === 'gpt-4o' || modelId === 'gpt-4o-mini' || modelId === 'gpt-4-turbo' || modelId.startsWith('o1') || modelId.startsWith('o3')) {
    return 'codex'
  }
  if (modelId.startsWith('claude')) return 'claude'
  if (modelId.startsWith('gemini')) return 'gemini'
  if (modelId.includes('/')) return 'openrouter'
  return 'codex'
}

export function resolveProviderConfigs(registry: ProviderRegistry): ProviderConfig[] {
  const result: ProviderConfig[] = []
  for (const id of CONNECTIVITY_PROVIDERS) {
    const builtIn = DEFAULT_BUILTIN_PROVIDER_CONFIGS[id]
    const override = registry.overrides[id]
    if (builtIn.type === 'cli') {
      result.push({
        ...builtIn,
        ...(override && {
          displayName: override.displayName ?? builtIn.displayName,
          enabled: override.enabled ?? builtIn.enabled,
          cliPath: override.cliPath,
        }),
      })
    } else {
      result.push({
        ...builtIn,
        ...(override && {
          displayName: override.displayName ?? builtIn.displayName,
          enabled: override.enabled ?? builtIn.enabled,
          apiBaseUrl: override.apiBaseUrl ?? builtIn.apiBaseUrl,
        }),
      })
    }
  }
  for (const custom of registry.customProviders ?? []) {
    result.push({ ...custom, isBuiltIn: false })
  }
  return result
}

export function syncModelConfigWithCatalog(
  prev: ModelConfig,
  available: AvailableCatalogModels,
  providerRegistry: ProviderRegistry,
  options?: {
    pruneMissingFromCatalog?: boolean
    providers?: ModelProvider[]
  },
): ModelConfig {
  const enabledProviders = new Set<ModelProvider>(
    resolveProviderConfigs(providerRegistry)
      .filter(
        (config): config is ProviderConfig & { id: ConnectivityProvider } =>
          Boolean(config.enabled) && CONNECTIVITY_PROVIDERS.includes(config.id as ConnectivityProvider),
      )
      .map((config) => config.id as ModelProvider),
  )
  enabledProviders.add('codex')
  const defaultModelsByProvider: Record<ModelProvider, { id: string; displayName: string }[]> = {
    codex: DEFAULT_MODEL_INTERFACES.filter((m) => m.provider === 'codex').map(({ id, displayName }) => ({ id, displayName })),
    claude: DEFAULT_MODEL_INTERFACES.filter((m) => m.provider === 'claude').map(({ id, displayName }) => ({ id, displayName })),
    gemini: DEFAULT_MODEL_INTERFACES.filter((m) => m.provider === 'gemini').map(({ id, displayName }) => ({ id, displayName })),
    openrouter: DEFAULT_MODEL_INTERFACES.filter((m) => m.provider === 'openrouter').map(({ id, displayName }) => ({ id, displayName })),
  }
  const catalogModelsByProvider: Record<ModelProvider, { id: string; displayName: string }[]> = {
    codex: [...(available.codex ?? []), ...defaultModelsByProvider.codex],
    claude: [...(available.claude ?? []), ...defaultModelsByProvider.claude],
    gemini: [...(available.gemini ?? []), ...defaultModelsByProvider.gemini],
    openrouter: [...(available.openrouter ?? []), ...defaultModelsByProvider.openrouter],
  }
  const pruneMissingFromCatalog = options?.pruneMissingFromCatalog === true
  const providersToSync = new Set<ModelProvider>(
    (options?.providers && options.providers.length > 0
      ? options.providers
      : CONNECTIVITY_PROVIDERS
    ).filter((provider): provider is ModelProvider => enabledProviders.has(provider)),
  )
  const catalogIdsByProvider: Record<ModelProvider, Set<string>> = {
    codex: new Set(catalogModelsByProvider.codex.map((m) => String(m.id ?? '').trim()).filter(Boolean)),
    claude: new Set(catalogModelsByProvider.claude.map((m) => String(m.id ?? '').trim()).filter(Boolean)),
    gemini: new Set(catalogModelsByProvider.gemini.map((m) => String(m.id ?? '').trim()).filter(Boolean)),
    openrouter: new Set(catalogModelsByProvider.openrouter.map((m) => String(m.id ?? '').trim()).filter(Boolean)),
  }
  const catalogDisplayNameByProvider: Record<ModelProvider, Record<string, string>> = {
    codex: Object.fromEntries(catalogModelsByProvider.codex.map((m) => [String(m.id ?? '').trim(), String(m.displayName ?? '').trim() || String(m.id ?? '').trim()])),
    claude: Object.fromEntries(catalogModelsByProvider.claude.map((m) => [String(m.id ?? '').trim(), String(m.displayName ?? '').trim() || String(m.id ?? '').trim()])),
    gemini: Object.fromEntries(catalogModelsByProvider.gemini.map((m) => [String(m.id ?? '').trim(), String(m.displayName ?? '').trim() || String(m.id ?? '').trim()])),
    openrouter: Object.fromEntries(catalogModelsByProvider.openrouter.map((m) => [String(m.id ?? '').trim(), String(m.displayName ?? '').trim() || String(m.id ?? '').trim()])),
  }
  const keptById = new Map<string, ModelInterface>()
  for (const model of prev.interfaces) {
    if (!enabledProviders.has(model.provider)) continue
    const id = String(model.id ?? '').trim()
    if (!id) continue
    if (
      pruneMissingFromCatalog &&
      providersToSync.has(model.provider) &&
      !catalogIdsByProvider[model.provider].has(id)
    ) {
      continue
    }
    const normalized: ModelInterface = {
      ...model,
      id,
      displayName: catalogDisplayNameByProvider[model.provider][id] || String(model.displayName ?? '').trim() || id,
    }
    const existing = keptById.get(id)
    if (!existing) {
      keptById.set(id, normalized)
      continue
    }
    if (!existing.enabled && normalized.enabled) keptById.set(id, normalized)
  }
  const nextInterfaces = [...keptById.values()]
  const existingIds = new Set(nextInterfaces.map((m) => m.id))
  for (const provider of CONNECTIVITY_PROVIDERS) {
    if (!enabledProviders.has(provider) || !providersToSync.has(provider)) continue
    for (const model of catalogModelsByProvider[provider]) {
      const id = String(model.id ?? '').trim()
      if (!id || existingIds.has(id)) continue
      const displayName = String(model.displayName ?? '').trim() || id
      nextInterfaces.push({ id, displayName, provider, enabled: true })
      existingIds.add(id)
    }
  }
  return { interfaces: nextInterfaces }
}

export function getModelPingKey(provider: string, modelId: string): string {
  return `${provider}::${modelId}`
}
