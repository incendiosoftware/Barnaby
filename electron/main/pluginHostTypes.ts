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
  getPanelInfo(panelId: string): PanelInfo | null
  getPanelMessages(panelId: string): PanelMessage[]
  listPanels(): PanelInfo[]

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
