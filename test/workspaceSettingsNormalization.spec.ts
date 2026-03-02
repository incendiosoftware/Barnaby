import { describe, expect, it } from 'vitest'
import { normalizeWorkspaceSettingsFromPartial } from '../src/utils/appCore'
import {
  DEFAULT_WORKSPACE_ALLOWED_AUTO_READ_PREFIXES,
  DEFAULT_WORKSPACE_ALLOWED_AUTO_WRITE_PREFIXES,
  DEFAULT_WORKSPACE_ALLOWED_COMMAND_PREFIXES,
  DEFAULT_WORKSPACE_DENIED_AUTO_READ_PREFIXES,
  DEFAULT_WORKSPACE_DENIED_AUTO_WRITE_PREFIXES,
} from '../src/constants'

describe('normalizeWorkspaceSettingsFromPartial', () => {
  it('preserves proceed-always for workspace-write and keeps fallback path', () => {
    const normalized = normalizeWorkspaceSettingsFromPartial('E:/Barnaby/barnaby-app', {
      permissionMode: 'proceed-always',
      sandbox: 'workspace-write',
    })

    expect(normalized.path).toBe('E:/Barnaby/barnaby-app')
    expect(normalized.permissionMode).toBe('proceed-always')
    expect(normalized.sandbox).toBe('workspace-write')
  })

  it('forces verify-first when sandbox is read-only', () => {
    const normalized = normalizeWorkspaceSettingsFromPartial('E:/Barnaby/barnaby-app', {
      permissionMode: 'proceed-always',
      sandbox: 'read-only',
    })

    expect(normalized.permissionMode).toBe('verify-first')
    expect(normalized.sandbox).toBe('read-only')
  })

  it('fills default allow/deny prefixes when lists are not provided', () => {
    const normalized = normalizeWorkspaceSettingsFromPartial('E:/Barnaby/barnaby-app', {})

    expect(normalized.allowedCommandPrefixes).toEqual(DEFAULT_WORKSPACE_ALLOWED_COMMAND_PREFIXES)
    expect(normalized.allowedAutoReadPrefixes).toEqual(DEFAULT_WORKSPACE_ALLOWED_AUTO_READ_PREFIXES)
    expect(normalized.allowedAutoWritePrefixes).toEqual(DEFAULT_WORKSPACE_ALLOWED_AUTO_WRITE_PREFIXES)
    expect(normalized.deniedAutoReadPrefixes).toEqual(DEFAULT_WORKSPACE_DENIED_AUTO_READ_PREFIXES)
    expect(normalized.deniedAutoWritePrefixes).toEqual(DEFAULT_WORKSPACE_DENIED_AUTO_WRITE_PREFIXES)
  })

  it('preserves cursorAllowBuilds when provided', () => {
    const normalized = normalizeWorkspaceSettingsFromPartial('E:/Barnaby/barnaby-app', {
      cursorAllowBuilds: true,
    })
    expect(normalized.cursorAllowBuilds).toBe(true)
  })

  it('defaults cursorAllowBuilds to false when not provided', () => {
    const normalized = normalizeWorkspaceSettingsFromPartial('E:/Barnaby/barnaby-app', {})
    expect(normalized.cursorAllowBuilds).toBe(false)
  })
})
