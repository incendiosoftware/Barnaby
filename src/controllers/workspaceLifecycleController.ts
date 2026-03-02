import type React from 'react'
import type {
  AgentPanelState,
  ConnectivityProvider,
  EditorPanelState,
  ProviderAuthStatus,
  ProviderConfig,
  ProviderRegistry,
  WorkspaceApplyFailure,
  WorkspaceLockAcquireResult,
  WorkspaceSettings,
  WorkspaceUiSnapshot,
  WorkspaceDockSide,
  CodeWindowTab,
  LayoutMode,
} from '../types'
import { CONNECTIVITY_PROVIDERS, SETUP_WIZARD_DONE_STORAGE_KEY } from '../constants'
import {
  cloneChatMessages,
  formatError,
  getDefaultSetupWizardSelection,
  isLockedWorkspacePrompt,
  makeDefaultPanel,
  normalizeWorkspacePathForCompare,
  withModelBanner,
} from '../utils/appCore'

type WorkspaceSwitchSource = 'menu' | 'picker' | 'dropdown' | 'workspace-create'

export interface WorkspaceLifecycleApi {
  claimWorkspace: (path: string) => Promise<WorkspaceLockAcquireResult>
  releaseWorkspace: (path: string) => Promise<unknown>
  disconnect: (panelId: string) => Promise<unknown>
}

export interface WorkspaceLifecycleContext {
  api: WorkspaceLifecycleApi
  workspaceSettingsByPath: Record<string, WorkspaceSettings>
  panelsRef: React.MutableRefObject<AgentPanelState[]>
  editorPanelsRef: React.MutableRefObject<EditorPanelState[]>
  focusedEditorIdRef: React.MutableRefObject<string | null>
  workspaceSnapshotsRef: React.MutableRefObject<Record<string, WorkspaceUiSnapshot>>
  workspaceRootRef: React.MutableRefObject<string>
  activeWorkspaceLockRef: React.MutableRefObject<string>
  layoutMode: LayoutMode
  showWorkspaceWindow: boolean
  showGitWindow: boolean
  showSettingsWindow: boolean
  showCodeWindow: boolean
  codeWindowTab: CodeWindowTab
  dockTab: 'orchestrator' | 'explorer' | 'git' | 'settings'
  workspaceDockSide: WorkspaceDockSide
  gitDockSide: WorkspaceDockSide
  settingsDockSide: WorkspaceDockSide
  activePanelId: string | null
  selectedWorkspaceFile: string | null
  expandedDirectories: Record<string, boolean>
  workspacePickerPrompt: string | null
  setupWizardSelection: Record<ConnectivityProvider, boolean>
  resolvedProviderConfigs: ProviderConfig[]
  pendingWorkspaceSwitch: { targetRoot: string; source: WorkspaceSwitchSource } | null
  refreshProviderAuthStatus: (config: ProviderConfig) => Promise<ProviderAuthStatus | null>
  setWorkspacePickerError: React.Dispatch<React.SetStateAction<string | null>>
  setWorkspacePickerPrompt: React.Dispatch<React.SetStateAction<string | null>>
  setWorkspacePickerOpening: React.Dispatch<React.SetStateAction<string | null>>
  setShowWorkspacePicker: React.Dispatch<React.SetStateAction<boolean>>
  setSetupWizardStep: React.Dispatch<React.SetStateAction<'providers' | 'connect'>>
  setSetupWizardSelection: React.Dispatch<React.SetStateAction<Record<ConnectivityProvider, boolean>>>
  setSetupWizardStatus: React.Dispatch<React.SetStateAction<string | null>>
  setShowSetupWizard: React.Dispatch<React.SetStateAction<boolean>>
  setSetupWizardFinishing: React.Dispatch<React.SetStateAction<boolean>>
  setProviderRegistry: React.Dispatch<React.SetStateAction<ProviderRegistry>>
  setShowWorkspaceModal: React.Dispatch<React.SetStateAction<boolean>>
  setWorkspaceRoot: React.Dispatch<React.SetStateAction<string>>
  setLayoutMode: React.Dispatch<React.SetStateAction<LayoutMode>>
  setShowWorkspaceWindow: React.Dispatch<React.SetStateAction<boolean>>
  setShowGitWindow: React.Dispatch<React.SetStateAction<boolean>>
  setShowSettingsWindow: React.Dispatch<React.SetStateAction<boolean>>
  setShowCodeWindow: React.Dispatch<React.SetStateAction<boolean>>
  setCodeWindowTab: React.Dispatch<React.SetStateAction<CodeWindowTab>>
  setDockTab: React.Dispatch<React.SetStateAction<'orchestrator' | 'explorer' | 'git' | 'settings'>>
  setWorkspaceDockSide: React.Dispatch<React.SetStateAction<WorkspaceDockSide>>
  setGitDockSide: React.Dispatch<React.SetStateAction<WorkspaceDockSide>>
  setSettingsDockSide: React.Dispatch<React.SetStateAction<WorkspaceDockSide>>
  setExpandedDirectories: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  setSelectedWorkspaceFile: React.Dispatch<React.SetStateAction<string | null>>
  setEditorPanels: React.Dispatch<React.SetStateAction<EditorPanelState[]>>
  setFocusedEditorId: React.Dispatch<React.SetStateAction<string | null>>
  setPanels: React.Dispatch<React.SetStateAction<AgentPanelState[]>>
  setActivePanelId: React.Dispatch<React.SetStateAction<string>>
  setSelectedHistoryId: React.Dispatch<React.SetStateAction<string>>
  setPendingWorkspaceSwitch: React.Dispatch<React.SetStateAction<{ targetRoot: string; source: WorkspaceSwitchSource } | null>>
  upsertPanelToHistory: (panel: AgentPanelState) => void
  requestImmediateAppStateSave: () => void
}

export interface WorkspaceLifecycleController {
  buildWorkspaceSnapshot: (nextWorkspaceRoot: string) => WorkspaceUiSnapshot
  openWorkspacePicker: (prompt?: string | null) => void
  closeWorkspacePicker: () => void
  openSetupWizard: () => void
  runSetupConnectivityChecks: (selected: ConnectivityProvider[]) => Promise<(ProviderAuthStatus | null)[]>
  finishSetupWizard: () => Promise<void>
  applyWorkspaceRoot: (
    nextRoot: string,
    options?: {
      showFailureAlert?: boolean
      rebindPanels?: boolean
      onFailure?: (failure: WorkspaceApplyFailure) => void
    },
  ) => Promise<string | null>
  requestWorkspaceSwitch: (targetRoot: string, source: WorkspaceSwitchSource) => void
  confirmWorkspaceSwitch: () => Promise<void>
  applyWorkspaceSnapshot: (nextWorkspaceRoot: string) => void
}

export function createWorkspaceLifecycleController(ctx: WorkspaceLifecycleContext): WorkspaceLifecycleController {
  function formatWorkspaceClaimFailure(requestedRoot: string, result: WorkspaceLockAcquireResult) {
    if (result.ok) return ''
    if (result.reason === 'in-use') {
      const owner = result.owner
      const detail =
        owner && owner.pid
          ? `Locked by PID ${owner.pid}${owner.hostname ? ` on ${owner.hostname}` : ''} (heartbeat ${new Date(owner.heartbeatAt).toLocaleString()}).`
          : 'Another Barnaby instance is already active in this workspace.'
      return `Cannot open workspace:\n${requestedRoot}\n\n${detail}`
    }
    if (result.reason === 'invalid-workspace') return `Cannot open workspace:\n${requestedRoot}\n\n${result.message}`
    return `Cannot open workspace:\n${requestedRoot}\n\n${result.message || 'Unknown error.'}`
  }

  function handleWorkspacePickerFailure(requestedRoot: string, failure: WorkspaceApplyFailure) {
    const msg = failure.kind === 'request-error' ? failure.message : formatWorkspaceClaimFailure(requestedRoot, failure.result)
    ctx.setWorkspacePickerError(msg)
  }

  function makeWorkspaceDefaultPanel(nextWorkspaceRoot: string) {
    const ws = ctx.workspaceSettingsByPath[nextWorkspaceRoot]
    const panel = makeDefaultPanel('default', nextWorkspaceRoot, undefined, undefined, ws?.cursorAllowBuilds === true)
    if (ws?.defaultModel) {
      panel.model = ws.defaultModel
      panel.messages = withModelBanner(panel.messages, ws.defaultModel)
    }
    if (ws?.permissionMode) panel.permissionMode = ws.permissionMode
    if (ws?.sandbox) panel.sandbox = ws.sandbox
    return panel
  }

  function buildWorkspaceSnapshot(nextWorkspaceRoot: string): WorkspaceUiSnapshot {
    const normalizedWorkspaceRoot = normalizeWorkspacePathForCompare(nextWorkspaceRoot)
    const workspacePanels = ctx.panelsRef.current
      .filter((panel) => normalizeWorkspacePathForCompare(panel.cwd) === normalizedWorkspaceRoot)
      .map((panel) => ({
        ...panel,
        connected: false,
        streaming: false,
        status: panel.connected || panel.streaming ? 'Disconnected after workspace switch.' : panel.status,
        messages: cloneChatMessages(panel.messages),
        attachments: panel.attachments.map((attachment) => ({ ...attachment })),
        pendingInputs: [...panel.pendingInputs],
      }))
    const workspaceEditors = ctx.editorPanelsRef.current
      .filter((panel) => normalizeWorkspacePathForCompare(panel.workspaceRoot) === normalizedWorkspaceRoot)
      .map((panel) => ({ ...panel }))
    return {
      layoutMode: ctx.layoutMode,
      showWorkspaceWindow: ctx.showWorkspaceWindow,
      showGitWindow: ctx.showGitWindow,
      showSettingsWindow: ctx.showSettingsWindow,
      showCodeWindow: ctx.showCodeWindow,
      codeWindowTab: ctx.codeWindowTab,
      dockTab: ctx.dockTab,
      workspaceDockSide: ctx.workspaceDockSide,
      gitDockSide: ctx.gitDockSide,
      settingsDockSide: ctx.settingsDockSide,
      panels: workspacePanels,
      editorPanels: workspaceEditors,
      activePanelId: ctx.panelsRef.current.some((panel) => panel.id === ctx.activePanelId) ? ctx.activePanelId : workspacePanels[0]?.id ?? null,
      focusedEditorId: ctx.focusedEditorIdRef.current,
      selectedWorkspaceFile: ctx.selectedWorkspaceFile,
      expandedDirectories: { ...ctx.expandedDirectories },
    }
  }

  function applyWorkspaceSnapshot(nextWorkspaceRoot: string) {
    const snapshot = ctx.workspaceSnapshotsRef.current[nextWorkspaceRoot]
    if (!snapshot) {
      const panel = makeWorkspaceDefaultPanel(nextWorkspaceRoot)
      ctx.setLayoutMode('vertical')
      ctx.setShowWorkspaceWindow(true)
      ctx.setShowGitWindow(false)
      ctx.setShowSettingsWindow(false)
      ctx.setShowCodeWindow(true)
      ctx.setCodeWindowTab('code')
      ctx.setDockTab('explorer')
      ctx.setWorkspaceDockSide('left')
      ctx.setGitDockSide('left')
      ctx.setSettingsDockSide('right')
      ctx.setExpandedDirectories({})
      ctx.setSelectedWorkspaceFile(null)
      ctx.setEditorPanels([])
      ctx.setFocusedEditorId(null)
      ctx.setPanels([panel])
      ctx.setActivePanelId(panel.id)
      return
    }
    ctx.setLayoutMode('vertical')
    ctx.setShowWorkspaceWindow(snapshot.showWorkspaceWindow)
    ctx.setShowGitWindow(snapshot.showGitWindow)
    ctx.setShowSettingsWindow(snapshot.showSettingsWindow)
    ctx.setShowCodeWindow(snapshot.showCodeWindow)
    ctx.setCodeWindowTab(snapshot.codeWindowTab)
    ctx.setDockTab(snapshot.dockTab)
    ctx.setWorkspaceDockSide(snapshot.workspaceDockSide)
    ctx.setGitDockSide(snapshot.gitDockSide)
    ctx.setSettingsDockSide(snapshot.settingsDockSide)
    ctx.setExpandedDirectories({ ...snapshot.expandedDirectories })
    ctx.setSelectedWorkspaceFile(snapshot.selectedWorkspaceFile)
    ctx.setEditorPanels(snapshot.editorPanels.map((panel) => ({ ...panel })))
    const restoredPanels = snapshot.panels.map((panel) => ({
      ...panel,
      cwd: nextWorkspaceRoot,
      connected: false,
      streaming: false,
      status: 'Restored for workspace.',
      messages: cloneChatMessages(panel.messages),
      attachments: panel.attachments.map((attachment) => ({ ...attachment })),
      pendingInputs: [...panel.pendingInputs],
    }))
    if (restoredPanels.length > 0) {
      ctx.setPanels(restoredPanels)
      const nextActivePanelId =
        snapshot.activePanelId && restoredPanels.some((panel) => panel.id === snapshot.activePanelId)
          ? snapshot.activePanelId
          : restoredPanels[0].id
      ctx.setActivePanelId(nextActivePanelId)
    } else {
      const panel = makeWorkspaceDefaultPanel(nextWorkspaceRoot)
      ctx.setPanels([panel])
      ctx.setActivePanelId(panel.id)
    }
    const nextFocusedEditor =
      snapshot.focusedEditorId && snapshot.editorPanels.some((panel) => panel.id === snapshot.focusedEditorId)
        ? snapshot.focusedEditorId
        : null
    ctx.setFocusedEditorId(nextFocusedEditor)
  }

  function openWorkspacePicker(prompt?: string | null) {
    const nextPrompt = typeof prompt === 'string' && prompt.trim() ? prompt.trim() : null
    ctx.setWorkspacePickerPrompt(nextPrompt)
    ctx.setWorkspacePickerError(null)
    ctx.setWorkspacePickerOpening(null)
    ctx.setShowWorkspacePicker(true)
  }

  function closeWorkspacePicker() {
    if (isLockedWorkspacePrompt(ctx.workspacePickerPrompt)) return
    ctx.setShowWorkspacePicker(false)
    ctx.setWorkspacePickerPrompt(null)
    ctx.setWorkspacePickerError(null)
    ctx.setWorkspacePickerOpening(null)
  }

  function openSetupWizard() {
    ctx.setSetupWizardStep('providers')
    ctx.setSetupWizardSelection(getDefaultSetupWizardSelection())
    ctx.setSetupWizardStatus(null)
    ctx.setShowSetupWizard(true)
  }

  async function runSetupConnectivityChecks(selected: ConnectivityProvider[]) {
    return Promise.all(
      selected.map(async (providerId) => {
        const config = ctx.resolvedProviderConfigs.find((p) => p.id === providerId)
        if (!config) return null
        return ctx.refreshProviderAuthStatus(config)
      }),
    )
  }

  async function finishSetupWizard() {
    const selected = CONNECTIVITY_PROVIDERS.filter((id) => ctx.setupWizardSelection[id])
    if (selected.length === 0) {
      ctx.setSetupWizardStatus('Select at least one provider to continue.')
      return
    }
    ctx.setSetupWizardFinishing(true)
    ctx.setSetupWizardStatus('Checking selected providers...')
    try {
      const statuses = await runSetupConnectivityChecks(selected)
      const connected = statuses.some((s) => Boolean(s?.authenticated))
      if (!connected) {
        ctx.setSetupWizardStatus('No selected provider is connected yet. Complete login/API key setup for at least one provider.')
        return
      }
      ctx.setProviderRegistry((prev) => ({
        ...prev,
        overrides: {
          ...prev.overrides,
          ...Object.fromEntries(selected.map((id) => [id, { ...(prev.overrides[id] ?? {}), enabled: true }])),
        },
      }))
      localStorage.setItem(SETUP_WIZARD_DONE_STORAGE_KEY, '1')
      ctx.setShowSetupWizard(false)
      ctx.setSetupWizardStatus(null)
      if (!ctx.workspaceRootRef.current?.trim()) openWorkspacePicker('Select or create a workspace to continue.')
    } finally {
      ctx.setSetupWizardFinishing(false)
    }
  }

  async function applyWorkspaceRoot(
    nextRoot: string,
    options?: { showFailureAlert?: boolean; rebindPanels?: boolean; onFailure?: (failure: WorkspaceApplyFailure) => void },
  ) {
    const targetRoot = nextRoot.trim()
    if (!targetRoot) return null
    const showFailureAlert = options?.showFailureAlert ?? true
    const rebindPanels = options?.rebindPanels ?? false
    let lockResult: WorkspaceLockAcquireResult
    try {
      lockResult = await ctx.api.claimWorkspace(targetRoot)
    } catch (err) {
      const message = formatError(err)
      if (showFailureAlert) alert(`Cannot open workspace:\n${targetRoot}\n\n${message}`)
      options?.onFailure?.({ kind: 'request-error', message })
      return null
    }
    if (!lockResult.ok) {
      if (showFailureAlert) alert(formatWorkspaceClaimFailure(targetRoot, lockResult))
      options?.onFailure?.({ kind: 'lock-denied', result: lockResult })
      return null
    }
    const resolvedRoot = lockResult.workspaceRoot
    const previousLockedRoot = ctx.activeWorkspaceLockRef.current
    ctx.activeWorkspaceLockRef.current = resolvedRoot
    if (previousLockedRoot && previousLockedRoot !== resolvedRoot) void ctx.api.releaseWorkspace(previousLockedRoot).catch(() => {})
    if (ctx.workspaceRootRef.current === resolvedRoot) return resolvedRoot
    ctx.setWorkspaceRoot(resolvedRoot)
    if (rebindPanels) {
      ctx.setPanels((prev) => prev.map((p) => ({ ...p, cwd: resolvedRoot, connected: false, status: 'Workspace changed. Reconnect on next send.' })))
    }
    return resolvedRoot
  }

  async function doWorkspaceSwitch(targetRoot: string, source: WorkspaceSwitchSource) {
    const currentWorkspace = ctx.workspaceRootRef.current?.trim()
    const currentPanels = ctx.panelsRef.current
    const panelIds = [...new Set(currentPanels.map((panel) => panel.id))]
    if (currentWorkspace) {
      ctx.workspaceSnapshotsRef.current[currentWorkspace] = buildWorkspaceSnapshot(currentWorkspace)
      const normalizedCurrent = normalizeWorkspacePathForCompare(currentWorkspace)
      for (const panel of currentPanels) {
        if (normalizeWorkspacePathForCompare(panel.cwd) === normalizedCurrent) {
          ctx.upsertPanelToHistory(panel)
        }
      }
    }
    const fromPicker = source === 'picker'
    if (fromPicker) {
      ctx.setWorkspacePickerError(null)
      ctx.setWorkspacePickerOpening(targetRoot)
    }
    const openedRoot = await applyWorkspaceRoot(targetRoot, {
      showFailureAlert: !fromPicker,
      rebindPanels: false,
      onFailure: fromPicker ? (f) => handleWorkspacePickerFailure(targetRoot, f) : undefined,
    }).finally(() => {
      if (fromPicker) ctx.setWorkspacePickerOpening(null)
    })
    if (!openedRoot) return
    if (fromPicker) closeWorkspacePicker()
    await Promise.all(panelIds.map((id) => ctx.api.disconnect(id).catch(() => {})))
    ctx.setPanels([])
    ctx.setEditorPanels([])
    ctx.setActivePanelId('default')
    ctx.setFocusedEditorId(null)
    ctx.setSelectedHistoryId('')
    ctx.setSelectedWorkspaceFile(null)
    ctx.setExpandedDirectories({})
    applyWorkspaceSnapshot(openedRoot)
    if (source === 'workspace-create') ctx.setShowWorkspaceModal(false)
    ctx.requestImmediateAppStateSave()
  }

  function requestWorkspaceSwitch(targetRoot: string, source: WorkspaceSwitchSource) {
    const next = targetRoot.trim()
    if (!next) return
    const current = ctx.workspaceRootRef.current?.trim() ?? ''
    if (source !== 'picker' && normalizeWorkspacePathForCompare(next) === normalizeWorkspacePathForCompare(current)) return
    const fromPicker = source === 'picker'
    if (fromPicker) {
      ctx.setWorkspacePickerError(null)
      ctx.setWorkspacePickerOpening(next)
    }
    if (!current) {
      void (async () => {
        try {
          const openedRoot = await applyWorkspaceRoot(next, {
            showFailureAlert: !fromPicker,
            rebindPanels: false,
            onFailure: fromPicker ? (f) => handleWorkspacePickerFailure(next, f) : undefined,
          })
          if (!openedRoot) return
          applyWorkspaceSnapshot(openedRoot)
          if (fromPicker) closeWorkspacePicker()
          if (source === 'workspace-create') ctx.setShowWorkspaceModal(false)
          ctx.requestImmediateAppStateSave()
        } finally {
          if (fromPicker) ctx.setWorkspacePickerOpening(null)
        }
      })()
      return
    }
    if (fromPicker) {
      void doWorkspaceSwitch(next, source)
      return
    }
    ctx.setPendingWorkspaceSwitch({ targetRoot: next, source })
  }

  async function confirmWorkspaceSwitch() {
    const pending = ctx.pendingWorkspaceSwitch
    if (!pending) return
    ctx.setPendingWorkspaceSwitch(null)
    await doWorkspaceSwitch(pending.targetRoot, pending.source)
  }

  return {
    buildWorkspaceSnapshot,
    openWorkspacePicker,
    closeWorkspacePicker,
    openSetupWizard,
    runSetupConnectivityChecks,
    finishSetupWizard,
    applyWorkspaceRoot,
    requestWorkspaceSwitch,
    confirmWorkspaceSwitch,
    applyWorkspaceSnapshot,
  }
}
