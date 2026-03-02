import type React from 'react'
import type {
  AgentInteractionMode,
  AgentPanelState,
  ChatMessage,
} from '../types'
import { INTERACTION_MODE_META } from '../constants'
import {
  MANUAL_CONTEXT_COMPACTION_NOTICE,
  getRateLimitPercent,
  newId,
  truncateText,
  withExhaustedRateLimitWarning,
  withModelBanner,
} from '../utils/appCore'

export interface PanelInputControllerContext {
  panels: AgentPanelState[]
  panelsRef: React.MutableRefObject<AgentPanelState[]>
  editorPanels: Array<{ dirty?: boolean }>
  inputDraftEditByPanel: Record<string, any>
  stickToBottomByPanelRef: React.MutableRefObject<Map<string, boolean>>
  lastScrollToUserMessageRef: React.MutableRefObject<{ panelId: string; messageId: string } | null>
  setPanels: React.Dispatch<React.SetStateAction<AgentPanelState[]>>
  setInputDraftEditByPanel: React.Dispatch<React.SetStateAction<Record<string, any>>>
  setResendingPanelId: React.Dispatch<React.SetStateAction<string | null>>
  autoResizeTextarea: (panelId: string) => void
  upsertPanelToHistory: (panel: AgentPanelState) => void
  seedPanelActivity: (panelId: string) => void
  markPanelActivity: (panelId: string, evt: any) => void
  clearPanelTurnComplete: (panelId: string) => void
  sendToAgent: (panelId: string, text: string, imagePaths?: string[]) => Promise<void>
  appendPanelDebug: (panelId: string, stage: string, detail: string) => void
  getModelProvider: (modelId: string) => string
  getWorkspaceSecurityLimitsForPath: (path: string) => { sandbox: 'read-only' | 'workspace-write'; permissionMode: 'verify-first' | 'proceed-always' }
}

export interface PanelInputController {
  injectQueuedMessage: (winId: string, index: number) => void
  beginQueuedMessageEdit: (winId: string, index: number) => void
  removeQueuedMessage: (winId: string, index: number) => void
  cancelDraftEdit: (winId: string) => void
  recallLastUserMessage: (winId: string) => void
  sendMessage: (winId: string) => void
  resendLastUserMessage: (winId: string) => void
  grantPermissionAndResend: (panelId: string) => void
  summarizeSessionContext: (winId: string) => void
  setInteractionMode: (panelId: string, nextMode: AgentInteractionMode) => void
}

export function createPanelInputController(ctx: PanelInputControllerContext): PanelInputController {
  function buildCheckpointSummary(messages: ChatMessage[]): string | null {
    const conversational = messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && (m.content ?? '').trim().length > 0)
      .map((m) => ({
        role: m.role,
        content: truncateText(String(m.content ?? '').replace(/\s+/g, ' ').trim(), 220),
      }))
    if (conversational.length === 0) return null
    const recent = conversational.slice(-10)
    const omitted = conversational.length - recent.length
    const lines = recent.map((m) => `- ${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    return [
      'Session checkpoint summary (auto-generated):',
      omitted > 0 ? `- Earlier conversational messages omitted: ${omitted}` : '',
      ...lines,
    ]
      .filter(Boolean)
      .join('\n')
  }

  function injectQueuedMessage(winId: string, index: number) {
    let textToInject = ''
    let snapshotForHistory: AgentPanelState | null = null
    ctx.setPanels((prev) =>
      prev.map((x) => {
        if (x.id !== winId) return x
        if (index < 0 || index >= x.pendingInputs.length) return x
        textToInject = x.pendingInputs[index]
        const nextPending = x.pendingInputs.filter((_, j) => j !== index)
        const queuedUserMessage: ChatMessage = {
          id: newId(),
          role: 'user',
          content: textToInject,
          interactionMode: x.interactionMode,
          format: 'text',
          createdAt: Date.now(),
        }
        ctx.lastScrollToUserMessageRef.current = { panelId: winId, messageId: queuedUserMessage.id }
        const updated: AgentPanelState = {
          ...x,
          streaming: true,
          status: x.streaming ? x.status : 'Preparing message...',
          pendingInputs: nextPending,
          messages: [...x.messages, queuedUserMessage],
        }
        snapshotForHistory = updated
        return updated
      }),
    )
    if (snapshotForHistory) ctx.upsertPanelToHistory(snapshotForHistory)
    ctx.seedPanelActivity(winId)
    ctx.markPanelActivity(winId, { type: 'turnStart' })
    if (!textToInject) return
    ctx.clearPanelTurnComplete(winId)
    void ctx.sendToAgent(winId, textToInject)
  }

  function beginQueuedMessageEdit(winId: string, index: number) {
    let queuedText = ''
    ctx.setPanels((prev) =>
      prev.map((x) => {
        if (x.id !== winId) return x
        if (index < 0 || index >= x.pendingInputs.length) return x
        queuedText = x.pendingInputs[index]
        return {
          ...x,
          input: queuedText,
          status: `Editing queued message ${index + 1}. Send to update this slot.`,
        }
      }),
    )
    if (!queuedText) return
    ctx.setInputDraftEditByPanel((prev) => ({ ...prev, [winId]: { kind: 'queued', index } }))
    queueMicrotask(() => ctx.autoResizeTextarea(winId))
  }

  function removeQueuedMessage(winId: string, index: number) {
    ctx.setPanels((prev) =>
      prev.map((x) => {
        if (x.id !== winId) return x
        if (index < 0 || index >= x.pendingInputs.length) return x
        const nextPending = x.pendingInputs.filter((_, j) => j !== index)
        return { ...x, pendingInputs: nextPending }
      }),
    )
    ctx.setInputDraftEditByPanel((prev) => {
      const draft = prev[winId]
      if (!draft || draft.kind !== 'queued') return prev
      if (draft.index === index) return { ...prev, [winId]: null }
      if (draft.index > index) return { ...prev, [winId]: { kind: 'queued', index: draft.index - 1 } }
      return prev
    })
  }

  function cancelDraftEdit(winId: string) {
    ctx.setInputDraftEditByPanel((prev) => ({ ...prev, [winId]: null }))
    ctx.setPanels((prev) =>
      prev.map((x) =>
        x.id !== winId
          ? x
          : {
              ...x,
              status: 'Draft edit cancelled.',
            },
      ),
    )
  }

  function recallLastUserMessage(winId: string) {
    const w = ctx.panels.find((x) => x.id === winId)
    if (!w) return
    const lastUserMsg = [...w.messages].reverse().find((m) => m.role === 'user' && (m.content ?? '').trim())
    if (!lastUserMsg?.content) return
    const isBusy = w.streaming || w.pendingInputs.length > 0
    ctx.setInputDraftEditByPanel((prev) => ({
      ...prev,
      [winId]: { kind: 'recalled' },
    }))
    ctx.setPanels((prev) =>
      prev.map((x) =>
        x.id !== winId
          ? x
          : {
              ...x,
              input: lastUserMsg.content ?? '',
              status: isBusy
                ? 'Recalled last message. Edit, then send to queue corrected text next.'
                : 'Recalled last message. Edit and send when ready.',
            },
      ),
    )
    queueMicrotask(() => ctx.autoResizeTextarea(winId))
  }

  function sendMessage(winId: string) {
    const w = ctx.panels.find((x) => x.id === winId)
    if (!w) return
    if (w.historyLocked) {
      ctx.setPanels((prev) =>
        prev.map((x) =>
          x.id !== winId
            ? x
            : { ...x, status: 'This chat is read-only. Start a new chat to continue.' },
        ),
      )
      return
    }
    const draftEdit = ctx.inputDraftEditByPanel[winId] ?? null
    const text = w.input.trim()
    const messageAttachments = w.attachments.map((a) => ({ ...a }))
    const imagePaths = messageAttachments.map((a) => a.path)
    if (!text && imagePaths.length === 0) return
    const hasDirtyEditor = ctx.editorPanels.some((p) => p.dirty)
    const updatingQueuedDraft = draftEdit?.kind === 'queued'
    if (hasDirtyEditor) {
      if (!updatingQueuedDraft) {
        const proceed = confirm(
          'You have unsaved changes in the Code Window. Agents may overwrite your edits. Save your changes first, or choose OK to continue anyway.',
        )
        if (!proceed) return
      }
    }
    const provider = ctx.getModelProvider(w.model)
    const usedPercent = provider === 'codex' ? getRateLimitPercent(w.usage) : null
    if (usedPercent !== null && usedPercent >= 99.5) {
      ctx.setPanels((prev) =>
        prev.map((x) =>
          x.id !== winId
            ? x
            : {
                ...x,
                status: 'Codex limit reached',
                messages: withExhaustedRateLimitWarning(x.messages, x.usage),
              },
        ),
      )
      return
    }
    const isBusy = w.streaming || w.pendingInputs.length > 0
    if (isBusy && imagePaths.length > 0) {
      ctx.setPanels((prev) =>
        prev.map((x) =>
          x.id !== winId
            ? x
            : {
                ...x,
                messages: [
                  ...x.messages,
                  {
                    id: newId(),
                    role: 'system',
                    content: 'Please wait for the current turn to finish before sending image attachments.',
                    format: 'text',
                    createdAt: Date.now(),
                  },
                ],
              },
        ),
      )
      return
    }
    ctx.clearPanelTurnComplete(winId)
    let snapshotForHistory: AgentPanelState | null = null
    ctx.setPanels((prev) =>
      prev.map((x) => {
        if (x.id !== winId) return x
        if (isBusy) {
          if (draftEdit?.kind === 'queued') {
            const nextPending = [...x.pendingInputs]
            if (draftEdit.index >= 0 && draftEdit.index < nextPending.length) {
              nextPending[draftEdit.index] = text
              ctx.appendPanelDebug(winId, 'queue', `Updated queued message #${draftEdit.index + 1} (${text.length} chars)`)
            } else {
              nextPending.push(text)
              ctx.appendPanelDebug(winId, 'queue', `Queued edited message at end (${text.length} chars)`)
            }
            const updated: AgentPanelState = {
              ...x,
              input: '',
              pendingInputs: nextPending,
              status: 'Updated queued message.',
            }
            snapshotForHistory = updated
            return updated
          }
          if (draftEdit?.kind === 'recalled') {
            ctx.appendPanelDebug(winId, 'queue', `Queued recalled correction at front (${text.length} chars)`)
            const updated: AgentPanelState = {
              ...x,
              input: '',
              pendingInputs: [text, ...x.pendingInputs],
              status: 'Correction queued to run next.',
            }
            snapshotForHistory = updated
            return updated
          }
          ctx.appendPanelDebug(winId, 'queue', `Panel busy - queued message (${text.length} chars)`)
          const updated: AgentPanelState = {
            ...x,
            input: '',
            pendingInputs: [...x.pendingInputs, text],
          }
          snapshotForHistory = updated
          return updated
        }
        ctx.appendPanelDebug(winId, 'queue', 'Panel idle - sending immediately')
        ctx.stickToBottomByPanelRef.current.set(winId, true)
        const userMessage: ChatMessage = {
          id: newId(),
          role: 'user',
          content: text,
          interactionMode: x.interactionMode,
          format: 'text',
          attachments: messageAttachments.length > 0 ? messageAttachments : undefined,
          createdAt: Date.now(),
        }
        ctx.lastScrollToUserMessageRef.current = { panelId: winId, messageId: userMessage.id }
        let baseMessages = x.messages
        if (draftEdit?.kind === 'recalled') {
          let lastUserIdx = -1
          for (let i = x.messages.length - 1; i >= 0; i--) {
            if (x.messages[i].role === 'user') { lastUserIdx = i; break }
          }
          if (lastUserIdx >= 0) baseMessages = x.messages.slice(0, lastUserIdx)
        }
        const updated: AgentPanelState = {
          ...x,
          input: '',
          attachments: [],
          streaming: true,
          status: 'Preparing message...',
          messages: [...baseMessages, userMessage],
        }
        snapshotForHistory = updated
        return updated
      }),
    )
    if (snapshotForHistory) ctx.upsertPanelToHistory(snapshotForHistory)
    ctx.seedPanelActivity(winId)
    ctx.markPanelActivity(winId, { type: 'turnStart' })
    if (draftEdit) {
      ctx.setInputDraftEditByPanel((prev) => ({ ...prev, [winId]: null }))
    }
    if (!isBusy) void ctx.sendToAgent(winId, text, imagePaths)
  }

  function resendLastUserMessage(winId: string) {
    const w = ctx.panels.find((x) => x.id === winId)
    if (!w || w.streaming) return
    const lastUserMsg = [...w.messages].reverse().find((m) => m.role === 'user')
    if (!lastUserMsg) return
    ctx.setResendingPanelId(winId)
    setTimeout(() => ctx.setResendingPanelId(null), 1200)
    ctx.clearPanelTurnComplete(winId)
    ctx.stickToBottomByPanelRef.current.set(winId, true)
    ctx.lastScrollToUserMessageRef.current = { panelId: winId, messageId: lastUserMsg.id }
    ctx.setPanels((prev) =>
      prev.map((x) =>
        x.id !== winId
          ? x
          : { ...x, streaming: true, status: 'Resending...' },
      ),
    )
    ctx.seedPanelActivity(winId)
    ctx.markPanelActivity(winId, { type: 'turnStart' })
    void ctx.sendToAgent(winId, lastUserMsg.content)
  }

  function grantPermissionAndResend(panelId: string) {
    const panel = ctx.panelsRef.current.find((p) => p.id === panelId)
    if (!panel || panel.streaming) return
    const limits = ctx.getWorkspaceSecurityLimitsForPath(panel.cwd)
    if (limits.sandbox === 'read-only') {
      ctx.setPanels((prev) =>
        prev.map((p) =>
          p.id !== panelId
            ? p
            : {
                ...p,
                status: 'Permissions are disabled because workspace sandbox is Read only.',
              },
        ),
      )
      return
    }
    if (limits.permissionMode === 'verify-first') {
      ctx.setPanels((prev) =>
        prev.map((p) =>
          p.id !== panelId
            ? p
            : {
                ...p,
                status: 'Permissions are managed in Workspace settings. Set Permissions to Proceed always there, then resend.',
              },
        ),
      )
      return
    }
    setTimeout(() => resendLastUserMessage(panelId), 0)
  }

  function summarizeSessionContext(winId: string) {
    const w = ctx.panelsRef.current.find((x) => x.id === winId)
    if (!w) return
    if (w.streaming) {
      ctx.setPanels((prev) =>
        prev.map((x) =>
          x.id !== winId
            ? x
            : { ...x, status: 'Wait for the current turn to finish before summarizing context.' },
        ),
      )
      return
    }

    const summary = buildCheckpointSummary(w.messages)
    if (!summary) {
      ctx.setPanels((prev) =>
        prev.map((x) =>
          x.id !== winId
            ? x
            : { ...x, status: 'No conversation content available to summarize yet.' },
        ),
      )
      return
    }

    const now = Date.now()
    const checkpointMessages: ChatMessage[] = withModelBanner(
      [
        {
          id: newId(),
          role: 'assistant',
          content: summary,
          format: 'markdown',
          createdAt: now,
        },
        {
          id: newId(),
          role: 'system',
          content: MANUAL_CONTEXT_COMPACTION_NOTICE,
          format: 'text',
          createdAt: now + 1,
        },
      ],
      w.model,
    )

    const updatedPanel: AgentPanelState = {
      ...w,
      historyId: newId(),
      connected: false,
      streaming: false,
      pendingInputs: [],
      messages: checkpointMessages,
      status: 'Session summarized. Context reset for the next turn.',
    }

    ctx.setPanels((prev) => prev.map((x) => (x.id !== winId ? x : updatedPanel)))
    ctx.setInputDraftEditByPanel((prev) => ({ ...prev, [winId]: null }))
    ctx.upsertPanelToHistory(updatedPanel)
  }

  function setInteractionMode(panelId: string, nextMode: AgentInteractionMode) {
    ctx.setPanels((prev) =>
      prev.map((p) =>
        p.id !== panelId
          ? p
          : p.interactionMode === nextMode
            ? p
            : {
                ...p,
                interactionMode: nextMode,
                status: `Mode set to ${INTERACTION_MODE_META[nextMode].label}.`,
                messages: [
                  ...p.messages,
                  {
                    id: newId(),
                    role: 'system',
                    content: `Mode switched to ${INTERACTION_MODE_META[nextMode].label}.`,
                    format: 'text',
                    createdAt: Date.now(),
                  },
                ],
              },
      ),
    )
  }

  return {
    injectQueuedMessage,
    beginQueuedMessageEdit,
    removeQueuedMessage,
    cancelDraftEdit,
    recallLastUserMessage,
    sendMessage,
    resendLastUserMessage,
    grantPermissionAndResend,
    summarizeSessionContext,
    setInteractionMode,
  }
}
