import { describe, expect, it } from 'vitest'
import { extractInteractionModeChange, syncOutsideWorkspaceBuildWarning } from '../src/utils/appCore'
import type { ChatMessage } from '../src/types'

function makeMessages(): ChatMessage[] {
  return [
    { id: 'model', role: 'system', content: 'Model: gpt-5.3-codex', format: 'text' },
    { id: 'user-1', role: 'user', content: 'hello', format: 'text' },
  ]
}

describe('syncOutsideWorkspaceBuildWarning', () => {
  it('prepends the warning when enabled', () => {
    const next = syncOutsideWorkspaceBuildWarning(makeMessages(), true)

    expect(next[0]?.role).toBe('system')
    expect(next[0]?.content).toContain('outside the workspace')
    expect(next[1]?.content).toBe('Model: gpt-5.3-codex')
  })

  it('removes the warning when disabled', () => {
    const withWarning = syncOutsideWorkspaceBuildWarning(makeMessages(), true)
    const next = syncOutsideWorkspaceBuildWarning(withWarning, false)

    expect(next).toHaveLength(2)
    expect(next[0]?.content).toBe('Model: gpt-5.3-codex')
    expect(next.some((message) => message.content.includes('outside the workspace'))).toBe(false)
  })
})

describe('extractInteractionModeChange', () => {
  it('detects explicit mode-switch text', () => {
    expect(extractInteractionModeChange('Mode switched to Plan.')).toBe('plan')
    expect(extractInteractionModeChange('Switching to ask mode now.')).toBe('ask')
  })

  it('detects collaboration mode payloads', () => {
    expect(extractInteractionModeChange({ collaboration_mode_kind: 'default' })).toBe('agent')
    expect(extractInteractionModeChange({ payload: { collaboration_mode: { mode: 'plan' } } })).toBe('plan')
  })

  it('ignores unrelated content', () => {
    expect(extractInteractionModeChange('Implemented the requested change.')).toBeNull()
    expect(extractInteractionModeChange({ payload: { status: 'ready' } })).toBeNull()
  })
})
