/**
 * Barnaby Plugin Host – shared type definitions.
 *
 * These types define the contract between Barnaby core and external plugins
 * (e.g. the Orchestrator add-on).  Plugins are discovered and loaded at
 * startup; see pluginHost.ts for the runtime implementation.
 */

export type PluginId = string

export type PanelStatus = 'idle' | 'connecting' | 'busy' | 'error' | 'completed' | 'closed'

export interface PanelInfo {
  id: string
  status: PanelStatus
  model: string
  provider: string
  streaming: boolean
  messageCount: number
}

export interface PanelCreateOptions {
  model?: string
  provider?: string
  workspace?: string
  interactionMode?: 'agent' | 'plan' | 'debug' | 'ask'
  permissionMode?: 'verify-first' | 'proceed-always'
  sandbox?: 'read-only' | 'workspace-write'
  /** Extra system prompt text appended to the agent's instructions. */
  additionalSystemPrompt?: string
  /** Restrict which tools the agent can use (allowlist). Empty/undefined = all tools allowed. */
  toolRestrictions?: string[]
}

export interface PanelMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  format?: 'text' | 'markdown'
  createdAt?: number
}

export interface AgentEvent {
  type: string
  [key: string]: unknown
}

export interface Disposable {
  dispose(): void
}

export interface WorkspaceFileInfo {
  relativePath: string
  size: number
  content: string
  binary?: boolean
  truncated?: boolean
}

export interface WorkspaceTreeNode {
  name: string
  relativePath: string
  type: 'file' | 'directory'
  children?: WorkspaceTreeNode[]
}

/**
 * The host API exposed to plugins by Barnaby core.
 * Plugins receive this via their `activate(host)` call.
 */
export interface BarnabyPluginHostApi {
  // --- Panel lifecycle ---
  createPanel(options?: PanelCreateOptions): Promise<string>
  closePanel(panelId: string): Promise<void>
  sendMessage(panelId: string, message: string, attachments?: string[]): Promise<void>
  interruptPanel(panelId: string): Promise<void>
  getPanelInfo(panelId: string): Promise<PanelInfo | null>
  getPanelMessages(panelId: string): Promise<PanelMessage[]>
  listPanels(): Promise<PanelInfo[]>

  // --- Events ---
  onPanelEvent(panelId: string, handler: (evt: AgentEvent) => void): Disposable
  onAnyPanelEvent(handler: (panelId: string, evt: AgentEvent) => void): Disposable
  onPanelTurnComplete(panelId: string, handler: () => void): Disposable

  // --- Workspace / filesystem ---
  readFile(relativePath: string): Promise<WorkspaceFileInfo>
  writeFile(relativePath: string, content: string): Promise<{ relativePath: string; size: number }>
  listFiles(options?: { includeHidden?: boolean }): Promise<{ nodes: WorkspaceTreeNode[]; truncated: boolean }>
  getWorkspaceRoot(): string

  // --- UI ---
  /**
   * Register a renderer-side React component to be shown in the dock pane
   * when the orchestrator tab is selected. Only one registration per plugin
   * is supported; subsequent calls replace the previous component.
   */
  registerDockPane(pluginId: PluginId, render: (props: DockPaneProps) => any): void

  // --- Settings / storage ---
  getSetting(key: string): unknown
  setSetting(key: string, value: unknown): void

  /** Returns whether a valid orchestrator license key is stored. */
  getOrchestratorLicenseKeyState(): { hasKey: boolean }

  // --- Logging ---
  log(pluginId: PluginId, level: 'info' | 'warn' | 'error', message: string): void
}

export interface DockPaneProps {
  workspaceRoot: string
  theme: 'light' | 'dark'
  hostApi: BarnabyPluginHostApi
}

/**
 * Lifecycle hooks that a plugin can optionally declare for crash-recovery
 * monitoring by the core heartbeat system.
 */
export interface PluginLifecycleConfig {
  pluginId: PluginId
  stateFilePath: string
  heartbeatField: string
  staleThresholdMs: number
  recoveryPrompt: string
}

// ---------------------------------------------------------------------------
// Orchestrator: Goal Run types (Phase 6 multi-agent orchestration)
// ---------------------------------------------------------------------------

export type AgentRole = 'builder' | 'reviewer' | 'researcher' | 'planner'

export type GoalRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
export type GoalRunTaskStatus = 'pending' | 'blocked' | 'running' | 'completed' | 'failed' | 'skipped'

export interface GoalRunTask {
  id: string
  title: string
  description: string
  role: AgentRole
  status: GoalRunTaskStatus
  /** Task IDs that must complete before this task can start. */
  dependsOn: string[]
  /** Panel ID assigned when the task is dispatched to an agent. */
  panelId?: string
  /** Structured signal received from the agent upon completion. */
  result?: AgentSignal
  /** Number of attempts made (for retry logic). */
  attempts: number
  createdAt: number
  startedAt?: number
  completedAt?: number
}

export interface GoalRun {
  id: string
  goal: string
  status: GoalRunStatus
  tasks: GoalRunTask[]
  createdAt: number
  completedAt?: number
  /** Final summary produced by the orchestrator after all tasks finish. */
  summary?: string
}

/**
 * Structured signal that agents embed in their output to communicate
 * status back to the orchestrator.
 */
export type AgentSignal =
  | { type: 'completed'; summary: string }
  | { type: 'failed'; reason: string }
  | { type: 'progress'; message: string; percentComplete?: number }
  | { type: 'escalate'; question: string }
  | { type: 'needs-review'; files: string[]; summary: string }

/**
 * Role-specific system prompt prefixes used when spawning agents.
 */
export const AGENT_ROLE_PROMPTS: Record<AgentRole, string> = {
  builder:
    'You are a Builder agent. Your job is to implement the assigned task by writing code. ' +
    'When done, output a signal line: [SIGNAL:completed] followed by a brief summary of changes. ' +
    'If you cannot complete the task, output [SIGNAL:failed] followed by the reason. ' +
    'If you need clarification, output [SIGNAL:escalate] followed by your question.',
  reviewer:
    'You are a Reviewer agent. Your job is to review code changes and identify issues. ' +
    'Do NOT make code changes yourself. Read the relevant files and provide your assessment. ' +
    'When done, output [SIGNAL:completed] followed by your review summary. ' +
    'If you find issues requiring changes, output [SIGNAL:needs-review] followed by file paths and summary.',
  researcher:
    'You are a Researcher agent. Your job is to gather information about the codebase. ' +
    'Read files, search for patterns, and report findings. Do NOT modify files. ' +
    'When done, output [SIGNAL:completed] followed by your findings.',
  planner:
    'You are a Planner agent. Your job is to analyze the goal and break it into concrete tasks. ' +
    'Output a structured task list with dependencies. Do NOT make code changes. ' +
    'When done, output [SIGNAL:completed] followed by the task breakdown.',
}

/**
 * The interface every Barnaby plugin module must export.
 */
export interface BarnabyPlugin {
  pluginId: PluginId
  displayName: string
  version: string
  activate(host: BarnabyPluginHostApi): Promise<void> | void
  deactivate?(): Promise<void> | void
  getLifecycleConfig?(): PluginLifecycleConfig | null
}
