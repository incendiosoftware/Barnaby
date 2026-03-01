/**
 * Workspace settings workflow - modal/docked form, persist, delete.
 * Use for: opening workspace settings, form updates, persisting, deleting workspaces.
 */

import type React from 'react'
import type { WorkspaceSettings, WorkspaceSettingsTextDraft } from '../types'
import {
  applyWorkspaceTextDraftField,
  normalizeAllowedCommandPrefixes,
  normalizeWorkspacePathForCompare,
  workspaceSettingsToTextDraft,
} from '../utils/appCore'
import {
  DEFAULT_MODEL,
  DEFAULT_WORKSPACE_ALLOWED_AUTO_READ_PREFIXES,
  DEFAULT_WORKSPACE_ALLOWED_AUTO_WRITE_PREFIXES,
  DEFAULT_WORKSPACE_ALLOWED_COMMAND_PREFIXES,
  DEFAULT_WORKSPACE_DENIED_AUTO_READ_PREFIXES,
  DEFAULT_WORKSPACE_DENIED_AUTO_WRITE_PREFIXES,
} from '../constants'

function normalizeWorkspaceSettingsForm(form: WorkspaceSettings): WorkspaceSettings {
  const sandbox = form.sandbox
  const permissionMode = sandbox === 'read-only' ? 'verify-first' : form.permissionMode
  return {
    path: form.path.trim(),
    defaultModel: form.defaultModel.trim() || DEFAULT_MODEL,
    permissionMode,
    sandbox,
    workspaceContext: typeof form.workspaceContext === 'string' ? form.workspaceContext.trim() : '',
    showWorkspaceContextInPrompt: form.showWorkspaceContextInPrompt === true,
    systemPrompt: typeof form.systemPrompt === 'string' ? form.systemPrompt.trim() : '',
    allowedCommandPrefixes: normalizeAllowedCommandPrefixes(form.allowedCommandPrefixes),
    allowedAutoReadPrefixes: normalizeAllowedCommandPrefixes(form.allowedAutoReadPrefixes),
    allowedAutoWritePrefixes: normalizeAllowedCommandPrefixes(form.allowedAutoWritePrefixes),
    deniedAutoReadPrefixes: normalizeAllowedCommandPrefixes(form.deniedAutoReadPrefixes),
    deniedAutoWritePrefixes: normalizeAllowedCommandPrefixes(form.deniedAutoWritePrefixes),
  }
}

function workspaceFormsEqual(a: WorkspaceSettings, b: WorkspaceSettings): boolean {
  const left = normalizeWorkspaceSettingsForm(a)
  const right = normalizeWorkspaceSettingsForm(b)
  return (
    left.path === right.path &&
    left.defaultModel === right.defaultModel &&
    left.permissionMode === right.permissionMode &&
    left.sandbox === right.sandbox &&
    left.workspaceContext === right.workspaceContext &&
    left.showWorkspaceContextInPrompt === right.showWorkspaceContextInPrompt &&
    left.systemPrompt === right.systemPrompt &&
    left.allowedCommandPrefixes.join('\n') === right.allowedCommandPrefixes.join('\n') &&
    left.allowedAutoReadPrefixes.join('\n') === right.allowedAutoReadPrefixes.join('\n') &&
    left.allowedAutoWritePrefixes.join('\n') === right.allowedAutoWritePrefixes.join('\n') &&
    left.deniedAutoReadPrefixes.join('\n') === right.deniedAutoReadPrefixes.join('\n') &&
    left.deniedAutoWritePrefixes.join('\n') === right.deniedAutoWritePrefixes.join('\n')
  )
}

export interface WorkspaceSettingsApi {
  writeWorkspaceConfig?: (path: string, settings?: WorkspaceSettings) => Promise<unknown>
  releaseWorkspace?: (path: string) => Promise<unknown>
}

export interface WorkspaceSettingsControllerContext {
  workspaceRoot: string
  workspaceList: string[]
  workspaceSettingsByPath: Record<string, WorkspaceSettings>
  setWorkspaceModalMode: (mode: 'new' | 'edit') => void
  setWorkspaceForm: React.Dispatch<React.SetStateAction<WorkspaceSettings>>
  setWorkspaceFormTextDraft: React.Dispatch<React.SetStateAction<WorkspaceSettingsTextDraft>>
  setShowWorkspaceModal: (v: boolean | ((prev: boolean) => boolean)) => void
  setDockTab: React.Dispatch<React.SetStateAction<'settings' | 'orchestrator' | 'explorer' | 'git'>>
  setWorkspaceSettingsByPath: React.Dispatch<React.SetStateAction<Record<string, WorkspaceSettings>>>
  setWorkspaceList: React.Dispatch<React.SetStateAction<string[]>>
  setWorkspaceRoot: (v: string | ((prev: string) => string)) => void
  workspaceRootRef: React.MutableRefObject<string>
  activeWorkspaceLockRef: React.MutableRefObject<string>
  api: WorkspaceSettingsApi
  requestWorkspaceSwitch: (path: string, source: 'workspace-create') => void
  applyWorkspaceRoot: (path: string, opts?: { showFailureAlert?: boolean; rebindPanels?: boolean }) => Promise<string | null>
  applyWorkspaceSnapshot: (path: string) => void
}

export interface WorkspaceSettingsController {
  buildWorkspaceForm: (mode: 'new' | 'edit', targetPath?: string) => WorkspaceSettings
  normalizeWorkspaceSettingsForm: (form: WorkspaceSettings) => WorkspaceSettings
  openWorkspaceSettings: (mode: 'new' | 'edit') => void
  openWorkspaceSettingsForPath: (targetPath: string) => void
  openWorkspaceSettingsTab: () => void
  persistWorkspaceSettings: (
    next: WorkspaceSettings,
    options?: { closeModal?: boolean; requestSwitch?: boolean },
  ) => Promise<void>
  updateDockedWorkspaceForm: (updater: (prev: WorkspaceSettings) => WorkspaceSettings) => void
  updateWorkspaceModalForm: (
    updater: (prev: WorkspaceSettings) => WorkspaceSettings,
    options?: { requestSwitch?: boolean },
  ) => void
  updateDockedWorkspaceTextDraft: (field: keyof WorkspaceSettingsTextDraft, raw: string) => void
  updateWorkspaceModalTextDraft: (field: keyof WorkspaceSettingsTextDraft, raw: string) => void
  deleteWorkspace: (pathToDelete: string) => Promise<void>
}

export function createWorkspaceSettingsController(
  ctx: WorkspaceSettingsControllerContext,
): WorkspaceSettingsController {
  const {
    workspaceRoot,
    workspaceList,
    workspaceSettingsByPath,
    setWorkspaceModalMode,
    setWorkspaceForm,
    setWorkspaceFormTextDraft,
    setShowWorkspaceModal,
    setDockTab,
    setWorkspaceSettingsByPath,
    setWorkspaceList,
    setWorkspaceRoot,
    workspaceRootRef,
    activeWorkspaceLockRef,
    api,
    requestWorkspaceSwitch,
    applyWorkspaceRoot,
    applyWorkspaceSnapshot,
  } = ctx

  function buildWorkspaceForm(mode: 'new' | 'edit', targetPath?: string): WorkspaceSettings {
    const resolvedPath = typeof targetPath === 'string' && targetPath.trim() ? targetPath.trim() : workspaceRoot
    const current =
      workspaceSettingsByPath[resolvedPath] ??
      workspaceSettingsByPath[workspaceRoot] ??
      ({
        path: resolvedPath || workspaceRoot,
        defaultModel: DEFAULT_MODEL,
        permissionMode: 'verify-first',
        sandbox: 'workspace-write',
        workspaceContext: '',
        showWorkspaceContextInPrompt: false,
        systemPrompt: '',
        allowedCommandPrefixes: [...DEFAULT_WORKSPACE_ALLOWED_COMMAND_PREFIXES],
        allowedAutoReadPrefixes: [...DEFAULT_WORKSPACE_ALLOWED_AUTO_READ_PREFIXES],
        allowedAutoWritePrefixes: [...DEFAULT_WORKSPACE_ALLOWED_AUTO_WRITE_PREFIXES],
        deniedAutoReadPrefixes: [...DEFAULT_WORKSPACE_DENIED_AUTO_READ_PREFIXES],
        deniedAutoWritePrefixes: [...DEFAULT_WORKSPACE_DENIED_AUTO_WRITE_PREFIXES],
      } as WorkspaceSettings)

    const cmdPrefixes = normalizeAllowedCommandPrefixes(current.allowedCommandPrefixes)
    const readPrefixes = normalizeAllowedCommandPrefixes(current.allowedAutoReadPrefixes)
    const writePrefixes = normalizeAllowedCommandPrefixes(current.allowedAutoWritePrefixes)
    const deniedRead = normalizeAllowedCommandPrefixes(current.deniedAutoReadPrefixes)
    const deniedWrite = normalizeAllowedCommandPrefixes(current.deniedAutoWritePrefixes)

    if (mode === 'new') {
      return {
        path: resolvedPath || workspaceRoot,
        defaultModel: current.defaultModel ?? DEFAULT_MODEL,
        permissionMode: current.permissionMode ?? 'verify-first',
        sandbox: current.sandbox ?? 'workspace-write',
        workspaceContext: current.workspaceContext ?? '',
        showWorkspaceContextInPrompt: current.showWorkspaceContextInPrompt === true,
        systemPrompt: current.systemPrompt ?? '',
        allowedCommandPrefixes: cmdPrefixes,
        allowedAutoReadPrefixes: readPrefixes,
        allowedAutoWritePrefixes: writePrefixes,
        deniedAutoReadPrefixes: deniedRead,
        deniedAutoWritePrefixes: deniedWrite,
      } satisfies WorkspaceSettings
    }

    return {
      path: current.path || resolvedPath || workspaceRoot,
      defaultModel: current.defaultModel ?? DEFAULT_MODEL,
      permissionMode: current.permissionMode ?? 'verify-first',
      sandbox: current.sandbox ?? 'workspace-write',
      workspaceContext: current.workspaceContext ?? '',
      showWorkspaceContextInPrompt: current.showWorkspaceContextInPrompt === true,
      systemPrompt: current.systemPrompt ?? '',
      allowedCommandPrefixes: cmdPrefixes,
      allowedAutoReadPrefixes: readPrefixes,
      allowedAutoWritePrefixes: writePrefixes,
      deniedAutoReadPrefixes: deniedRead,
      deniedAutoWritePrefixes: deniedWrite,
    } satisfies WorkspaceSettings
  }

  async function persistWorkspaceSettings(
    next: WorkspaceSettings,
    options?: { closeModal?: boolean; requestSwitch?: boolean },
  ) {
    if (!next.path) return

    setWorkspaceSettingsByPath((prev) => {
      const existing = prev[next.path]
      if (existing && workspaceFormsEqual(existing, next)) return prev
      return { ...prev, [next.path]: next }
    })
    setWorkspaceList((prev) => (prev.includes(next.path) ? prev : [next.path, ...prev]))
    if (options?.closeModal) setShowWorkspaceModal(false)
    if (options?.requestSwitch) {
      const normalizedCurrentRoot = normalizeWorkspacePathForCompare(workspaceRootRef.current || '')
      const normalizedNextPath = normalizeWorkspacePathForCompare(next.path)
      if (normalizedCurrentRoot !== normalizedNextPath) {
        requestWorkspaceSwitch(next.path, 'workspace-create')
      }
    }

    try {
      await api.writeWorkspaceConfig?.(next.path, next)
    } catch {
      // best-effort only
    }
  }

  function updateDockedWorkspaceForm(updater: (prev: WorkspaceSettings) => WorkspaceSettings) {
    setWorkspaceForm((prev) => {
      const nextForm = updater(prev)
      const normalized = normalizeWorkspaceSettingsForm(nextForm)
      queueMicrotask(() => {
        const normalizedCurrentRoot = normalizeWorkspacePathForCompare(workspaceRootRef.current || '')
        const normalizedFormPath = normalizeWorkspacePathForCompare(normalized.path)
        if (normalizedCurrentRoot !== normalizedFormPath) return
        void persistWorkspaceSettings(normalized)
      })
      return nextForm
    })
  }

  function updateWorkspaceModalForm(
    updater: (prev: WorkspaceSettings) => WorkspaceSettings,
    options?: { requestSwitch?: boolean },
  ) {
    setWorkspaceForm((prev) => {
      const nextForm = updater(prev)
      const normalized = normalizeWorkspaceSettingsForm(nextForm)
      queueMicrotask(() => {
        void persistWorkspaceSettings(normalized, options?.requestSwitch ? { requestSwitch: true } : undefined)
      })
      return nextForm
    })
  }

  function updateDockedWorkspaceTextDraft(field: keyof WorkspaceSettingsTextDraft, raw: string) {
    setWorkspaceFormTextDraft((prev) => ({ ...prev, [field]: raw }))
    setWorkspaceForm((prev) => {
      const nextForm = applyWorkspaceTextDraftField(prev, field, raw)
      const normalized = normalizeWorkspaceSettingsForm(nextForm)
      queueMicrotask(() => {
        const normalizedCurrentRoot = normalizeWorkspacePathForCompare(workspaceRootRef.current || '')
        const normalizedFormPath = normalizeWorkspacePathForCompare(normalized.path)
        if (normalizedCurrentRoot !== normalizedFormPath) return
        void persistWorkspaceSettings(normalized)
      })
      return nextForm
    })
  }

  function updateWorkspaceModalTextDraft(field: keyof WorkspaceSettingsTextDraft, raw: string) {
    setWorkspaceFormTextDraft((prev) => ({ ...prev, [field]: raw }))
    updateWorkspaceModalForm((prev) => applyWorkspaceTextDraftField(prev, field, raw))
  }

  function openWorkspaceSettings(mode: 'new' | 'edit') {
    setWorkspaceModalMode(mode)
    const nextForm = buildWorkspaceForm(mode)
    setWorkspaceForm(nextForm)
    setWorkspaceFormTextDraft(workspaceSettingsToTextDraft(nextForm))
    setShowWorkspaceModal(true)
  }

  function openWorkspaceSettingsForPath(targetPath: string) {
    setWorkspaceModalMode('edit')
    const nextForm = buildWorkspaceForm('edit', targetPath)
    setWorkspaceForm(nextForm)
    setWorkspaceFormTextDraft(workspaceSettingsToTextDraft(nextForm))
    setShowWorkspaceModal(true)
  }

  function openWorkspaceSettingsTab() {
    const nextForm = buildWorkspaceForm('edit')
    setWorkspaceForm(nextForm)
    setWorkspaceFormTextDraft(workspaceSettingsToTextDraft(nextForm))
    setShowWorkspaceModal(false)
    setDockTab('settings')
  }

  async function deleteWorkspace(pathToDelete: string) {
    const remaining = workspaceList.filter((p) => p !== pathToDelete)
    setWorkspaceList(remaining)
    setWorkspaceSettingsByPath((prev) => {
      const next = { ...prev }
      delete next[pathToDelete]
      return next
    })

    if (activeWorkspaceLockRef.current === pathToDelete) {
      try {
        await api.releaseWorkspace?.(pathToDelete)
      } catch {
        // best effort only
      }
      activeWorkspaceLockRef.current = ''
    }

    if (workspaceRootRef.current === pathToDelete) {
      let switched = false
      for (const nextRoot of remaining) {
        const opened = await applyWorkspaceRoot(nextRoot, { showFailureAlert: false, rebindPanels: false })
        if (opened) {
          applyWorkspaceSnapshot(opened)
          switched = true
          break
        }
      }
      if (!switched) {
        setWorkspaceRoot('')
      }
    }
    setShowWorkspaceModal(false)
  }

  return {
    buildWorkspaceForm,
    normalizeWorkspaceSettingsForm,
    openWorkspaceSettings,
    openWorkspaceSettingsForPath,
    openWorkspaceSettingsTab,
    persistWorkspaceSettings,
    updateDockedWorkspaceForm,
    updateWorkspaceModalForm,
    updateDockedWorkspaceTextDraft,
    updateWorkspaceModalTextDraft,
    deleteWorkspace,
  }
}
