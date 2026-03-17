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
import { MODAL_BACKDROP_CLASS, MODAL_CARD_CLASS, UI_CLOSE_ICON_BUTTON_CLASS } from '../../constants'
import type { GitStatusState, OrchestratorSettings } from '../../types'
import { describeGitOperationPreflight } from '../../utils/gitOperationPreflight'

export interface OrchestratorPaneProps {
  pluginDisplayName: string
  pluginVersion: string
  licensed: boolean
  workspaceRoot: string
  onOpenSettings: () => void
  onOpenAgentPanel?: (panelId: string) => void
  onCreateTaskPanel?: (title: string, injectedPrompt: string) => Promise<string | null>
  onPanelClosed?: (panelId: string) => void
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

type OrchestratorMode = 'goal-run' | 'review' | 'task-list'

type TaskListItemStatus = 'pending' | 'in-progress' | 'done'

interface TaskListItem {
  id: string
  name: string
  status: TaskListItemStatus
  panelId?: string
}

type GoalWizardStep = 1 | 2 | 3 | 4 | 5 | 6

interface GoalPlanQuestion {
  id: string
  question: string
  answer: string
}

interface GoalPlanAgentRole {
  id: string
  agent: string
  role: string
}

interface GoalPlanSettings {
  orchestratorModel: string
  workerProvider: string
  workerModel: string
  maxParallelPanels: number
  maxTaskAttempts: number
  iterations: number
}

interface GoalPlan {
  id: string
  title: string
  goalPrompt: string
  clarificationQuestions: GoalPlanQuestion[]
  clarificationNotes: string
  requirements: string[]
  tasks: string[]
  agents: GoalPlanAgentRole[]
  settings: GoalPlanSettings
  createdAt: number
  updatedAt: number
}

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
  getGitStatus?: (workspaceRoot: string) => Promise<GitStatusState>
  gitCommit?: (workspaceRoot: string, selectedPaths?: string[]) => Promise<{ ok: boolean; error?: string }>
  gitPush?: (workspaceRoot: string, selectedPaths?: string[]) => Promise<{ ok: boolean; error?: string }>
  gitRollback?: (workspaceRoot: string, selectedPaths?: string[]) => Promise<{ ok: boolean; error?: string }>
  readWorkspaceTextFile?: (workspaceRoot: string, relativePath: string) => Promise<{ content: string } | null>
  writeWorkspaceFile?: (workspaceRoot: string, relativePath: string, content: string) => Promise<{ relativePath: string; size: number } | null>
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
  'task-list': {
    label: 'Task List',
    placeholder: '',
    button: '',
    importLabel: '',
  },
}

const TASK_LIST_STORAGE_DIR = '.barnaby/orchestrator/tasks'
const TASK_LIST_FILE = `${TASK_LIST_STORAGE_DIR}/task-list.json`

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

const GOAL_PLANS_STORAGE_KEY = 'agentorchestrator.goalPlans.v1'

const GOAL_WIZARD_STEPS: Array<{ id: GoalWizardStep; label: string }> = [
  { id: 1, label: 'Goal Prompt' },
  { id: 2, label: 'Clarifying Q&A' },
  { id: 3, label: 'Requirements' },
  { id: 4, label: 'Tasks' },
  { id: 5, label: 'Agents & Roles' },
  { id: 6, label: 'Settings' },
]

function makeLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function moveItem<T>(items: T[], fromIndex: number, delta: -1 | 1): T[] {
  const targetIndex = fromIndex + delta
  if (targetIndex < 0 || targetIndex >= items.length) return items
  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  next.splice(targetIndex, 0, item)
  return next
}

function createDefaultPlanSettings(orchestratorSettings: OrchestratorSettings): GoalPlanSettings {
  return {
    orchestratorModel: orchestratorSettings.orchestratorModel,
    workerProvider: orchestratorSettings.workerProvider,
    workerModel: orchestratorSettings.workerModel,
    maxParallelPanels: orchestratorSettings.maxParallelPanels,
    maxTaskAttempts: orchestratorSettings.maxTaskAttempts,
    iterations: orchestratorSettings.maxTaskAttempts,
  }
}

function createBlankGoalPlan(orchestratorSettings: OrchestratorSettings): GoalPlan {
  const id = makeLocalId('goal-plan')
  return {
    id,
    title: 'Untitled Goal Plan',
    goalPrompt: '',
    clarificationQuestions: [],
    clarificationNotes: '',
    requirements: [],
    tasks: [],
    agents: [],
    settings: createDefaultPlanSettings(orchestratorSettings),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

function buildPlanRunPrompt(plan: GoalPlan): string {
  const lines: string[] = []
  lines.push(`# ${plan.title}`)
  lines.push('')
  lines.push('## Goal')
  lines.push(plan.goalPrompt.trim() || '_No goal prompt provided._')
  lines.push('')
  if (plan.clarificationQuestions.length > 0) {
    lines.push('## Clarifying Q&A')
    for (const item of plan.clarificationQuestions) {
      lines.push(`- Q: ${item.question.trim() || '(empty question)'}`)
      lines.push(`  A: ${item.answer.trim() || '(no answer yet)'}`)
    }
    lines.push('')
  }
  if (plan.clarificationNotes.trim()) {
    lines.push('## Clarification Notes')
    lines.push(plan.clarificationNotes.trim())
    lines.push('')
  }
  if (plan.requirements.length > 0) {
    lines.push('## Numbered Requirements')
    plan.requirements.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`)
    })
    lines.push('')
  }
  if (plan.tasks.length > 0) {
    lines.push('## Task Order')
    plan.tasks.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`)
    })
    lines.push('')
  }
  if (plan.agents.length > 0) {
    lines.push('## Suggested Agents')
    plan.agents.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.agent} - ${item.role}`)
    })
    lines.push('')
  }
  lines.push('## Execution Constraints')
  lines.push(`- Max parallel panels: ${plan.settings.maxParallelPanels}`)
  lines.push(`- Max task attempts: ${plan.settings.maxTaskAttempts}`)
  lines.push(`- Iteration budget: ${plan.settings.iterations}`)
  if (plan.settings.orchestratorModel) lines.push(`- Orchestrator model: ${plan.settings.orchestratorModel}`)
  if (plan.settings.workerProvider) lines.push(`- Worker provider: ${plan.settings.workerProvider}`)
  if (plan.settings.workerModel) lines.push(`- Worker model: ${plan.settings.workerModel}`)
  return lines.join('\n')
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

function OrderedEditor({
  title,
  items,
  onChange,
  addLabel,
}: {
  title: string
  items: string[]
  onChange: (next: string[]) => void
  addLabel: string
}) {
  const [draft, setDraft] = useState('')
  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2 space-y-2">
      <div className="text-xs font-medium text-neutral-700 dark:text-neutral-200">{title}</div>
      <div className="space-y-1.5">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className="flex items-center gap-1.5">
            <span className="w-6 text-[11px] text-neutral-500 dark:text-neutral-400 text-right">{index + 1}.</span>
            <input
              className="flex-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-xs px-2 py-1.5"
              value={item}
              onChange={(e) => {
                const next = [...items]
                next[index] = e.target.value
                onChange(next)
              }}
            />
            <button
              type="button"
              className="h-7 px-2 rounded-md border border-neutral-300 dark:border-neutral-600 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              onClick={() => onChange(moveItem(items, index, -1))}
              disabled={index === 0}
            >
              Up
            </button>
            <button
              type="button"
              className="h-7 px-2 rounded-md border border-neutral-300 dark:border-neutral-600 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              onClick={() => onChange(moveItem(items, index, 1))}
              disabled={index === items.length - 1}
            >
              Down
            </button>
            <button
              type="button"
              className="h-7 px-2 rounded-md border border-red-300 dark:border-red-700 text-xs text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-xs px-2 py-1.5"
          value={draft}
          placeholder="Add item..."
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              const next = draft.trim()
              if (!next) return
              onChange([...items, next])
              setDraft('')
            }
          }}
        />
        <button
          type="button"
          className="h-8 px-2.5 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:opacity-50"
          disabled={!draft.trim()}
          onClick={() => {
            const next = draft.trim()
            if (!next) return
            onChange([...items, next])
            setDraft('')
          }}
        >
          {addLabel}
        </button>
      </div>
    </div>
  )
}

function GoalWizardModal({
  visible,
  step,
  draft,
  mode,
  onClose,
  onChangeStep,
  onChangeDraft,
  onSave,
}: {
  visible: boolean
  step: GoalWizardStep
  draft: GoalPlan
  mode: 'create' | 'edit'
  onClose: () => void
  onChangeStep: (next: GoalWizardStep) => void
  onChangeDraft: (updater: (prev: GoalPlan) => GoalPlan) => void
  onSave: () => void
}) {
  const [newQuestion, setNewQuestion] = useState('')
  if (!visible) return null

  return (
    <div className={MODAL_BACKDROP_CLASS}>
      <div className={`w-full max-w-4xl ${MODAL_CARD_CLASS}`}>
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div className="font-medium text-sm">{mode === 'edit' ? 'Edit Goal Plan' : 'New Goal Plan Wizard'}</div>
          <button className={UI_CLOSE_ICON_BUTTON_CLASS} onClick={onClose} title="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-4 pt-3 pb-2 border-b border-neutral-200 dark:border-neutral-800">
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-1.5">
            {GOAL_WIZARD_STEPS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`rounded-md border px-2 py-1.5 text-[11px] ${step === item.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-200'
                  : 'border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                onClick={() => onChangeStep(item.id)}
              >
                {item.id}. {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 max-h-[72vh] overflow-y-auto space-y-3">
          {step === 1 && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-200">Goal title</label>
              <input
                className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-2.5 py-1.5"
                value={draft.title}
                onChange={(e) => onChangeDraft((prev) => ({ ...prev, title: e.target.value }))}
              />
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-200">Goal prompt</label>
              <textarea
                className="w-full min-h-[180px] rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-2.5 py-2"
                value={draft.goalPrompt}
                placeholder="Describe the goal outcome, constraints, and success criteria."
                onChange={(e) => onChangeDraft((prev) => ({ ...prev, goalPrompt: e.target.value }))}
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2.5">
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Capture clarifying questions and answers until the requirements are concrete enough for step 3.
              </div>
              {draft.clarificationQuestions.map((item, index) => (
                <div key={item.id} className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2 space-y-1.5">
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400">Question {index + 1}</div>
                  <input
                    className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-xs px-2 py-1.5"
                    value={item.question}
                    placeholder="Clarifying question"
                    onChange={(e) => onChangeDraft((prev) => ({
                      ...prev,
                      clarificationQuestions: prev.clarificationQuestions.map((row) => (row.id === item.id ? { ...row, question: e.target.value } : row)),
                    }))}
                  />
                  <textarea
                    className="w-full min-h-[72px] rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-xs px-2 py-1.5"
                    value={item.answer}
                    placeholder="User answer / inferred answer"
                    onChange={(e) => onChangeDraft((prev) => ({
                      ...prev,
                      clarificationQuestions: prev.clarificationQuestions.map((row) => (row.id === item.id ? { ...row, answer: e.target.value } : row)),
                    }))}
                  />
                  <button
                    type="button"
                    className="h-7 px-2 rounded-md border border-red-300 dark:border-red-700 text-xs text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={() => onChangeDraft((prev) => ({
                      ...prev,
                      clarificationQuestions: prev.clarificationQuestions.filter((row) => row.id !== item.id),
                    }))}
                  >
                    Delete question
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-xs px-2 py-1.5"
                  value={newQuestion}
                  placeholder="Add a clarifying question..."
                  onChange={(e) => setNewQuestion(e.target.value)}
                />
                <button
                  type="button"
                  className="h-8 px-2.5 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:opacity-50"
                  disabled={!newQuestion.trim()}
                  onClick={() => {
                    const next = newQuestion.trim()
                    if (!next) return
                    onChangeDraft((prev) => ({
                      ...prev,
                      clarificationQuestions: [...prev.clarificationQuestions, { id: makeLocalId('q'), question: next, answer: '' }],
                    }))
                    setNewQuestion('')
                  }}
                >
                  Add Question
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-200 mb-1">Extra clarification notes</label>
                <textarea
                  className="w-full min-h-[100px] rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-xs px-2 py-1.5"
                  value={draft.clarificationNotes}
                  onChange={(e) => onChangeDraft((prev) => ({ ...prev, clarificationNotes: e.target.value }))}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-2">
              <OrderedEditor
                title="Identified requirements"
                items={draft.requirements}
                onChange={(next) => onChangeDraft((prev) => ({ ...prev, requirements: next }))}
                addLabel="Add"
              />
              <button
                type="button"
                className="h-8 px-2.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => onChangeStep(2)}
              >
                Ask More Questions
              </button>
            </div>
          )}

          {step === 4 && (
            <OrderedEditor
              title="Task sequence"
              items={draft.tasks}
              onChange={(next) => onChangeDraft((prev) => ({ ...prev, tasks: next }))}
              addLabel="Add"
            />
          )}

          {step === 5 && (
            <div className="space-y-2">
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Suggested agents and roles. You can edit the list; the orchestrator still makes the final execution decisions.
              </div>
              {draft.agents.map((item, index) => (
                <div key={item.id} className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2 grid grid-cols-1 sm:grid-cols-[1.1fr_1.6fr_auto_auto_auto] gap-2 items-center">
                  <input
                    className="rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-xs px-2 py-1.5"
                    value={item.agent}
                    placeholder="Agent name"
                    onChange={(e) => onChangeDraft((prev) => ({
                      ...prev,
                      agents: prev.agents.map((row) => (row.id === item.id ? { ...row, agent: e.target.value } : row)),
                    }))}
                  />
                  <input
                    className="rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-xs px-2 py-1.5"
                    value={item.role}
                    placeholder="Role"
                    onChange={(e) => onChangeDraft((prev) => ({
                      ...prev,
                      agents: prev.agents.map((row) => (row.id === item.id ? { ...row, role: e.target.value } : row)),
                    }))}
                  />
                  <button
                    type="button"
                    className="h-7 px-2 rounded-md border border-neutral-300 dark:border-neutral-600 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                    onClick={() => onChangeDraft((prev) => ({ ...prev, agents: moveItem(prev.agents, index, -1) }))}
                    disabled={index === 0}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="h-7 px-2 rounded-md border border-neutral-300 dark:border-neutral-600 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                    onClick={() => onChangeDraft((prev) => ({ ...prev, agents: moveItem(prev.agents, index, 1) }))}
                    disabled={index === draft.agents.length - 1}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    className="h-7 px-2 rounded-md border border-red-300 dark:border-red-700 text-xs text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={() => onChangeDraft((prev) => ({ ...prev, agents: prev.agents.filter((row) => row.id !== item.id) }))}
                  >
                    Delete
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="h-8 px-2.5 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700"
                onClick={() => onChangeDraft((prev) => ({
                  ...prev,
                  agents: [...prev.agents, { id: makeLocalId('agent'), agent: 'Worker', role: '' }],
                }))}
              >
                Add Agent
              </button>
            </div>
          )}

          {step === 6 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium text-neutral-700 dark:text-neutral-200 mb-1">Orchestrator model</label>
                <input
                  className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1.5"
                  value={draft.settings.orchestratorModel}
                  onChange={(e) => onChangeDraft((prev) => ({ ...prev, settings: { ...prev.settings, orchestratorModel: e.target.value } }))}
                />
              </div>
              <div>
                <label className="block font-medium text-neutral-700 dark:text-neutral-200 mb-1">Worker provider</label>
                <input
                  className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1.5"
                  value={draft.settings.workerProvider}
                  onChange={(e) => onChangeDraft((prev) => ({ ...prev, settings: { ...prev.settings, workerProvider: e.target.value } }))}
                />
              </div>
              <div>
                <label className="block font-medium text-neutral-700 dark:text-neutral-200 mb-1">Worker model</label>
                <input
                  className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1.5"
                  value={draft.settings.workerModel}
                  onChange={(e) => onChangeDraft((prev) => ({ ...prev, settings: { ...prev.settings, workerModel: e.target.value } }))}
                />
              </div>
              <div>
                <label className="block font-medium text-neutral-700 dark:text-neutral-200 mb-1">Max parallel panels</label>
                <input
                  type="number"
                  min={1}
                  max={8}
                  className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1.5"
                  value={draft.settings.maxParallelPanels}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10)
                    if (!Number.isNaN(value)) onChangeDraft((prev) => ({ ...prev, settings: { ...prev.settings, maxParallelPanels: value } }))
                  }}
                />
              </div>
              <div>
                <label className="block font-medium text-neutral-700 dark:text-neutral-200 mb-1">Max task attempts</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1.5"
                  value={draft.settings.maxTaskAttempts}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10)
                    if (!Number.isNaN(value)) onChangeDraft((prev) => ({ ...prev, settings: { ...prev.settings, maxTaskAttempts: value } }))
                  }}
                />
              </div>
              <div>
                <label className="block font-medium text-neutral-700 dark:text-neutral-200 mb-1">Iteration budget</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1.5"
                  value={draft.settings.iterations}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10)
                    if (!Number.isNaN(value)) onChangeDraft((prev) => ({ ...prev, settings: { ...prev.settings, iterations: value } }))
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <button
            type="button"
            className="h-8 px-3 rounded-md border border-neutral-300 dark:border-neutral-600 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
            disabled={step === 1}
            onClick={() => onChangeStep(Math.max(1, step - 1) as GoalWizardStep)}
          >
            Back
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-8 px-3 rounded-md border border-neutral-300 dark:border-neutral-600 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={onClose}
            >
              Cancel
            </button>
            {step < 6 ? (
              <button
                type="button"
                className="h-8 px-3 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700"
                onClick={() => onChangeStep(Math.min(6, step + 1) as GoalWizardStep)}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className="h-8 px-3 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700"
                onClick={onSave}
              >
                Save Plan
              </button>
            )}
          </div>
        </div>
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
  onCreateTaskPanel,
  onPanelClosed,
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
  const [goalPlans, setGoalPlans] = useState<GoalPlan[]>([])
  const [selectedGoalPlanId, setSelectedGoalPlanId] = useState<string | null>(null)
  const [wizardVisible, setWizardVisible] = useState(false)
  const [wizardMode, setWizardMode] = useState<'create' | 'edit'>('create')
  const [wizardStep, setWizardStep] = useState<GoalWizardStep>(1)
  const [wizardDraft, setWizardDraft] = useState<GoalPlan>(() => createBlankGoalPlan(orchestratorSettings))
  const [taskListItems, setTaskListItems] = useState<TaskListItem[]>([])
  const [taskListLoaded, setTaskListLoaded] = useState(false)
  const [taskEditingId, setTaskEditingId] = useState<string | null>(null)
  const [taskEditDraft, setTaskEditDraft] = useState('')
  const [taskNewDraft, setTaskNewDraft] = useState('')
  const taskListItemsRef = useRef(taskListItems)
  taskListItemsRef.current = taskListItems
  const summaryRef = useRef<HTMLDivElement>(null)
  const modeConfig = MODE_LABELS[mode]

  // ── Task list file persistence ─────────────────────────────────────

  const loadTaskList = useCallback(async () => {
    if (!workspaceRoot) return
    const api = getOrchestratorApi()
    if (typeof api.readWorkspaceTextFile !== 'function') return
    try {
      const result = await api.readWorkspaceTextFile(workspaceRoot, TASK_LIST_FILE)
      if (result?.content) {
        const parsed = JSON.parse(result.content) as TaskListItem[]
        if (Array.isArray(parsed)) {
          setTaskListItems(parsed)
        }
      }
    } catch {
      // File doesn't exist yet — start empty. Create folder structure.
      if (typeof api.writeWorkspaceFile === 'function') {
        await api.writeWorkspaceFile(workspaceRoot, `${TASK_LIST_STORAGE_DIR}/.gitkeep`, '').catch(() => {})
        await api.writeWorkspaceFile(workspaceRoot, '.barnaby/orchestrator/goals/.gitkeep', '').catch(() => {})
        await api.writeWorkspaceFile(workspaceRoot, '.barnaby/orchestrator/comparative-reviews/.gitkeep', '').catch(() => {})
      }
    }
    setTaskListLoaded(true)
  }, [workspaceRoot])

  const saveTaskList = useCallback(async (items: TaskListItem[]) => {
    if (!workspaceRoot) return
    const api = getOrchestratorApi()
    if (typeof api.writeWorkspaceFile !== 'function') return
    try {
      await api.writeWorkspaceFile(workspaceRoot, TASK_LIST_FILE, JSON.stringify(items, null, 2))
    } catch {
      // Best-effort write
    }
  }, [workspaceRoot])

  useEffect(() => {
    if (mode === 'task-list' && !taskListLoaded) {
      void loadTaskList()
    }
  }, [mode, taskListLoaded, loadTaskList])

  const updateTaskListAndSave = useCallback((updater: (prev: TaskListItem[]) => TaskListItem[]) => {
    setTaskListItems((prev) => {
      const next = updater(prev)
      void saveTaskList(next)
      return next
    })
  }, [saveTaskList])

  const addTask = useCallback((name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    updateTaskListAndSave((prev) => [...prev, { id: makeLocalId('task'), name: trimmed, status: 'pending' }])
  }, [updateTaskListAndSave])

  const deleteTask = useCallback((taskId: string) => {
    updateTaskListAndSave((prev) => prev.filter((t) => t.id !== taskId))
  }, [updateTaskListAndSave])

  const updateTaskName = useCallback((taskId: string, name: string) => {
    updateTaskListAndSave((prev) => prev.map((t) => t.id === taskId ? { ...t, name } : t))
  }, [updateTaskListAndSave])

  const updateTaskStatus = useCallback((taskId: string, status: TaskListItemStatus) => {
    updateTaskListAndSave((prev) => prev.map((t) => t.id === taskId ? { ...t, status } : t))
  }, [updateTaskListAndSave])

  const moveTask = useCallback((fromIndex: number, delta: -1 | 1) => {
    updateTaskListAndSave((prev) => moveItem(prev, fromIndex, delta))
  }, [updateTaskListAndSave])

  const startOrContinueTask = useCallback(async (task: TaskListItem) => {
    if (!onCreateTaskPanel || !workspaceRoot) return

    const logRelPath = `${TASK_LIST_STORAGE_DIR}/${task.id}-log.md`
    const injectedPrompt = `Please continue with this task: ${task.name}. Provide current status as per log ${logRelPath}, and request next steps from user.\n\nIMPORTANT: Update your progress to the log file at \`${logRelPath}\` as you work. When done, ask the user if the task is complete.`

    const panelId = await onCreateTaskPanel(task.name, injectedPrompt)
    if (panelId) {
      updateTaskListAndSave((prev) =>
        prev.map((t) => t.id === task.id ? { ...t, status: 'in-progress', panelId } : t),
      )
      // Create initial log file if it doesn't exist
      const api = getOrchestratorApi()
      if (typeof api.readWorkspaceTextFile === 'function') {
        try {
          await api.readWorkspaceTextFile(workspaceRoot, logRelPath)
        } catch {
          // File doesn't exist, create it
          if (typeof api.writeWorkspaceFile === 'function') {
            const initialLog = `# Task Log: ${task.name}\n\nCreated: ${new Date().toISOString()}\n\n## Progress\n\n- Task started\n`
            await api.writeWorkspaceFile(workspaceRoot, logRelPath, initialLog).catch(() => {})
          }
        }
      }
    }
  }, [onCreateTaskPanel, workspaceRoot, updateTaskListAndSave])

  const markTaskComplete = useCallback((taskId: string) => {
    updateTaskListAndSave((prev) => prev.map((t) => t.id === taskId ? { ...t, status: 'done', panelId: undefined } : t))
  }, [updateTaskListAndSave])

  // Listen for panel close events to prompt task completion
  const panelCloseCheckRef = useRef<(panelId: string) => void>()
  panelCloseCheckRef.current = (panelId: string) => {
    const task = taskListItemsRef.current.find((t) => t.panelId === panelId && t.status === 'in-progress')
    if (!task) return
    const isComplete = globalThis.confirm(`Is the task "${task.name}" complete?`)
    if (isComplete) {
      markTaskComplete(task.id)
    } else {
      updateTaskListAndSave((prev) =>
        prev.map((t) => t.id === task.id ? { ...t, panelId: undefined } : t),
      )
    }
  }

  // Expose panel close check to parent via a stable callback on window
  useEffect(() => {
    const w = window as unknown as { __orchestratorPanelCloseCheck?: (panelId: string) => void }
    w.__orchestratorPanelCloseCheck = (panelId: string) => {
      panelCloseCheckRef.current?.(panelId)
    }
    return () => { delete w.__orchestratorPanelCloseCheck }
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(GOAL_PLANS_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as GoalPlan[]
      if (!Array.isArray(parsed)) return
      setGoalPlans(parsed)
      if (parsed.length > 0) setSelectedGoalPlanId(parsed[0].id)
    } catch {
      // Best-effort local state restore
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(GOAL_PLANS_STORAGE_KEY, JSON.stringify(goalPlans))
    } catch {
      // Ignore storage write failures
    }
  }, [goalPlans])

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
  const selectedGoalPlan = goalPlans.find((item) => item.id === selectedGoalPlanId) ?? null

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

  const openNewGoalWizard = useCallback(() => {
    setWizardMode('create')
    setWizardStep(1)
    setWizardDraft(createBlankGoalPlan(orchestratorSettings))
    setWizardVisible(true)
  }, [orchestratorSettings])

  const openSelectedGoalPlan = useCallback(() => {
    if (!selectedGoalPlan) {
      setStatusMessage('No saved plan selected.')
      return
    }
    setWizardMode('edit')
    setWizardStep(1)
    setWizardDraft({ ...selectedGoalPlan, settings: { ...selectedGoalPlan.settings } })
    setWizardVisible(true)
  }, [selectedGoalPlan])

  const saveGoalPlanFromWizard = useCallback(() => {
    const timestamp = Date.now()
    const normalizedTitle = wizardDraft.title.trim() || 'Untitled Goal Plan'
    const normalizedPrompt = wizardDraft.goalPrompt.trim()
    if (!normalizedPrompt) {
      setStatusMessage('Goal prompt is required before saving.')
      return
    }
    const nextPlan: GoalPlan = {
      ...wizardDraft,
      title: normalizedTitle,
      goalPrompt: normalizedPrompt,
      updatedAt: timestamp,
      createdAt: wizardMode === 'edit' ? wizardDraft.createdAt : timestamp,
    }
    setGoalPlans((prev) => {
      if (wizardMode === 'edit') {
        return prev.map((plan) => (plan.id === nextPlan.id ? nextPlan : plan))
      }
      return [nextPlan, ...prev]
    })
    setSelectedGoalPlanId(nextPlan.id)
    setWizardVisible(false)
    setStatusMessage(`Plan saved: ${nextPlan.title}`)
  }, [wizardDraft, wizardMode])

  const runSelectedGoalPlan = useCallback(async () => {
    if (!selectedGoalPlan) {
      setStatusMessage('Select or create a goal plan first.')
      return
    }
    setOrchestratorSettings((prev) => ({
      ...prev,
      orchestratorModel: selectedGoalPlan.settings.orchestratorModel,
      workerProvider: selectedGoalPlan.settings.workerProvider,
      workerModel: selectedGoalPlan.settings.workerModel,
      maxParallelPanels: selectedGoalPlan.settings.maxParallelPanels,
      maxTaskAttempts: selectedGoalPlan.settings.maxTaskAttempts,
    }))
    const prompt = buildPlanRunPrompt(selectedGoalPlan)
    await handleSend(prompt)
  }, [selectedGoalPlan, setOrchestratorSettings, handleSend])

  const deleteSelectedGoalPlan = useCallback(() => {
    if (!selectedGoalPlan) return
    setGoalPlans((prev) => {
      const next = prev.filter((item) => item.id !== selectedGoalPlan.id)
      setSelectedGoalPlanId(next[0]?.id ?? null)
      return next
    })
    setStatusMessage(`Deleted plan: ${selectedGoalPlan.title}`)
  }, [selectedGoalPlan])

  const handleGitCommitAndPush = useCallback(async () => {
    if (!workspaceRoot) {
      setStatusMessage('Workspace root is not available.')
      return
    }
    const api = getOrchestratorApi()
    if (typeof api.gitPush !== 'function') {
      setStatusMessage('COMMIT and PUSH is not available in this build.')
      return
    }
    let gitStatus: GitStatusState | null = null
    if (typeof api.getGitStatus === 'function') {
      try {
        gitStatus = await api.getGitStatus(workspaceRoot)
      } catch {
        gitStatus = null
      }
    }
    const preflight = describeGitOperationPreflight({
      op: 'push',
      workspaceRoot,
      gitStatus,
      selectedPaths: gitStatus?.entries.map((entry) => entry.relativePath) ?? [],
    })
    const confirmed = globalThis.confirm([
      preflight.title,
      '',
      'This shortcut is labeled COMMIT and PUSH.',
      'It is expected to commit current workspace changes first and then push.',
      '',
      ...preflight.details,
    ].join('\n'))
    if (!confirmed) {
      setStatusMessage('COMMIT and PUSH canceled.')
      return
    }
    const result = await api.gitPush(workspaceRoot)
    setStatusMessage(result?.ok ? 'Git push completed.' : result?.error ?? 'Git push failed.')
  }, [workspaceRoot])

  const handleGitRollback = useCallback(async () => {
    if (!workspaceRoot) {
      setStatusMessage('Workspace root is not available.')
      return
    }
    const api = getOrchestratorApi()
    if (typeof api.gitRollback !== 'function') {
      setStatusMessage('ROLLBACK macro is not available yet in this build.')
      return
    }
    const result = await api.gitRollback(workspaceRoot)
    setStatusMessage(result?.ok ? 'Workspace rolled back.' : result?.error ?? 'Rollback failed.')
  }, [workspaceRoot])

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
              className="inline-flex items-center gap-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-xs px-2.5 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50"
              onClick={openNewGoalWizard}
              disabled={mode !== 'goal-run'}
              title="Create a new goal plan with the setup wizard"
            >
              New
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-xs px-2.5 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50"
              onClick={openSelectedGoalPlan}
              disabled={mode !== 'goal-run' || !selectedGoalPlan}
              title="Open selected goal plan in wizard"
            >
              Open
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-xs px-2.5 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              onClick={() => { void handleImportMarkdown() }}
              title={`Import markdown as the ${modeConfig.label.toLowerCase()} prompt`}
            >
              Import
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

            {mode === 'goal-run' && (
              <DashboardRow label="Loaded Plan">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <select
                      className="flex-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-xs px-2 py-1.5"
                      value={selectedGoalPlanId ?? ''}
                      onChange={(e) => setSelectedGoalPlanId(e.target.value || null)}
                    >
                      <option value="">No plan selected</option>
                      {goalPlans.map((plan) => (
                        <option key={plan.id} value={plan.id}>{plan.title}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="h-8 px-2.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                      onClick={openNewGoalWizard}
                    >
                      New
                    </button>
                    <button
                      type="button"
                      className="h-8 px-2.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50"
                      onClick={openSelectedGoalPlan}
                      disabled={!selectedGoalPlan}
                    >
                      Open
                    </button>
                  </div>
                  {selectedGoalPlan ? (
                    <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium text-neutral-700 dark:text-neutral-200">{selectedGoalPlan.title}</div>
                        <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                          req {selectedGoalPlan.requirements.length} • tasks {selectedGoalPlan.tasks.length}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          className="h-7 px-2.5 rounded-md bg-blue-600 text-white text-[11px] hover:bg-blue-700 disabled:opacity-50"
                          onClick={() => { void runSelectedGoalPlan() }}
                          disabled={startingRun || stoppingRun}
                        >
                          RUN
                        </button>
                        <button
                          type="button"
                          className="h-7 px-2.5 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-200 text-[11px] hover:bg-amber-100 dark:hover:bg-amber-900/60 disabled:opacity-50"
                          onClick={() => { void handlePause() }}
                          disabled={!isRunning || stoppingRun}
                        >
                          PAUSE
                        </button>
                        <button
                          type="button"
                          className="h-7 px-2.5 rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-200 text-[11px] hover:bg-red-100 dark:hover:bg-red-900/60 disabled:opacity-50"
                          onClick={() => { void handleCancel() }}
                          disabled={!canStopRun || stoppingRun}
                        >
                          CANCEL
                        </button>
                        <button
                          type="button"
                          className="h-7 px-2.5 rounded-md border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 text-[11px] hover:bg-red-50 dark:hover:bg-red-950/30"
                          onClick={deleteSelectedGoalPlan}
                        >
                          DELETE
                        </button>
                        <button
                          type="button"
                          className="h-7 px-2.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 text-[11px] hover:bg-neutral-100 dark:hover:bg-neutral-800"
                          onClick={() => { void handleGitCommitAndPush() }}
                        >
                          COMMIT and PUSH
                        </button>
                        <button
                          type="button"
                          className="h-7 px-2.5 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 text-[11px] hover:bg-neutral-100 dark:hover:bg-neutral-800"
                          onClick={() => { void handleGitRollback() }}
                        >
                          ROLLBACK
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      No saved goal plan. Use New to run the setup wizard.
                    </div>
                  )}
                </div>
              </DashboardRow>
            )}

            {/* Task List view */}
            {mode === 'task-list' && (
              <div className="space-y-3">
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  Manage standalone tasks. Start/Continue opens a chat panel that picks up where you left off.
                </div>

                {/* Add new task */}
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-xs px-2.5 py-1.5 placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
                    value={taskNewDraft}
                    placeholder="New task name..."
                    onChange={(e) => setTaskNewDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTask(taskNewDraft)
                        setTaskNewDraft('')
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="h-8 px-3 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:opacity-50"
                    disabled={!taskNewDraft.trim()}
                    onClick={() => {
                      addTask(taskNewDraft)
                      setTaskNewDraft('')
                    }}
                  >
                    Add
                  </button>
                </div>

                {/* Task list */}
                {taskListItems.length === 0 && taskListLoaded && (
                  <div className="py-4 text-center text-xs text-neutral-400 dark:text-neutral-500 italic">
                    No tasks yet. Add one above.
                  </div>
                )}
                <div className="space-y-1.5">
                  {taskListItems.map((task, index) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 rounded-md border border-neutral-200 dark:border-neutral-700 px-2.5 py-2 bg-white dark:bg-neutral-800/60"
                    >
                      {/* Status indicator */}
                      <span className="text-sm shrink-0" title={task.status}>
                        {task.status === 'done' ? '\u2705' : task.status === 'in-progress' ? '\u{1F504}' : '\u23F3'}
                      </span>

                      {/* Name (editable) */}
                      {taskEditingId === task.id ? (
                        <input
                          className="flex-1 rounded-md border border-blue-400 dark:border-blue-600 bg-white dark:bg-neutral-800 text-xs px-2 py-1"
                          value={taskEditDraft}
                          autoFocus
                          onChange={(e) => setTaskEditDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              updateTaskName(task.id, taskEditDraft)
                              setTaskEditingId(null)
                            } else if (e.key === 'Escape') {
                              setTaskEditingId(null)
                            }
                          }}
                          onBlur={() => {
                            updateTaskName(task.id, taskEditDraft)
                            setTaskEditingId(null)
                          }}
                        />
                      ) : (
                        <span
                          className={`flex-1 text-xs cursor-pointer ${task.status === 'done' ? 'line-through text-neutral-400 dark:text-neutral-500' : 'text-neutral-700 dark:text-neutral-200'}`}
                          onDoubleClick={() => {
                            setTaskEditingId(task.id)
                            setTaskEditDraft(task.name)
                          }}
                          title="Double-click to edit"
                        >
                          {task.name}
                        </span>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        {task.status !== 'done' && (
                          <button
                            type="button"
                            className="h-6 px-2 rounded border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 text-[10px] hover:bg-green-100 dark:hover:bg-green-900/40"
                            onClick={() => { void startOrContinueTask(task) }}
                            title="Start or continue this task in a new chat panel"
                          >
                            {task.status === 'in-progress' ? 'Continue' : 'Start'}
                          </button>
                        )}
                        {task.status === 'in-progress' && (
                          <button
                            type="button"
                            className="h-6 px-2 rounded border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 text-[10px] hover:bg-blue-50 dark:hover:bg-blue-950/30"
                            onClick={() => markTaskComplete(task.id)}
                            title="Mark as done"
                          >
                            Done
                          </button>
                        )}
                        <button
                          type="button"
                          className="h-6 px-1.5 rounded border border-neutral-300 dark:border-neutral-600 text-neutral-500 dark:text-neutral-400 text-[10px] hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-30"
                          onClick={() => moveTask(index, -1)}
                          disabled={index === 0}
                          title="Move up"
                        >
                          {'\u25B2'}
                        </button>
                        <button
                          type="button"
                          className="h-6 px-1.5 rounded border border-neutral-300 dark:border-neutral-600 text-neutral-500 dark:text-neutral-400 text-[10px] hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-30"
                          onClick={() => moveTask(index, 1)}
                          disabled={index === taskListItems.length - 1}
                          title="Move down"
                        >
                          {'\u25BC'}
                        </button>
                        <button
                          type="button"
                          className="h-6 px-1.5 rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-[10px] hover:bg-red-50 dark:hover:bg-red-950/30"
                          onClick={() => deleteTask(task.id)}
                          title="Delete task"
                        >
                          {'\u2715'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary stats */}
                {taskListItems.length > 0 && (
                  <div className="flex items-center gap-3 text-[10px] text-neutral-400 dark:text-neutral-500 pt-1">
                    <span>{taskListItems.length} tasks</span>
                    <span>{taskListItems.filter(t => t.status === 'done').length} done</span>
                    <span>{taskListItems.filter(t => t.status === 'in-progress').length} active</span>
                    <span>{taskListItems.filter(t => t.status === 'pending').length} pending</span>
                  </div>
                )}
              </div>
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

          {/* Input area (hidden in task-list mode) */}
          {mode !== 'task-list' && <div className="shrink-0 px-3 py-2.5 border-t border-neutral-200/80 dark:border-neutral-800">
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
          </div>}
        </>
      )}
      <GoalWizardModal
        visible={wizardVisible}
        step={wizardStep}
        draft={wizardDraft}
        mode={wizardMode}
        onClose={() => setWizardVisible(false)}
        onChangeStep={setWizardStep}
        onChangeDraft={(updater) => setWizardDraft((prev) => updater(prev))}
        onSave={saveGoalPlanFromWizard}
      />
    </div>
  )
}
