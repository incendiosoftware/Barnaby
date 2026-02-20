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

interface Window {
  agentOrchestrator: {
    connect(
      agentWindowId: string,
      options: {
        cwd: string
        model: string
        permissionMode?: 'verify-first' | 'proceed-always'
        approvalPolicy?: 'on-request' | 'never'
        sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access'
        provider?: 'codex' | 'gemini'
        modelConfig?: Record<string, string>
      },
    ): Promise<{ threadId: string }>
    sendMessage(agentWindowId: string, text: string): Promise<void>
    interrupt(agentWindowId: string): Promise<void>
    disconnect(agentWindowId: string): Promise<void>
    openFolderDialog(): Promise<string | null>
    writeWorkspaceConfig(folderPath: string): Promise<boolean>
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
    onEvent(cb: (payload: { agentWindowId: string; evt: any }) => void): () => void
    onMenu(cb: (payload: { action: string; path?: string }) => void): () => void
  }
  // Back-compat alias.
  fireharness: Window['agentOrchestrator']
}
