import { describe, expect, it } from 'vitest'
import { getWorkspaceSecurityLimitsForPath } from '../src/utils/panelContext'
import type { WorkspaceSettings } from '../src/types'

function makeWorkspaceSettings(path: string, permissionMode: 'verify-first' | 'proceed-always' = 'proceed-always'): WorkspaceSettings {
  return {
    path,
    defaultModel: 'gpt-5.3-codex',
    permissionMode,
    sandbox: 'workspace-write',
    allowedCommandPrefixes: [],
    allowedAutoReadPrefixes: [],
    allowedAutoWritePrefixes: [],
    deniedAutoReadPrefixes: [],
    deniedAutoWritePrefixes: [],
  }
}

describe('getWorkspaceSecurityLimitsForPath', () => {
  it('matches workspace settings with normalized case and slash differences', () => {
    const workspaceRoot = 'E:\\Barnaby\\barnaby-app'
    const map: Record<string, WorkspaceSettings> = {
      'e:/barnaby/barnaby-app/': makeWorkspaceSettings('e:/barnaby/barnaby-app/', 'proceed-always'),
    }

    const limits = getWorkspaceSecurityLimitsForPath('E:/BARNABY/barnaby-app', map, workspaceRoot)

    expect(limits.sandbox).toBe('workspace-write')
    expect(limits.permissionMode).toBe('proceed-always')
  })

  it('applies the closest parent workspace settings for nested cwd paths', () => {
    const workspaceRoot = 'E:\\Barnaby\\barnaby-app'
    const map: Record<string, WorkspaceSettings> = {
      'E:\\Barnaby': makeWorkspaceSettings('E:\\Barnaby', 'verify-first'),
      'E:\\Barnaby\\barnaby-app': makeWorkspaceSettings('E:\\Barnaby\\barnaby-app', 'proceed-always'),
    }

    const limits = getWorkspaceSecurityLimitsForPath(
      'E:\\Barnaby\\barnaby-app\\src\\components',
      map,
      workspaceRoot,
    )

    expect(limits.permissionMode).toBe('proceed-always')
  })
})
