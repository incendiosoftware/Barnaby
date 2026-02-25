/**
 * Batched localStorage persistence hook.
 * Groups all localStorage.setItem effects by domain so the
 * persistence surface area is in one place, not scattered across App.tsx.
 *
 * Each domain is a single useEffect with a combined dependency array.
 * This preserves the original per-value reactivity while reducing the
 * number of distinct effects App.tsx owns.
 */

import { useEffect } from 'react'
import type {
  ApplicationSettings,
  ChatHistoryEntry,
  ExplorerPrefs,
  ModelConfig,
  OrchestratorSettings,
  ProviderRegistry,
  ThemeOverrides,
  WorkspaceDockSide,
  WorkspaceSettings,
} from '../types'
import {
  APP_SETTINGS_STORAGE_KEY,
  CHAT_HISTORY_STORAGE_KEY,
  EXPLORER_PREFS_STORAGE_KEY,
  MODEL_CONFIG_STORAGE_KEY,
  ORCHESTRATOR_SETTINGS_STORAGE_KEY,
  PROVIDER_REGISTRY_STORAGE_KEY,
  THEME_ID_STORAGE_KEY,
  THEME_OVERRIDES_STORAGE_KEY,
  WORKSPACE_DOCK_SIDE_STORAGE_KEY,
  WORKSPACE_LIST_STORAGE_KEY,
  WORKSPACE_SETTINGS_STORAGE_KEY,
  WORKSPACE_STORAGE_KEY,
} from '../constants'

export interface LocalStoragePersistenceArgs {
  applicationSettings: ApplicationSettings
  themeOverrides: ThemeOverrides

  workspaceRoot: string
  workspaceList: string[]
  workspaceSettingsByPath: Record<string, WorkspaceSettings>
  explorerPrefsByWorkspace: Record<string, ExplorerPrefs>
  workspaceDockSide: WorkspaceDockSide

  modelConfig: ModelConfig
  providerRegistry: ProviderRegistry
  orchestratorSettings: OrchestratorSettings

  chatHistory: ChatHistoryEntry[]
}

export function useLocalStoragePersistence(args: LocalStoragePersistenceArgs) {
  // ── Theme & app settings ────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(THEME_ID_STORAGE_KEY, args.applicationSettings.themeId)
    try { localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(args.applicationSettings)) } catch { /* best-effort */ }
  }, [args.applicationSettings])

  useEffect(() => {
    localStorage.setItem(THEME_OVERRIDES_STORAGE_KEY, JSON.stringify(args.themeOverrides))
  }, [args.themeOverrides])

  // ── Workspace ───────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, args.workspaceRoot)
  }, [args.workspaceRoot])

  useEffect(() => {
    localStorage.setItem(WORKSPACE_LIST_STORAGE_KEY, JSON.stringify(args.workspaceList))
  }, [args.workspaceList])

  useEffect(() => {
    localStorage.setItem(WORKSPACE_SETTINGS_STORAGE_KEY, JSON.stringify(args.workspaceSettingsByPath))
  }, [args.workspaceSettingsByPath])

  useEffect(() => {
    localStorage.setItem(EXPLORER_PREFS_STORAGE_KEY, JSON.stringify(args.explorerPrefsByWorkspace))
  }, [args.explorerPrefsByWorkspace])

  useEffect(() => {
    localStorage.setItem(WORKSPACE_DOCK_SIDE_STORAGE_KEY, args.workspaceDockSide)
  }, [args.workspaceDockSide])

  // ── Model & provider ───────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(MODEL_CONFIG_STORAGE_KEY, JSON.stringify(args.modelConfig))
  }, [args.modelConfig])

  useEffect(() => {
    localStorage.setItem(PROVIDER_REGISTRY_STORAGE_KEY, JSON.stringify(args.providerRegistry))
  }, [args.providerRegistry])

  useEffect(() => {
    localStorage.setItem(ORCHESTRATOR_SETTINGS_STORAGE_KEY, JSON.stringify(args.orchestratorSettings))
  }, [args.orchestratorSettings])

  // ── Chat history (local only; API sync stays in App.tsx) ───────
  useEffect(() => {
    try { localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(args.chatHistory)) } catch { /* best-effort */ }
  }, [args.chatHistory])
}
