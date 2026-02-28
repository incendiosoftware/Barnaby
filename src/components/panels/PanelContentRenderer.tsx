import React from 'react'
import type { AgentPanelState } from '../../types'
import { DEFAULT_DIAGNOSTICS_VISIBILITY, PANEL_COMPLETION_NOTICE_MS } from '../../constants'
import { AgentPanelShell } from './AgentPanelShell'
import { AgentPanelHeader } from './AgentPanelHeader'
import { AgentPanelMessageViewport } from '../chat/AgentPanelMessageViewport'
import { ChatTimeline } from '../chat/timeline'
import { ChatInputSection } from '../chat/ChatInputSection'

export interface PanelContentRendererProps {
  panel: AgentPanelState
  ctx: any
}

export function PanelContentRenderer({ panel: w, ctx }: PanelContentRendererProps) {
  const hasInput = Boolean(w.input.trim()) || w.attachments.length > 0
  const inputLocked = Boolean(w.historyLocked)
  const isBusy = w.streaming
  const queueCount = w.pendingInputs.length
  const isIdle = !w.streaming && queueCount === 0
  const panelFontSizePx = 14 * w.fontScale
  const panelLineHeightPx = 24 * w.fontScale
  const panelTextStyle = { fontSize: `${panelFontSizePx}px`, lineHeight: `${panelLineHeightPx}px` }
  const activity = ctx.panelActivityById[w.id]
  const timelineUnits = ctx.panelTimelineById[w.id] ?? []
  const msSinceLastActivity = activity ? ctx.activityClock - activity.lastEventAt : Number.POSITIVE_INFINITY
  const isRunning = isBusy
  const isQueued = !isRunning && queueCount > 0
  const completionNoticeAt = ctx.panelTurnCompleteAtById[w.id]
  const completionNoticeAgeMs =
    typeof completionNoticeAt === 'number' ? Math.max(0, ctx.activityClock - completionNoticeAt) : Number.POSITIVE_INFINITY
  const showCompletionNotice = Number.isFinite(completionNoticeAgeMs) && completionNoticeAgeMs < PANEL_COMPLETION_NOTICE_MS
  const isFinalComplete =
    !isRunning && !isQueued && (activity?.lastEventLabel === 'Turn complete' || showCompletionNotice)
  const hasRecentActivity = msSinceLastActivity < 4000
  const activityDotClass = isRunning
    ? 'bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.15)]'
    : isQueued
      ? 'bg-amber-500'
      : isFinalComplete
        ? 'bg-emerald-500'
        : hasRecentActivity
          ? 'bg-sky-500/90'
          : 'bg-neutral-300 dark:bg-neutral-700'
  const activityLabel = isRunning ? 'running' : isQueued ? 'queued' : isFinalComplete ? 'done' : hasRecentActivity ? 'recent' : 'idle'
  const draftEdit = ctx.inputDraftEditByPanel[w.id] ?? null
  const editingQueuedIndex = draftEdit?.kind === 'queued' ? draftEdit.index : null
  const sendTitle = draftEdit?.kind === 'queued'
    ? 'Update queued message'
    : draftEdit?.kind === 'recalled' && isBusy
      ? 'Queue corrected message next'
      : isBusy
        ? hasInput
          ? `Stop${queueCount > 0 ? ` (${queueCount} queued)` : ''}`
          : 'Stop'
        : 'Send'
  const secondsAgo = Number.isFinite(msSinceLastActivity) ? Math.max(0, Math.floor(msSinceLastActivity / 1000)) : null
  const activityTitle = activity
    ? `Activity: ${activityLabel}\nLast event: ${activity.lastEventLabel}\n${secondsAgo}s ago\nEvents seen: ${activity.totalEvents}\nTimeline units: ${timelineUnits.length}`
    : `Activity: idle\nNo events seen yet for this panel.\nTimeline units: ${timelineUnits.length}`
  const lastPromptDurationMs = ctx.lastPromptDurationMsByPanel[w.id]
  const formatDurationLabel = (durationMs: number) => `${(durationMs / 1000).toFixed(1).replace(/\.0$/, '')}s`
  const activePromptStartedAt = ctx.activePromptStartedAtRef.current.get(w.id)
  const livePromptDurationLabel =
    isRunning && typeof activePromptStartedAt === 'number'
      ? formatDurationLabel(Math.max(0, ctx.activityClock - activePromptStartedAt))
      : null
  const completedPromptDurationLabel =
    ctx.applicationSettings.showResponseDurationAfterPrompt && !isRunning && !isQueued && typeof lastPromptDurationMs === 'number'
      ? formatDurationLabel(lastPromptDurationMs)
      : null
  const completedPromptTimestamp =
    completedPromptDurationLabel && typeof completionNoticeAt === 'number' ? completionNoticeAt : null
  const lastAgentTimelineUnitId = completedPromptDurationLabel
    ? [...timelineUnits]
        .reverse()
        .find((unit) => unit.kind === 'assistant' || unit.kind === 'code' || unit.kind === 'thinking')
        ?.id ?? null
      : null
  const lastUserUnitId = [...timelineUnits].reverse().find((u) => u.kind === 'user')?.id ?? null
  const verbose = Boolean(ctx.applicationSettings.verboseDiagnostics)
  const showActivityUpdates = verbose || DEFAULT_DIAGNOSTICS_VISIBILITY.showActivityUpdates
  const showReasoningUpdates = verbose || DEFAULT_DIAGNOSTICS_VISIBILITY.showReasoningUpdates
  const showOperationTrace = verbose || DEFAULT_DIAGNOSTICS_VISIBILITY.showOperationTrace
  const debugNoteColor = ctx.activeTheme.debugNotes
  const operationTraceColor = ctx.activeTheme.operationTrace
  const timelineMessageColor = ctx.activeTheme.thinkingProgress
  const settingsPopover = ctx.settingsPopoverByPanel[w.id] ?? null
  const interactionMode = ctx.parseInteractionMode(w.interactionMode)
  const panelSecurity = ctx.getPanelSecurityState(w)
  const effectiveSandbox = panelSecurity.effectiveSandbox
  const effectivePermissionMode = panelSecurity.effectivePermissionMode
  const sandboxLockedToView = panelSecurity.sandboxLockedToView
  const permissionDisabledByReadOnlySandbox = panelSecurity.permissionLockedByReadOnlySandbox
  const permissionLockedToVerifyFirst = panelSecurity.permissionLockedToVerifyFirst
  const contextUsage = ctx.estimatePanelContextUsage(w)
  const contextUsagePercent = contextUsage ? Math.max(0, Number(contextUsage.usedPercent.toFixed(1))) : null
  const contextUsageStrokeColor =
    contextUsagePercent === null
      ? 'currentColor'
      : contextUsagePercent >= 95
        ? '#dc2626'
        : contextUsagePercent >= 85
          ? '#f59e0b'
          : '#059669'

  return (
    <AgentPanelShell
      isActive={ctx.activePanelId === w.id}
      hasSettingsPopover={Boolean(settingsPopover)}
      onFocus={() => { ctx.setActivePanelId(w.id); ctx.setFocusedEditorId(null) }}
      onMouseDown={() => { ctx.setActivePanelId(w.id); ctx.setFocusedEditorId(null) }}
      onWheel={(e) => ctx.onPanelWheel(e, w.id)}
    >
      <AgentPanelHeader
        panel={w}
        panelsCount={ctx.panels.length}
        draggingPanelId={ctx.draggingPanelId}
        dragOverTarget={ctx.dragOverTarget}
        onDragOver={(e) => ctx.handleDragOver(e, { acceptAgent: true, targetId: `agent-${w.id}` })}
        onDrop={(e) => ctx.handleAgentDrop(e, w.id)}
        onDragStart={(e) => ctx.handleDragStart(e, 'agent', w.id)}
        onDragEnd={ctx.handleDragEnd}
        onSplit={() => ctx.splitAgentPanel(w.id)}
        onClose={() => ctx.closePanel(w.id)}
      />

      <AgentPanelMessageViewport
        registerRef={(el) => ctx.registerMessageViewport(w.id, el)}
        onScroll={() => ctx.onMessageViewportScroll(w.id)}
        onContextMenu={ctx.onChatHistoryContextMenu}
        panelTextStyle={panelTextStyle}
      >
        <ChatTimeline
          timelineUnits={timelineUnits}
          showOperationTrace={showOperationTrace}
          showReasoningUpdates={showReasoningUpdates}
          showActivityUpdates={showActivityUpdates}
          timelineOpenByUnitId={ctx.timelineOpenByUnitId}
          setTimelineOpenByUnitId={ctx.setTimelineOpenByUnitId}
          codeBlockOpenById={ctx.codeBlockOpenById}
          setCodeBlockOpenById={ctx.setCodeBlockOpenById}
          timelinePinnedCodeByUnitId={ctx.timelinePinnedCodeByUnitId}
          setTimelinePinnedCodeByUnitId={ctx.setTimelinePinnedCodeByUnitId}
          operationTraceColor={operationTraceColor}
          timelineMessageColor={timelineMessageColor}
          debugNoteColor={debugNoteColor}
          activeTheme={ctx.activeTheme}
          panelId={w.id}
          isStreaming={w.streaming}
          permissionMode={w.permissionMode}
          isIdle={isIdle}
          activityClock={ctx.activityClock}
          lastAgentTimelineUnitId={lastAgentTimelineUnitId}
          lastUserUnitId={lastUserUnitId}
          completedPromptDurationLabel={completedPromptDurationLabel}
          completedPromptTimestamp={completedPromptTimestamp}
          resendingPanelId={ctx.resendingPanelId}
          queueCount={queueCount}
          pendingInputs={w.pendingInputs}
          editingQueuedIndex={editingQueuedIndex}
          formatToolTrace={ctx.formatToolTrace}
          onChatLinkClick={ctx.onChatLinkClick}
          onGrantPermissionAndResend={() => ctx.grantPermissionAndResend(w.id)}
          onRecallLastUserMessage={() => ctx.recallLastUserMessage(w.id)}
          onBeginQueuedMessageEdit={(i) => ctx.beginQueuedMessageEdit(w.id, i)}
          onInjectQueuedMessage={(i) => ctx.injectQueuedMessage(w.id, i)}
          onRemoveQueuedMessage={(i) => ctx.removeQueuedMessage(w.id, i)}
          actionsLocked={inputLocked}
        />
      </AgentPanelMessageViewport>

      <ChatInputSection
        panel={w}
        inputLocked={inputLocked}
        panelFontSizePx={panelFontSizePx}
        panelLineHeightPx={panelLineHeightPx}
        hasInput={hasInput}
        isBusy={isBusy}
        draftEdit={draftEdit}
        sendTitle={sendTitle}
        livePromptDurationLabel={livePromptDurationLabel}
        timelineMessageColor={timelineMessageColor}
        contextUsage={contextUsage ?? null}
        contextUsagePercent={contextUsagePercent}
        contextUsageStrokeColor={contextUsageStrokeColor}
        activityDotClass={activityDotClass}
        activityLabel={activityLabel}
        activityTitle={activityTitle}
        isRunning={isRunning}
        showCompletionNotice={showCompletionNotice}
        settingsPopover={settingsPopover}
        interactionMode={interactionMode}
        effectiveSandbox={effectiveSandbox}
        effectivePermissionMode={effectivePermissionMode}
        sandboxLockedToView={sandboxLockedToView}
        permissionDisabledByReadOnlySandbox={permissionDisabledByReadOnlySandbox}
        permissionLockedToVerifyFirst={permissionLockedToVerifyFirst}
        modelConfig={ctx.modelConfig}
        providerAuthByName={ctx.providerAuthByName}
        providerVerifiedByName={ctx.providerVerifiedByName}
        modelPingResults={ctx.modelPingResults}
        modelPingPending={ctx.modelPingPending}
        showOnlyResponsiveModels={ctx.showOnlyResponsiveModels}
        getModelProvider={ctx.getModelProvider}
        getModelOptions={ctx.getModelOptions}
        textareaRef={(el) => ctx.registerTextarea(w.id, el)}
        onInputChange={(next) => {
          if (inputLocked) return
          ctx.setPanels((prev: AgentPanelState[]) => prev.map((x) => (x.id === w.id ? { ...x, input: next } : x)))
          queueMicrotask(() => ctx.autoResizeTextarea(w.id))
        }}
        onFocus={() => ctx.setActivePanelId(w.id)}
        onPasteImage={(file) => {
          if (inputLocked) return
          void ctx.handlePasteImage(w.id, file)
        }}
        onKeyDown={(e) => {
          if (inputLocked) return
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            ctx.sendMessage(w.id)
          }
        }}
        onContextMenu={ctx.onInputPanelContextMenu}
        onSend={() => {
          if (inputLocked) return
          ctx.sendMessage(w.id)
        }}
        onInterrupt={() => void ctx.api.interrupt(w.id)}
        onCancelDraftEdit={() => {
          if (inputLocked) return
          ctx.cancelDraftEdit(w.id)
        }}
        onRemoveAttachment={(attachmentId) => {
          if (inputLocked) return
          ctx.setPanels((prev: AgentPanelState[]) =>
            prev.map((p) =>
              p.id !== w.id ? p : { ...p, attachments: p.attachments.filter((x) => x.id !== attachmentId) },
            ),
          )
        }}
        setSettingsPopover={(next) => {
          if (inputLocked) return
          ctx.setSettingsPopoverByPanel((prev: Record<string, any>) => ({ ...prev, [w.id]: next }))
        }}
        onSetInteractionMode={(mode) => {
          if (inputLocked) return
          ctx.setInteractionMode(w.id, mode)
        }}
        onSetPanelSandbox={(value) => {
          if (inputLocked) return
          ctx.setPanelSandbox(w.id, value)
        }}
        onSetPanelPermission={(value) => {
          if (inputLocked) return
          ctx.setPanelPermission(w.id, value)
        }}
        onSandboxLockedClick={() => {
          if (inputLocked) return
          ctx.setPanels((prev: AgentPanelState[]) =>
            prev.map((p) =>
              p.id !== w.id
                ? p
                : { ...p, status: 'Sandbox is locked to View. Expand sandbox in Workspace settings.' },
            ),
          )
        }}
        onSwitchModel={(modelId) => {
          if (inputLocked) return
          ctx.switchModel(w.id, modelId)
        }}
        onSummarizeContext={() => {
          if (inputLocked) return
          ctx.summarizeSessionContext(w.id)
        }}
      />
    </AgentPanelShell>
  )
}
