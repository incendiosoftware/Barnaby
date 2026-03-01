/**
 * Shared system prompt builder for all AI clients.
 * Phase 1 of agent quality improvement — replaces minimal prompts with Cursor-quality instructions.
 *
 * The prompt is split into two parts for cache efficiency:
 *   - **Stable prefix**: behavioural rules, code quality, tool usage, mode — does not change
 *     within a session. CLI providers can cache this across turns.
 *   - **Dynamic suffix**: workspace tree, git status, cwd — refreshed on each turn.
 */

export type SystemPromptOptions = {
  workspaceTree: string
  cwd: string
  permissionMode: string
  sandbox: string
  interactionMode?: string
  gitStatus?: string
  workspaceContext?: string
  showWorkspaceContextInPrompt?: boolean
  additionalSystemPrompt?: string
}

export type StablePromptOptions = {
  interactionMode?: string
  additionalSystemPrompt?: string
}

export type DynamicContextOptions = {
  workspaceTree: string
  cwd: string
  permissionMode: string
  sandbox: string
  gitStatus?: string
  workspaceContext?: string
  showWorkspaceContextInPrompt?: boolean
}

const MODE_INSTRUCTIONS: Record<string, string> = {
  agent:
    'Implement changes directly. Bias toward action: locate files, apply edits, report what changed. Do not defer to checklists or "you could" suggestions.',
  plan: 'Explore options and trade-offs first. Present a concrete plan with steps before making code changes. Focus on design decisions and alternatives.',
  debug: 'Investigate systematically. Gather evidence via tools. Identify root cause before proposing fixes. Prioritize verification steps.',
  ask: 'Read-only guidance mode. Explain clearly. Do not make code changes unless the user explicitly asks you to.',
}

function getModeInstruction(mode?: string): string {
  if (!mode || typeof mode !== 'string') return MODE_INSTRUCTIONS.agent
  const normalized = mode.trim().toLowerCase()
  return MODE_INSTRUCTIONS[normalized] ?? MODE_INSTRUCTIONS.agent
}

/**
 * Build the stable portion of the system prompt.
 * This content does not change within a session and is ideal for caching.
 */
export function buildStableSystemPrompt(options: StablePromptOptions): string {
  const modeInstruction = getModeInstruction(options.interactionMode)
  const additionalSystemPrompt = typeof options.additionalSystemPrompt === 'string' ? options.additionalSystemPrompt.trim() : ''

  const parts: string[] = []

  parts.push(`You are a coding agent running inside Barnaby, an AI orchestrator. You have access to the user's workspace and tools to read, search, write files, and run commands.`)

  parts.push('')
  parts.push('## Behavioral rules')
  parts.push('- Prefer action over deferral: locate files, apply edits, report what changed.')
  parts.push('- Do not run git commit, branch, or push unless the user explicitly asks you to.')
  parts.push('- Never invent file names, symbols, or behavior — verify via tools first.')
  parts.push('- Cite evidence (file paths, line numbers) in your answers.')
  parts.push('- Keep working until the task is done or a clear blocker is identified.')
  parts.push('- Do not narrate what you are about to do — just do it.')
  parts.push('- Be concise — no filler, no restating the question.')

  parts.push('')
  parts.push('## Code quality rules')
  parts.push('- Do not add obvious or redundant comments.')
  parts.push('- Preserve existing code style and indentation.')
  parts.push('- When editing, show only the changed section with enough context to locate it.')
  parts.push('- Do not generate binary data or extremely long hashes.')

  if (additionalSystemPrompt) {
    parts.push('')
    parts.push('## Additional system prompt')
    parts.push(additionalSystemPrompt)
  }

  return parts.join('\n')
}

/**
 * Build the dynamic portion of the system prompt.
 * This content changes per turn (workspace tree, git status) and should NOT be cached.
 */
export function buildDynamicContext(options: DynamicContextOptions): string {
  const { workspaceTree, cwd, permissionMode, sandbox, gitStatus } = options
  const workspaceContext = typeof options.workspaceContext === 'string' ? options.workspaceContext.trim() : ''
  const showWorkspaceContextInPrompt = options.showWorkspaceContextInPrompt === true

  const parts: string[] = []

  parts.push('## Workspace context')
  parts.push(`- Workspace root: ${cwd}`)
  parts.push(`- Permission mode: ${permissionMode}`)
  parts.push(`- Sandbox: ${sandbox}`)
  if (showWorkspaceContextInPrompt && workspaceContext) {
    parts.push(`- Workspace notes: ${workspaceContext}`)
  }

  if (gitStatus && gitStatus.trim()) {
    parts.push('')
    parts.push('## Git status')
    parts.push(gitStatus.trim())
  }

  parts.push('')
  parts.push('## Workspace structure')
  parts.push(workspaceTree)

  return parts.join('\n')
}

/**
 * Build both parts of the system prompt separately.
 * Use this when you need to cache the stable part and refresh the dynamic part per turn.
 */
export function buildSystemPromptParts(options: SystemPromptOptions): { stable: string; dynamic: string } {
  return {
    stable: buildStableSystemPrompt({
      interactionMode: options.interactionMode,
      additionalSystemPrompt: options.additionalSystemPrompt,
    }),
    dynamic: buildDynamicContext({
      workspaceTree: options.workspaceTree,
      cwd: options.cwd,
      permissionMode: options.permissionMode,
      sandbox: options.sandbox,
      gitStatus: options.gitStatus,
      workspaceContext: options.workspaceContext,
      showWorkspaceContextInPrompt: options.showWorkspaceContextInPrompt,
    }),
  }
}

/**
 * Build the full system prompt as a single string.
 * Backward-compatible — used by clients that don't need the split.
 */
export function buildSystemPrompt(options: SystemPromptOptions): string {
  const { stable, dynamic } = buildSystemPromptParts(options)
  return `${stable}\n\n${dynamic}`
}
