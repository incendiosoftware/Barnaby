import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { BrowserWindow, dialog } from 'electron'
import { errorMessage } from './logger'
import { normalizeRelativePath, resolveWorkspacePath, toWorkspaceRelativePath, resolveWorkspaceRootFromAnyPath, resolveWorkspaceRootPath, upsertWorkspaceBundleFolder, getWorkspaceLockFilePath } from './workspaceManager'
import { execFileAsync } from './cliUtils'
import { getMainWindow } from './windowManager'
import type { GitStatusEntry, GitStatusResult } from './types'

export const MAX_GIT_STATUS_FILES_IN_PROMPT = 15

export function parseGitStatus(rawStatus: string): GitStatusResult {
  let branch = '(detached HEAD)'
  let ahead = 0
  let behind = 0
  const entries: GitStatusEntry[] = []

  for (const line of rawStatus.split(/\r?\n/)) {
    if (!line.trim()) continue

    if (line.startsWith('## ')) {
      const header = line.slice(3).trim()
      const branchPart = header.split('...')[0].trim()
      branch = branchPart.replace(/\s+\[.*\]$/, '') || branch
      const aheadMatch = header.match(/ahead (\d+)/)
      const behindMatch = header.match(/behind (\d+)/)
      ahead = aheadMatch ? Number.parseInt(aheadMatch[1], 10) : 0
      behind = behindMatch ? Number.parseInt(behindMatch[1], 10) : 0
      continue
    }

    const status = line.slice(0, 2)
    const rawPath = line.slice(3).trim()
    if (!rawPath) continue

    let relativePath = normalizeRelativePath(rawPath)
    let renamedFrom: string | undefined
    if (rawPath.includes(' -> ')) {
      const [from, to] = rawPath.split(' -> ')
      renamedFrom = normalizeRelativePath(from.trim())
      relativePath = normalizeRelativePath(to.trim())
    }

    const indexStatus = status[0] ?? ' '
    const workingTreeStatus = status[1] ?? ' '
    const untracked = status === '??'
    const staged = !untracked && indexStatus !== ' '
    const unstaged = !untracked && workingTreeStatus !== ' '

    entries.push({
      relativePath,
      indexStatus,
      workingTreeStatus,
      staged,
      unstaged,
      untracked,
      renamedFrom,
    })
  }

  const stagedCount = entries.filter((entry) => entry.staged).length
  const unstagedCount = entries.filter((entry) => entry.unstaged).length
  const untrackedCount = entries.filter((entry) => entry.untracked).length

  return {
    ok: true,
    branch,
    ahead,
    behind,
    stagedCount,
    unstagedCount,
    untrackedCount,
    clean: entries.length === 0,
    entries,
    checkedAt: Date.now(),
  }
}

export async function runGitCommand(root: string, args: string[]): Promise<{ ok: boolean; stdout?: string; stderr?: string; error?: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('git', ['-C', root, ...args], {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    })
    return { ok: true, stdout: stdout?.trim(), stderr: stderr?.trim() }
  } catch (err: unknown) {
    const stderr = err && typeof err === 'object' && 'stderr' in err ? String((err as { stderr?: unknown }).stderr ?? '') : ''
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg || stderr, stderr }
  }
}

export async function runShellCommand(root: string, cmd: string, args: string[]): Promise<{ ok: boolean; stdout?: string; stderr?: string; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: root,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    proc.stdout?.setEncoding('utf8')
    proc.stdout?.on('data', (chunk: string) => { stdout += chunk })
    proc.stderr?.setEncoding('utf8')
    proc.stderr?.on('data', (chunk: string) => { stderr += chunk })
    proc.on('error', (err) => resolve({ ok: false, error: err.message }))
    proc.on('exit', (code) => {
      if (code === 0) resolve({ ok: true, stdout, stderr })
      else resolve({ ok: false, error: stderr || `Exit code ${code}`, stdout, stderr })
    })
  })
}

export function normalizeSelectedGitPaths(selectedPaths?: string[]): string[] {
  if (!Array.isArray(selectedPaths)) return []
  const out: string[] = []
  for (const value of selectedPaths) {
    if (typeof value !== 'string') continue
    const normalized = normalizeRelativePath(value).trim()
    if (!normalized || normalized.startsWith('/')) continue
    const cleaned = normalized.split('/').filter((segment) => segment && segment !== '.' && segment !== '..').join('/')
    if (!cleaned) continue
    if (!out.includes(cleaned)) out.push(cleaned)
  }
  return out
}

export function buildCommitSelection(entries: GitStatusEntry[], selectedPaths: string[]) {
  if (selectedPaths.length === 0) {
    return {
      selectedEntries: entries,
      pathspecs: [] as string[],
      hasSelection: false,
    }
  }
  const entryByPath = new Map(entries.map((entry) => [entry.relativePath, entry] as const))
  const selectedEntries: GitStatusEntry[] = []
  for (const relativePath of selectedPaths) {
    const entry = entryByPath.get(relativePath)
    if (entry) selectedEntries.push(entry)
  }
  const pathspecs: string[] = []
  for (const entry of selectedEntries) {
    if (!pathspecs.includes(entry.relativePath)) pathspecs.push(entry.relativePath)
    if (entry.renamedFrom && !pathspecs.includes(entry.renamedFrom)) pathspecs.push(entry.renamedFrom)
  }
  return {
    selectedEntries,
    pathspecs,
    hasSelection: true,
  }
}

export function buildCommitMessageFromEntries(entries: GitStatusEntry[]): { subject: string; body: string } {
  const modified: string[] = []
  const added: string[] = []
  const deleted: string[] = []
  const renamed: Array<{ from: string; to: string }> = []
  for (const e of entries) {
    if (e.untracked) {
      added.push(e.relativePath)
    } else if (e.renamedFrom) {
      renamed.push({ from: e.renamedFrom, to: e.relativePath })
    } else if (e.indexStatus === 'D' || e.workingTreeStatus === 'D') {
      deleted.push(e.relativePath)
    } else if (e.indexStatus === 'A' || e.indexStatus === '?') {
      added.push(e.relativePath)
    } else {
      modified.push(e.relativePath)
    }
  }
  const total = modified.length + added.length + deleted.length + renamed.length
  const subjectParts: string[] = []
  if (modified.length) subjectParts.push(`${modified.length} modified`)
  if (added.length) subjectParts.push(`${added.length} added`)
  if (deleted.length) subjectParts.push(`${deleted.length} deleted`)
  if (renamed.length) subjectParts.push(`${renamed.length} renamed`)
  const subject = total > 0 ? `Commit workspace changes (${subjectParts.join(', ')})` : 'Commit workspace changes'

  const lines: string[] = []
  if (modified.length) {
    lines.push('Modified:', ...modified.map((p) => `  - ${p}`), '')
  }
  if (added.length) {
    lines.push('Added:', ...added.map((p) => `  - ${p}`), '')
  }
  if (deleted.length) {
    lines.push('Deleted:', ...deleted.map((p) => `  - ${p}`), '')
  }
  if (renamed.length) {
    lines.push('Renamed:', ...renamed.map((r) => `  - ${r.from} -> ${r.to}`), '')
  }
  const body = lines.join('\n').trim()
  return { subject, body: body || 'No changes' }
}

export function isNothingToCommitError(error?: string) {
  if (!error) return false
  const normalized = error.toLowerCase()
  return normalized.includes('nothing to commit') || normalized.includes('no changes')
}

export async function getGitStatus(workspaceRoot: string): Promise<GitStatusResult> {
  const root = path.resolve(workspaceRoot)
  const base: Omit<GitStatusResult, 'ok'> = {
    branch: '(not a git repository)',
    ahead: 0,
    behind: 0,
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
    clean: true,
    entries: [],
    checkedAt: Date.now(),
  }

  try {
    const inside = await execFileAsync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    })
    if (!inside.stdout.trim().startsWith('true')) {
      return { ok: false, ...base, error: 'This workspace is not inside a git repository.' }
    }
  } catch (err) {
    return { ok: false, ...base, error: errorMessage(err) }
  }

  try {
    const status = await execFileAsync('git', ['-C', root, 'status', '--short', '--branch'], {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    })
    return parseGitStatus(status.stdout)
  } catch (err) {
    return { ok: false, ...base, error: errorMessage(err) }
  }
}

export async function gitCommit(workspaceRoot: string, selectedPaths?: string[]): Promise<{ ok: boolean; error?: string }> {
  const root = path.resolve(workspaceRoot)
  const status = await getGitStatus(root)
  if (!status.ok || status.clean) {
    return { ok: false, error: status.clean ? 'Nothing to commit.' : (status.error ?? 'Cannot read git status.') }
  }
  const normalizedSelection = normalizeSelectedGitPaths(selectedPaths)
  const selection = buildCommitSelection(status.entries, normalizedSelection)
  if (selection.hasSelection && selection.selectedEntries.length === 0) {
    return { ok: false, error: 'Selected files no longer have changes.' }
  }
  const commitEntries = selection.selectedEntries
  const addArgs = selection.hasSelection ? ['add', '-A', '--', ...selection.pathspecs] : ['add', '-A']
  const addResult = await runGitCommand(root, addArgs)
  if (!addResult.ok) return { ok: false, error: addResult.error ?? 'git add failed' }
  const message = buildCommitMessageFromEntries(commitEntries)
  const commitArgs = message.body ? ['commit', '-m', message.subject, '-m', message.body] : ['commit', '-m', message.subject]
  if (selection.hasSelection) commitArgs.push('--', ...selection.pathspecs)
  const commitResult = await runGitCommand(root, commitArgs)
  if (!commitResult.ok) return { ok: false, error: commitResult.error ?? 'git commit failed' }
  return { ok: true }
}

export async function gitPush(workspaceRoot: string, selectedPaths?: string[]): Promise<{ ok: boolean; error?: string }> {
  const root = path.resolve(workspaceRoot)
  const normalizedSelection = normalizeSelectedGitPaths(selectedPaths)
  if (normalizedSelection.length > 0) {
    const commitResult = await gitCommit(root, normalizedSelection)
    if (!commitResult.ok && !isNothingToCommitError(commitResult.error)) {
      return commitResult
    }
  }
  const result = await runGitCommand(root, ['push'])
  return { ok: result.ok, error: result.error }
}

export async function gitDeploy(workspaceRoot: string, _selectedPaths?: string[]): Promise<{ ok: boolean; error?: string }> {
  const root = path.resolve(workspaceRoot)
  const pkgPath = path.join(root, 'package.json')
  if (!fs.existsSync(pkgPath)) return { ok: false, error: 'No package.json found.' }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> }
  if (!pkg?.scripts?.deploy) return { ok: false, error: 'No deploy script in package.json.' }
  const result = await runShellCommand(root, 'npm', ['run', 'deploy'])
  return { ok: result.ok, error: result.error }
}

export async function gitBuild(workspaceRoot: string, _selectedPaths?: string[]): Promise<{ ok: boolean; error?: string }> {
  const root = path.resolve(workspaceRoot)
  const pkgPath = path.join(root, 'package.json')
  if (!fs.existsSync(pkgPath)) return { ok: false, error: 'No package.json found.' }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> }
  if (!pkg?.scripts?.build) return { ok: false, error: 'No build script in package.json.' }
  const result = await runShellCommand(root, 'npm', ['run', 'build'])
  return { ok: result.ok, error: result.error }
}

export async function gitRelease(workspaceRoot: string, _selectedPaths?: string[]): Promise<{ ok: boolean; error?: string }> {
  const root = path.resolve(workspaceRoot)
  const pkgPath = path.join(root, 'package.json')
  if (!fs.existsSync(pkgPath)) return { ok: false, error: 'No package.json found.' }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> }
  if (!pkg?.scripts?.['release:prepare']) return { ok: false, error: 'No release:prepare script in package.json.' }
  const result = await runShellCommand(root, 'npm', ['run', 'release:prepare'])
  return { ok: result.ok, error: result.error }
}

export async function gitRollback(workspaceRoot: string, selectedPaths?: string[]): Promise<{ ok: boolean; error?: string }> {
  const root = path.resolve(workspaceRoot)
  const status = await getGitStatus(root)
  if (!status.ok) return { ok: false, error: status.error ?? 'Cannot read git status.' }
  if (status.clean) return { ok: false, error: 'Nothing to rollback.' }

  const normalizedSelection = normalizeSelectedGitPaths(selectedPaths)
  const selection = buildCommitSelection(status.entries, normalizedSelection)
  if (selection.hasSelection && selection.selectedEntries.length === 0) {
    return { ok: false, error: 'Selected files no longer have tracked changes.' }
  }

  const restoreArgs = selection.hasSelection
    ? ['restore', '--staged', '--worktree', '--', ...selection.pathspecs]
    : ['restore', '--staged', '--worktree', '.']
  const restoreResult = await runGitCommand(root, restoreArgs)
  if (!restoreResult.ok) return { ok: false, error: restoreResult.error ?? 'git restore failed' }

  return { ok: true }
}

export function formatGitStatusForPrompt(status: GitStatusResult): string {
  if (!status.ok) return `Git status unavailable: ${status.error ?? 'Unknown error.'}`

  const lines: string[] = []
  lines.push(`Branch: ${status.branch}`)
  if (status.ahead > 0 || status.behind > 0) {
    lines.push(`Divergence: ahead ${status.ahead}, behind ${status.behind}`)
  }
  lines.push(`Summary: ${status.clean ? 'clean working tree' : `${status.stagedCount} staged, ${status.unstagedCount} changed, ${status.untrackedCount} untracked`}`)

  if (!status.clean) {
    lines.push('Changed files:')
    const visibleEntries = status.entries.slice(0, MAX_GIT_STATUS_FILES_IN_PROMPT)
    for (const entry of visibleEntries) {
      const statusCode = `${entry.indexStatus}${entry.workingTreeStatus}`
      if (entry.renamedFrom) {
        lines.push(`- ${statusCode} ${entry.renamedFrom} -> ${entry.relativePath}`)
      } else {
        lines.push(`- ${statusCode} ${entry.relativePath}`)
      }
    }
    if (status.entries.length > visibleEntries.length) {
      lines.push(`- ...and ${status.entries.length - visibleEntries.length} more`)
    }
  }

  return lines.join('\n')
}
