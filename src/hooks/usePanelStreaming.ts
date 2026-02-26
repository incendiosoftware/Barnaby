import { useRef } from 'react'
import type { AgentPanelState } from '../types'
import { newId } from '../utils/appCore'

export interface PanelStreamingContext {
  setPanels: React.Dispatch<React.SetStateAction<AgentPanelState[]>>
}

export function usePanelStreaming(ctx: PanelStreamingContext) {
  const deltaBuffers = useRef(new Map<string, string>())
  const flushTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  function flushWindowDelta(agentWindowId: string) {
    const buf = deltaBuffers.current.get(agentWindowId) ?? ''
    if (!buf) return
    deltaBuffers.current.set(agentWindowId, '')

    ctx.setPanels((prev) =>
      prev.map((w) => {
        if (w.id !== agentWindowId) return w
        const msgs = w.messages
        const roles = msgs.map((m) => m.role)
        const lastAssistantIdx = roles.lastIndexOf('assistant')
        const lastUserIdx = roles.lastIndexOf('user')
        if (w.streaming && lastAssistantIdx >= 0 && lastAssistantIdx > lastUserIdx) {
          const last = msgs[lastAssistantIdx]
          return {
            ...w,
            streaming: true,
            messages: [
              ...msgs.slice(0, lastAssistantIdx),
              {
                ...last,
                format: 'markdown',
                content: last.content + buf,
                createdAt: last.createdAt ?? Date.now(),
              },
              ...msgs.slice(lastAssistantIdx + 1),
            ],
          }
        }
        return {
          ...w,
          streaming: true,
          messages: [
            ...msgs,
            { id: newId(), role: 'assistant', content: buf, format: 'markdown', createdAt: Date.now() },
          ],
        }
      }),
    )
  }

  function queueDelta(agentWindowId: string, delta: string) {
    deltaBuffers.current.set(agentWindowId, (deltaBuffers.current.get(agentWindowId) ?? '') + delta)
    if (delta.includes('\n')) {
      const t = flushTimers.current.get(agentWindowId)
      if (t) clearTimeout(t)
      flushTimers.current.delete(agentWindowId)
      flushWindowDelta(agentWindowId)
      return
    }
    if (flushTimers.current.has(agentWindowId)) return
    const t = setTimeout(() => {
      flushTimers.current.delete(agentWindowId)
      flushWindowDelta(agentWindowId)
    }, 16)
    flushTimers.current.set(agentWindowId, t)
  }

  return {
    queueDelta,
    flushWindowDelta,
  }
}
