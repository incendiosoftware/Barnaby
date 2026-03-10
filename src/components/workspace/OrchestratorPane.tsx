/**
 * OrchestratorPane - dashboard UI for the orchestrator plugin.
 *
 * Renders a structured dashboard with:
 * - Mode selector (Goal Run / Comparative Review)
 * - Goal display
 * - Task progress summary
 * - Live agent status table
 * - Current state indicator
 * - Activity log (collapsible)
 * - Interrupt prompt
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { UI_CLOSE_ICON_BUTTON_CLASS } from '../../constants'
import type { OrchestratorSettings } from '../../types'

export interface OrchestratorPaneProps {
  pluginDisplayName: string
  pluginVersion: string
  licensed: boolean
  workspaceRoot: string
  onOpenSettings: () => void
  onOpenAgentPanel?: (panelId: string) => void
  orchestratorSettings: OrchestratorSettings
  setOrchestratorSettings: React.Dispatch<React.SetStateAction<OrchestratorSettings>>
  onClose?: () => void
}

// ── State types matching what the plugin returns ─────────────────────

interface GoalRunTaskSnapshot {
  id: string
  title: string
  description: string
  role: string
  status: string
  dependsOn: string[]
  panelId?: string
  attempts: number
  createdAt: number
  startedAt?: number
  completedAt?: number
}

interface GoalRunSnapshot {
  id: string
  goal: string
  status: string
  tasks: GoalRunTaskSnapshot[]
  createdAt: number
  completedAt?: number
  summary?: string
}

interface ComparativeReviewRunSummary {
  id: string
  goal: string
  status: string
  workerA: { panelId: string | null; summary?: string | null }
  workerB: { panelId: string | null; summary?: string | null }
  finalReport: string | null
  error: string | null
}

interface OrchestratorLogEntry {
  id: string
  actor: string
  kind: string
  text: string
  panelId: string | null
  createdAt: number
}

interface OrchestratorStateSnapshot {
  phase: string
  goal: { text: string; createdAt: number } | null
  currentRun: ComparativeReviewRunSummary | null
  goalRun: GoalRunSnapshot | null
  activePanels: Array<{ taskId: string; panelId: string }>
  log: OrchestratorLogEntry[]
  error: string | null
}

type OrchestratorMode = 'goal-run' | 'review'

type OrchestratorApi = {
  startOrchestratorComparativeReview?: (
    goal: string,
    options?: {
      reviewerA?: { id?: string; label?: string; provider?: string; model?: string }
      reviewerB?: { id?: string; label?: string; provider?: string; model?: string }
    },
  ) => Promise<{ ok: boolean; runId?: string; error?: string }>
  startOrchestratorGoalRun?: (goal: string) => Promise<{ ok: boolean; runId?: string; error?: string }>
  pauseOrchestratorRun?: () => Promise<{ ok: boolean; error?: string }>
  cancelOrchestratorRun?: () => Promise<{ ok: boolean; error?: string }>
  getOrchestratorState?: () => Promise<OrchestratorStateSnapshot | null>
  browseMarkdownFile?: () => Promise<{ filePath: string; content: string } | null>
  saveTranscriptFile?: (
    workspaceRoot: string,
    suggestedFileName: string,
    content: string,
  ) => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>
}

const MODE_LABELS: Record<OrchestratorMode, { label: string; placeholder: string; button: string; importLabel: string }> = {
  'goal-run': {
    label: 'Goal Run',
    placeholder: 'Describe the goal to decompose and execute...',
    button: 'Start Goal Run',
    importLabel: 'Import Goal',
  },
  'review': {
    label: 'Comparative Review',
    placeholder: 'Describe the comparative review goal...',
    button: 'Start Review',
    importLabel: 'Import Review',
  },
}

function getOrchestratorApi(): OrchestratorApi {
  return ((window as unknown as { agentOrchestrator?: OrchestratorApi; fireharness?: OrchestratorApi }).agentOrchestrator
    ?? (window as unknown as { fireharness?: OrchestratorApi }).fireharness
    ?? {}) as OrchestratorApi
}

// ── Task status helpers ──────────────────────────────────────────────

const STATUS_ICON: Record<string, string> = {
  completed: '\u2705',
  running: '\u{1F504}',
  pending: '\u23F3',
  blocked: '\u{1F6D1}',
  failed: '\u274C',
  skipped: '\u23ED\uFE0F',
}

const STATUS_COLOR: Record<string, string> = {
  completed: 'text-green-600 dark:text-green-400',
  running: 'text-blue-600 dark:text-blue-400',
  pending: 'text-neutral-500 dark:text-neutral-400',
  blocked: 'text-amber-600 dark:text-amber-400',
  failed: 'text-red-600 dark:text-red-400',
  skipped: 'text-neutral-400 dark:text-neutral-500',
}

const PHASE_LABELS: Record<string, string> = {
  idle: 'Idle',
  planning: 'Planning',
  executing: 'Building & Testing',
  verifying: 'Verifying',
  complete: 'Complete',
  failed: 'Failed',
  paused: 'Paused',
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

function deriveReviewerSummaryFromLog(
  log: OrchestratorLogEntry[],
  reviewer: 'A' | 'B',
): string | null {
  const needle = reviewer === 'A' ? 'reviewer a' : 'reviewer b'
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const entry = log[i]
    const actor = entry.actor.toLowerCase()
    const text = entry.text.toLowerCase()
    if (
      actor.includes(needle) ||
      actor.includes(`reviewer-${reviewer.toLowerCase()}`) ||
      text.includes(needle)
    ) {
      const raw = entry.text.trim()
      if (raw) return raw
    }
  }
  return null
}

// ── Sub-components ───────────────────────────────────────────────────

function DashboardRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-neutral-200/50 dark:border-neutral-700/50 last:border-b-0">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 w-24 shrink-0 pt-0.5">{label}</span>
      <div className="flex-1 min-w-0 text-xs text-neutral-700 dark:text-neutral-200">{children}</div>
    </div>
  )
}

function AgentTable({ tasks, activePanels }: { tasks: GoalRunTaskSnapshot[]; activePanels: Array<{ taskId: string; panelId: string }> }) {
  // Build agent rows: one per running/completed task + the orchestrator itself
  const agentRows: Array<{ name: string; role: string; status: string; detail: string; panelId?: string }> = [
    { name: 'Orchestrator', role: 'coordinator', status: 'running', detail: 'Managing...' },
  ]

  for (const task of tasks) {
    if (task.status === 'pending' || task.status === 'blocked') continue
    const activePanel = activePanels.find(ap => ap.taskId === task.id)
    let detail = task.status
    if (task.status === 'running') detail = `Running: ${task.title}`
    else if (task.status === 'completed') detail = `Done: ${task.title}`
    else if (task.status === 'failed') detail = `Failed: ${task.title}`
    else if (task.status === 'skipped') detail = `Skipped: ${task.title}`

    agentRows.push({
      name: task.role.charAt(0).toUpperCase() + task.role.slice(1),
      role: task.role,
      status: task.status,
      detail,
      panelId: task.panelId ?? activePanel?.panelId,
    })
  }

  return (
    <div className="rounded-md border border-neutral-200/70 dark:border-neutral-700/70 overflow-hidden">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-neutral-100 dark:bg-neutral-800/80 text-neutral-500 dark:text-neutral-400">
            <th className="text-left px-2 py-1.5 font-medium">Agent</th>
            <th className="text-left px-2 py-1.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {agentRows.map((row, i) => (
            <tr key={i} className="border-t border-neutral-100 dark:border-neutral-800/50">
              <td className="px-2 py-1.5 text-neutral-700 dark:text-neutral-200 font-medium">
                {row.name}
                {row.panelId && <span className="text-neutral-400 dark:text-neutral-500 font-normal ml-1">({row.panelId})</span>}
              </td>
              <td className={`px-2 py-1.5 ${STATUS_COLOR[row.status] ?? 'text-neutral-500'}`}>
                {STATUS_ICON[row.status] ?? ''} {row.detail}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TaskList({ tasks }: { tasks: GoalRunTaskSnapshot[] }) {
  return (
    <div className="space-y-1">
      {tasks.map((task) => (
        <div key={task.id} className="flex items-center gap-2 text-[11px]">
          <span>{STATUS_ICON[task.status] ?? '\u2022'}</span>
          <span className={`font-medium ${STATUS_COLOR[task.status] ?? ''}`}>{task.title}</span>
          <span className="text-neutral-400 dark:text-neutral-500">({task.role})</span>
          {task.attempts > 1 && <span className="text-neutral-400 dark:text-neutral-500">attempt {task.attempts}</span>}
        </div>
      ))}
    </div>
  )
}

function ActivityLog({ log }: { log: OrchestratorLogEntry[] }) {
  const [expanded, setExpanded] = useState(false)
  const recent = expanded ? log.slice(-30) : log.slice(-5)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [log.length, expanded])

  return (
    <div className="rounded-md border border-neutral-200/70 dark:border-neutral-700/70 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-2 py-1.5 bg-neutral-100 dark:bg-neutral-800/80 text-[11px] font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200/60 dark:hover:bg-neutral-700/60"
        onClick={() => setExpanded(!expanded)}
      >
        <span>Activity Log ({log.length})</span>
        <span>{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>
      <div ref={scrollRef} className={`overflow-y-auto ${expanded ? 'max-h-60' : 'max-h-28'}`}>
        {recent.map((entry) => (
          <div key={entry.id} className="px-2 py-1 border-t border-neutral-100 dark:border-neutral-800/50 text-[10px] text-neutral-500 dark:text-neutral-400">
            <span className="text-neutral-400 dark:text-neutral-500">{new Date(entry.createdAt).toLocaleTimeString()}</span>{' '}
            <span className="font-medium text-neutral-600 dark:text-neutral-300">[{entry.actor}/{entry.kind}]</span>{' '}
            {entry.text.slice(0, 200)}
          </div>
        ))}
        {log.length === 0 && (
          <div className="px-2 py-2 text-[10px] text-neutral-400 dark:text-neutral-500 italic">No activity yet.</div>
        )}
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────

export function OrchestratorPane({
  pluginDisplayName,
  pluginVersion,
  licensed,
  workspaceRoot,
  onOpenSettings,
  onOpenAgentPanel,
  orchestratorSettings,
  setOrchestratorSettings,
  onClose,
}: OrchestratorPaneProps) {
  const [inputValue, setInputValue] = useState('')
  const [snapshot, setSnapshot] = useState<OrchestratorStateSnapshot | null>(null)
  const [archivedComparativeRun, setArchivedComparativeRun] = useState<ComparativeReviewRunSummary | null>(null)
  const [archivedGoalRun, setArchivedGoalRun] = useState<GoalRunSnapshot | null>(null)
  const [closedWorkKey, setClosedWorkKey] = useState<string | null>(null)
  const [startingRun, setStartingRun] = useState(false)
  const [stoppingRun, setStoppingRun] = useState(false)
  const [mode, setMode] = useState<OrchestratorMode>('goal-run')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const modeConfig = MODE_LABELS[mode]

  // Poll orchestrator state
  useEffect(() => {
    if (!licensed) return

    let disposed = false
    const api = getOrchestratorApi()

    const syncState = async () => {
      try {
        const next = await api.getOrchestratorState?.()
        if (disposed || !next) return
        setSnapshot(next)
      } catch {
        if (!disposed) setSnapshot(null)
      }
    }

    void syncState()
    const intervalId = window.setInterval(() => { void syncState() }, 1200)
    return () => { disposed = true; window.clearInterval(intervalId) }
  }, [licensed])

  useEffect(() => {
    if (snapshot?.currentRun) {
      setArchivedComparativeRun(snapshot.currentRun)
      setClosedWorkKey((prev) => (prev === `review:${snapshot.currentRun?.id}` ? null : prev))
    }
    if (snapshot?.goalRun) {
      setArchivedGoalRun(snapshot.goalRun)
      setClosedWorkKey((prev) => (prev === `goal:${snapshot.goalRun?.id}` ? null : prev))
    }
  }, [snapshot?.currentRun, snapshot?.goalRun])

  const handleSend = useCallback(async (goalOverride?: string) => {
    const trimmed = (goalOverride ?? inputValue).trim()
    if (!trimmed || startingRun) return

    const api = getOrchestratorApi()
    setStartingRun(true)
    if (!goalOverride) setInputValue('')
    setStatusMessage(null)

    try {
      const startFn = mode === 'goal-run'
        ? api.startOrchestratorGoalRun
        : api.startOrchestratorComparativeReview

      if (typeof startFn !== 'function') {
        setStatusMessage(`${modeConfig.label} is not available. The orchestrator plugin may not support this mode yet.`)
        return
      }

      const reviewerA = orchestratorSettings.workerPool.find((worker) => worker.id === orchestratorSettings.comparativeReviewerAId)
      const reviewerB = orchestratorSettings.workerPool.find((worker) => worker.id === orchestratorSettings.comparativeReviewerBId)
      if (mode === 'review' && reviewerA?.provider && reviewerB?.provider && reviewerA.provider === reviewerB.provider) {
        setStatusMessage('Comparative reviewers must use different providers. Update reviewer profiles or selection.')
        return
      }

      const result = mode === 'review'
        ? await startFn(trimmed, {
          reviewerA,
          reviewerB,
        })
        : await startFn(trimmed)
      if (!result?.ok) {
        setStatusMessage(result?.error || `Unable to start ${modeConfig.label.toLowerCase()}.`)
        return
      }

      setStatusMessage(`${modeConfig.label} started.`)
      setClosedWorkKey(null)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setStartingRun(false)
    }
  }, [inputValue, startingRun, mode, modeConfig, orchestratorSettings])

  const handleImportMarkdown = useCallback(async () => {
    const api = getOrchestratorApi()
    try {
      const file = await api.browseMarkdownFile?.()
      if (!file) return
      setInputValue(file.content)
    } catch (error) {
      setStatusMessage(`Import failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [])

  const handlePause = useCallback(async () => {
    const api = getOrchestratorApi()
    if (typeof api.pauseOrchestratorRun !== 'function') return
    setStoppingRun(true)
    setStatusMessage(null)
    try {
      const result = await api.pauseOrchestratorRun()
      if (!result?.ok) {
        setStatusMessage(result?.error || 'Unable to pause the orchestrator run.')
        return
      }
      setStatusMessage('Orchestrator run paused.')
      const next = await api.getOrchestratorState?.()
      if (next) setSnapshot(next)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setStoppingRun(false)
    }
  }, [])

  const handleCancel = useCallback(async () => {
    const api = getOrchestratorApi()
    if (typeof api.cancelOrchestratorRun !== 'function') return
    setStoppingRun(true)
    setStatusMessage(null)
    try {
      const result = await api.cancelOrchestratorRun()
      if (!result?.ok) {
        setStatusMessage(result?.error || 'Unable to cancel the orchestrator run.')
        return
      }
      setStatusMessage('Orchestrator run cancelled.')
      const next = await api.getOrchestratorState?.()
      if (next) setSnapshot(next)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setStoppingRun(false)
    }
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  function buildWorkSummaryMarkdown(params: {
    goalRun: GoalRunSnapshot | null
    comparativeRun: ComparativeReviewRunSummary | null
    goalText: string | null
    phase: string
    log: OrchestratorLogEntry[]
  }): string {
    const { goalRun, comparativeRun, goalText, phase, log } = params
    const lines: string[] = []
    lines.push(`# ${modeConfig.label} Work`)
    lines.push('')
    lines.push(`- Plugin: ${pluginDisplayName} v${pluginVersion}`)
    lines.push(`- Phase: ${phase}`)
    lines.push(`- Saved: ${new Date().toISOString()}`)
    lines.push('')
    if (goalText) {
      lines.push('## Goal')
      lines.push(goalText)
      lines.push('')
    }
    if (goalRun) {
      lines.push('## Goal Run Summary')
      if (goalRun.summary) lines.push(goalRun.summary)
      lines.push('')
    }
    if (comparativeRun) {
      const reviewerASummary = (comparativeRun.workerA.summary ?? '').trim() || deriveReviewerSummaryFromLog(log, 'A') || ''
      const reviewerBSummary = (comparativeRun.workerB.summary ?? '').trim() || deriveReviewerSummaryFromLog(log, 'B') || ''
      lines.push('## Reviewer A Summary')
      lines.push(reviewerASummary || '_No reviewer summary available in run payload._')
      lines.push('')
      lines.push('## Reviewer B Summary')
      lines.push(reviewerBSummary || '_No reviewer summary available in run payload._')
      lines.push('')
      lines.push('## Orchestrator Final Summary')
      lines.push((comparativeRun.finalReport ?? '').trim() || '_No final report available._')
      lines.push('')
    }
    if (log.length > 0) {
      lines.push('## Activity Log')
      lines.push('')
      for (const entry of log.slice(-50)) {
        lines.push(`- ${new Date(entry.createdAt).toISOString()} [${entry.actor}/${entry.kind}] ${entry.text}`)
      }
      lines.push('')
    }
    return lines.join('\n')
  }

  // Derived state
  const snapshotGoalRun = snapshot?.goalRun ?? null
  const snapshotComparativeRun = snapshot?.currentRun ?? null
  const goalRun = snapshotGoalRun ?? archivedGoalRun
  const comparativeRun = snapshotComparativeRun ?? archivedComparativeRun
  const phase = snapshot?.phase ?? 'idle'
  const log = snapshot?.log ?? []
  const activePanels = snapshot?.activePanels ?? []

  const isRunning = phase === 'planning' || phase === 'executing' || phase === 'verifying'
  const goalWorkKey = goalRun?.id ? `goal:${goalRun.id}` : null
  const reviewWorkKey = comparativeRun?.id ? `review:${comparativeRun.id}` : null
  const isGoalClosed = Boolean(goalWorkKey && closedWorkKey === goalWorkKey)
  const isReviewClosed = Boolean(reviewWorkKey && closedWorkKey === reviewWorkKey)
  const effectiveGoalRun = isGoalClosed ? null : goalRun
  const effectiveComparativeRun = isReviewClosed ? null : comparativeRun
  const hasWork = Boolean(effectiveGoalRun || effectiveComparativeRun || (isRunning && snapshot?.goal?.text))
  const goalText = effectiveGoalRun?.goal ?? effectiveComparativeRun?.goal ?? (isRunning ? snapshot?.goal?.text ?? null : null)
  const canStopRun = Boolean(goalText) && (isRunning || phase === 'paused')

  const taskCounts = effectiveGoalRun ? {
    total: effectiveGoalRun.tasks.length,
    completed: effectiveGoalRun.tasks.filter(t => t.status === 'completed').length,
    running: effectiveGoalRun.tasks.filter(t => t.status === 'running').length,
    failed: effectiveGoalRun.tasks.filter(t => t.status === 'failed').length,
    pending: effectiveGoalRun.tasks.filter(t => t.status === 'pending' || t.status === 'blocked').length,
  } : null

  const elapsed = effectiveGoalRun
    ? (effectiveGoalRun.completedAt ?? Date.now()) - effectiveGoalRun.createdAt
    : null

  return (
    <div className="h-full min-h-0 flex flex-col bg-neutral-50 dark:bg-neutral-900">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-neutral-200/80 dark:border-neutral-800 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${licensed ? 'bg-green-500 dark:bg-green-600' : 'bg-amber-500 dark:bg-amber-600'}`} />
            <span className="text-base font-medium text-neutral-700 dark:text-neutral-300">
              {pluginDisplayName} <span className="text-neutral-400 dark:text-neutral-500 font-normal">v{pluginVersion}</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              className="h-7 w-7 inline-flex items-center justify-center rounded-md border-0 bg-white hover:bg-neutral-50 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200"
              title="Orchestrator settings"
              onClick={onOpenSettings}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            {onClose && (
              <button className={UI_CLOSE_ICON_BUTTON_CLASS} onClick={onClose} title="Close">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {licensed && (
          <div className="flex items-center gap-2 mt-2">
            <select
              className="rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-xs px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as OrchestratorMode)
                setStatusMessage(null)
              }}
            >
              {(Object.keys(MODE_LABELS) as OrchestratorMode[]).map((key) => (
                <option key={key} value={key}>{MODE_LABELS[key].label}</option>
              ))}
            </select>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-xs px-2.5 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              onClick={() => { void handleImportMarkdown() }}
              title={`Open a markdown file as the ${modeConfig.label.toLowerCase()} prompt`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Open
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-xs px-2.5 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50"
              disabled={!hasWork}
              onClick={async () => {
                if (!hasWork || !workspaceRoot) return
                const api = getOrchestratorApi()
                if (typeof api.saveTranscriptFile !== 'function') return
                const content = buildWorkSummaryMarkdown({
                  goalRun: effectiveGoalRun,
                  comparativeRun: effectiveComparativeRun,
                  goalText,
                  phase,
                  log,
                })
                const suggestedFileName = `orchestrator-${mode === 'review' ? 'comparative' : 'goal'}-${new Date().toISOString().slice(0, 10)}.md`
                const result = await api.saveTranscriptFile(workspaceRoot, suggestedFileName, content)
                if (!result?.ok) {
                  setStatusMessage(result?.error || 'Unable to save orchestrator work.')
                  return
                }
                if (!result?.canceled) setStatusMessage(`Work saved: ${result?.path ?? suggestedFileName}`)
              }}
            >
              Save
            </button>
            {!isRunning && hasWork && (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-xs px-2.5 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                onClick={() => {
                  if (mode === 'review' && reviewWorkKey) setClosedWorkKey(reviewWorkKey)
                  else if (mode === 'goal-run' && goalWorkKey) setClosedWorkKey(goalWorkKey)
                  else setClosedWorkKey('__closed__')
                  setStatusMessage('Work closed. Panel reset to default view.')
                }}
              >
                Close Work
              </button>
            )}
            {mode === 'review' && effectiveComparativeRun && (
              <>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-xs px-2.5 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                  onClick={() => {
                    const panelId = effectiveComparativeRun.workerA.panelId
                    if (!panelId) {
                      setStatusMessage('Reviewer A panel is not available.')
                      return
                    }
                    onOpenAgentPanel?.(panelId)
                  }}
                >
                  Open Reviewer A
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-xs px-2.5 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                  onClick={() => {
                    const panelId = effectiveComparativeRun.workerB.panelId
                    if (!panelId) {
                      setStatusMessage('Reviewer B panel is not available.')
                      return
                    }
                    onOpenAgentPanel?.(panelId)
                  }}
                >
                  Open Reviewer B
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-xs px-2.5 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                  onClick={() => summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  Open Orchestrator Summary
                </button>
              </>
            )}
            {canStopRun && (
              <>
                {isRunning && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-200 text-xs px-2.5 py-1 hover:bg-amber-100 dark:hover:bg-amber-900/60 disabled:opacity-50"
                    onClick={() => { void handlePause() }}
                    disabled={stoppingRun}
                  >
                    {stoppingRun ? 'Pausing...' : 'Pause'}
                  </button>
                )}
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-200 text-xs px-2.5 py-1 hover:bg-red-100 dark:hover:bg-red-900/60 disabled:opacity-50"
                  onClick={() => { void handleCancel() }}
                  disabled={stoppingRun}
                >
                  {stoppingRun ? 'Working...' : 'Cancel'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      {!licensed ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-6 py-8 text-center">
          <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">License Required</div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed mb-4">
            Enter your orchestrator license key in Orchestrator Settings to enable goal-driven multi-agent workflows.
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
            onClick={onOpenSettings}
          >
            Open Settings
          </button>
        </div>
      ) : (
        <>
          {/* Dashboard content */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-1">

            {/* Status message */}
            {statusMessage && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 mb-2">
                {statusMessage}
              </div>
            )}

            {/* Idle state - show welcome */}
            {phase === 'idle' && !goalText && (
              <div className="py-6 text-center">
                <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  {mode === 'goal-run'
                    ? 'Describe a goal and the orchestrator will decompose it into tasks, spawn role-based agents, and execute them in parallel.'
                    : 'Start a comparative review to launch two reviewer agents, exchange notes, and return a transparent run log.'}
                </p>
              </div>
            )}

            {mode === 'review' && !isRunning && (
              <DashboardRow label="Reviewers">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-300 mb-1">Reviewer A</label>
                    <select
                      className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-xs px-2 py-1.5"
                      value={orchestratorSettings.comparativeReviewerAId}
                      onChange={(e) => setOrchestratorSettings((prev) => ({ ...prev, comparativeReviewerAId: e.target.value }))}
                    >
                      {orchestratorSettings.workerPool.map((worker) => (
                        <option key={worker.id} value={worker.id}>
                          {worker.label} ({worker.provider}{worker.model ? ` / ${worker.model}` : ''})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-300 mb-1">Reviewer B</label>
                    <select
                      className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-xs px-2 py-1.5"
                      value={orchestratorSettings.comparativeReviewerBId}
                      onChange={(e) => setOrchestratorSettings((prev) => ({ ...prev, comparativeReviewerBId: e.target.value }))}
                    >
                      {orchestratorSettings.workerPool.map((worker) => (
                        <option key={worker.id} value={worker.id}>
                          {worker.label} ({worker.provider}{worker.model ? ` / ${worker.model}` : ''})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </DashboardRow>
            )}

            {/* Goal display */}
            {goalText && (
              <DashboardRow label="Goal">
                <p className="whitespace-pre-wrap leading-relaxed">{goalText}</p>
              </DashboardRow>
            )}

            {/* Goal Run dashboard */}
            {effectiveGoalRun && (
              <>
                {/* Tasks summary */}
                {taskCounts && taskCounts.total > 0 && (
                  <DashboardRow label="Tasks">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-medium">{taskCounts.total} tasks</span>
                      {taskCounts.completed > 0 && <span className="text-green-600 dark:text-green-400">{taskCounts.completed} done</span>}
                      {taskCounts.running > 0 && <span className="text-blue-600 dark:text-blue-400">{taskCounts.running} running</span>}
                      {taskCounts.failed > 0 && <span className="text-red-600 dark:text-red-400">{taskCounts.failed} failed</span>}
                      {taskCounts.pending > 0 && <span className="text-neutral-400">{taskCounts.pending} pending</span>}
                    </div>
                    <div className="mt-2">
                      <TaskList tasks={effectiveGoalRun.tasks} />
                    </div>
                  </DashboardRow>
                )}

                {/* Agents table */}
                {effectiveGoalRun.tasks.some(t => t.status !== 'pending' && t.status !== 'blocked') && (
                  <DashboardRow label="Agents">
                    <AgentTable tasks={effectiveGoalRun.tasks} activePanels={activePanels} />
                  </DashboardRow>
                )}

                {/* Current state */}
                <DashboardRow label="State">
                  <div className="flex items-center gap-3">
                    <span className={`font-medium ${phase === 'complete' ? 'text-green-600 dark:text-green-400' : phase === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                      {PHASE_LABELS[phase] ?? phase}
                    </span>
                    {elapsed !== null && (
                      <span className="text-neutral-400 dark:text-neutral-500">{formatDuration(elapsed)}</span>
                    )}
                  </div>
                </DashboardRow>

                {/* Summary (when complete) */}
                {effectiveGoalRun.summary && (
                  <DashboardRow label="Summary">
                    <p className="whitespace-pre-wrap leading-relaxed">{effectiveGoalRun.summary}</p>
                  </DashboardRow>
                )}
              </>
            )}

            {/* Comparative review dashboard */}
            {effectiveComparativeRun && mode === 'review' && (
              <>
                <DashboardRow label="Status">
                  <span className="font-medium">{effectiveComparativeRun.status}</span>
                </DashboardRow>
                {effectiveComparativeRun.status !== 'complete' && (
                  <DashboardRow label="Agents">
                    <div className="space-y-1 text-[11px]">
                      <div>Reviewer A: {effectiveComparativeRun.workerA.panelId ?? 'launching...'}</div>
                      <div>Reviewer B: {effectiveComparativeRun.workerB.panelId ?? 'launching...'}</div>
                    </div>
                  </DashboardRow>
                )}
                {effectiveComparativeRun.status === 'complete' && (
                  <>
                    <DashboardRow label="Reviewer A">
                      <p className="whitespace-pre-wrap leading-relaxed text-xs">
                        {(effectiveComparativeRun.workerA.summary ?? '').trim() || deriveReviewerSummaryFromLog(log, 'A') || 'Reviewer A summary is not available in the current plugin payload.'}
                      </p>
                    </DashboardRow>
                    <DashboardRow label="Reviewer B">
                      <p className="whitespace-pre-wrap leading-relaxed text-xs">
                        {(effectiveComparativeRun.workerB.summary ?? '').trim() || deriveReviewerSummaryFromLog(log, 'B') || 'Reviewer B summary is not available in the current plugin payload.'}
                      </p>
                    </DashboardRow>
                  </>
                )}
                <div ref={summaryRef}>
                  <DashboardRow label="Orchestrator Summary">
                    <p className="whitespace-pre-wrap leading-relaxed text-xs">
                      {(effectiveComparativeRun.finalReport ?? '').trim() || 'Final orchestrator report is not available yet.'}
                    </p>
                  </DashboardRow>
                </div>
                {effectiveComparativeRun.error && (
                  <DashboardRow label="Error">
                    <span className="text-red-600 dark:text-red-400">{effectiveComparativeRun.error}</span>
                  </DashboardRow>
                )}
              </>
            )}

            {/* Error display */}
            {snapshot?.error && !effectiveGoalRun?.summary && (
              <DashboardRow label="Error">
                <span className="text-red-600 dark:text-red-400">{snapshot.error}</span>
              </DashboardRow>
            )}

            {/* Activity log */}
            {log.length > 0 && (
              <div className="pt-2">
                <ActivityLog log={log} />
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="shrink-0 px-3 py-2.5 border-t border-neutral-200/80 dark:border-neutral-800">
            <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mb-1.5 font-medium uppercase tracking-wide">
              {isRunning ? 'Interrupt Orchestrator:' : `${modeConfig.label} Prompt:`}
            </div>
            <div className="flex gap-2">
              <textarea
                className="flex-1 min-h-[36px] max-h-[120px] resize-none rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-800 placeholder:text-neutral-400 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder={isRunning ? 'Send a message to the orchestrator...' : modeConfig.placeholder}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
              />
              <button
                type="button"
                className="shrink-0 self-end h-9 px-4 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => { void handleSend() }}
                disabled={!inputValue.trim() || startingRun || stoppingRun}
              >
                {startingRun ? 'Starting...' : isRunning ? 'Submit' : modeConfig.button}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
