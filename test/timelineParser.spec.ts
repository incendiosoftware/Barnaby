import { describe, expect, it } from 'vitest'
import { buildTimelineForPanel } from '../src/chat/timelineParser'

describe('timelineParser', () => {
  it('merges adjacent activity items with same label/kind within merge window', () => {
    const timeline = buildTimelineForPanel({
      panelId: 'p1',
      messages: [],
      activityItems: [
        { id: 'a1', label: 'Running command', kind: 'command', detail: 'npm install', at: 1000, count: 1 },
        { id: 'a2', label: 'Running command', kind: 'command', detail: 'npm test', at: 7000, count: 1 },
      ],
      streaming: false,
      retrospectiveWindow: 20,
    })

    expect(timeline).toHaveLength(1)
    expect(timeline[0].kind).toBe('activity')
    expect(timeline[0].body).toContain('Running command x2')
    expect(timeline[0].body).toContain('npm install')
    expect(timeline[0].body).toContain('npm test')
  })

  it('does not merge activity items across merge window boundary', () => {
    const timeline = buildTimelineForPanel({
      panelId: 'p1',
      messages: [],
      activityItems: [
        { id: 'a1', label: 'Scanning files', kind: 'event', at: 1000, count: 1 },
        { id: 'a2', label: 'Scanning files', kind: 'event', at: 10001, count: 1 },
      ],
      streaming: false,
      retrospectiveWindow: 20,
    })

    expect(timeline.filter((u) => u.kind === 'activity')).toHaveLength(2)
  })

  it('keeps only latest activity unit open by default', () => {
    const timeline = buildTimelineForPanel({
      panelId: 'p1',
      messages: [],
      activityItems: [
        { id: 'a1', label: 'Step 1', kind: 'event', at: 1000, count: 1 },
        { id: 'a2', label: 'Step 2', kind: 'event', at: 12000, count: 1 },
      ],
      streaming: false,
      retrospectiveWindow: 20,
    })
    const activities = timeline.filter((u) => u.kind === 'activity')
    expect(activities).toHaveLength(2)
    expect(activities[0].defaultOpen).toBe(false)
    expect(activities[1].defaultOpen).toBe(true)
  })

  it('marks latest assistant/code unit as in_progress during streaming', () => {
    const timeline = buildTimelineForPanel({
      panelId: 'p1',
      messages: [
        { id: 'm1', role: 'user', content: 'build feature', format: 'text' },
        { id: 'm2', role: 'assistant', content: '```ts\nconsole.log(1)\n```', format: 'markdown' },
      ],
      activityItems: [],
      streaming: true,
      retrospectiveWindow: 20,
    })

    const last = timeline[timeline.length - 1]
    expect(last.kind).toBe('code')
    expect(last.status).toBe('in_progress')
    expect(last.defaultOpen).toBe(true)
  })

  it('defaults completed code units to collapsed', () => {
    const timeline = buildTimelineForPanel({
      panelId: 'p1',
      messages: [{ id: 'm1', role: 'assistant', content: '```ts\nconst a = 1\n```', format: 'markdown' }],
      activityItems: [],
      streaming: false,
      retrospectiveWindow: 20,
    })

    expect(timeline).toHaveLength(1)
    expect(timeline[0].kind).toBe('code')
    expect(timeline[0].status).toBe('completed')
    expect(timeline[0].defaultOpen).toBe(false)
  })

  it('filters low-level raw event labels from timeline activity units', () => {
    const timeline = buildTimelineForPanel({
      panelId: 'p1',
      messages: [],
      activityItems: [
        { id: 'a1', label: 'Event: codex/event/agent_message_delta', kind: 'event', at: 1000, count: 1 },
        { id: 'a2', label: 'assistantDelta', kind: 'event', at: 1001, count: 1 },
        { id: 'a3', label: 'Running command', kind: 'command', at: 1002, count: 1 },
      ],
      streaming: false,
      retrospectiveWindow: 20,
    })

    const activities = timeline.filter((u) => u.kind === 'activity')
    expect(activities).toHaveLength(1)
    expect(activities[0].body).toContain('Running command')
  })
})
