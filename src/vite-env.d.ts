/// <reference types="vite/client" />

type WorkspaceTreeNode = {
  name: string
  relativePath: string
  type: 'file' | 'directory'
  children?: WorkspaceTreeNode[]
}

type WorkspaceTreeOptions = {
  includeHidden?: boolean
  includeNodeModules?: boolean
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

type ProviderName = 'codex' | 'claude' | 'gemini' | 'openrouter'
type ProviderAuthStatus = {
  provider: string
  installed: boolean
  authenticated: boolean
  detail: string
  checkedAt: number
}
type ProviderConfigForAuth = {
  id: string
  type?: 'cli' | 'api'
  cliCommand?: string
  cliPath?: string
  authCheckCommand?: string
  loginCommand?: string
  upgradeCommand?: string
  upgradePackage?: string
  apiBaseUrl?: string
  loginUrl?: string
}

type WorkspaceLockOwner = {
  pid: number
  hostname: string
  acquiredAt: number
  heartbeatAt: number
}

type WorkspaceLockAcquireResult =
  | {
      ok: true
      workspaceRoot: string
      lockFilePath: string
    }
  | {
      ok: false
      reason: 'invalid-workspace' | 'in-use' | 'error'
      message: string
      workspaceRoot: string
      lockFilePath: string
      owner?: WorkspaceLockOwner | null
    }

interface Window {
  agentOrchestrator: {
    connect(
      agentWindowId: string,
      options: {
        cwd: string
        model: string
        permissionMode?: 'verify-first' | 'proceed-always'
        approvalPolicy?: 'on-request' | 'never'
        sandbox?: 'read-only' | 'workspace-write'
        provider?: 'codex' | 'claude' | 'gemini' | 'openrouter'
        modelConfig?: Record<string, string>
        initialHistory?: Array<{ role: 'user' | 'assistant'; text: string }>
      },
    ): Promise<{ threadId: string }>
    sendMessage(
      agentWindowId: string,
      text: string,
      imagePaths?: string[],
      priorMessagesForContext?: Array<{ role: string; content: string }>,
    ): Promise<void>
    loadChatHistory(): Promise<unknown[]>
    saveChatHistory(entries: unknown[]): Promise<{
      ok: boolean
      count: number
      path: string
    }>
    loadAppState(): Promise<unknown | null>
    saveAppState(state: unknown): Promise<{
      ok: boolean
      path: string
      savedAt: number
    }>
    setWindowTheme(theme: 'light' | 'dark' | 'system'): Promise<{
      ok: boolean
      themeSource: 'light' | 'dark' | 'system'
      shouldUseDarkColors: boolean
    }>
    notifyRendererReady(): Promise<{ ok: boolean }>
    getDiagnosticsInfo(): Promise<{
      userDataPath: string
      storageDir: string
      chatHistoryPath: string
      appStatePath: string
      runtimeLogPath: string
      diagnosticsConfigPath: string
    }>
    loadDiagnosticsConfig(): Promise<{
      showActivityUpdates: boolean
      showReasoningUpdates: boolean
      showOperationTrace: boolean
      showThinkingProgress: boolean
      colors: {
        debugNotes: string
        activityUpdates: string
        reasoningUpdates: string
        operationTrace: string
        thinkingProgress: string
      }
    }>
    openRuntimeLog(): Promise<{
      ok: boolean
      path: string
      error?: string
    }>
    openExternalUrl(url: string): Promise<{
      ok: boolean
      error?: string
    }>
    interrupt(agentWindowId: string): Promise<void>
    disconnect(agentWindowId: string): Promise<void>
    openFolderDialog(): Promise<string | null>
    writeWorkspaceConfig(folderPath: string): Promise<boolean>
    claimWorkspace(workspaceRoot: string): Promise<WorkspaceLockAcquireResult>
    releaseWorkspace(workspaceRoot: string): Promise<boolean>
    savePastedImage(dataUrl: string, mimeType?: string): Promise<{
      path: string
      mimeType: string
    }>
    listWorkspaceTree(workspaceRoot: string, options?: WorkspaceTreeOptions): Promise<{
      nodes: WorkspaceTreeNode[]
      truncated: boolean
    }>
    readWorkspaceFile(workspaceRoot: string, relativePath: string): Promise<{
      relativePath: string
      size: number
      truncated: boolean
      binary: boolean
      content: string
    }>
    readWorkspaceTextFile(workspaceRoot: string, relativePath: string): Promise<{
      relativePath: string
      size: number
      binary: boolean
      content: string
    }>
    writeWorkspaceFile(workspaceRoot: string, relativePath: string, content: string): Promise<{
      relativePath: string
      size: number
    }>
    pickWorkspaceSavePath(workspaceRoot: string, relativePath: string): Promise<string | null>
    pickWorkspaceOpenPath(workspaceRoot: string): Promise<string | null>
    getGitStatus(workspaceRoot: string): Promise<{
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
    }>
    setRecentWorkspaces(list: string[]): void
    setEditorMenuState(enabled: boolean): void
    findInPage(text: string): Promise<void>
    showContextMenu(kind: 'input-selection' | 'chat-selection'): Promise<{ ok: boolean }>
    getProviderAuthStatus(config: ProviderConfigForAuth): Promise<ProviderAuthStatus>
    startProviderLogin(config: ProviderConfigForAuth): Promise<{ started: boolean; detail: string }>
    upgradeProviderCli(config: ProviderConfigForAuth): Promise<{ started: boolean; detail: string }>
    setProviderApiKey(providerId: string, apiKey: string): Promise<{ ok: boolean; hasKey: boolean }>
    getProviderApiKeyState(providerId: string): Promise<{ hasKey: boolean }>
    importProviderApiKeyFromEnv(providerId: string): Promise<{ ok: boolean; hasKey: boolean; imported: boolean; detail: string }>
    resetApplicationData(): Promise<void>
    getGeminiAvailableModels(): Promise<{ id: string; displayName: string }[]>
    getAvailableModels(): Promise<{
      codex: { id: string; displayName: string }[]
      claude: { id: string; displayName: string }[]
      gemini: { id: string; displayName: string }[]
      openrouter: { id: string; displayName: string }[]
    }>
    onEvent(cb: (payload: { agentWindowId: string; evt: any }) => void): () => void
    onMenu(cb: (payload: { action: string; path?: string }) => void): () => void
  }
  // Back-compat alias.
  fireharness: Window['agentOrchestrator']
}
