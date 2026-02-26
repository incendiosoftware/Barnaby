import { useState, useRef, useEffect } from 'react'
import type { PanelActivityState, PanelDebugEntry, AgentPanelState, ApplicationSettings } from '../types'
import { newId, describeActivityEntry } from '../utils/appCore'
import { ONGOING_WORK_LABELS } from '../constants'

export interface PanelActivityContext {
  applicationSettings: ApplicationSettings
  setPanels: React.Dispatch<React.SetStateAction<AgentPanelState[]>>
}

export function usePanelActivity(ctx: PanelActivityContext) {
  const [panelActivityById, setPanelActivityById] = useState<Record<string, PanelActivityState>>({})
  const [activityClock, setActivityClock] = useState(() => Date.now())
  const [panelDebugById, setPanelDebugById] = useState<Record<string, PanelDebugEntry[]>>({})
  const [lastPromptDurationMsByPanel, setLastPromptDurationMsByPanel] = useState<Record<string, number>>({})
  const [panelTurnCompleteAtById, setPanelTurnCompleteAtById] = useState<Record<string, number>>({})

  const activityLatestRef = useRef(new Map<string, PanelActivityState>())
  const activityFlushTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const t = setInterval(() => setActivityClock(Date.now()), 400)
    return () => clearInterval(t)
  }, [])

  useEffect(
    () => () => {
      for (const t of activityFlushTimers.current.values()) clearTimeout(t)
      activityFlushTimers.current.clear()
    },
    [],
  )

  function describeIncomingEvent(evt: any): string {
    if (!evt) return 'event'
    if (evt.type === 'rawNotification' && typeof evt.method === 'string') return evt.method
    if (typeof evt.type === 'string') return evt.type
    return 'event'
  }

  function appendPanelDebug(agentWindowId: string, stage: string, detail: string) {
    setPanelDebugById((prev) => {
      const nextEntry: PanelDebugEntry = {
        id: newId(),
        at: Date.now(),
        stage,
        detail: detail || '(no detail)',
      }
      const existing = prev[agentWindowId] ?? []
      const next = [nextEntry, ...existing].slice(0, 80)
      return { ...prev, [agentWindowId]: next }
    })
    const shouldMirrorToChat = new Set(['send', 'auth', 'connect', 'turn/start', 'queue', 'error', 'event:status']).has(stage)
    if (!shouldMirrorToChat) return
    if (!ctx.applicationSettings.showDebugNotesInTimeline) return
    const debugLine = `Debug (${stage}): ${detail || '(no detail)'}`
    // Defer mirroring to chat to avoid "Maximum update depth exceeded" when called
    // synchronously from send flow (onKeyDown -> sendMessage -> sendToAgent -> appendPanelDebug).
    queueMicrotask(() => {
      ctx.setPanels((prev) =>
        prev.map((p) =>
          p.id !== agentWindowId
            ? p
            : {
                ...p,
                messages: [...p.messages, { id: newId(), role: 'system', content: debugLine, format: 'text', createdAt: Date.now() }],
              },
        ),
      )
    })
  }

  function markPanelTurnComplete(agentWindowId: string) {
    setPanelTurnCompleteAtById((prev) => ({ ...prev, [agentWindowId]: Date.now() }))
  }

  function clearPanelTurnComplete(agentWindowId: string) {
    setPanelTurnCompleteAtById((prev) => {
      if (!(agentWindowId in prev)) return prev
      const next = { ...prev }
      delete next[agentWindowId]
      return next
    })
  }

  function seedPanelActivity(agentWindowId: string) {
    const prev = activityLatestRef.current.get(agentWindowId)
    const seed: PanelActivityState = {
      lastEventAt: Date.now(),
      lastEventLabel: prev?.lastEventLabel ?? 'Turn started',
      totalEvents: prev?.totalEvents ?? 0,
      recent: prev?.recent ?? [],
    }
    activityLatestRef.current.set(agentWindowId, seed)
    setPanelActivityById((prevState) => ({ ...prevState, [agentWindowId]: seed }))
  }

  function markPanelActivity(agentWindowId: string, evt: any) {
    const prev = activityLatestRef.current.get(agentWindowId)
    const entry = describeActivityEntry(evt)
    let recent = [...(prev?.recent ?? [])]
    if (entry) {
      const isOngoing =
        entry.label &&
        (ONGOING_WORK_LABELS.has(entry.label) || (entry.label.startsWith('Completed ') && entry.label !== 'Turn complete'))
      if (isOngoing) {
        clearPanelTurnComplete(agentWindowId)
      }
      const now = Date.now()
      const top = recent[0]
      if (top && top.label === entry.label && top.detail === entry.detail && now - top.at < 4000) {
        recent[0] = { ...top, at: now, count: top.count + 1 }
      } else {
        recent.unshift({ id: newId(), label: entry.label, detail: entry.detail, kind: entry.kind, at: now, count: 1 })
      }
      recent = recent.slice(0, 10)
    }
    const next: PanelActivityState = {
      lastEventAt: Date.now(),
      lastEventLabel: entry?.label ?? describeIncomingEvent(evt),
      totalEvents: (prev?.totalEvents ?? 0) + 1,
      recent,
    }
    activityLatestRef.current.set(agentWindowId, next)
    if (activityFlushTimers.current.has(agentWindowId)) return
    const t = setTimeout(() => {
      activityFlushTimers.current.delete(agentWindowId)
      const snapshot = activityLatestRef.current.get(agentWindowId)
      if (!snapshot) return
      setPanelActivityById((prevState) => ({ ...prevState, [agentWindowId]: snapshot }))
    }, 180)
    activityFlushTimers.current.set(agentWindowId, t)
  }

  return {
    panelActivityById,
    activityClock,
    panelDebugById,
    lastPromptDurationMsByPanel,
    setLastPromptDurationMsByPanel,
    panelTurnCompleteAtById,
    appendPanelDebug,
    markPanelTurnComplete,
    clearPanelTurnComplete,
    seedPanelActivity,
    markPanelActivity,
  }
}
