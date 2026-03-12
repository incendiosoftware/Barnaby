import { describe, expect, it } from 'vitest'
import { describeGitOperationPreflight } from '../src/utils/gitOperationPreflight'
import type { GitStatusState } from '../src/types'

const gitStatus: GitStatusState = {
  ok: true,
  branch: 'main',
  ahead: 0,
  behind: 0,
  stagedCount: 1,
  unstagedCount: 1,
  untrackedCount: 1,
  clean: false,
  checkedAt: Date.now(),
  entries: [
    {
      relativePath: 'src/App.tsx',
      indexStatus: 'M',
      workingTreeStatus: ' ',
      staged: true,
      unstaged: false,
      untracked: false,
    },
    {
      relativePath: 'src/components/GitPane.tsx',
      indexStatus: ' ',
      workingTreeStatus: 'M',
      staged: false,
      unstaged: true,
      untracked: false,
    },
    {
      relativePath: 'test/new.spec.ts',
      indexStatus: '?',
      workingTreeStatus: '?',
      staged: false,
      unstaged: false,
      untracked: true,
    },
  ],
}

describe('describeGitOperationPreflight', () => {
  it('explains that selected push performs a commit before pushing', () => {
    const result = describeGitOperationPreflight({
      op: 'push',
      workspaceRoot: 'E:\\Barnaby\\barnaby-app',
      gitStatus,
      selectedPaths: ['src/App.tsx', 'test/new.spec.ts'],
    })

    expect(result.title).toContain('Commit And Push')
    expect(result.summary).toContain('first stage and commit')
    expect(result.confirmMessage).toContain('git commit')
    expect(result.confirmMessage).toContain('git push')
  })

  it('explains that an unscoped push only pushes the current branch', () => {
    const result = describeGitOperationPreflight({
      op: 'push',
      workspaceRoot: 'E:\\Barnaby\\barnaby-app',
      gitStatus,
    })

    expect(result.summary).toContain('run `git push`')
    expect(result.summary).toContain('It will not create a commit first')
  })

  it('describes release preparation as release:prepare', () => {
    const result = describeGitOperationPreflight({
      op: 'release',
      workspaceRoot: 'E:\\Barnaby\\barnaby-app',
      packageScripts: {
        'release:prepare': 'node scripts/run-with-version-bump.mjs "npm run release:notes && npm run build:portable:raw"',
      },
    })

    expect(result.confirmMessage).toContain('npm run release:prepare')
    expect(result.confirmMessage).toContain('version bump')
    expect(result.confirmMessage).toContain('portable artifact')
  })
})
