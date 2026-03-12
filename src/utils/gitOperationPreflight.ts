import type { GitOperation, GitStatusEntry, GitStatusState } from '../types'

type PackageScripts = Record<string, string> | undefined

export type GitOperationPreflight = {
  title: string
  summary: string
  details: string[]
  confirmMessage: string
}

function summarizeEntries(entries: GitStatusEntry[]) {
  const modified: string[] = []
  const added: string[] = []
  const deleted: string[] = []
  const renamed: Array<{ from: string; to: string }> = []

  for (const entry of entries) {
    if (entry.untracked) {
      added.push(entry.relativePath)
    } else if (entry.renamedFrom) {
      renamed.push({ from: entry.renamedFrom, to: entry.relativePath })
    } else if (entry.indexStatus === 'D' || entry.workingTreeStatus === 'D') {
      deleted.push(entry.relativePath)
    } else if (entry.indexStatus === 'A' || entry.indexStatus === '?') {
      added.push(entry.relativePath)
    } else {
      modified.push(entry.relativePath)
    }
  }

  return { modified, added, deleted, renamed }
}

function formatFilePreview(paths: string[]) {
  if (paths.length === 0) return ['Files: none']
  const visible = paths.slice(0, 8)
  const lines = ['Files:']
  for (const path of visible) lines.push(`- ${path}`)
  if (paths.length > visible.length) lines.push(`- ...and ${paths.length - visible.length} more`)
  return lines
}

function buildCommitSummary(entries: GitStatusEntry[]) {
  const { modified, added, deleted, renamed } = summarizeEntries(entries)
  const parts: string[] = []
  if (modified.length) parts.push(`${modified.length} modified`)
  if (added.length) parts.push(`${added.length} added`)
  if (deleted.length) parts.push(`${deleted.length} deleted`)
  if (renamed.length) parts.push(`${renamed.length} renamed`)
  return parts.length > 0 ? parts.join(', ') : 'no file changes'
}

function resolveSelectedEntries(gitStatus: GitStatusState | null, selectedPaths: string[]) {
  const entries = gitStatus?.entries ?? []
  if (selectedPaths.length === 0) return entries
  const selected = new Set(selectedPaths)
  return entries.filter((entry) => selected.has(entry.relativePath))
}

function scriptDescription(scriptName: string, packageScripts: PackageScripts, fallback: string) {
  const script = packageScripts?.[scriptName]
  return script ? `Runs \`npm run ${scriptName}\` (${script}).` : fallback
}

function workspaceName(workspaceRoot: string) {
  const parts = workspaceRoot.split(/[\\/]+/).filter(Boolean)
  return parts[parts.length - 1] ?? workspaceRoot
}

export function describeGitOperationPreflight(args: {
  op: GitOperation
  workspaceRoot: string
  gitStatus?: GitStatusState | null
  selectedPaths?: string[]
  packageScripts?: PackageScripts
}): GitOperationPreflight {
  const { op, workspaceRoot, gitStatus = null, packageScripts, selectedPaths = [] } = args
  const hasSelection = selectedPaths.length > 0
  const selectedEntries = resolveSelectedEntries(gitStatus, selectedPaths)
  const filePaths = selectedEntries.map((entry) => entry.relativePath)
  const targetLabel = hasSelection
    ? `${selectedEntries.length || selectedPaths.length} selected file${(selectedEntries.length || selectedPaths.length) === 1 ? '' : 's'}`
    : 'the current workspace'
  const branch = gitStatus?.branch ? ` on branch ${gitStatus.branch}` : ''

  let title = ''
  let summary = ''
  let details: string[] = []

  if (op === 'commit') {
    const commitSummary = buildCommitSummary(selectedEntries)
    title = hasSelection ? 'Confirm Commit Selected Changes' : 'Confirm Commit All Changes'
    summary = hasSelection
      ? `This will stage and commit ${targetLabel}${branch}.`
      : `This will stage and commit all tracked and untracked changes in ${workspaceName(workspaceRoot)}${branch}.`
    details = [
      hasSelection ? 'Action: `git add -A -- <selected paths>`' : 'Action: `git add -A`',
      'Action: `git commit` with an auto-generated summary message.',
      `Change summary: ${commitSummary}.`,
      ...formatFilePreview(filePaths),
    ]
  } else if (op === 'push') {
    title = hasSelection ? 'Confirm Commit And Push Selected Changes' : 'Confirm Push'
    summary = hasSelection
      ? `This will first stage and commit ${targetLabel}, then push the current branch${branch}.`
      : `This will run \`git push\` for the current branch${branch}. It will not create a commit first.`
    details = [
      hasSelection ? 'Action: `git add -A -- <selected paths>`' : 'Action: `git push`',
      hasSelection
        ? 'Action: `git commit` with an auto-generated summary message, then `git push`.'
        : 'Action: pushes the current branch to its configured remote.',
      ...formatFilePreview(filePaths),
    ]
  } else if (op === 'deploy') {
    title = 'Confirm Deploy'
    summary = `This will run the deploy script for ${workspaceName(workspaceRoot)}.`
    details = [
      scriptDescription('deploy', packageScripts, 'Runs `npm run deploy` if that script exists.'),
      'In this repo, `deploy` delegates to the packaging flow.',
    ]
  } else if (op === 'build') {
    title = 'Confirm Build'
    summary = `This will run the build script for ${workspaceName(workspaceRoot)}.`
    details = [
      scriptDescription('build', packageScripts, 'Runs `npm run build` if that script exists.'),
    ]
  } else {
    title = 'Confirm Release Preparation'
    summary = `This will prepare a release for ${workspaceName(workspaceRoot)}.`
    details = [
      scriptDescription('release:prepare', packageScripts, 'Runs `npm run release:prepare` if that script exists.'),
      'Expected result: version bump, release notes generation, and portable artifact build.',
    ]
  }

  return {
    title,
    summary,
    details,
    confirmMessage: [title, '', summary, '', ...details].join('\n'),
  }
}
