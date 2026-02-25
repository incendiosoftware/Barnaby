/**
 * Provider connectivity controller.
 * Owns: ensureProviderReady, refreshProviderAuthStatus, refreshProviderApiAuthStatus,
 *       refreshAllProviderAuthStatuses, refreshMcpServers, refreshProviderApiKeyState,
 *       saveProviderApiKey, clearProviderApiKey, importProviderApiKeyFromEnv,
 *       startProviderLoginFlow, startProviderUpgradeFlow.
 */

import type React from 'react'
import type {
  ConnectivityProvider,
  ModelProvider,
  ProviderAuthStatus,
  ProviderConfig,
} from '../types'
import {
  API_CONFIG_BY_PROVIDER,
  DEFAULT_BUILTIN_PROVIDER_CONFIGS,
} from '../constants'
import { formatError } from '../utils/appCore'

const PROVIDERS_WITH_DEDICATED_PING = new Set(['claude', 'codex'])

export { PROVIDERS_WITH_DEDICATED_PING }

export interface ProviderConnectivityApi {
  getProviderAuthStatus: (opts: any) => Promise<any>
  startProviderLogin: (opts: any) => Promise<any>
  upgradeProviderCli: (opts: any) => Promise<any>
  pingProvider?: (id: string) => Promise<{ ok: boolean; durationMs: number }>
  getMcpServers: () => Promise<any>
  getProviderApiKeyState?: (providerId: string) => Promise<any>
  setProviderApiKey?: (providerId: string, value: string) => Promise<any>
  importProviderApiKeyFromEnv?: (providerId: string) => Promise<any>
}

export interface ProviderConnectivityContext {
  resolvedProviderConfigs: ProviderConfig[]
  providerApiKeyDraftByName: Record<string, string>
  api: ProviderConnectivityApi
  setProviderAuthByName: React.Dispatch<React.SetStateAction<Partial<Record<string, ProviderAuthStatus>>>>
  setProviderAuthLoadingByName: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  setProviderAuthActionByName: React.Dispatch<React.SetStateAction<Record<string, string | null>>>
  setProviderPingDurationByName: React.Dispatch<React.SetStateAction<Record<string, number | null>>>
  setProviderVerifiedByName: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  setProviderApiKeyStateByName: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  setProviderApiKeyDraftByName: React.Dispatch<React.SetStateAction<Record<string, string>>>
  setMcpServers: React.Dispatch<React.SetStateAction<any>>
}

export interface ProviderConnectivityController {
  ensureProviderReady: (provider: ModelProvider, reason: string) => Promise<void>
  refreshProviderAuthStatus: (config: ProviderConfig) => Promise<ProviderAuthStatus | null>
  refreshProviderApiAuthStatus: (providerId: string) => Promise<ProviderAuthStatus | null | undefined>
  refreshAllProviderAuthStatuses: () => Promise<void>
  refreshMcpServers: () => Promise<void>
  refreshProviderApiKeyState: (providerId: string) => Promise<void>
  saveProviderApiKey: (providerId: string, explicitValue?: string) => Promise<void>
  clearProviderApiKey: (providerId: string) => Promise<void>
  importProviderApiKeyFromEnv: (providerId: string) => Promise<void>
  startProviderLoginFlow: (config: ProviderConfig) => Promise<void>
  startProviderUpgradeFlow: (config: ProviderConfig) => Promise<void>
}

export function createProviderConnectivityController(ctx: ProviderConnectivityContext): ProviderConnectivityController {

  async function ensureProviderReady(provider: ModelProvider, reason: string) {
    const config = ctx.resolvedProviderConfigs.find((c) => c.id === provider) ?? DEFAULT_BUILTIN_PROVIDER_CONFIGS[provider as ConnectivityProvider]
    const status = (await ctx.api.getProviderAuthStatus(
      config.type === 'cli'
        ? { id: config.id, type: 'cli', cliCommand: config.cliCommand, cliPath: config.cliPath, authCheckCommand: config.authCheckCommand, loginCommand: config.loginCommand }
        : { id: config.id, type: 'api', apiBaseUrl: config.apiBaseUrl, loginUrl: config.loginUrl },
    )) as ProviderAuthStatus
    if (!status.installed) {
      throw new Error(`${config.displayName} CLI is not installed. ${status.detail}`.trim())
    }
    if (status.authenticated) return
    throw new Error(
      `${config.displayName} login required for ${reason}. ${status.detail}\nLogin outside the app, then send again.`,
    )
  }

  async function refreshProviderApiKeyState(providerId: string) {
    if (!ctx.api.getProviderApiKeyState) return
    try {
      const state = await ctx.api.getProviderApiKeyState(providerId)
      ctx.setProviderApiKeyStateByName((prev) => ({ ...prev, [providerId]: Boolean(state?.hasKey) }))
    } catch {
      ctx.setProviderApiKeyStateByName((prev) => ({ ...prev, [providerId]: false }))
    }
  }

  async function refreshProviderAuthStatus(config: ProviderConfig): Promise<ProviderAuthStatus | null> {
    ctx.setProviderAuthLoadingByName((prev) => ({ ...prev, [config.id]: true }))
    try {
      const status = (await ctx.api.getProviderAuthStatus(
        config.type === 'cli'
          ? { id: config.id, type: 'cli', cliCommand: config.cliCommand, cliPath: config.cliPath, authCheckCommand: config.authCheckCommand, loginCommand: config.loginCommand }
          : { id: config.id, type: 'api', apiBaseUrl: config.apiBaseUrl, loginUrl: config.loginUrl },
      )) as ProviderAuthStatus
      ctx.setProviderAuthByName((prev) => ({ ...prev, [config.id]: status }))
      ctx.setProviderAuthActionByName((prev) => ({ ...prev, [config.id]: null }))
      if (config.type === 'api') await refreshProviderApiKeyState(config.id)
      return status
    } catch (err) {
      ctx.setProviderAuthActionByName((prev) => ({
        ...prev,
        [config.id]: `Could not check ${config.displayName}: ${formatError(err)}`,
      }))
      return null
    } finally {
      ctx.setProviderAuthLoadingByName((prev) => ({ ...prev, [config.id]: false }))
    }
  }

  async function refreshProviderApiAuthStatus(providerId: string) {
    const apiConfig = API_CONFIG_BY_PROVIDER[providerId]
    if (!apiConfig || !ctx.api.getProviderAuthStatus) return
    ctx.setProviderAuthLoadingByName((prev) => ({ ...prev, [providerId]: true }))
    try {
      const status = (await ctx.api.getProviderAuthStatus({
        id: providerId,
        type: 'api',
        apiBaseUrl: apiConfig.apiBaseUrl,
        loginUrl: apiConfig.loginUrl,
      })) as ProviderAuthStatus
      ctx.setProviderAuthByName((prev) => ({ ...prev, [providerId]: status }))
      ctx.setProviderAuthActionByName((prev) => ({ ...prev, [providerId]: null }))
      await refreshProviderApiKeyState(providerId)
      return status
    } catch (err) {
      ctx.setProviderAuthActionByName((prev) => ({
        ...prev,
        [providerId]: `API check failed: ${formatError(err)}`,
      }))
      return null
    } finally {
      ctx.setProviderAuthLoadingByName((prev) => ({ ...prev, [providerId]: false }))
    }
  }

  async function refreshAllProviderAuthStatuses() {
    await Promise.all(
      ctx.resolvedProviderConfigs
        .filter((config) => config.id !== 'openrouter')
        .map(async (config) => {
          const authStart = Date.now()
          const s = await refreshProviderAuthStatus(config)
          const authDurationMs = Date.now() - authStart
          if (!s?.authenticated) return
          if (PROVIDERS_WITH_DEDICATED_PING.has(config.id) && ctx.api.pingProvider) {
            try {
              const ping = await ctx.api.pingProvider(config.id)
              ctx.setProviderPingDurationByName((prev) => ({ ...prev, [config.id]: ping.durationMs }))
              if (ping.ok) ctx.setProviderVerifiedByName((prev) => prev[config.id] ? prev : { ...prev, [config.id]: true })
            } catch { /* ignore */ }
          } else {
            ctx.setProviderPingDurationByName((prev) => ({ ...prev, [config.id]: authDurationMs }))
            ctx.setProviderVerifiedByName((prev) => prev[config.id] ? prev : { ...prev, [config.id]: true })
          }
        }),
    )
  }

  async function refreshMcpServers() {
    try {
      const servers = await ctx.api.getMcpServers()
      ctx.setMcpServers(servers)
    } catch { /* ignore */ }
  }

  async function saveProviderApiKey(providerId: string, explicitValue?: string) {
    if (!ctx.api.setProviderApiKey) return
    const next = typeof explicitValue === 'string' ? explicitValue : ctx.providerApiKeyDraftByName[providerId] ?? ''
    try {
      const result = await ctx.api.setProviderApiKey(providerId, next)
      ctx.setProviderApiKeyStateByName((prev) => ({ ...prev, [providerId]: Boolean(result?.hasKey) }))
      ctx.setProviderApiKeyDraftByName((prev) => ({ ...prev, [providerId]: '' }))
      ctx.setProviderAuthActionByName((prev) => ({ ...prev, [providerId]: result?.hasKey ? 'API key saved.' : 'API key cleared.' }))
      const cfg = ctx.resolvedProviderConfigs.find((p) => p.id === providerId)
      if (cfg) await refreshProviderAuthStatus(cfg)
    } catch (err) {
      ctx.setProviderAuthActionByName((prev) => ({ ...prev, [providerId]: `Could not save API key: ${formatError(err)}` }))
    }
  }

  async function clearProviderApiKey(providerId: string) {
    ctx.setProviderApiKeyDraftByName((prev) => ({ ...prev, [providerId]: '' }))
    await saveProviderApiKey(providerId, '')
  }

  async function importProviderApiKeyFromEnv(providerId: string) {
    if (!ctx.api.importProviderApiKeyFromEnv) return
    try {
      const result = await ctx.api.importProviderApiKeyFromEnv(providerId)
      ctx.setProviderApiKeyStateByName((prev) => ({ ...prev, [providerId]: Boolean(result?.hasKey) }))
      ctx.setProviderAuthActionByName((prev) => ({
        ...prev,
        [providerId]: result?.detail || (result?.ok ? 'Imported API key from environment.' : 'Could not import API key from environment.'),
      }))
      const cfg = ctx.resolvedProviderConfigs.find((p) => p.id === providerId)
      if (cfg) await refreshProviderAuthStatus(cfg)
    } catch (err) {
      ctx.setProviderAuthActionByName((prev) => ({ ...prev, [providerId]: `Could not import API key: ${formatError(err)}` }))
    }
  }

  async function startProviderLoginFlow(config: ProviderConfig) {
    ctx.setProviderAuthActionByName((prev) => ({ ...prev, [config.id]: null }))
    try {
      const result = await ctx.api.startProviderLogin(
        config.type === 'cli'
          ? { id: config.id, type: 'cli', cliCommand: config.cliCommand, cliPath: config.cliPath, authCheckCommand: config.authCheckCommand, loginCommand: config.loginCommand }
          : { id: config.id, type: 'api', apiBaseUrl: config.apiBaseUrl, loginUrl: config.loginUrl },
      )
      ctx.setProviderAuthActionByName((prev) => ({
        ...prev,
        [config.id]: result?.started
          ? `${result.detail} Complete login in the terminal, then click Re-check.`
          : `Could not start login for ${config.displayName}.`,
      }))
    } catch (err) {
      ctx.setProviderAuthActionByName((prev) => ({
        ...prev,
        [config.id]: `Could not start login for ${config.displayName}: ${formatError(err)}`,
      }))
    }
  }

  async function startProviderUpgradeFlow(config: ProviderConfig) {
    if (config.type !== 'cli') return
    if (!config.upgradeCommand && !config.upgradePackage) return
    ctx.setProviderAuthActionByName((prev) => ({ ...prev, [config.id]: null }))
    try {
      const result = await ctx.api.upgradeProviderCli({
        id: config.id,
        cliCommand: config.cliCommand,
        cliPath: config.cliPath,
        authCheckCommand: config.authCheckCommand,
        loginCommand: config.loginCommand,
        upgradeCommand: config.upgradeCommand,
        upgradePackage: config.upgradePackage,
      })
      ctx.setProviderAuthActionByName((prev) => ({
        ...prev,
        [config.id]: result?.started
          ? result.detail
          : result?.detail ?? `Could not upgrade ${config.displayName} CLI.`,
      }))
    } catch (err) {
      ctx.setProviderAuthActionByName((prev) => ({
        ...prev,
        [config.id]: `Could not upgrade ${config.displayName}: ${formatError(err)}`,
      }))
    }
  }

  return {
    ensureProviderReady,
    refreshProviderAuthStatus,
    refreshProviderApiAuthStatus,
    refreshAllProviderAuthStatuses,
    refreshMcpServers,
    refreshProviderApiKeyState,
    saveProviderApiKey,
    clearProviderApiKey,
    importProviderApiKeyFromEnv,
    startProviderLoginFlow,
    startProviderUpgradeFlow,
  }
}
