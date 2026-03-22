import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  WORKSPACE_BUNDLE_FILENAME,
  WORKSPACE_LOCK_DIRNAME,
  WORKSPACE_LOCK_FILENAME,
  WORKSPACE_LOCK_HEARTBEAT_INTERVAL_MS,
  WORKSPACE_LOCK_STALE_MS,
  WORKSPACE_CONFIG_FILENAME
} from './constants'
import { appendRuntimeLog, errorMessage } from './logger'
import { isDirectory } from './storageUtils'
import type {
  BarnabyWorkspaceFolder,
  BarnabyWorkspaceFile,
  WorkspaceConfigSettingsPayload,
  WorkspaceLockToken,
  WorkspaceLockAcquireResult,
  WorkspaceTreeOptions
} from './types'

export const workspaceLockInstanceId = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
export const ownedWorkspaceLocks = new Map<string, { lockFilePath: string; acquiredAt: number }>()
let workspaceLockHeartbeatTimer: ReturnType<typeof setInterval> | null = null

export function normalizeRelativePath(p: string) {
  return p.replace(/\\/g, '/')
}

export function resolveWorkspacePath(workspaceRoot: string, relativePath: string) {
  const root = path.resolve(workspaceRoot)
  const safeRelative = relativePath.split('/').filter(Boolean).join(path.sep)
  const target = path.resolve(root, safeRelative)
  const check = path.relative(root, target)
  if (check.startsWith('..') || path.isAbsolute(check)) {
    throw new Error('Path is outside the workspace root.')
  }
  return target
}

export function toWorkspaceRelativePath(workspaceRoot: string, absolutePath: string) {
  const root = path.resolve(workspaceRoot)
  const target = path.resolve(absolutePath)
  const check = path.relative(root, target)
  if (check.startsWith('..') || path.isAbsolute(check)) {
    throw new Error('Path is outside the workspace root.')
  }
  return normalizeRelativePath(check)
}

export function normalizeWorkspaceRoots(raw: unknown, preferredRoot?: string): string[] {
  const roots: string[] = []
  const seen = new Set<string>()
  const pushRoot = (value: unknown) => {
    if (typeof value !== 'string') return
    const trimmed = value.trim()
    if (!trimmed) return
    const resolved = path.resolve(trimmed)
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved
    if (seen.has(key)) return
    seen.add(key)
    roots.push(resolved)
  }
  pushRoot(preferredRoot)
  if (Array.isArray(raw)) {
    for (const item of raw) pushRoot(item)
  } else {
    pushRoot(raw)
  }
  return roots
}

export function isWorkspaceBundlePath(rawPath: string) {
  return path.basename(rawPath).toLowerCase() === WORKSPACE_BUNDLE_FILENAME.toLowerCase()
}

export function defaultWorkspaceConfigSettings(folderPath: string): WorkspaceConfigSettingsPayload {
  return {
    path: folderPath,
    defaultModel: '',
    permissionMode: 'proceed-always',
    sandbox: 'workspace-write',
    workspaceContext: '',
    showWorkspaceContextInPrompt: false,
    systemPrompt: '',
    allowedCommandPrefixes: [],
    allowedAutoReadPrefixes: [],
    allowedAutoWritePrefixes: [],
    deniedAutoReadPrefixes: [],
    deniedAutoWritePrefixes: [],
    cursorAllowBuilds: true,
    promptShortcuts: [],
  }
}

export function resolveWorkspaceRootFromAnyPath(rawPath: string): string {
  const trimmed = typeof rawPath === 'string' ? rawPath.trim() : ''
  if (!trimmed) throw new Error('Workspace path is required.')
  const resolved = path.resolve(trimmed)
  return isWorkspaceBundlePath(resolved) ? path.dirname(resolved) : resolved
}

export function getWorkspaceBundleFilePathForRoot(workspaceRoot: string) {
  return path.join(workspaceRoot, WORKSPACE_BUNDLE_FILENAME)
}

export function normalizeWorkspaceConfigPrefixes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of raw) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result.slice(0, 64)
}

export function sanitizeWorkspaceConfigSettings(folderPath: string, raw: unknown): WorkspaceConfigSettingsPayload {
  const source = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}) ?? {}
  return {
    path: typeof source.path === 'string' && source.path.trim() ? source.path.trim() : folderPath,
    defaultModel: typeof source.defaultModel === 'string' ? source.defaultModel.trim() : '',
    permissionMode: source.permissionMode === 'proceed-always' ? 'proceed-always' : 'verify-first',
    sandbox: source.sandbox === 'read-only' ? 'read-only' : 'workspace-write',
    workspaceContext: typeof source.workspaceContext === 'string' ? source.workspaceContext.trim() : '',
    showWorkspaceContextInPrompt: source.showWorkspaceContextInPrompt === true,
    systemPrompt: typeof source.systemPrompt === 'string' ? source.systemPrompt.trim() : '',
    allowedCommandPrefixes: normalizeWorkspaceConfigPrefixes(source.allowedCommandPrefixes),
    allowedAutoReadPrefixes: normalizeWorkspaceConfigPrefixes(source.allowedAutoReadPrefixes),
    allowedAutoWritePrefixes: normalizeWorkspaceConfigPrefixes(source.allowedAutoWritePrefixes),
    deniedAutoReadPrefixes: normalizeWorkspaceConfigPrefixes(source.deniedAutoReadPrefixes),
    deniedAutoWritePrefixes: normalizeWorkspaceConfigPrefixes(source.deniedAutoWritePrefixes),
    cursorAllowBuilds: source.cursorAllowBuilds === true,
    promptShortcuts: Array.isArray(source.promptShortcuts)
      ? (source.promptShortcuts as unknown[])
          .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          .map((s) => s.slice(0, 80))
          .slice(0, 50)
      : [],
  }
}

export function upsertWorkspaceBundleFolder(
  workspaceRoot: string,
  settings?: WorkspaceConfigSettingsPayload,
): { ok: boolean; workspaceRoot: string; workspaceFilePath: string; error?: string } {
  let resolvedRoot = ''
  try {
    resolvedRoot = resolveWorkspaceRootPath(workspaceRoot)
  } catch (err) {
    return { ok: false, workspaceRoot: path.resolve(workspaceRoot || '.'), workspaceFilePath: '', error: errorMessage(err) }
  }
  const workspaceFilePath = getWorkspaceBundleFilePathForRoot(resolvedRoot)
  const folderSettings = sanitizeWorkspaceConfigSettings(resolvedRoot, settings ?? defaultWorkspaceConfigSettings(resolvedRoot))
  const defaultFolder: BarnabyWorkspaceFolder = {
    id: 'folder-1',
    path: '.',
    name: path.basename(resolvedRoot),
    settings: folderSettings,
  }
  let next: BarnabyWorkspaceFile = {
    version: 1,
    app: 'Barnaby',
    kind: 'workspace',
    savedAt: Date.now(),
    activeFolderId: defaultFolder.id,
    folders: [defaultFolder],
  }
  try {
    if (fs.existsSync(workspaceFilePath)) {
      const raw = fs.readFileSync(workspaceFilePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<BarnabyWorkspaceFile>
      if (parsed && parsed.app === 'Barnaby' && parsed.kind === 'workspace' && Array.isArray(parsed.folders) && parsed.folders.length > 0) {
        const folders = parsed.folders
          .filter((item): item is BarnabyWorkspaceFolder => Boolean(item && typeof item === 'object'))
          .map((item, index) => {
            const itemPath = typeof item.path === 'string' && item.path.trim() ? item.path.trim() : '.'
            const absolute = path.isAbsolute(itemPath) ? path.resolve(itemPath) : path.resolve(resolvedRoot, itemPath)
            const portable = toPortableWorkspacePath(resolvedRoot, absolute)
            return {
              id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `folder-${index + 1}`,
              path: portable,
              name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : path.basename(absolute),
              settings: item.settings && typeof item.settings === 'object'
                ? sanitizeWorkspaceConfigSettings(absolute, item.settings)
                : undefined,
            } as BarnabyWorkspaceFolder
          })
        const rootFolderIndex = folders.findIndex((item) => {
          const absolute = path.isAbsolute(item.path) ? path.resolve(item.path) : path.resolve(resolvedRoot, item.path)
          return path.resolve(absolute) === resolvedRoot
        })
        if (rootFolderIndex >= 0) {
          folders[rootFolderIndex] = {
            ...folders[rootFolderIndex],
            path: '.',
            settings: folderSettings,
          }
        } else {
          folders.unshift(defaultFolder)
        }
        const activeFolderId =
          typeof parsed.activeFolderId === 'string' && parsed.activeFolderId.trim()
            ? parsed.activeFolderId.trim()
            : folders[0]?.id
        next = {
          version: 1,
          app: 'Barnaby',
          kind: 'workspace',
          savedAt: Date.now(),
          activeFolderId,
          folders,
        }
      }
    }
    fs.writeFileSync(workspaceFilePath, `${JSON.stringify(next, null, 2)}
`, 'utf8')
    return { ok: true, workspaceRoot: resolvedRoot, workspaceFilePath }
  } catch (err) {
    return { ok: false, workspaceRoot: resolvedRoot, workspaceFilePath, error: errorMessage(err) }
  }
}

export function toPortableWorkspacePath(anchorRoot: string, workspaceRoot: string): string {
  const relative = path.relative(anchorRoot, workspaceRoot)
  if (!relative) return '.'
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return workspaceRoot
  }
  return relative.replace(/\\/g, '/')
}

export function normalizeRecentWorkspaceFiles(rawList: unknown): string[] {
  if (!Array.isArray(rawList)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of rawList) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed) continue
    let root = ''
    try {
      root = resolveWorkspaceRootFromAnyPath(trimmed)
    } catch {
      continue
    }
    const ensured = upsertWorkspaceBundleFolder(root)
    if (!ensured.ok || !ensured.workspaceFilePath) continue
    const key = process.platform === 'win32' ? ensured.workspaceFilePath.toLowerCase() : ensured.workspaceFilePath
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ensured.workspaceFilePath)
  }
  return out
}

export function readWorkspaceBundleFromRoot(rawRoot: string): { workspaceRoot: string; workspaceList: string[]; sourcePath: string } | null {
  const root = typeof rawRoot === 'string' ? rawRoot.trim() : ''
  if (!root) return null
  let resolvedRoot = ''
  try {
    resolvedRoot = resolveWorkspaceRootPath(root)
  } catch {
    return null
  }
  const sourcePath = path.join(resolvedRoot, WORKSPACE_BUNDLE_FILENAME)
  if (!fs.existsSync(sourcePath)) return null
  try {
    const raw = fs.readFileSync(sourcePath, 'utf8')
    if (!raw.trim()) return null
    const parsed = JSON.parse(raw) as Partial<BarnabyWorkspaceFile>
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.app !== 'Barnaby' || parsed.kind !== 'workspace') return null
    if (!Array.isArray(parsed.folders)) return null
    const folders: BarnabyWorkspaceFolder[] = parsed.folders
      .filter((item): item is BarnabyWorkspaceFolder => Boolean(item && typeof item === 'object'))
      .map((item, index) => {
        const folderPath = typeof item.path === 'string' ? item.path.trim() : ''
        if (!folderPath) return null
        const absolutePath = path.isAbsolute(folderPath)
          ? path.resolve(folderPath)
          : path.resolve(resolvedRoot, folderPath)
        return {
          id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `folder-${index + 1}`,
          name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : undefined,
          path: absolutePath,
        } as BarnabyWorkspaceFolder
      })
      .filter((item): item is BarnabyWorkspaceFolder => Boolean(item))
    if (folders.length === 0) return null
    const activeFolderId = typeof parsed.activeFolderId === 'string' && parsed.activeFolderId.trim()
      ? parsed.activeFolderId.trim()
      : folders[0].id
    const activeFolder = folders.find((item) => item.id === activeFolderId) ?? folders[0]
    const workspaceList = normalizeWorkspaceRoots(folders.map((item) => item.path), activeFolder.path)
    const workspaceRoot = workspaceList[0] ?? activeFolder.path
    return {
      workspaceRoot,
      workspaceList,
      sourcePath,
    }
  } catch (err) {
    appendRuntimeLog('read-workspace-bundle-failed', { root: resolvedRoot, error: errorMessage(err) }, 'warn')
    return null
  }
}

export function extractWorkspaceSelectionFromState(rawState: unknown): { workspaceRoot: string; workspaceList: string[] } {
  if (!rawState || typeof rawState !== 'object') {
    return { workspaceRoot: '', workspaceList: [] }
  }
  const record = rawState as { workspaceRoot?: unknown; workspaceList?: unknown }
  const preferredRoot = typeof record.workspaceRoot === 'string' ? record.workspaceRoot : ''
  const list = normalizeWorkspaceRoots(record.workspaceList, preferredRoot)
  return {
    workspaceRoot: list[0] ?? '',
    workspaceList: list,
  }
}

export function withWorkspaceBundleSelection(rawState: unknown, currentWindowWorkspaceRoot: string): unknown {
  const persisted = extractWorkspaceSelectionFromState(rawState)
  const searchRoots = normalizeWorkspaceRoots(
    [currentWindowWorkspaceRoot, persisted.workspaceRoot, ...persisted.workspaceList],
    '',
  )
  for (const candidate of searchRoots) {
    const loaded = readWorkspaceBundleFromRoot(candidate)
    if (!loaded) continue
    if (rawState && typeof rawState === 'object' && !Array.isArray(rawState)) {
      return {
        ...(rawState as Record<string, unknown>),
        workspaceRoot: loaded.workspaceRoot,
        workspaceList: loaded.workspaceList,
      }
    }
    return {
      version: 1,
      workspaceRoot: loaded.workspaceRoot,
      workspaceList: loaded.workspaceList,
    }
  }
  return rawState
}

export function syncWorkspaceBundleFromState(rawState: unknown): { ok: boolean; path?: string; reason?: string } {
  const selection = extractWorkspaceSelectionFromState(rawState)
  if (!selection.workspaceRoot || selection.workspaceList.length === 0) {
    return { ok: false, reason: 'no-workspace-selection' }
  }
  let anchorRoot = ''
  try {
    anchorRoot = resolveWorkspaceRootPath(selection.workspaceRoot)
  } catch {
    return { ok: false, reason: 'invalid-workspace-root' }
  }
  const folders: BarnabyWorkspaceFolder[] = selection.workspaceList.map((folderPath, index) => ({
    id: `folder-${index + 1}`,
    path: toPortableWorkspacePath(anchorRoot, folderPath),
    name: path.basename(folderPath),
  }))
  const workspace: BarnabyWorkspaceFile = {
    version: 1,
    app: 'Barnaby',
    kind: 'workspace',
    savedAt: Date.now(),
    activeFolderId: folders[0]?.id,
    folders,
  }
  const bundlePath = path.join(anchorRoot, WORKSPACE_BUNDLE_FILENAME)
  const nextRaw = `${JSON.stringify(workspace, null, 2)}
`
  try {
    const existingRaw = fs.existsSync(bundlePath) ? fs.readFileSync(bundlePath, 'utf8') : null
    if (existingRaw === nextRaw) return { ok: true, path: bundlePath }
    fs.writeFileSync(bundlePath, nextRaw, 'utf8')
    return { ok: true, path: bundlePath }
  } catch (err) {
    appendRuntimeLog('write-workspace-bundle-failed', { path: bundlePath, error: errorMessage(err) }, 'warn')
    return { ok: false, reason: 'write-failed' }
  }
}

export function resolveWorkspaceRootPath(workspaceRoot: string) {
  const root = path.resolve(workspaceRoot)
  if (!fs.existsSync(root)) throw new Error('Workspace path does not exist.')
  if (!fs.statSync(root).isDirectory()) throw new Error('Workspace path is not a directory.')
  return root
}

export function getWorkspaceLockFilePath(workspaceRoot: string) {
  return path.join(workspaceRoot, WORKSPACE_LOCK_DIRNAME, WORKSPACE_LOCK_FILENAME)
}

export function readWorkspaceLockToken(lockFilePath: string): WorkspaceLockToken | null {
  try {
    const raw = fs.readFileSync(lockFilePath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<WorkspaceLockToken>
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.app !== 'Barnaby') return null
    if (parsed.version !== 1) return null
    if (typeof parsed.instanceId !== 'string' || !parsed.instanceId.trim()) return null
    if (typeof parsed.pid !== 'number' || !Number.isFinite(parsed.pid) || parsed.pid <= 0) return null
    if (typeof parsed.hostname !== 'string') return null
    if (typeof parsed.workspaceRoot !== 'string' || !parsed.workspaceRoot.trim()) return null
    if (typeof parsed.acquiredAt !== 'number' || !Number.isFinite(parsed.acquiredAt)) return null
    if (typeof parsed.heartbeatAt !== 'number' || !Number.isFinite(parsed.heartbeatAt)) return null
    return {
      version: 1,
      app: 'Barnaby',
      instanceId: parsed.instanceId,
      pid: parsed.pid,
      hostname: parsed.hostname,
      workspaceRoot: parsed.workspaceRoot,
      acquiredAt: parsed.acquiredAt,
      heartbeatAt: parsed.heartbeatAt,
    }
  } catch {
    return null
  }
}

export function isPidLikelyAlive(pid: number) {
  if (!Number.isFinite(pid) || pid <= 0) return false
  if (pid === process.pid) return true
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as { code?: string }).code === 'EPERM'
  }
}

export function isWorkspaceLockOwnedByThisProcess(token: WorkspaceLockToken) {
  return token.instanceId === workspaceLockInstanceId && token.pid === process.pid
}

export function makeWorkspaceLockToken(workspaceRoot: string, acquiredAt?: number, heartbeatAt?: number): WorkspaceLockToken {
  const now = Date.now()
  return {
    version: 1,
    app: 'Barnaby',
    instanceId: workspaceLockInstanceId,
    pid: process.pid,
    hostname: os.hostname(),
    workspaceRoot,
    acquiredAt: acquiredAt ?? now,
    heartbeatAt: heartbeatAt ?? now,
  }
}

export function writeWorkspaceLockToken(lockFilePath: string, token: WorkspaceLockToken, mode: 'exclusive' | 'overwrite') {
  fs.mkdirSync(path.dirname(lockFilePath), { recursive: true })
  fs.writeFileSync(lockFilePath, `${JSON.stringify(token, null, 2)}
`, {
    encoding: 'utf8',
    flag: mode === 'exclusive' ? 'wx' : 'w',
  })
}

export function ensureWorkspaceLockHeartbeatTimer() {
  if (workspaceLockHeartbeatTimer) return
  workspaceLockHeartbeatTimer = setInterval(() => {
    const now = Date.now()
    for (const [workspaceRoot, lockInfo] of ownedWorkspaceLocks) {
      const currentToken = readWorkspaceLockToken(lockInfo.lockFilePath)
      if (currentToken && !isWorkspaceLockOwnedByThisProcess(currentToken)) {
        ownedWorkspaceLocks.delete(workspaceRoot)
        continue
      }
      const nextToken = makeWorkspaceLockToken(workspaceRoot, lockInfo.acquiredAt, now)
      try {
        writeWorkspaceLockToken(lockInfo.lockFilePath, nextToken, 'overwrite')
      } catch {
        // best-effort only; stale locks are recovered by timeout checks
      }
    }
    if (ownedWorkspaceLocks.size === 0 && workspaceLockHeartbeatTimer) {
      clearInterval(workspaceLockHeartbeatTimer)
      workspaceLockHeartbeatTimer = null
    }
  }, WORKSPACE_LOCK_HEARTBEAT_INTERVAL_MS)

  if (typeof workspaceLockHeartbeatTimer.unref === 'function') {
    workspaceLockHeartbeatTimer.unref()
  }
}

export function acquireWorkspaceLock(workspaceRoot: string): WorkspaceLockAcquireResult {
  let root = ''
  try {
    root = resolveWorkspaceRootPath(resolveWorkspaceRootFromAnyPath(workspaceRoot))
  } catch (err) {
    const resolvedPath = path.resolve(workspaceRoot || '.')
    return {
      ok: false,
      reason: 'invalid-workspace',
      message: errorMessage(err),
      workspaceRoot: resolvedPath,
      lockFilePath: getWorkspaceLockFilePath(resolvedPath),
      owner: null,
    }
  }

  const ensuredWorkspace = upsertWorkspaceBundleFolder(root)
  if (!ensuredWorkspace.ok) {
    return {
      ok: false,
      reason: 'error',
      message: ensuredWorkspace.error ?? 'Could not initialize workspace file.',
      workspaceRoot: root,
      lockFilePath: getWorkspaceLockFilePath(root),
      owner: null,
    }
  }

  const lockFilePath = getWorkspaceLockFilePath(root)
  const existingOwned = ownedWorkspaceLocks.get(root)
  if (existingOwned) {
    const refreshedToken = makeWorkspaceLockToken(root, existingOwned.acquiredAt, Date.now())
    try {
      writeWorkspaceLockToken(lockFilePath, refreshedToken, 'overwrite')
    } catch (err) {
      return {
        ok: false,
        reason: 'error',
        message: errorMessage(err),
        workspaceRoot: root,
        lockFilePath,
      }
    }
    return {
      ok: true,
      workspaceRoot: root,
      lockFilePath,
    }
  }

  const nextToken = makeWorkspaceLockToken(root)
  try {
    writeWorkspaceLockToken(lockFilePath, nextToken, 'exclusive')
    ownedWorkspaceLocks.set(root, { lockFilePath, acquiredAt: nextToken.acquiredAt })
    ensureWorkspaceLockHeartbeatTimer()
    return {
      ok: true,
      workspaceRoot: root,
      lockFilePath,
    }
  } catch (err) {
    const existingToken = readWorkspaceLockToken(lockFilePath)
    if (!existingToken) {
      return {
        ok: false,
        reason: 'error',
        message: `Could not acquire lock: ${errorMessage(err)}`,
        workspaceRoot: root,
        lockFilePath,
      }
    }

    if (isWorkspaceLockOwnedByThisProcess(existingToken)) {
      ownedWorkspaceLocks.set(root, { lockFilePath, acquiredAt: existingToken.acquiredAt })
      ensureWorkspaceLockHeartbeatTimer()
      return {
        ok: true,
        workspaceRoot: root,
        lockFilePath,
      }
    }

    const now = Date.now()
    const isStale = now - existingToken.heartbeatAt > WORKSPACE_LOCK_STALE_MS
    const isDead = !isPidLikelyAlive(existingToken.pid) && existingToken.hostname === os.hostname()

    if (isStale || isDead) {
      try {
        writeWorkspaceLockToken(lockFilePath, nextToken, 'overwrite')
        ownedWorkspaceLocks.set(root, { lockFilePath, acquiredAt: nextToken.acquiredAt })
        ensureWorkspaceLockHeartbeatTimer()
        return {
          ok: true,
          workspaceRoot: root,
          lockFilePath,
        }
      } catch (err2) {
        return {
          ok: false,
          reason: 'error',
          message: `Could not recover stale lock: ${errorMessage(err2)}`,
          workspaceRoot: root,
          lockFilePath,
        }
      }
    }

    return {
      ok: false,
      reason: 'in-use',
      message: `Workspace is in use by ${existingToken.hostname} (PID ${existingToken.pid}).`,
      workspaceRoot: root,
      lockFilePath,
      owner: {
        pid: existingToken.pid,
        hostname: existingToken.hostname,
        acquiredAt: existingToken.acquiredAt,
        heartbeatAt: existingToken.heartbeatAt,
      },
    }
  }
}

export function releaseWorkspaceLock(workspaceRoot: string) {
  let root = ''
  try {
    root = resolveWorkspaceRootPath(resolveWorkspaceRootFromAnyPath(workspaceRoot))
  } catch {
    return { ok: false, error: 'Invalid workspace root.' }
  }
  const lockInfo = ownedWorkspaceLocks.get(root)
  if (!lockInfo) return { ok: true }

  ownedWorkspaceLocks.delete(root)
  try {
    const currentToken = readWorkspaceLockToken(lockInfo.lockFilePath)
    if (currentToken && isWorkspaceLockOwnedByThisProcess(currentToken)) {
      fs.unlinkSync(lockInfo.lockFilePath)
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

export function releaseAllWorkspaceLocks() {
  for (const [workspaceRoot] of ownedWorkspaceLocks) {
    releaseWorkspaceLock(workspaceRoot)
  }
}

export function forceClaimWorkspace(workspaceRoot: string) {
  let root = ''
  try {
    root = resolveWorkspaceRootPath(resolveWorkspaceRootFromAnyPath(workspaceRoot))
  } catch (err) {
    const resolvedPath = path.resolve(workspaceRoot || '.')
    return {
      ok: false,
      reason: 'invalid-workspace',
      message: errorMessage(err),
      workspaceRoot: resolvedPath,
      lockFilePath: getWorkspaceLockFilePath(resolvedPath),
      owner: null,
    }
  }

  const lockFilePath = getWorkspaceLockFilePath(root)
  const nextToken = makeWorkspaceLockToken(root)
  try {
    writeWorkspaceLockToken(lockFilePath, nextToken, 'overwrite')
    ownedWorkspaceLocks.set(root, { lockFilePath, acquiredAt: nextToken.acquiredAt })
    ensureWorkspaceLockHeartbeatTimer()
    return {
      ok: true,
      workspaceRoot: root,
      lockFilePath,
    }
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      message: errorMessage(err),
      workspaceRoot: root,
      lockFilePath,
    }
  }
}
