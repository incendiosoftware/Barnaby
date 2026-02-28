import { useEffect } from 'react'
import {
  classifyContextCompactionNotification,
  getModelPingKey,
  withContextCompactionNotice,
} from '../utils/appCore'

export function useAppRuntimeEvents(ctx: any) {
  const {
    api,
    workspaceList,
    workspaceRoot,
    reconnectPanelRef,
    appendPanelDebug,
    markPanelActivity,
    formatToolTrace,
    setPanels,
    newId,
    withLimitWarningMessage,
    clearPanelTurnComplete,
    markPanelTurnComplete,
    activePromptStartedAtRef,
    kickQueuedMessage,
    queueDelta,
    flushWindowDelta,
    panelsRef,
    getModelProvider,
    setProviderVerifiedByName,
    setModelPingResults,
    setModelPingPending,
    looksIncomplete,
    autoContinueCountRef,
    MAX_AUTO_CONTINUE,
    AUTO_CONTINUE_PROMPT,
    setLastPromptDurationMsByPanel,
    upsertPanelToHistory,
    withExhaustedRateLimitWarning,
    isTurnCompletionRawNotification,
    summarizeRawNotification,
    shouldSurfaceRawNoteInChat,
    createAgentPanel,
    createNewFileFromMenu,
    workspaceSettings,
    openWorkspacePicker,
    openFileFromMenu,
    requestWorkspaceSwitch,
    closeWorkspacePicker,
    closeFocusedFromMenu,
    findInPageFromMenu,
    findInFilesFromMenu,
    openAppSettingsInRightDock,
    focusedEditorIdRef,
    saveEditorPanel,
    saveEditorPanelAs,
    setLayoutMode,
    setShowWorkspaceWindow,
    setShowCodeWindow,
    setZoomLevel,
  } = ctx

  useEffect(() => {
    const contextCompactingPanels = new Set<string>()

    const unsubEvent = api.onEvent(({ agentWindowId, evt }: any) => {
      if (!agentWindowId) agentWindowId = 'default'
      if (evt?.type === 'contextCompacting') {
        appendPanelDebug(agentWindowId, 'event:context', evt.detail ?? 'Compacting context')
        markPanelActivity(agentWindowId, evt)
        contextCompactingPanels.add(agentWindowId)
        setPanels((prev: any[]) =>
          prev.map((w) =>
            w.id !== agentWindowId
              ? w
              : {
                  ...w,
                  status: 'Compacting context...',
                },
          ),
        )
        return
      }

      if (evt?.type === 'contextCompacted') {
        appendPanelDebug(agentWindowId, 'event:context', evt.detail ?? 'Context compacted')
        markPanelActivity(agentWindowId, evt)
        contextCompactingPanels.delete(agentWindowId)
        setPanels((prev: any[]) =>
          prev.map((w) =>
            w.id !== agentWindowId
              ? w
              : {
                  ...w,
                  status: 'Context compacted. Continuing...',
                  messages: withContextCompactionNotice(w.messages, typeof evt.detail === 'string' ? evt.detail : undefined),
                },
          ),
        )
        return
      }

      if (evt?.type === 'thinking') {
        appendPanelDebug(agentWindowId, 'event:thinking', evt.message ?? '')
        markPanelActivity(agentWindowId, evt)
        const thinkingText = typeof evt.message === 'string' ? evt.message.trim() : ''
        if (thinkingText && thinkingText.includes(':')) {
          const prefixed = `\u{1F504} ${formatToolTrace(thinkingText)}`
          setPanels((prev: any[]) =>
            prev.map((w) => {
              if (w.id !== agentWindowId) return w
              const last = w.messages[w.messages.length - 1]
              if (last && last.role === 'system' && last.content === prefixed) return w
              return { ...w, messages: [...w.messages, { id: newId(), role: 'system' as const, content: prefixed, format: 'text' as const, createdAt: Date.now() }] }
            }),
          )
        }
        return
      }

      markPanelActivity(agentWindowId, evt)

      if (evt?.type === 'status') {
        appendPanelDebug(agentWindowId, 'event:status', `${evt.status}${evt.message ? ` - ${evt.message}` : ''}`)
        const isRetryableError = evt.status === 'error' && typeof evt.message === 'string' &&
          /status 429|Retrying with backoff|Attempt \d+ failed(?!.*Max attempts)|Rate limited/i.test(evt.message)
        const holdCompactingStatus = contextCompactingPanels.has(agentWindowId) && evt.status === 'starting'
        let closedAfterStreaming = false
        setPanels((prev: any[]) =>
          prev.map((w) =>
            w.id !== agentWindowId
              ? w
              : {
                  ...w,
                  status: holdCompactingStatus
                    ? 'Compacting context...'
                    : isRetryableError
                    ? 'Rate limited — retrying...'
                    : (evt.message ?? evt.status),
                  connected: evt.status === 'ready',
                  streaming: isRetryableError ? w.streaming : (evt.status === 'closed' || evt.status === 'error' ? false : w.streaming),
                  ...(evt.status === 'closed' && !isRetryableError && w.streaming
                    ? (() => {
                        closedAfterStreaming = true
                        return {}
                      })()
                    : {}),
                  messages:
                    evt.status === 'error' && typeof evt.message === 'string' && !isRetryableError
                      ? (() => {
                          const withLimit = withLimitWarningMessage(w.messages, evt.message)
                          const generic = `Provider error: ${evt.message.trim()}`
                          const hasGeneric = withLimit.slice(-8).some((m: any) => m.role === 'system' && m.content === generic)
                          return hasGeneric
                            ? withLimit
                            : [...withLimit, { id: newId(), role: 'system' as const, content: generic, format: 'text' as const, createdAt: Date.now() }]
                        })()
                      : w.messages,
                },
          ),
        )
        if (evt.status === 'error' && !isRetryableError) {
          clearPanelTurnComplete(agentWindowId)
        } else if (evt.status === 'closed' && !isRetryableError && closedAfterStreaming) {
          markPanelTurnComplete(agentWindowId)
        }
        if ((evt.status === 'closed' || evt.status === 'error') && !isRetryableError) {
          contextCompactingPanels.delete(agentWindowId)
          activePromptStartedAtRef.current.delete(agentWindowId)
          queueMicrotask(() => kickQueuedMessage(agentWindowId))
          if (evt.status === 'closed' && reconnectPanelRef?.current) {
            setTimeout(() => {
              if (panelsRef.current?.some((p: any) => p.id === agentWindowId)) {
                reconnectPanelRef.current?.(agentWindowId, 'connection closed')
              }
            }, 1500)
          }
        }
        return
      }

      if (evt?.type === 'assistantDelta') {
        queueDelta(agentWindowId, String(evt.delta ?? ''))
        return
      }

      if (evt?.type === 'assistantCompleted') {
        appendPanelDebug(agentWindowId, 'event:assistantCompleted', 'Assistant turn completed')
        contextCompactingPanels.delete(agentWindowId)
        flushWindowDelta(agentWindowId)
        const now = Date.now()
        const startedAtForHealth = activePromptStartedAtRef.current.get(agentWindowId)
        const observedDurationMs =
          typeof startedAtForHealth === 'number' ? Math.max(0, now - startedAtForHealth) : 0
        const completedPanel = panelsRef.current.find((p: any) => p.id === agentWindowId)
        if (completedPanel) {
          const verifiedProvider = getModelProvider(completedPanel.model)
          setProviderVerifiedByName((prev: Record<string, boolean>) => prev[verifiedProvider] ? prev : { ...prev, [verifiedProvider]: true })
          const modelId = String(completedPanel.model ?? '').trim()
          if (modelId) {
            const modelPingKey = getModelPingKey(verifiedProvider, modelId)
            setModelPingResults?.((prev: Record<string, { ok: boolean; durationMs: number; error?: string }>) => ({
              ...prev,
              [modelPingKey]: { ok: true, durationMs: observedDurationMs },
            }))
            setModelPingPending?.((prev: Set<string>) => {
              if (!prev.has(modelPingKey)) return prev
              const next = new Set(prev)
              next.delete(modelPingKey)
              return next
            })
          }
        }
        let snapshotForHistory: any = null
        let shouldKeepPromptTimer = false
        const isTransientTurnStatus = (status: unknown) => {
          if (typeof status !== 'string') return false
          if (status === 'Sending message...' || status === 'Preparing message...') return true
          return /^Running .+ turn\.\.\.$/i.test(status)
        }
        setPanels((prev: any[]) =>
          prev.map((w) => {
            if (w.id !== agentWindowId) return w
            const msgs = w.messages
            const lastAssistantIdx = msgs.map((m: any) => m.role).lastIndexOf('assistant')
            const lastAssistant = lastAssistantIdx >= 0 ? msgs[lastAssistantIdx] : null
            if (!lastAssistant) {
              const updated = {
                ...w,
                streaming: false,
                status:
                  isTransientTurnStatus(w.status)
                    ? ''
                    : w.status,
              }
              snapshotForHistory = updated
              return updated
            }
            let pendingInputs: string[] = w.pendingInputs
            let nextMessages: any[] = [...msgs.slice(0, lastAssistantIdx), { ...lastAssistant, format: 'markdown' as const }, ...msgs.slice(lastAssistantIdx + 1)]
            if (looksIncomplete(lastAssistant.content)) {
              const count = autoContinueCountRef.current.get(agentWindowId) ?? 0
              if (count < MAX_AUTO_CONTINUE && w.pendingInputs.length === 0) {
                autoContinueCountRef.current.set(agentWindowId, count + 1)
                pendingInputs = [...w.pendingInputs, AUTO_CONTINUE_PROMPT]
                shouldKeepPromptTimer = true
              }
            } else {
              autoContinueCountRef.current.delete(agentWindowId)
            }
            const updated = {
              ...w,
              streaming: false,
              pendingInputs,
              messages: nextMessages,
              status:
                isTransientTurnStatus(w.status)
                  ? ''
                  : w.status,
            }
            snapshotForHistory = updated
            return updated
          }),
        )
        if (!shouldKeepPromptTimer) {
          const startedAt = activePromptStartedAtRef.current.get(agentWindowId)
          if (typeof startedAt === 'number') {
            const elapsedMs = Math.max(0, Date.now() - startedAt)
            setLastPromptDurationMsByPanel((prev: Record<string, number>) => ({ ...prev, [agentWindowId]: elapsedMs }))
          }
          activePromptStartedAtRef.current.delete(agentWindowId)
        }
        if (snapshotForHistory) upsertPanelToHistory(snapshotForHistory)
        markPanelTurnComplete(agentWindowId)
        queueMicrotask(() => kickQueuedMessage(agentWindowId))
      }

      if (evt?.type === 'usageUpdated') {
        setPanels((prev: any[]) =>
          prev.map((w) =>
            w.id === agentWindowId
              ? {
                  ...w,
                  usage: evt.usage,
                  messages:
                    getModelProvider(w.model) === 'codex'
                      ? withExhaustedRateLimitWarning(w.messages, evt.usage)
                      : w.messages,
                }
              : w,
          ),
        )
        return
      }

      if (evt?.type === 'rawNotification') {
        const method = String(evt.method ?? '')
        const compactionPhase = classifyContextCompactionNotification(method, evt.params)
        if (compactionPhase === 'start') {
          appendPanelDebug(agentWindowId, 'event:context', method)
          contextCompactingPanels.add(agentWindowId)
          setPanels((prev: any[]) =>
            prev.map((w) =>
              w.id !== agentWindowId
                ? w
                : {
                    ...w,
                    status: 'Compacting context...',
                  },
            ),
          )
          return
        }
        if (compactionPhase === 'completed') {
          appendPanelDebug(agentWindowId, 'event:context', method)
          contextCompactingPanels.delete(agentWindowId)
          setPanels((prev: any[]) =>
            prev.map((w) =>
              w.id !== agentWindowId
                ? w
                : {
                    ...w,
                    status: 'Context compacted. Continuing...',
                    messages: withContextCompactionNotice(w.messages),
                  },
            ),
          )
          return
        }
        if (isTurnCompletionRawNotification(method, evt.params)) {
          markPanelTurnComplete(agentWindowId)
        }
        appendPanelDebug(agentWindowId, 'event:raw', method)
        const note = summarizeRawNotification(method, evt.params)
        if (!note) return
        if (!shouldSurfaceRawNoteInChat(method)) return
        setPanels((prev: any[]) =>
          prev.map((w) =>
            w.id !== agentWindowId
              ? w
              : {
                  ...w,
                  messages: [...w.messages, { id: newId(), role: 'system', content: note, format: 'text', createdAt: Date.now() }],
                },
          ),
        )
      }
    })

    const unsubMenu = api.onMenu?.((msg: { action: string; path?: string }) => {
      const { action, path: actionPath } = msg
      if (action === 'newAgentWindow') {
        createAgentPanel()
        return
      }
      if (action === 'newFile') {
        void createNewFileFromMenu()
        return
      }
      if (action === 'newWorkspace') {
        workspaceSettings.openWorkspaceSettings('new')
        return
      }
      if (action === 'openWorkspacePicker') {
        openWorkspacePicker()
        return
      }
      if (action === 'openFile') {
        void openFileFromMenu()
        return
      }
      if (action === 'openWorkspace' && typeof actionPath === 'string') {
        requestWorkspaceSwitch(actionPath, 'menu')
        closeWorkspacePicker()
        return
      }
      if (action === 'closeFocused') {
        closeFocusedFromMenu()
        return
      }
      if (action === 'closeWorkspace') {
        if (workspaceList.length <= 1) return
        void workspaceSettings.deleteWorkspace(workspaceRoot)
        return
      }
      if (action === 'findInPage') {
        ctx.findInPageFromMenu()
        return
      }
      if (action === 'findInFiles') {
        void findInFilesFromMenu()
        return
      }
      if (action === 'openThemeModal') {
        openAppSettingsInRightDock('preferences')
        return
      }
      if (action === 'openAppSettings' || action === 'openConnectivity' || action === 'openSettings') {
        openAppSettingsInRightDock('connectivity')
        return
      }
      if (action === 'openModelSetup') {
        openAppSettingsInRightDock('models')
        return
      }
      if (action === 'openPreferences') {
        openAppSettingsInRightDock('preferences')
        return
      }
      if (action === 'openAgents') {
        openAppSettingsInRightDock('agents')
        return
      }
      if (action === 'openDiagnostics') {
        openAppSettingsInRightDock('diagnostics')
        return
      }
      if (action === 'openOrchestrator') {
        openAppSettingsInRightDock('orchestrator')
        return
      }
      if (action === 'openMcpServers') {
        openAppSettingsInRightDock('mcp-servers')
        return
      }
      if (action === 'toggleDockPanel') {
        const payload = msg as { panelId?: string }
        const panelId = payload?.panelId
        if (typeof panelId !== 'string') return
        ctx.toggleDockPanel?.(panelId)
        return
      }
      if (action === 'saveEditorFile') {
        const targetEditorId = focusedEditorIdRef.current
        if (targetEditorId) void saveEditorPanel(targetEditorId)
        return
      }
      if (action === 'saveEditorFileAs') {
        const targetEditorId = focusedEditorIdRef.current
        if (targetEditorId) void saveEditorPanelAs(targetEditorId)
        return
      }
      if (action === 'layoutVertical') ctx.setLayoutMode('vertical')
      if (action === 'layoutHorizontal') ctx.setLayoutMode('horizontal')
      if (action === 'layoutGrid') ctx.setLayoutMode('grid')
      if (action === 'toggleWorkspaceWindow') setShowWorkspaceWindow((prev: boolean) => !prev)
      if (action === 'toggleCodeWindow') setShowCodeWindow((prev: boolean) => !prev)
      if (action === 'zoomIn') {
        api.zoomIn?.()
        const level = api.getZoomLevel?.()
        if (level !== undefined) setZoomLevel(level)
        return
      }
      if (action === 'zoomOut') {
        api.zoomOut?.()
        const level = api.getZoomLevel?.()
        if (level !== undefined) setZoomLevel(level)
        return
      }
      if (action === 'resetZoom') {
        api.resetZoom?.()
        setZoomLevel(0)
        return
      }
    })

    return () => {
      unsubEvent?.()
      unsubMenu?.()
    }
  }, [api, workspaceList, workspaceRoot])
}
