/**
 * Dispatcher - routes each row to the appropriate row component.
 */

import React from 'react'
import type { TimelineRow } from './types'
import { TimelineActivityRow } from './TimelineActivityRow'
import { TimelineOperationBatchRow } from './TimelineOperationBatchRow'
import { TimelineThinkingBatchRow } from './TimelineThinkingBatchRow'
import { TimelineMessageRow } from './TimelineMessageRow'
import type { ChatRole, MessageFormat } from '../../../types'
import type { TimelineUnit } from '../../../chat/timelineTypes'
import { isPermissionEscalationMessage, LIMIT_WARNING_PREFIX } from '../../../utils/appCore'

export interface TimelineUnitRowProps {
  row: TimelineRow
  timelineOpenByUnitId: Record<string, boolean>
  setTimelineOpenByUnitId: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  codeBlockOpenById: Record<string, boolean>
  setCodeBlockOpenById: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  timelinePinnedCodeByUnitId: Record<string, boolean>
  setTimelinePinnedCodeByUnitId: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  showOperationTrace: boolean
  showReasoningUpdates: boolean
  showActivityUpdates: boolean
  operationTraceColor: string
  timelineMessageColor: string
  debugNoteColor: string
  activeTheme: { mode: 'light' | 'dark' }
  panelId: string
  isStreaming: boolean
  permissionMode: 'verify-first' | 'proceed-always'
  isIdle: boolean
  activityClock: number
  lastAgentTimelineUnitId: string | null
  lastUserUnitId: string | null
  completedPromptDurationLabel: string | null
  completedPromptTimestamp: number | null
  resendingPanelId: string | null
  formatToolTrace: (raw: string) => string
  onChatLinkClick: (href: string) => void
  onGrantPermissionAndResend: () => void
  onRecallLastUserMessage: () => void
}

export const TimelineUnitRow = React.memo(function TimelineUnitRow(props: TimelineUnitRowProps) {
  const { row } = props

  if (row.type === 'operationBatch' || row.type === 'thinkingBatch') {
    const isOps = row.type === 'operationBatch'
    const batchKey = `${isOps ? 'op' : 'think'}-batch-${row.units.map((u) => u.id).join('-')}`
    const batchOpen = props.timelineOpenByUnitId[batchKey] ?? false
    const batchColor = isOps ? props.operationTraceColor : props.timelineMessageColor

    if (isOps) {
      return (
        <TimelineOperationBatchRow
          batchKey={batchKey}
          units={row.units}
          batchColor={batchColor}
          batchOpen={batchOpen}
          onToggle={() =>
            props.setTimelineOpenByUnitId((prev) => ({ ...prev, [batchKey]: !batchOpen }))
          }
          formatToolTrace={props.formatToolTrace}
        />
      )
    }

    return (
      <TimelineThinkingBatchRow
        batchKey={batchKey}
        units={row.units}
        batchColor={batchColor}
        batchOpen={batchOpen}
        onToggle={() =>
          props.setTimelineOpenByUnitId((prev) => ({ ...prev, [batchKey]: !batchOpen }))
        }
        formatToolTrace={props.formatToolTrace}
      />
    )
  }

  const unit = row.unit

  if (unit.kind === 'activity') {
    const isReasoningActivity = unit.activityKind === 'reasoning'
    const isOperationTrace = unit.activityKind === 'operation'
    if (isOperationTrace) return null
    if (isReasoningActivity && !props.showReasoningUpdates) return null
    if (!isReasoningActivity && !props.showActivityUpdates) return null

    const isOpen = props.timelineOpenByUnitId[unit.id] ?? unit.defaultOpen

    return (
      <TimelineActivityRow
        unit={unit}
        isOpen={isOpen}
        onToggle={(next) =>
          props.setTimelineOpenByUnitId((prev) => (prev[unit.id] === next ? prev : { ...prev, [unit.id]: next }))
        }
        timelineMessageColor={props.timelineMessageColor}
      />
    )
  }

  const m = {
    id: unit.id,
    role: (unit.kind === 'user' ? 'user' : unit.kind === 'system' ? 'system' : 'assistant') as ChatRole,
    content: unit.body,
    format: (unit.markdown ? 'markdown' : 'text') as MessageFormat,
    attachments: unit.attachments,
    createdAt: unit.createdAt,
  }

  const isDebugSystemNote = m.role === 'system' && /^Debug \(/.test(m.content)
  const isLimitSystemWarning = m.role === 'system' && m.content.startsWith(LIMIT_WARNING_PREFIX)
  const isApprovalRequiredMessage = m.role === 'system' && isPermissionEscalationMessage(m.content)
  const canShowGrantPermissionButton =
    isApprovalRequiredMessage && !props.isStreaming && props.permissionMode !== 'proceed-always'
  const codeUnitPinned = Boolean(props.timelinePinnedCodeByUnitId[unit.id])
  const isCodeLifecycleUnit = unit.kind === 'code'
  const shouldCollapseThinking = unit.kind === 'thinking'
  const thinkingOpen = props.timelineOpenByUnitId[unit.id] ?? unit.defaultOpen
  const thinkingInProgress = unit.status === 'in_progress'
  const thinkingSummary = m.content.trim().split(/\r?\n/)[0]?.trim().slice(0, 80) || 'Progress update'
  const messageContainerStyle = !shouldCollapseThinking && isDebugSystemNote ? { color: props.debugNoteColor } : undefined
  const showCompletedDurationOnMessage = Boolean(
    props.completedPromptDurationLabel && props.lastAgentTimelineUnitId === unit.id
  )
  const isLastUserMessage = m.role === 'user' && unit.id === props.lastUserUnitId
  const isLastAssistantMessage = m.role === 'assistant' && unit.id === props.lastAgentTimelineUnitId
  const canRecallLastUserMessage = isLastUserMessage && props.isIdle

  return (
    <TimelineMessageRow
      unit={unit}
      messageId={m.id}
      role={m.role}
      content={m.content}
      format={m.format}
      attachments={m.attachments}
      createdAt={m.createdAt}
      isCodeLifecycleUnit={isCodeLifecycleUnit}
      codeUnitPinned={codeUnitPinned}
      shouldCollapseThinking={shouldCollapseThinking}
      thinkingOpen={thinkingOpen}
      thinkingInProgress={thinkingInProgress}
      thinkingSummary={thinkingSummary}
      isDebugSystemNote={isDebugSystemNote}
      isLimitSystemWarning={isLimitSystemWarning}
      canShowGrantPermissionButton={canShowGrantPermissionButton}
      messageContainerStyle={messageContainerStyle}
      showCompletedDurationOnMessage={showCompletedDurationOnMessage}
      completedPromptDurationLabel={props.completedPromptDurationLabel}
      completedPromptTimestamp={props.completedPromptTimestamp}
      isLastUserMessage={isLastUserMessage}
      isLastAssistantMessage={isLastAssistantMessage}
      isStreaming={props.isStreaming}
      canRecallLastUserMessage={canRecallLastUserMessage}
      resendingPanelId={props.resendingPanelId}
      panelId={props.panelId}
      activeTheme={props.activeTheme as import('../../../types').StandaloneTheme}
      debugNoteColor={props.debugNoteColor}
      timelineMessageColor={props.timelineMessageColor}
      codeBlockOpenById={props.codeBlockOpenById}
      setCodeBlockOpenById={props.setCodeBlockOpenById}
      setTimelineOpenByUnitId={props.setTimelineOpenByUnitId}
      setTimelinePinnedCodeByUnitId={props.setTimelinePinnedCodeByUnitId}
      onChatLinkClick={props.onChatLinkClick}
      onGrantPermissionAndResend={props.onGrantPermissionAndResend}
      onRecallLastUserMessage={props.onRecallLastUserMessage}
    />
  )
})
