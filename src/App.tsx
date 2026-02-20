import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Group, Panel, Separator } from 'react-resizable-panels'
import React, { useEffect, useMemo, useRef, useState } from 'react'

type Theme = 'light' | 'dark'
type ChatRole = 'user' | 'assistant' | 'system'
type MessageFormat = 'text' | 'markdown'
type ChatMessage = { id: string; role: ChatRole; content: string; format?: MessageFormat }
type PermissionMode = 'verify-first' | 'proceed-always'
type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'

type LayoutMode = 'vertical' | 'horizontal' | 'grid'

type AgentPanelState = {
  id: string
  title: string
  cwd: string
  model: string
  permissionMode: PermissionMode
  sandbox: SandboxMode
  status: string
  connected: boolean
  streaming: boolean
  messages: ChatMessage[]
  input: string
  pendingInputs: string[]
  fontScale: number
  usage?: {
    kind?: string
    primary?: { usedPercent?: number; windowMinutes?: number; resetsAt?: number } | null
    secondary?: { usedPercent?: number; windowMinutes?: number; resetsAt?: number } | null
  }
}

type WorkspaceSettings = {
  path: string
  defaultModel: string
  permissionMode: PermissionMode
  sandbox: SandboxMode
}

type WorkspaceTreeNode = {
  name: string
  relativePath: string
  type: 'file' | 'directory'
  children?: WorkspaceTreeNode[]
}

type GitStatusEntry = {
  relativePath: string
  indexStatus: string
  workingTreeStatus: string
  staged: boolean
  unstaged: boolean
  untracked: boolean
  renamedFrom?: string
}

type GitStatusState = {
  ok: boolean
  branch: string
  ahead: number
  behind: number
  stagedCount: number
  unstagedCount: number
  untrackedCount: number
  clean: boolean
  entries: GitStatusEntry[]
  checkedAt: number
  error?: string
}

type FilePreviewState = {
  relativePath: string
  size: number
  truncated: boolean
  binary: boolean
  content: string
  loading: boolean
  error?: string
}

type ExplorerPrefs = {
  showHiddenFiles: boolean
  showNodeModules: boolean
}

type PanelActivityState = {
  lastEventAt: number
  lastEventLabel: string
  totalEvents: number
  recent?: ActivityFeedItem[]
}

type ActivityKind = 'approval' | 'command' | 'reasoning' | 'event'
type ActivityFeedItem = {
  id: string
  label: string
  detail?: string
  kind: ActivityKind
  at: number
  count: number
}

const DEFAULT_WORKSPACE_ROOT = 'E:\\Retirement\\FIREMe'
const DEFAULT_MODEL = 'gpt-5.3-codex'

type ModelProvider = 'codex' | 'gemini'

type ModelInterface = {
  id: string
  displayName: string
  provider: ModelProvider
  enabled: boolean
  config?: Record<string, string> // e.g. apiKey for Gemini
}

type ModelConfig = {
  interfaces: ModelInterface[]
}

const DEFAULT_MODEL_INTERFACES: ModelInterface[] = [
  { id: 'gpt-5.3-codex', displayName: 'GPT 5.3 (Codex)', provider: 'codex', enabled: true },
  { id: 'gpt-5.2-codex', displayName: 'GPT 5.2 (Codex)', provider: 'codex', enabled: true },
  { id: 'gpt-5.1-codex', displayName: 'GPT 5.1 (Codex)', provider: 'codex', enabled: true },
  { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', provider: 'gemini', enabled: true },
  { id: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', provider: 'gemini', enabled: true },
]

const MAX_PANELS = 5
const MAX_AUTO_CONTINUE = 3

function looksIncomplete(content: string): boolean {
  const t = content.trim().toLowerCase()
  if (!t) return false
  const incompletePhrases = [
    'i\'m about to',
    "i'm about to",
    'about to edit',
    'about to implement',
    'i have a concrete',
    'i\'ll ',
    "i'll ",
    'let me ',
    'i will ',
    'implementing now',
    'implementing the',
    'now and edit',
  ]
  for (const p of incompletePhrases) {
    if (t.includes(p)) return true
  }
  if (t.endsWith('...')) return true
  return false
}
const THEME_STORAGE_KEY = 'agentorchestrator.theme'
const WORKSPACE_STORAGE_KEY = 'agentorchestrator.workspaceRoot'
const WORKSPACE_LIST_STORAGE_KEY = 'agentorchestrator.workspaceList'
const WORKSPACE_SETTINGS_STORAGE_KEY = 'agentorchestrator.workspaceSettings'
const MODEL_CONFIG_STORAGE_KEY = 'agentorchestrator.modelConfig'
const EXPLORER_PREFS_STORAGE_KEY = 'agentorchestrator.explorerPrefsByWorkspace'
const MIN_FONT_SCALE = 0.75
const MAX_FONT_SCALE = 1.5
const FONT_SCALE_STEP = 0.05
const INPUT_MAX_HEIGHT_PX = 220
const DEFAULT_EXPLORER_PREFS: ExplorerPrefs = { showHiddenFiles: false, showNodeModules: false }
const CONNECT_TIMEOUT_MS = 15000
const TURN_START_TIMEOUT_MS = 15000
const STALL_WATCHDOG_MS = 30000

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getInitialTheme(): Theme {
  const stored = (globalThis.localStorage?.getItem(THEME_STORAGE_KEY) ?? '').toLowerCase()
  if (stored === 'light' || stored === 'dark') return stored
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
}

function getInitialWorkspaceRoot() {
  return globalThis.localStorage?.getItem(WORKSPACE_STORAGE_KEY) ?? DEFAULT_WORKSPACE_ROOT
}

function getInitialModelConfig(): ModelConfig {
  try {
    const stored = globalThis.localStorage?.getItem(MODEL_CONFIG_STORAGE_KEY)
    if (!stored) return { interfaces: DEFAULT_MODEL_INTERFACES }
    const parsed = JSON.parse(stored) as ModelConfig
    if (!parsed?.interfaces?.length) return { interfaces: DEFAULT_MODEL_INTERFACES }
    return parsed
  } catch {
    return { interfaces: DEFAULT_MODEL_INTERFACES }
  }
}

function getInitialWorkspaceList(): string[] {
  const root = getInitialWorkspaceRoot()
  try {
    const stored = globalThis.localStorage?.getItem(WORKSPACE_LIST_STORAGE_KEY)
    if (!stored) return [root]
    const list = JSON.parse(stored) as string[]
    if (!Array.isArray(list)) return [root]
    const deduped = [...new Set([root, ...list])]
    return deduped.filter(Boolean)
  } catch {
    return [root]
  }
}

function getConversationPrecis(panel: AgentPanelState): string {
  const firstUser = panel.messages.find((m) => m.role === 'user')
  if (!firstUser?.content?.trim()) return panel.title
  const text = firstUser.content.trim().replace(/\s+/g, ' ')
  const maxLen = 36
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen).trim() + 'Ã¢â‚¬Â¦'
}

function toShortJson(value: unknown, maxLen = 280): string {
  try {
    const s = JSON.stringify(value)
    if (!s) return ''
    return s.length > maxLen ? `${s.slice(0, maxLen)}...` : s
  } catch {
    return String(value ?? '')
  }
}

function pickString(obj: any, keys: string[]): string | null {
  for (const key of keys) {
    const v = obj?.[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

function summarizeRawNotification(method: string, params: any): string | null {
  if (!method) return null

  if (method.endsWith('/requestApproval')) {
    const reason =
      pickString(params, ['reason', 'message', 'description']) ??
      pickString(params?.request, ['reason', 'message', 'description']) ??
      pickString(params?.action, ['reason', 'message', 'description'])
    const command =
      pickString(params, ['command', 'cmd']) ??
      pickString(params?.command, ['command', 'cmd', 'raw']) ??
      pickString(params?.action, ['command', 'cmd'])
    const filePath =
      pickString(params, ['path', 'file']) ??
      pickString(params?.action, ['path', 'file']) ??
      pickString(params?.edit, ['path', 'file'])
    const bits = ['Approval requested']
    if (reason) bits.push(reason)
    if (command) bits.push(`cmd: ${command}`)
    if (filePath) bits.push(`file: ${filePath}`)
    if (!reason && !command && !filePath) bits.push(toShortJson(params))
    return `${bits.join(' | ')}`
  }

  if (method === 'item/completed') {
    const itemType = params?.item?.type
    if (!itemType || itemType === 'agentMessage') return null
    const command =
      pickString(params?.item, ['command', 'cmd']) ??
      pickString(params?.item?.command, ['command', 'cmd', 'raw']) ??
      pickString(params?.item?.input, ['command', 'cmd'])
    const pathLike =
      pickString(params?.item, ['path', 'file']) ??
      pickString(params?.item?.target, ['path', 'file']) ??
      pickString(params?.item?.edit, ['path', 'file'])
    const out = [`Activity: ${itemType}`]
    if (command) out.push(`cmd: ${command}`)
    if (pathLike) out.push(`file: ${pathLike}`)
    return out.join(' | ')
  }

  return null
}

function simplifyCommand(raw: string): string {
  const trimmed = raw.trim()
  const m = trimmed.match(/-Command\s+'([^']+)'/i)
  const reduced = m?.[1]?.trim() || trimmed
  return reduced.length > 140 ? `${reduced.slice(0, 140)}...` : reduced
}

function describeActivityEntry(evt: any): { label: string; detail?: string; kind: ActivityKind } | null {
  if (!evt) return null
  if (evt.type === 'status') {
    return {
      label: `Status: ${String(evt.status ?? 'unknown')}`,
      detail: typeof evt.message === 'string' ? evt.message : undefined,
      kind: 'event',
    }
  }
  if (evt.type === 'assistantCompleted') return { label: 'Turn complete', kind: 'event' }
  if (evt.type === 'rawNotification' && typeof evt.method === 'string') {
    const method = evt.method
    const params = evt.params
    if (method.endsWith('/requestApproval')) {
      return {
        label: 'Approval requested',
        detail: summarizeRawNotification(method, params) ?? undefined,
        kind: 'approval',
      }
    }
    if (/commandExecution/i.test(method)) {
      const cmd =
        pickString(params, ['command', 'cmd']) ??
        pickString(params?.command, ['command', 'cmd', 'raw']) ??
        pickString(params?.action, ['command', 'cmd'])
      return { label: 'Running command', detail: cmd ? simplifyCommand(cmd) : undefined, kind: 'command' }
    }
    if (/reasoning/i.test(method)) return { label: 'Reasoning update', kind: 'reasoning' }
    if (method === 'item/completed') {
      const itemType = params?.item?.type
      if (itemType && itemType !== 'agentMessage') return { label: `Completed ${itemType}`, kind: 'event' }
      return null
    }
    return { label: `Event: ${method}`, detail: toShortJson(params, 140), kind: 'event' }
  }
  if (typeof evt.type === 'string') return { label: evt.type, kind: 'event' }
  return null
}

function shouldSurfaceRawNoteInChat(method: string): boolean {
  if (method.endsWith('/requestApproval')) return true
  return false
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    promise
      .then((v) => {
        clearTimeout(t)
        resolve(v)
      })
      .catch((e) => {
        clearTimeout(t)
        reject(e)
      })
  })
}

function makeDefaultPanel(id: string, cwd: string): AgentPanelState {
  return {
    id,
    title: `Agent ${id.slice(-4)}`,
    cwd,
    model: DEFAULT_MODEL,
    permissionMode: 'verify-first',
    sandbox: 'workspace-write',
    status: 'Not connected',
    connected: false,
    streaming: false,
    messages: [
      {
        id: newId(),
        role: 'system',
        content: `Local agent using ${DEFAULT_MODEL}. Complete all tasks fully. Do not stop after describing a plan - execute the plan. Continue until the work is done.`,
        format: 'text',
      },
    ],
    input: '',
    pendingInputs: [],
    fontScale: 1,
    usage: undefined,
  }
}

function getInitialWorkspaceSettings(list: string[]): Record<string, WorkspaceSettings> {
  try {
    const raw = globalThis.localStorage?.getItem(WORKSPACE_SETTINGS_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, WorkspaceSettings>) : {}
    const result: Record<string, WorkspaceSettings> = { ...parsed }
    for (const p of list) {
      if (!result[p]) {
        result[p] = { path: p, defaultModel: DEFAULT_MODEL, permissionMode: 'verify-first', sandbox: 'workspace-write' }
      }
    }
    return result
  } catch {
    const result: Record<string, WorkspaceSettings> = {}
    for (const p of list) result[p] = { path: p, defaultModel: DEFAULT_MODEL, permissionMode: 'verify-first', sandbox: 'workspace-write' }
    return result
  }
}

function getInitialExplorerPrefsByWorkspace(): Record<string, ExplorerPrefs> {
  try {
    const raw = globalThis.localStorage?.getItem(EXPLORER_PREFS_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, ExplorerPrefs>) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export default function App() {
  const api = useMemo(() => window.agentOrchestrator ?? window.fireharness, [])

  const [theme, setTheme] = useState<Theme>(() => getInitialTheme())
  const [workspaceRoot, setWorkspaceRoot] = useState(() => getInitialWorkspaceRoot())
  const [workspaceList, setWorkspaceList] = useState<string[]>(() => getInitialWorkspaceList())
  const [workspaceSettingsByPath, setWorkspaceSettingsByPath] = useState<Record<string, WorkspaceSettings>>(() =>
    getInitialWorkspaceSettings(getInitialWorkspaceList()),
  )
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false)
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false)
  const [workspaceModalMode, setWorkspaceModalMode] = useState<'new' | 'edit'>('edit')
  const [workspaceForm, setWorkspaceForm] = useState<WorkspaceSettings>({
    path: getInitialWorkspaceRoot(),
    defaultModel: DEFAULT_MODEL,
    permissionMode: 'verify-first',
    sandbox: 'workspace-write',
  })
  const [showThemeModal, setShowThemeModal] = useState(false)
  const [showModelSetupModal, setShowModelSetupModal] = useState(false)
  const [modelConfig, setModelConfig] = useState<ModelConfig>(() => getInitialModelConfig())
  const [editingModel, setEditingModel] = useState<ModelInterface | null>(null)
  const [modelForm, setModelForm] = useState<ModelInterface>({
    id: '',
    displayName: '',
    provider: 'codex',
    enabled: true,
  })
  const [dockTab, setDockTab] = useState<'explorer' | 'git'>('explorer')
  const [workspaceTree, setWorkspaceTree] = useState<WorkspaceTreeNode[]>([])
  const [workspaceTreeLoading, setWorkspaceTreeLoading] = useState(false)
  const [workspaceTreeError, setWorkspaceTreeError] = useState<string | null>(null)
  const [workspaceTreeTruncated, setWorkspaceTreeTruncated] = useState(false)
  const [expandedDirectories, setExpandedDirectories] = useState<Record<string, boolean>>({})
  const [explorerPrefsByWorkspace, setExplorerPrefsByWorkspace] = useState<Record<string, ExplorerPrefs>>(
    () => getInitialExplorerPrefsByWorkspace(),
  )
  const [showHiddenFiles, setShowHiddenFiles] = useState(false)
  const [showNodeModules, setShowNodeModules] = useState(false)
  const [gitStatus, setGitStatus] = useState<GitStatusState | null>(null)
  const [gitStatusLoading, setGitStatusLoading] = useState(false)
  const [gitStatusError, setGitStatusError] = useState<string | null>(null)
  const [filePreview, setFilePreview] = useState<FilePreviewState | null>(null)
  const [panelActivityById, setPanelActivityById] = useState<Record<string, PanelActivityState>>({})
  const [activityClock, setActivityClock] = useState(() => Date.now())
  const [activityOpenByPanel, setActivityOpenByPanel] = useState<Record<string, boolean>>({})

  const modelList = modelConfig.interfaces.filter((m) => m.enabled).map((m) => m.id)
  function getModelOptions(includeCurrent?: string): string[] {
    const base = [...modelList]
    if (includeCurrent && !base.includes(includeCurrent)) base.push(includeCurrent)
    return base
  }

  const layoutRef = useRef<HTMLDivElement | null>(null)
  const deltaBuffers = useRef(new Map<string, string>())
  const flushTimers = useRef(new Map<string, any>())
  const autoContinueCountRef = useRef(new Map<string, number>())
  const textareaRefs = useRef(new Map<string, HTMLTextAreaElement>())
  const messageViewportRefs = useRef(new Map<string, HTMLDivElement>())
  const activityLatestRef = useRef(new Map<string, PanelActivityState>())
  const activityFlushTimers = useRef(new Map<string, any>())
  const panelsRef = useRef<AgentPanelState[]>([])
  const reconnectingRef = useRef(new Set<string>())

  const [layoutMode, setLayoutMode] = useState<LayoutMode>('vertical')
  const [panels, setPanels] = useState<AgentPanelState[]>(() => [
    makeDefaultPanel('default', getInitialWorkspaceRoot()),
  ])
  const [activePanelId, setActivePanelId] = useState<string>('default')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, workspaceRoot)
  }, [workspaceRoot])

  useEffect(() => {
    localStorage.setItem(WORKSPACE_LIST_STORAGE_KEY, JSON.stringify(workspaceList))
    api.setRecentWorkspaces?.(workspaceList)
  }, [workspaceList, api])

  useEffect(() => {
    localStorage.setItem(WORKSPACE_SETTINGS_STORAGE_KEY, JSON.stringify(workspaceSettingsByPath))
  }, [workspaceSettingsByPath])

  useEffect(() => {
    localStorage.setItem(MODEL_CONFIG_STORAGE_KEY, JSON.stringify(modelConfig))
  }, [modelConfig])

  useEffect(() => {
    localStorage.setItem(EXPLORER_PREFS_STORAGE_KEY, JSON.stringify(explorerPrefsByWorkspace))
  }, [explorerPrefsByWorkspace])

  // Keep workspaceRoot in the list when it changes (e.g. manually selected)
  useEffect(() => {
    if (!workspaceRoot || workspaceList.includes(workspaceRoot)) return
    setWorkspaceList((prev) => [...new Set([workspaceRoot, ...prev])])
  }, [workspaceRoot])

  useEffect(() => {
    const ws = workspaceSettingsByPath[workspaceRoot]
    if (!ws) return
    setPanels((prev) =>
      prev.map((p) => ({
        ...p,
        cwd: workspaceRoot,
        model: ws.defaultModel,
        permissionMode: ws.permissionMode,
      })),
    )
  }, [workspaceRoot, workspaceSettingsByPath])

  useEffect(() => {
    if (panels.length === 0) return
    if (!panels.some((p) => p.id === activePanelId)) {
      setActivePanelId(panels[0].id)
    }
  }, [panels, activePanelId])

  useEffect(() => {
    panelsRef.current = panels
  }, [panels])

  useEffect(() => {
    for (const p of panels) {
      const viewport = messageViewportRefs.current.get(p.id)
      if (!viewport) continue
      viewport.scrollTop = viewport.scrollHeight
    }
  }, [panels])

  useEffect(() => {
    const prefs = explorerPrefsByWorkspace[workspaceRoot] ?? DEFAULT_EXPLORER_PREFS
    setShowHiddenFiles(prefs.showHiddenFiles)
    setShowNodeModules(prefs.showNodeModules)
    setExpandedDirectories({})
    setFilePreview(null)
    void refreshWorkspaceTree(prefs)
    void refreshGitStatus()
  }, [workspaceRoot, api])

  useEffect(() => {
    setExpandedDirectories({})
    void refreshWorkspaceTree()
  }, [showHiddenFiles, showNodeModules])

  useEffect(() => {
    const t = setInterval(() => setActivityClock(Date.now()), 1500)
    return () => clearInterval(t)
  }, [])

  useEffect(
    () => () => {
      for (const t of activityFlushTimers.current.values()) clearTimeout(t)
      activityFlushTimers.current.clear()
    },
    [],
  )

  function applyWorkspaceRoot(nextRoot: string) {
    if (!nextRoot) return
    setWorkspaceRoot(nextRoot)
    // Workspace is central: propagate to all panels and force reconnect on next send.
    setPanels((prev) =>
      prev.map((p) => ({
        ...p,
        cwd: nextRoot,
        connected: false,
        status: 'Workspace changed. Reconnect on next send.',
      })),
    )
  }

  function registerTextarea(panelId: string, el: HTMLTextAreaElement | null) {
    if (!el) {
      textareaRefs.current.delete(panelId)
      return
    }
    textareaRefs.current.set(panelId, el)
    queueMicrotask(() => autoResizeTextarea(panelId))
  }

  function registerMessageViewport(panelId: string, el: HTMLDivElement | null) {
    if (!el) {
      messageViewportRefs.current.delete(panelId)
      return
    }
    messageViewportRefs.current.set(panelId, el)
  }

  function autoResizeTextarea(panelId: string) {
    const el = textareaRefs.current.get(panelId)
    if (!el) return
    el.style.height = 'auto'
    const nextHeight = Math.min(el.scrollHeight, INPUT_MAX_HEIGHT_PX)
    el.style.height = `${nextHeight}px`
    el.style.overflowY = el.scrollHeight > INPUT_MAX_HEIGHT_PX ? 'auto' : 'hidden'
  }

  function zoomPanelFont(panelId: string, deltaY: number) {
    const direction = deltaY < 0 ? 1 : -1
    setPanels((prev) =>
      prev.map((p) =>
        p.id === panelId
          ? {
              ...p,
              fontScale: Math.max(
                MIN_FONT_SCALE,
                Math.min(MAX_FONT_SCALE, Number((p.fontScale + direction * FONT_SCALE_STEP).toFixed(2))),
              ),
            }
          : p,
      ),
    )
  }

  async function browseForWorkspaceIntoForm() {
    const path = await api.openFolderDialog?.()
    if (!path) return
    setWorkspaceForm((prev) => ({ ...prev, path }))
  }

  function openWorkspaceSettings(mode: 'new' | 'edit') {
    const current =
      workspaceSettingsByPath[workspaceRoot] ??
      ({ path: workspaceRoot, defaultModel: DEFAULT_MODEL, permissionMode: 'verify-first', sandbox: 'workspace-write' } as WorkspaceSettings)
    setWorkspaceModalMode(mode)
    setWorkspaceForm(
      mode === 'new'
        ? {
            path: workspaceRoot,
            defaultModel: current.defaultModel ?? DEFAULT_MODEL,
            permissionMode: current.permissionMode ?? 'verify-first',
            sandbox: current.sandbox ?? 'workspace-write',
          }
        : current,
    )
    setShowWorkspaceModal(true)
  }

  async function saveWorkspaceSettings() {
    const next = {
      path: workspaceForm.path.trim(),
      defaultModel: workspaceForm.defaultModel.trim() || DEFAULT_MODEL,
      permissionMode: workspaceForm.permissionMode,
      sandbox: workspaceForm.sandbox,
    } satisfies WorkspaceSettings
    if (!next.path) return

    try {
      await api.writeWorkspaceConfig?.(next.path)
    } catch {
      // best-effort only
    }

    setWorkspaceSettingsByPath((prev) => ({ ...prev, [next.path]: next }))
    setWorkspaceList((prev) => (prev.includes(next.path) ? prev : [next.path, ...prev]))
    applyWorkspaceRoot(next.path)
    setShowWorkspaceModal(false)
  }

  function deleteWorkspace(pathToDelete: string) {
    const remaining = workspaceList.filter((p) => p !== pathToDelete)
    setWorkspaceList(remaining)
    setWorkspaceSettingsByPath((prev) => {
      const next = { ...prev }
      delete next[pathToDelete]
      return next
    })
    if (workspaceRoot === pathToDelete) {
      if (remaining.length > 0) applyWorkspaceRoot(remaining[0])
      else setWorkspaceRoot('')
    }
    setShowWorkspaceModal(false)
  }


  function flushWindowDelta(agentWindowId: string) {
    const buf = deltaBuffers.current.get(agentWindowId) ?? ''
    if (!buf) return
    deltaBuffers.current.set(agentWindowId, '')

    setPanels((prev) =>
      prev.map((w) => {
        if (w.id !== agentWindowId) return w
        const msgs = w.messages
        const last = msgs[msgs.length - 1]
        if (last && last.role === 'assistant') {
          return { ...w, streaming: true, messages: [...msgs.slice(0, -1), { ...last, content: last.content + buf }] }
        }
        return {
          ...w,
          streaming: true,
          messages: [...msgs, { id: newId(), role: 'assistant', content: buf, format: 'text' }],
        }
      }),
    )
  }

  function queueDelta(agentWindowId: string, delta: string) {
    deltaBuffers.current.set(agentWindowId, (deltaBuffers.current.get(agentWindowId) ?? '') + delta)
    if (flushTimers.current.has(agentWindowId)) return
    // Quick win: buffer high-frequency deltas, flush ~30fps.
    const t = setTimeout(() => {
      flushTimers.current.delete(agentWindowId)
      flushWindowDelta(agentWindowId)
    }, 33)
    flushTimers.current.set(agentWindowId, t)
  }

  function describeIncomingEvent(evt: any): string {
    if (!evt) return 'event'
    if (evt.type === 'rawNotification' && typeof evt.method === 'string') return evt.method
    if (typeof evt.type === 'string') return evt.type
    return 'event'
  }

  function markPanelActivity(agentWindowId: string, evt: any) {
    const prev = activityLatestRef.current.get(agentWindowId)
    const entry = describeActivityEntry(evt)
    let recent = [...(prev?.recent ?? [])]
    if (entry) {
      const now = Date.now()
      const top = recent[0]
      if (top && top.label === entry.label && top.detail === entry.detail && now - top.at < 4000) {
        recent[0] = { ...top, at: now, count: top.count + 1 }
      } else {
        recent.unshift({ id: newId(), label: entry.label, detail: entry.detail, kind: entry.kind, at: now, count: 1 })
      }
      recent = recent.slice(0, 10)
    }
    const next: PanelActivityState = {
      lastEventAt: Date.now(),
      lastEventLabel: entry?.label ?? describeIncomingEvent(evt),
      totalEvents: (prev?.totalEvents ?? 0) + 1,
      recent,
    }
    activityLatestRef.current.set(agentWindowId, next)
    if (activityFlushTimers.current.has(agentWindowId)) return
    const t = setTimeout(() => {
      activityFlushTimers.current.delete(agentWindowId)
      const snapshot = activityLatestRef.current.get(agentWindowId)
      if (!snapshot) return
      setPanelActivityById((prevState) => ({ ...prevState, [agentWindowId]: snapshot }))
    }, 180)
    activityFlushTimers.current.set(agentWindowId, t)
  }

  useEffect(() => {
    const unsubEvent = api.onEvent(({ agentWindowId, evt }: any) => {
      if (!agentWindowId) agentWindowId = 'default'
      markPanelActivity(agentWindowId, evt)

      if (evt?.type === 'status') {
        setPanels((prev) =>
          prev.map((w) =>
            w.id !== agentWindowId
              ? w
              : {
                  ...w,
                  status: evt.message ?? evt.status,
                  connected: evt.status === 'ready',
                  streaming: evt.status === 'closed' ? false : w.streaming,
                },
          ),
        )
        if (evt.status === 'closed') {
          queueMicrotask(() => kickQueuedMessage(agentWindowId))
        }
        return
      }

      if (evt?.type === 'assistantDelta') {
        queueDelta(agentWindowId, String(evt.delta ?? ''))
        return
      }

      if (evt?.type === 'assistantCompleted') {
        flushWindowDelta(agentWindowId)
        setPanels((prev) =>
          prev.map((w) => {
            if (w.id !== agentWindowId) return w
            const msgs = w.messages
            const last = msgs[msgs.length - 1]
            if (!last || last.role !== 'assistant') return { ...w, streaming: false }
            let pendingInputs: string[] = w.pendingInputs
            let nextMessages: ChatMessage[] = [...msgs.slice(0, -1), { ...last, format: 'markdown' as const }]
            if (looksIncomplete(last.content)) {
              const count = autoContinueCountRef.current.get(agentWindowId) ?? 0
              if (count < MAX_AUTO_CONTINUE && w.pendingInputs.length === 0) {
                autoContinueCountRef.current.set(agentWindowId, count + 1)
                const autoPrompt = 'Please continue from where you left off. Complete the task fully.'
                pendingInputs = [...w.pendingInputs, autoPrompt]
                nextMessages = [...nextMessages, { id: newId(), role: 'user', content: autoPrompt, format: 'text' as const }]
              }
            } else {
              autoContinueCountRef.current.delete(agentWindowId)
            }
            return { ...w, streaming: false, pendingInputs, messages: nextMessages }
          }),
        )
        queueMicrotask(() => kickQueuedMessage(agentWindowId))
      }

      if (evt?.type === 'usageUpdated') {
        setPanels((prev) =>
          prev.map((w) => (w.id === agentWindowId ? { ...w, usage: evt.usage } : w)),
        )
        return
      }

      if (evt?.type === 'rawNotification') {
        const method = String(evt.method ?? '')
        const note = summarizeRawNotification(method, evt.params)
        if (!note) return
        if (!shouldSurfaceRawNoteInChat(method)) return
        setPanels((prev) =>
          prev.map((w) =>
            w.id !== agentWindowId
              ? w
              : {
                  ...w,
                  messages: [...w.messages, { id: newId(), role: 'system', content: note, format: 'text' }],
                },
          ),
        )
      }
    })

    const unsubMenu = api.onMenu?.((msg: { action: string; path?: string }) => {
      const { action, path: actionPath } = msg
      if (action === 'newAgentWindow') {
        createAgentPanel()
        return
      }
      if (action === 'newWorkspace') {
        openWorkspaceSettings('new')
        return
      }
      if (action === 'openWorkspacePicker') {
        setShowWorkspacePicker(true)
        return
      }
      if (action === 'openWorkspace' && typeof actionPath === 'string') {
        applyWorkspaceRoot(actionPath)
        setShowWorkspacePicker(false)
        return
      }
      if (action === 'closeWorkspace') {
        if (workspaceList.length <= 1) return
        deleteWorkspace(workspaceRoot)
        return
      }
      if (action === 'openThemeModal') {
        setShowThemeModal(true)
        return
      }
      if (action === 'openModelSetup') {
        setShowModelSetupModal(true)
        return
      }
      if (action === 'layoutVertical') setLayoutMode('vertical')
      if (action === 'layoutHorizontal') setLayoutMode('horizontal')
      if (action === 'layoutGrid') setLayoutMode('grid')
    })

    return () => {
      unsubEvent?.()
      unsubMenu?.()
    }
  }, [api, workspaceList, workspaceRoot])

  function formatRateLimitLabel(usage: AgentPanelState['usage']) {
    const p = usage?.primary
    if (!p || typeof p.usedPercent !== 'number') return null
    const used = Math.max(0, Math.min(100, p.usedPercent))
    const left = 100 - used
    const windowMinutes = typeof p.windowMinutes === 'number' ? p.windowMinutes : null
    const windowLabel = windowMinutes === 300 ? '5h' : windowMinutes ? `${Math.round(windowMinutes / 60)}h` : null
    return `${windowLabel ? `${windowLabel} ` : ''}${left}% left`
  }

  function getRateLimitPercent(usage: AgentPanelState['usage']) {
    const p = usage?.primary
    if (!p || typeof p.usedPercent !== 'number') return null
    return Math.max(0, Math.min(100, p.usedPercent))
  }

  function sandboxModeDescription(mode: SandboxMode) {
    if (mode === 'read-only') return 'Read project files only; no file edits or shell writes.'
    if (mode === 'workspace-write') return 'Can edit files and run commands inside the workspace folder.'
    return 'Full access to your machine. Use only when necessary.'
  }

  function formatError(err: unknown) {
    if (err instanceof Error && err.message) return err.message
    return String(err ?? 'Unknown error')
  }

  async function refreshWorkspaceTree(prefs?: ExplorerPrefs) {
    if (!workspaceRoot) {
      setWorkspaceTree([])
      setWorkspaceTreeTruncated(false)
      setWorkspaceTreeError(null)
      return
    }
    const effectivePrefs = prefs ?? { showHiddenFiles, showNodeModules }
    setWorkspaceTreeLoading(true)
    setWorkspaceTreeError(null)
    try {
      const result = await api.listWorkspaceTree(workspaceRoot, {
        includeHidden: effectivePrefs.showHiddenFiles,
        includeNodeModules: effectivePrefs.showNodeModules,
      })
      setWorkspaceTree(result?.nodes ?? [])
      setWorkspaceTreeTruncated(Boolean(result?.truncated))
    } catch (err) {
      setWorkspaceTree([])
      setWorkspaceTreeTruncated(false)
      setWorkspaceTreeError(formatError(err))
    } finally {
      setWorkspaceTreeLoading(false)
    }
  }

  async function refreshGitStatus() {
    if (!workspaceRoot) {
      setGitStatus(null)
      setGitStatusError(null)
      return
    }
    setGitStatusLoading(true)
    setGitStatusError(null)
    try {
      const result = await api.getGitStatus(workspaceRoot)
      setGitStatus(result)
      setGitStatusError(result.ok ? null : result.error ?? 'Unable to load git status.')
    } catch (err) {
      setGitStatus(null)
      setGitStatusError(formatError(err))
    } finally {
      setGitStatusLoading(false)
    }
  }

  function setExplorerPrefs(next: ExplorerPrefs) {
    setShowHiddenFiles(next.showHiddenFiles)
    setShowNodeModules(next.showNodeModules)
    if (!workspaceRoot) return
    setExplorerPrefsByWorkspace((prev) => ({ ...prev, [workspaceRoot]: next }))
  }

  async function openFilePreview(relativePath: string) {
    setFilePreview({
      relativePath,
      size: 0,
      truncated: false,
      binary: false,
      content: '',
      loading: true,
    })
    try {
      const result = await api.readWorkspaceFile(workspaceRoot, relativePath)
      setFilePreview({
        relativePath: result.relativePath,
        size: result.size,
        truncated: result.truncated,
        binary: result.binary,
        content: result.content,
        loading: false,
      })
    } catch (err) {
      setFilePreview({
        relativePath,
        size: 0,
        truncated: false,
        binary: false,
        content: '',
        loading: false,
        error: formatError(err),
      })
    }
  }

  function toggleDirectory(relativePath: string) {
    setExpandedDirectories((prev) => ({ ...prev, [relativePath]: !prev[relativePath] }))
  }

  function isDirectoryExpanded(relativePath: string, depth: number) {
    if (relativePath in expandedDirectories) return Boolean(expandedDirectories[relativePath])
    return depth < 1
  }

  function collectDirectoryPaths(nodes: WorkspaceTreeNode[]): string[] {
    const paths: string[] = []
    const walk = (items: WorkspaceTreeNode[]) => {
      for (const item of items) {
        if (item.type !== 'directory') continue
        paths.push(item.relativePath)
        if (item.children?.length) walk(item.children)
      }
    }
    walk(nodes)
    return paths
  }

  function expandAllDirectories() {
    const next: Record<string, boolean> = {}
    for (const relativePath of collectDirectoryPaths(workspaceTree)) {
      next[relativePath] = true
    }
    setExpandedDirectories(next)
  }

  function collapseAllDirectories() {
    const next: Record<string, boolean> = {}
    for (const relativePath of collectDirectoryPaths(workspaceTree)) {
      next[relativePath] = false
    }
    setExpandedDirectories(next)
  }

  function gitStatusText(entry: GitStatusEntry) {
    if (entry.untracked) return '??'
    return `${entry.indexStatus}${entry.workingTreeStatus}`
  }

  function gitEntryClass(entry: GitStatusEntry) {
    if (entry.untracked) return 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200'
    if (entry.staged && entry.unstaged) return 'bg-purple-100 text-purple-900 dark:bg-purple-900/30 dark:text-purple-200'
    if (entry.staged) return 'bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200'
    if (entry.unstaged) return 'bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-200'
    return 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100'
  }

  function formatCheckedAt(ts?: number) {
    if (!ts) return 'Never'
    const dt = new Date(ts)
    return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function createAgentPanel() {
    setPanels((prev) => {
      if (prev.length >= MAX_PANELS) return prev
      const id = newId()
      const ws = workspaceSettingsByPath[workspaceRoot]
      const p = makeDefaultPanel(id, workspaceRoot)
      if (ws) {
        p.model = ws.defaultModel
        p.permissionMode = ws.permissionMode
        p.sandbox = ws.sandbox
      }
      return [...prev, p]
    })
  }

  function renderGridLayout() {
    const n = panels.length
    const cols = Math.ceil(Math.sqrt(n))
    const rows = Math.ceil(n / cols)
    const panelChunks: AgentPanelState[][] = []
    for (let r = 0; r < rows; r++) {
      const start = r * cols
      panelChunks.push(panels.slice(start, start + cols))
    }
    return (
      <Group orientation="vertical" className="flex-1 min-h-0 min-w-0" id="grid-outer">
        {panelChunks.map((rowPanels, rowIdx) => (
          <React.Fragment key={rowIdx}>
            {rowIdx > 0 && <Separator className="h-1 bg-neutral-300 dark:bg-neutral-700 hover:bg-blue-400 data-[resize-handle-active]:bg-blue-500" />}
            <Panel id={`grid-row-${rowIdx}`} defaultSize={100 / rows} minSize={10} className="min-h-0 min-w-0">
              <Group orientation="horizontal" className="h-full min-w-0" id={`grid-row-${rowIdx}-inner`}>
                {rowPanels.map((w, colIdx) => (
                  <React.Fragment key={w.id}>
                    {colIdx > 0 && <Separator className="w-1 bg-neutral-300 dark:bg-neutral-700 hover:bg-blue-400" />}
                    <Panel id={`panel-${w.id}`} defaultSize={100 / rowPanels.length} minSize={15} className="min-h-0 min-w-0">
                      {renderPanelContent(w)}
                    </Panel>
                  </React.Fragment>
                ))}
              </Group>
            </Panel>
          </React.Fragment>
        ))}
      </Group>
    )
  }

  async function connectWindow(
    winId: string,
    model: string,
    cwd: string,
    permissionMode: PermissionMode,
    sandbox: SandboxMode,
  ) {
    const mi = modelConfig.interfaces.find((m) => m.id === model)
    await withTimeout(
      api.connect(winId, {
        model,
        cwd,
        permissionMode,
        approvalPolicy: permissionMode === 'proceed-always' ? 'never' : 'on-request',
        sandbox,
        provider: mi?.provider ?? 'codex',
        modelConfig: mi?.config,
      }),
      CONNECT_TIMEOUT_MS,
      'connect',
    )
  }

  async function reconnectPanel(winId: string, reason: string) {
    if (reconnectingRef.current.has(winId)) return
    const w = panelsRef.current.find((x) => x.id === winId)
    if (!w) return
    reconnectingRef.current.add(winId)
    setPanels((prev) =>
      prev.map((p) =>
        p.id !== winId
          ? p
          : {
              ...p,
              connected: false,
              streaming: false,
              status: `Reconnecting: ${reason}`,
            },
      ),
    )
    try {
      await connectWindow(winId, w.model, w.cwd, w.permissionMode, w.sandbox)
      setPanels((prev) =>
        prev.map((p) =>
          p.id !== winId
            ? p
            : {
                ...p,
                status: 'Reconnected.',
              },
        ),
      )
      queueMicrotask(() => kickQueuedMessage(winId))
    } catch (e) {
      const errMsg = formatConnectionError(e)
      setPanels((prev) =>
        prev.map((p) =>
          p.id !== winId
            ? p
            : {
                ...p,
                connected: false,
                streaming: false,
                status: 'Reconnect failed',
                messages: [...p.messages, { id: newId(), role: 'system', content: errMsg, format: 'text' }],
              },
        ),
      )
    } finally {
      reconnectingRef.current.delete(winId)
    }
  }

  async function connectWindowWithRetry(
    winId: string,
    model: string,
    cwd: string,
    permissionMode: PermissionMode,
    sandbox: SandboxMode,
  ) {
    try {
      await connectWindow(winId, model, cwd, permissionMode, sandbox)
      return
    } catch {
      await connectWindow(winId, model, cwd, permissionMode, sandbox)
    }
  }

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const current = panelsRef.current
      for (const p of current) {
        if (!p.streaming) continue
        const activity = panelActivityById[p.id]
        if (!activity) continue
        if (now - activity.lastEventAt < STALL_WATCHDOG_MS) continue
        void reconnectPanel(p.id, 'turn appears stalled')
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [panelActivityById])

  function formatConnectionError(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('codex app-server closed') || msg.includes('codex app-server')) {
      return [
        'Codex disconnected. Common causes:',
        '- Run `codex app-server` in a terminal to check for errors',
        '- Ensure logged in: `codex auth`',
        '- Try using fewer panels (each uses a separate Codex process)',
        'Send another message to reconnect.',
      ].join('\n')
    }
    if (msg.includes('Not connected') || msg.includes('closed')) {
      return `${msg}\n\nSend another message to reconnect.`
    }
    return `Error: ${msg}`
  }

  async function sendToAgent(winId: string, text: string) {
    const w = panels.find((x) => x.id === winId)
    if (!w) return
    try {
      if (!w.connected) await connectWindowWithRetry(winId, w.model, w.cwd, w.permissionMode, w.sandbox)
      await withTimeout(api.sendMessage(winId, text), TURN_START_TIMEOUT_MS, 'turn/start')
    } catch (e: any) {
      const errMsg = formatConnectionError(e)
      setPanels((prev) =>
        prev.map((x) =>
          x.id !== winId
            ? x
            : {
                ...x,
                streaming: false,
                connected: false,
                status: 'Disconnected',
                messages: [...x.messages, { id: newId(), role: 'system', content: errMsg, format: 'text' }],
              },
        ),
      )
    }
  }

  function kickQueuedMessage(winId: string) {
    let nextText = ''
    setPanels((prev) =>
      prev.map((x) => {
        if (x.id !== winId) return x
        if (x.streaming || x.pendingInputs.length === 0) return x
        const [head, ...rest] = x.pendingInputs
        nextText = head
        return { ...x, streaming: true, pendingInputs: rest }
      }),
    )
    if (nextText) void sendToAgent(winId, nextText)
  }

  function sendMessage(winId: string) {
    const w = panels.find((x) => x.id === winId)
    if (!w) return
    const text = w.input.trim()
    if (!text) return

    let sendNow = false
    setPanels((prev) =>
      prev.map((x) => {
        if (x.id !== winId) return x
        const isBusy = x.streaming || x.pendingInputs.length > 0
        if (isBusy) {
          return {
            ...x,
            input: '',
            pendingInputs: [...x.pendingInputs, text],
            messages: [...x.messages, { id: newId(), role: 'user', content: text, format: 'text' }],
          }
        }
        sendNow = true
        return {
          ...x,
          input: '',
          streaming: true,
          messages: [...x.messages, { id: newId(), role: 'user', content: text, format: 'text' }],
        }
      }),
    )

    if (sendNow) void sendToAgent(winId, text)
  }

  async function closePanel(panelId: string) {
    await api.disconnect(panelId).catch(() => {})
    setPanels((prev) => prev.filter((w) => w.id !== panelId))
  }

  async function switchModel(winId: string, nextModel: string) {
    setPanels((prev) =>
      prev.map((w) =>
        w.id !== winId
          ? w
          : {
              ...w,
              model: nextModel,
              connected: false,
              status: 'Switching model...',
              messages: [...w.messages, { id: newId(), role: 'system', content: `Switching model to ${nextModel}...`, format: 'text' }],
            },
      ),
    )
    const panel = panels.find((p) => p.id === winId)
    const permissionMode = panel?.permissionMode ?? 'verify-first'
    const sandbox = panel?.sandbox ?? 'workspace-write'
    try {
      await connectWindow(winId, nextModel, workspaceRoot, permissionMode, sandbox)
      setPanels((prev) =>
        prev.map((w) => {
          if (w.id !== winId) return w
          const msgs = [...w.messages, { id: newId(), role: 'system' as const, content: `Connected with ${nextModel}.`, format: 'text' as const }]
          if (msgs[0]?.role === 'system') msgs[0] = { ...msgs[0], content: `Local agent using ${nextModel}. Complete all tasks fully. Do not stop after describing a plan - execute the plan. Continue until the work is done.` }
          return { ...w, cwd: workspaceRoot, messages: msgs }
        }),
      )
    } catch (e) {
      const errMsg = formatConnectionError(e)
      setPanels((prev) =>
        prev.map((w) =>
          w.id !== winId ? w : { ...w, status: 'Disconnected', messages: [...w.messages, { id: newId(), role: 'system' as const, content: errMsg, format: 'text' as const }] },
        ),
      )
    }
  }

  function renderExplorerNode(node: WorkspaceTreeNode, depth = 0): React.ReactNode {
    const rowPadding = 8 + depth * 14
    if (node.type === 'file') {
      const selected = filePreview?.relativePath === node.relativePath
      return (
        <button
          key={node.relativePath}
          type="button"
          className={`w-full text-left py-1.5 pr-2 rounded text-xs font-mono flex items-center gap-2 truncate ${
            selected
              ? 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100'
              : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
          }`}
          style={{ paddingLeft: `${rowPadding}px` }}
          onClick={() => openFilePreview(node.relativePath)}
          title={node.relativePath}
        >
          <span className="text-neutral-400">*</span>
          <span className="truncate">{node.name}</span>
        </button>
      )
    }

    const expanded = isDirectoryExpanded(node.relativePath, depth)
    return (
      <div key={node.relativePath}>
        <button
          type="button"
          className="w-full text-left py-1.5 pr-2 rounded text-xs font-mono flex items-center gap-2 truncate hover:bg-neutral-100 dark:hover:bg-neutral-800"
          style={{ paddingLeft: `${rowPadding}px` }}
          onClick={() => toggleDirectory(node.relativePath)}
          title={node.relativePath}
        >
          <span className="w-3 text-neutral-500">{expanded ? '-' : '+'}</span>
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {expanded && node.children?.map((child) => renderExplorerNode(child, depth + 1))}
      </div>
    )
  }

  function renderExplorerPane() {
    return (
      <div className="h-full min-h-0 flex flex-col bg-white dark:bg-neutral-950">
        <div className="px-3 py-3 border-b border-neutral-200/80 dark:border-neutral-800 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-neutral-700 dark:text-neutral-300">Workspace files</span>
            <button
              type="button"
              className="px-2.5 py-1 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
              onClick={() => refreshWorkspaceTree()}
            >
              Refresh
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <label className="inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-400">
              <input
                type="checkbox"
                checked={showHiddenFiles}
                onChange={(e) =>
                  setExplorerPrefs({
                    showHiddenFiles: e.target.checked,
                    showNodeModules,
                  })
                }
              />
              Hidden
            </label>
            <label className="inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-400">
              <input
                type="checkbox"
                checked={showNodeModules}
                onChange={(e) =>
                  setExplorerPrefs({
                    showHiddenFiles,
                    showNodeModules: e.target.checked,
                  })
                }
              />
              node_modules
            </label>
            <button
              type="button"
              className="px-2 py-0.5 rounded border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
              onClick={expandAllDirectories}
            >
              Expand all
            </button>
            <button
              type="button"
              className="px-2 py-0.5 rounded border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
              onClick={collapseAllDirectories}
            >
              Collapse all
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-2.5">
          {workspaceTreeLoading && <p className="text-xs text-neutral-500 dark:text-neutral-400 px-1">Loading files...</p>}
          {!workspaceTreeLoading && workspaceTreeError && (
            <p className="text-xs text-red-600 dark:text-red-400 px-1">{workspaceTreeError}</p>
          )}
          {!workspaceTreeLoading && !workspaceTreeError && workspaceTree.length === 0 && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 px-1">No files found in this workspace.</p>
          )}
          {!workspaceTreeLoading && !workspaceTreeError && workspaceTree.map((node) => renderExplorerNode(node))}
        </div>
        {workspaceTreeTruncated && (
          <div className="px-3 py-2 border-t border-neutral-200/80 dark:border-neutral-800 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
            File list truncated for performance. Use a smaller workspace for full tree view.
          </div>
        )}
      </div>
    )
  }

  function renderGitPane() {
    const canShowEntries = Boolean(gitStatus?.ok)
    return (
      <div className="h-full min-h-0 flex flex-col bg-white dark:bg-neutral-950">
        <div className="px-3 py-3 border-b border-neutral-200/80 dark:border-neutral-800 text-xs flex items-center justify-between">
          <span className="font-medium text-neutral-700 dark:text-neutral-300">Git status (view only)</span>
          <button
            type="button"
            className="px-2.5 py-1 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
            onClick={refreshGitStatus}
          >
            Refresh
          </button>
        </div>
        <div className="px-3 py-3 border-b border-neutral-200/80 dark:border-neutral-800 text-xs space-y-1.5">
          <div className="font-mono truncate" title={gitStatus?.branch ?? '(unknown)'}>
            Branch: {gitStatus?.branch ?? '(unknown)'}
          </div>
          <div className="flex flex-wrap gap-1 text-[11px]">
            <span className="px-2 py-0.5 rounded bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200">
              Staged {gitStatus?.stagedCount ?? 0}
            </span>
            <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-200">
              Changed {gitStatus?.unstagedCount ?? 0}
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
              Untracked {gitStatus?.untrackedCount ?? 0}
            </span>
          </div>
          <div className="text-neutral-500 dark:text-neutral-400">
            Ahead {gitStatus?.ahead ?? 0}, behind {gitStatus?.behind ?? 0} | Updated {formatCheckedAt(gitStatus?.checkedAt)}
          </div>
        </div>
        <div className="flex-1 overflow-auto p-2.5 space-y-1.5">
          {gitStatusLoading && <p className="text-xs text-neutral-500 dark:text-neutral-400 px-1">Loading git status...</p>}
          {!gitStatusLoading && gitStatusError && <p className="text-xs text-red-600 dark:text-red-400 px-1">{gitStatusError}</p>}
          {!gitStatusLoading && canShowEntries && gitStatus?.clean && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 px-1">Working tree clean.</p>
          )}
          {!gitStatusLoading && canShowEntries && gitStatus?.entries.map((entry) => (
            <button
              key={`${entry.relativePath}-${entry.indexStatus}-${entry.workingTreeStatus}`}
              type="button"
              className="w-full text-left px-2.5 py-2 rounded-md text-xs font-mono border border-transparent hover:border-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-900 dark:hover:border-neutral-800"
              onClick={() => openFilePreview(entry.relativePath)}
              title={entry.relativePath}
            >
              <div className="flex items-start gap-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${gitEntryClass(entry)}`}>{gitStatusText(entry)}</span>
                <span className="truncate flex-1">{entry.relativePath}</span>
              </div>
              {entry.renamedFrom && (
                <div className="pl-8 text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                  from {entry.renamedFrom}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-full min-w-0 max-w-full overflow-hidden flex flex-col bg-neutral-50 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="shrink-0 flex items-center justify-between gap-3 min-w-0 px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white/70 dark:bg-neutral-950/40 backdrop-blur">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="font-semibold">Agent Orchestrator</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 min-w-0 truncate">
            Workspace: <span className="font-mono">{workspaceRoot}</span>
          </div>
        </div>
        <div />
      </header>

      <div className="shrink-0 border-b border-neutral-200 dark:border-neutral-800 px-3 py-2 bg-white dark:bg-neutral-950">
        <div className="flex flex-wrap items-center gap-2 text-xs min-w-0">
          <span className="text-neutral-600 dark:text-neutral-400 w-20 shrink-0">Workspace</span>
          <select
            className="flex-1 px-2 py-1 rounded bg-white border border-neutral-300 text-neutral-900 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-100 min-w-0 font-mono"
            value={workspaceList.includes(workspaceRoot) ? workspaceRoot : workspaceList[0] ?? ''}
            onChange={(e) => applyWorkspaceRoot(e.target.value)}
          >
            {workspaceList.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="h-8 w-8 inline-flex items-center justify-center rounded border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800 shrink-0"
            onClick={() => openWorkspaceSettings('new')}
            title="New workspace"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="h-8 w-8 inline-flex items-center justify-center rounded border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800 shrink-0"
            onClick={() => openWorkspaceSettings('edit')}
            title="Edit selected workspace"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 11.5L3.6 9.2L10.6 2.2L12.8 4.4L5.8 11.4L3 12Z" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8.5 3.9L11.1 6.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <div className="flex items-center gap-1">
            <button
              className={`h-8 w-8 inline-flex items-center justify-center rounded border ${
                layoutMode === 'horizontal' ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40' : 'border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800'
              }`}
              onClick={() => setLayoutMode('horizontal')}
              title="Split horizontal (H)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2.5" y="3" width="11" height="5" rx="1" stroke="currentColor" />
                <rect x="2.5" y="8" width="11" height="5" rx="1" stroke="currentColor" />
              </svg>
            </button>
            <button
              className={`h-8 w-8 inline-flex items-center justify-center rounded border ${
                layoutMode === 'vertical' ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40' : 'border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800'
              }`}
              onClick={() => setLayoutMode('vertical')}
              title="Split vertical (V)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2.5" y="3" width="5.5" height="10" rx="1" stroke="currentColor" />
                <rect x="8" y="3" width="5.5" height="10" rx="1" stroke="currentColor" />
              </svg>
            </button>
            <button
              className={`h-8 w-8 inline-flex items-center justify-center rounded border ${
                layoutMode === 'grid' ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40' : 'border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800'
              }`}
              onClick={() => setLayoutMode('grid')}
              title="Tile / Grid"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="3" y="3" width="4.5" height="4.5" rx="1" stroke="currentColor" />
                <rect x="8.5" y="3" width="4.5" height="4.5" rx="1" stroke="currentColor" />
                <rect x="3" y="8.5" width="4.5" height="4.5" rx="1" stroke="currentColor" />
                <rect x="8.5" y="8.5" width="4.5" height="4.5" rx="1" stroke="currentColor" />
              </svg>
            </button>
            <button
              className="h-8 w-8 inline-flex items-center justify-center rounded border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={createAgentPanel}
              disabled={panels.length >= MAX_PANELS}
              title={panels.length >= MAX_PANELS ? `Maximum ${MAX_PANELS} panels` : 'New panel'}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" />
                <path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 min-w-0 bg-neutral-100 dark:bg-neutral-900">
        <Group orientation="horizontal" className="h-full min-h-0 min-w-0 select-none" id="workspace-shell-layout">
          <Panel id="workspace-dock" defaultSize={28} minSize={16} maxSize={65} className="min-h-0 min-w-[220px]">
            <div className="h-full min-h-0 min-w-0 flex flex-col border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
              <div className="px-2 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-1">
                <button
                  type="button"
                  className={`px-2.5 py-1 rounded text-xs border ${
                    dockTab === 'explorer'
                      ? 'border-blue-600 bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100'
                      : 'border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800'
                  }`}
                  onClick={() => setDockTab('explorer')}
                >
                  Explorer
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-1 rounded text-xs border ${
                    dockTab === 'git'
                      ? 'border-blue-600 bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100'
                      : 'border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800'
                  }`}
                  onClick={() => setDockTab('git')}
                >
                  Git
                </button>
              </div>
              <div className="flex-1 min-h-0 min-w-0">
                {dockTab === 'explorer' ? renderExplorerPane() : renderGitPane()}
              </div>
            </div>
          </Panel>
          <Separator className="w-2 min-w-2 cursor-col-resize bg-neutral-300 dark:bg-neutral-700 hover:bg-blue-400 dark:hover:bg-blue-600 data-[resize-handle-active]:bg-blue-500" />
          <Panel id="workspace-content" minSize={25} className="min-h-0 min-w-0">
            <div ref={layoutRef} className="h-full flex flex-col min-h-0 min-w-0">
              {panels.length === 1 ? (
                <div className="flex-1 min-h-0 min-w-0 overflow-hidden">{renderPanelContent(panels[0])}</div>
              ) : layoutMode === 'grid' ? (
                renderGridLayout()
              ) : (
                (() => {
                  // UX naming:
                  // - "Horizontal" means a horizontal split line (stacked panes, top/bottom)
                  // - "Vertical" means a vertical split line (side-by-side panes, left/right)
                  // react-resizable-panels uses orientation as the pane flow direction, so we map accordingly.
                  const paneFlowOrientation = layoutMode === 'horizontal' ? 'vertical' : 'horizontal'
                  return (
                    <Group orientation={paneFlowOrientation} className="flex-1 min-h-0 min-w-0" id="main-layout">
                      {panels.map((w, idx) => (
                        <React.Fragment key={w.id}>
                          {idx > 0 && (
                            <Separator
                              className={
                                paneFlowOrientation === 'horizontal'
                                  ? 'w-1 min-w-1 bg-neutral-300 dark:bg-neutral-700 hover:bg-blue-400 dark:hover:bg-blue-600 data-[resize-handle-active]:bg-blue-500'
                                  : 'h-1 min-h-1 bg-neutral-300 dark:bg-neutral-700 hover:bg-blue-400 dark:hover:bg-blue-600 data-[resize-handle-active]:bg-blue-500'
                              }
                            />
                          )}
                          <Panel id={`panel-${w.id}`} defaultSize={100 / panels.length} minSize={15} className="min-h-0 min-w-0">
                            {renderPanelContent(w)}
                          </Panel>
                        </React.Fragment>
                      ))}
                    </Group>
                  )
                })()
              )}
            </div>
          </Panel>
        </Group>
      </div>

      <footer className="shrink-0 px-3 py-1.5 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 text-xs text-neutral-600 dark:text-neutral-400 flex items-center gap-4">
        <span className="font-mono truncate max-w-[40ch]" title={workspaceRoot}>
          {workspaceRoot.split(/[/\\]/).pop() || workspaceRoot}
        </span>
        <span>{panels.length} agent{panels.length !== 1 ? 's' : ''}</span>
        {(() => {
          const withUsage = panels.filter((p) => getRateLimitPercent(p.usage) !== null)
          if (withUsage.length === 0) return null
          const worst = withUsage.reduce((a, p) => {
            const pct = getRateLimitPercent(p.usage) ?? 0
            return pct > (getRateLimitPercent(a.usage) ?? 0) ? p : a
          })
          const label = formatRateLimitLabel(worst.usage)
          return label ? <span>Usage: {label}</span> : null
        })()}
      </footer>

      {filePreview && (
        <div
          className="fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4"
          onClick={() => setFilePreview(null)}
        >
          <div
            className="w-[72vw] h-[72vh] min-w-[520px] min-h-[320px] max-w-[90vw] max-h-[90vh] resize overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2">
              <div className="text-xs font-mono truncate" title={filePreview.relativePath}>
                {filePreview.relativePath}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-2 py-1 text-xs rounded border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800 disabled:opacity-50"
                  disabled={filePreview.loading}
                  onClick={() => openFilePreview(filePreview.relativePath)}
                >
                  Refresh
                </button>
                <button
                  type="button"
                  className="h-7 w-9 inline-flex items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  onClick={() => setFilePreview(null)}
                  title="Close preview"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto bg-neutral-50 dark:bg-neutral-900">
              {filePreview.loading && (
                <div className="p-4 text-sm text-neutral-600 dark:text-neutral-400">Loading file preview...</div>
              )}
              {!filePreview.loading && filePreview.error && (
                <div className="p-4 text-sm text-red-600 dark:text-red-400">{filePreview.error}</div>
              )}
              {!filePreview.loading && !filePreview.error && filePreview.binary && (
                <div className="p-4 text-sm text-neutral-600 dark:text-neutral-400">
                  Binary file preview is not supported.
                </div>
              )}
              {!filePreview.loading && !filePreview.error && !filePreview.binary && (
                <pre className="p-4 m-0 text-[12px] leading-5 font-mono whitespace-pre overflow-x-auto text-neutral-900 dark:text-neutral-100">
                  {filePreview.content}
                </pre>
              )}
            </div>
            <div className="px-3 py-1.5 border-t border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center justify-between">
              <span>{Math.round(filePreview.size / 1024)} KB</span>
              <span>{filePreview.truncated ? 'Preview truncated at 1 MB.' : 'Read-only preview.'}</span>
            </div>
          </div>
        </div>
      )}

      {showThemeModal && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xl">
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div className="font-medium">Theme</div>
              <button
                className="h-7 w-9 inline-flex items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => setShowThemeModal(false)}
                title="Close"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="theme"
                  checked={theme === 'light'}
                  onChange={() => setTheme('light')}
                />
                <span>Light</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="theme"
                  checked={theme === 'dark'}
                  onChange={() => setTheme('dark')}
                />
                <span>Dark</span>
              </label>
            </div>
            <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-end">
              <button
                className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-500"
                onClick={() => setShowThemeModal(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {showWorkspacePicker && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xl">
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div className="font-medium">Open workspace</div>
              <button
                className="h-7 w-9 inline-flex items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => setShowWorkspacePicker(false)}
                title="Close"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-auto">
              <div className="space-y-1">
                {workspaceList.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`w-full text-left px-3 py-2 rounded text-sm font-mono truncate ${
                      p === workspaceRoot
                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100'
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                    onClick={() => {
                      applyWorkspaceRoot(p)
                      setShowWorkspacePicker(false)
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="mt-3 w-full px-3 py-2 rounded border border-dashed border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900 text-sm text-neutral-600 dark:text-neutral-400"
                onClick={async () => {
                  const selected = await api.openFolderDialog?.()
                  if (!selected) return
                  setWorkspaceList((prev) => (prev.includes(selected) ? prev : [selected, ...prev]))
                  setWorkspaceSettingsByPath((prev) => ({
                    ...prev,
                    [selected]: {
                      path: selected,
                      defaultModel: DEFAULT_MODEL,
                      permissionMode: 'verify-first',
                      sandbox: 'workspace-write',
                    },
                  }))
                  applyWorkspaceRoot(selected)
                  try {
                    await api.writeWorkspaceConfig?.(selected)
                  } catch {}
                  setShowWorkspacePicker(false)
                }}
              >
                + Select folder...
              </button>
            </div>
          </div>
        </div>
      )}

      {showModelSetupModal && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xl max-h-[90vh] flex flex-col">
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0">
              <div className="font-medium">Model setup</div>
              <button
                className="h-7 w-9 inline-flex items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => {
                  setShowModelSetupModal(false)
                  setEditingModel(null)
                }}
                title="Close"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                Add and configure model interfaces. Codex uses your ChatGPT login. Gemini requires an API key from Google AI Studio.
              </p>
              {editingModel ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-[120px_1fr] items-center gap-2 text-sm">
                    <span className="text-neutral-600 dark:text-neutral-400">ID</span>
                    <input
                      className="px-2 py-1 rounded border border-neutral-300 bg-white dark:bg-neutral-900 dark:border-neutral-800 font-mono text-sm"
                      value={modelForm.id}
                      onChange={(e) => setModelForm((p) => ({ ...p, id: e.target.value }))}
                      placeholder="e.g. gemini-2.0-flash"
                    />
                    <span className="text-neutral-600 dark:text-neutral-400">Display name</span>
                    <input
                      className="px-2 py-1 rounded border border-neutral-300 bg-white dark:bg-neutral-900 dark:border-neutral-800"
                      value={modelForm.displayName}
                      onChange={(e) => setModelForm((p) => ({ ...p, displayName: e.target.value }))}
                      placeholder="e.g. Gemini 2.0 Flash"
                    />
                    <span className="text-neutral-600 dark:text-neutral-400">Provider</span>
                    <select
                      className="px-2 py-1 rounded border border-neutral-300 bg-white dark:bg-neutral-900 dark:border-neutral-800"
                      value={modelForm.provider}
                      onChange={(e) => setModelForm((p) => ({ ...p, provider: e.target.value as ModelProvider }))}
                    >
                      <option value="codex">Codex (ChatGPT)</option>
                      <option value="gemini">Gemini (Google AI)</option>
                    </select>
                    <span className="text-neutral-600 dark:text-neutral-400">Enabled</span>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={modelForm.enabled}
                        onChange={(e) => setModelForm((p) => ({ ...p, enabled: e.target.checked }))}
                      />
                      Show in model selector
                    </label>
                    {modelForm.provider === 'gemini' && (
                      <>
                        <span className="text-neutral-600 dark:text-neutral-400">API key</span>
                        <input
                          type="password"
                          className="px-2 py-1 rounded border border-neutral-300 bg-white dark:bg-neutral-900 dark:border-neutral-800 font-mono"
                          value={modelForm.config?.apiKey ?? ''}
                          onChange={(e) =>
                            setModelForm((p) => ({
                              ...p,
                              config: { ...p.config, apiKey: e.target.value },
                            }))
                          }
                          placeholder="From Google AI Studio"
                        />
                      </>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-500"
                      onClick={() => {
                        const idx = modelConfig.interfaces.findIndex((m) => m.id === editingModel.id)
                        const next = [...modelConfig.interfaces]
                        if (idx >= 0) next[idx] = modelForm
                        else next.push(modelForm)
                        setModelConfig({ interfaces: next })
                        setEditingModel(null)
                      }}
                    >
                      Save
                    </button>
                    <button
                      className="px-3 py-1.5 text-sm rounded border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                      onClick={() => setEditingModel(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {modelConfig.interfaces.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                      >
                        <div>
                          <span className="font-medium">{m.displayName || m.id}</span>
                          <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-2">
                            {m.provider} {!m.enabled && '(disabled)'}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            className="px-2 py-1 text-xs rounded border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                            onClick={() => {
                              setModelForm({ ...m })
                              setEditingModel(m)
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="px-2 py-1 text-xs rounded border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                            onClick={() => {
                              setModelConfig({
                                interfaces: modelConfig.interfaces.filter((x) => x.id !== m.id),
                              })
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    className="mt-4 px-3 py-1.5 text-sm rounded border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                    onClick={() => {
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
            </div>
          </div>
        </div>
      )}

      {showWorkspaceModal && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xl">
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div className="font-medium">
                {workspaceModalMode === 'new' ? 'New workspace settings' : 'Edit workspace settings'}
              </div>
              <button
                className="h-7 w-9 inline-flex items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => setShowWorkspaceModal(false)}
                title="Close"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4 text-sm">
              <div className="grid grid-cols-[140px_1fr_auto] items-center gap-2">
                <span className="text-neutral-600 dark:text-neutral-400">Folder location</span>
                <input
                  className="w-full px-2 py-1 rounded bg-white border border-neutral-300 text-neutral-900 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-100 font-mono"
                  value={workspaceForm.path}
                  onChange={(e) => setWorkspaceForm((prev) => ({ ...prev, path: e.target.value }))}
                />
                <button
                  type="button"
                  className="px-2 py-1 rounded border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                  onClick={browseForWorkspaceIntoForm}
                >
                  Browse
                </button>
              </div>
              <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                <span className="text-neutral-600 dark:text-neutral-400">Default model</span>
                <select
                  className="px-2 py-1 rounded border border-neutral-300 bg-white text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                  value={workspaceForm.defaultModel}
                  onChange={(e) =>
                    setWorkspaceForm((prev) => ({ ...prev, defaultModel: e.target.value }))
                  }
                >
                  {getModelOptions(workspaceForm.defaultModel).map((id) => {
                    const mi = modelConfig.interfaces.find((m) => m.id === id)
                    return (
                      <option key={id} value={id}>
                        {mi?.displayName ?? id}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                <span className="text-neutral-600 dark:text-neutral-400">Sandbox</span>
                <div className="space-y-1">
                  <select
                    className="w-full px-2 py-1 rounded border border-neutral-300 bg-white text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                    value={workspaceForm.sandbox}
                    onChange={(e) =>
                      setWorkspaceForm((prev) => ({
                        ...prev,
                        sandbox: e.target.value as SandboxMode,
                      }))
                    }
                  >
                    <option value="read-only">Read only</option>
                    <option value="workspace-write">Workspace write</option>
                    <option value="danger-full-access">Danger full access</option>
                  </select>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    {sandboxModeDescription(workspaceForm.sandbox)}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                <span className="text-neutral-600 dark:text-neutral-400">Permissions</span>
                <select
                  className="px-2 py-1 rounded border border-neutral-300 bg-white text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                  value={workspaceForm.permissionMode}
                  onChange={(e) =>
                    setWorkspaceForm((prev) => ({
                      ...prev,
                      permissionMode: e.target.value as PermissionMode,
                    }))
                  }
                >
                  <option value="verify-first">Verify first (safer)</option>
                  <option value="proceed-always">Proceed always (autonomous)</option>
                </select>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-between">
              <div>
                {workspaceModalMode === 'edit' && workspaceList.includes(workspaceForm.path) && (
                  <button
                    className="px-3 py-1.5 text-sm rounded border border-red-300 bg-white text-red-600 hover:bg-red-50 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/30"
                    onClick={() => {
                      if (confirm(`Delete workspace "${workspaceForm.path}"?`)) {
                        deleteWorkspace(workspaceForm.path)
                      }
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1.5 text-sm rounded border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                  onClick={() => setShowWorkspaceModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-500"
                  onClick={saveWorkspaceSettings}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  function renderPanelContent(w: AgentPanelState) {
    const hasInput = Boolean(w.input.trim())
    const isBusy = w.streaming
    const queueCount = w.pendingInputs.length
    const panelFontSizePx = 14 * w.fontScale
    const panelLineHeightPx = 24 * w.fontScale
    const sendTitle = isBusy
      ? hasInput
        ? `Queue message${queueCount > 0 ? ` (${queueCount} queued)` : ''}`
        : 'Busy'
      : 'Send'
    const activity = panelActivityById[w.id]
    const msSinceLastActivity = activity ? activityClock - activity.lastEventAt : Number.POSITIVE_INFINITY
    const isLive = isBusy || msSinceLastActivity < 4000
    const activityDotClass = isLive
      ? 'bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.15)]'
      : 'bg-neutral-300 dark:bg-neutral-700'
    const activityLabel = isLive ? 'live' : 'idle'
    const secondsAgo = Number.isFinite(msSinceLastActivity) ? Math.max(0, Math.floor(msSinceLastActivity / 1000)) : null
    const activityTitle = activity
      ? `Activity: ${activityLabel}\nLast event: ${activity.lastEventLabel}\n${secondsAgo}s ago\nEvents seen: ${activity.totalEvents}`
      : 'Activity: idle\nNo events seen yet for this panel.'
    const activityItems = activity?.recent ?? []
    const activityOpen = Boolean(activityOpenByPanel[w.id])

    return (
      <div
        className={[
          'h-full min-h-0 min-w-0 flex flex-col rounded-lg border bg-white dark:bg-neutral-950 overflow-hidden outline-none',
          activePanelId === w.id
            ? 'border-blue-400 dark:border-blue-600 ring-1 ring-blue-200 dark:ring-blue-900/40'
            : 'border-neutral-200 dark:border-neutral-800',
        ].join(' ')}
        tabIndex={0}
        onFocusCapture={() => setActivePanelId(w.id)}
        onMouseDownCapture={() => setActivePanelId(w.id)}
        onWheel={(e) => {
          if (!e.ctrlKey) return
          if (activePanelId !== w.id) return
          e.preventDefault()
          zoomPanelFont(w.id, e.deltaY)
        }}
      >
        <div className="flex items-center justify-between gap-2 min-w-0 px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 shrink-0">
          <div className="flex-1 min-w-0 text-sm font-medium truncate" title={w.title}>{getConversationPrecis(w)}</div>
          <button
            className="h-7 w-9 shrink-0 inline-flex items-center justify-center hover:bg-red-600 hover:text-white dark:hover:bg-red-600 rounded"
            onClick={() => closePanel(w.id)}
            title="Close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-2 bg-neutral-100 dark:bg-neutral-950 min-h-0"
          style={{ fontSize: `${panelFontSizePx}px`, lineHeight: `${panelLineHeightPx}px` }}
        >
          {w.messages.map((m) => (
            <div key={m.id} className="w-full">
              <div
                className={[
                  'w-full rounded-xl px-3 py-2 border',
                  m.role === 'user'
                    ? 'bg-blue-50 border-blue-200 text-blue-950 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-100'
                    : 'bg-white border-neutral-200 text-neutral-900 dark:bg-neutral-800 dark:border-neutral-800 dark:text-neutral-100',
                  m.role === 'system'
                    ? 'bg-neutral-50 border-neutral-200 text-neutral-700 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-300'
                    : '',
                ].join(' ')}
              >
                {m.role === 'assistant' && m.format === 'markdown' ? (
                  <div className="prose prose-neutral dark:prose-invert prose-pre:bg-neutral-900/5 dark:prose-pre:bg-neutral-950 prose-pre:border prose-pre:border-neutral-200 dark:prose-pre:border-neutral-800 prose-pre:rounded-lg prose-pre:p-3 max-w-none break-words [overflow-wrap:anywhere] [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:overflow-x-hidden [&_code]:break-words">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code(props) {
                          const { children, className } = props
                          const isBlock = typeof className === 'string' && className.includes('language-')
                          if (isBlock) return <code className={className}>{children}</code>
                          return (
                            <code className="px-1 py-0.5 rounded bg-neutral-900/10 dark:bg-neutral-100/10">
                              {children}
                            </code>
                          )
                        },
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.content}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-neutral-200 dark:border-neutral-800 p-2 bg-white dark:bg-neutral-950">
          <div className="flex items-end gap-2 min-w-0">
            <textarea
              ref={(el) => registerTextarea(w.id, el)}
              className="flex-1 min-w-0 resize-none rounded-xl bg-white border border-neutral-300 px-3 py-2 text-neutral-900 outline-none focus:border-neutral-500 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-100 dark:focus:border-neutral-600"
              style={{ fontSize: `${panelFontSizePx}px`, lineHeight: `${panelLineHeightPx}px` }}
              placeholder="Message..."
              rows={1}
              value={w.input}
              onFocus={() => setActivePanelId(w.id)}
              onChange={(e) => {
                const next = e.target.value
                setPanels((prev) => prev.map((x) => (x.id === w.id ? { ...x, input: next } : x)))
                queueMicrotask(() => autoResizeTextarea(w.id))
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage(w.id)
                }
              }}
            />
            <button
              className={[
                'h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                isBusy
                  ? hasInput
                    ? 'border-neutral-400 bg-neutral-200 text-neutral-700 hover:bg-neutral-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600'
                    : 'border-neutral-300 bg-neutral-200 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400'
                  : hasInput
                    ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-500'
                    : 'border-neutral-300 bg-neutral-100 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-600',
              ].join(' ')}
              onClick={() => sendMessage(w.id)}
              disabled={!hasInput}
              title={sendTitle}
            >
              {isBusy && !hasInput ? (
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeOpacity="0.28" strokeWidth="2" />
                  <path d="M10 3.5a6.5 6.5 0 0 1 6.5 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <path d="M10 4V13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M6.5 7.5L10 4l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 16h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </div>
          {queueCount > 0 && (
            <div className="px-1 pt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
              {queueCount} queued
            </div>
          )}
        </div>

        <div className="border-t border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-xs flex flex-wrap items-start justify-between gap-2 min-w-0 overflow-x-hidden bg-neutral-50 dark:bg-neutral-900">
          <div className="min-w-0 flex-1 text-neutral-600 dark:text-neutral-400 flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400"
              title={activityTitle}
              aria-label={`Panel activity ${activityLabel}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${activityDotClass} ${isLive ? 'animate-pulse' : ''}`}
                aria-hidden
              />
              {activityLabel}
            </span>
            {activityItems.length > 0 && (
              <button
                type="button"
                className="text-[11px] rounded border border-neutral-300 px-1.5 py-0.5 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                onClick={() => setActivityOpenByPanel((prev) => ({ ...prev, [w.id]: !prev[w.id] }))}
                title="Toggle activity details"
              >
                {activityOpen ? 'Hide activity' : 'Show activity'}
              </button>
            )}
            <span className="break-words [overflow-wrap:anywhere]">{w.status}</span>
            {(() => {
              const pct = getRateLimitPercent(w.usage)
              const label = formatRateLimitLabel(w.usage)
              if (pct === null || !label) return null
              return (
                <span className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-20 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                    <span className="block h-full bg-blue-600" style={{ width: `${100 - pct}%` }} />
                  </span>
                  <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
                </span>
              )
            })()}
            {activityOpen && activityItems.length > 0 && (
              <div className="w-full rounded border border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-950/70 px-2 py-1.5 space-y-1 max-h-32 overflow-auto">
                {activityItems.map((item) => (
                  <div key={item.id} className="text-[11px] leading-4">
                    <span className="font-medium text-neutral-700 dark:text-neutral-200">
                      {item.label}
                      {item.count > 1 ? ` x${item.count}` : ''}
                    </span>
                    {item.detail ? (
                      <span className="text-neutral-500 dark:text-neutral-400"> - {item.detail}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="min-w-0 flex flex-wrap items-end justify-end gap-3">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="text-neutral-600 dark:text-neutral-400">Sandbox</span>
                <select
                  className="max-w-full text-xs rounded border border-neutral-300 bg-white text-neutral-900 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                  value={w.sandbox}
                  onChange={(e) => {
                    const next = e.target.value as SandboxMode
                    setPanels((prev) =>
                      prev.map((p) =>
                        p.id === w.id
                          ? {
                              ...p,
                              sandbox: next,
                              connected: false,
                              status: `Sandbox set to ${next} (reconnect on next send).`,
                            }
                          : p,
                      ),
                    )
                  }}
                >
                  <option value="read-only">Read only</option>
                  <option value="workspace-write">Workspace write</option>
                  <option value="danger-full-access">Danger full access</option>
                </select>
              </div>
              <span className="text-[10px] leading-4 text-neutral-500 dark:text-neutral-400 max-w-[280px]">
                {sandboxModeDescription(w.sandbox)}
              </span>
            </div>
            <span className="text-neutral-600 dark:text-neutral-400">Permissions</span>
            <select
              className="max-w-full text-xs rounded border border-neutral-300 bg-white text-neutral-900 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
              value={w.permissionMode}
              onChange={(e) => {
                const next = e.target.value as PermissionMode
                setPanels((prev) =>
                  prev.map((p) =>
                    p.id === w.id
                      ? {
                          ...p,
                          permissionMode: next,
                          connected: false,
                          status:
                            next === 'proceed-always'
                              ? 'Permissions set: Proceed always (reconnect on next send).'
                              : 'Permissions set: Verify first (reconnect on next send).',
                        }
                      : p,
                  ),
                )
              }}
            >
              <option value="verify-first">Verify first</option>
              <option value="proceed-always">Proceed always</option>
            </select>
            <span className="text-neutral-600 dark:text-neutral-400">Model</span>
            <select
              className="max-w-full text-xs rounded border border-neutral-300 bg-white text-neutral-900 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
              value={w.model}
              onChange={(e) => switchModel(w.id, e.target.value)}
            >
              {getModelOptions(w.model).map((id) => {
                const mi = modelConfig.interfaces.find((m) => m.id === id)
                return (
                  <option key={id} value={id}>
                    {mi?.displayName ?? id}
                  </option>
                )
              })}
            </select>
          </div>
        </div>
      </div>
    )
  }
}
