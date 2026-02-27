/**
 * Agent pipeline controller - sendToAgent, closePanel, switchModel.
 * Owns the imperative flow for sending messages to the backend,
 * closing panels (archive → disconnect → cleanup), and model switching.
 */

import type React from 'react'
import type {
  AgentInteractionMode,
  AgentPanelState,
  ApplicationSettings,
  ChatMessage,
  ModelProvider,
  PermissionMode,
  SandboxMode,
} from '../types'
import {
  AUTO_CONTINUE_PROMPT,
  CODEX_API_MODELS,
  TURN_START_TIMEOUT_MS,
} from '../constants'
import {
  newId,
  panelMessagesToInitialHistory,
  parseInteractionMode,
  withModelBanner,
  withTimeout,
} from '../utils/appCore'

export interface AgentPipelineApi {
  readWorkspaceTextFile: (workspaceRoot: string, relativePath: string) => Promise<{ relativePath: string; content: string; size: number; binary?: boolean }>
  sendMessage: (...args: any[]) => Promise<any>
  disconnect: (winId: string) => Promise<any>
}

export interface AgentPipelineContext {
  workspaceRoot: string
  applicationSettings: ApplicationSettings
  panelsRef: React.MutableRefObject<AgentPanelState[]>
  activePromptStartedAtRef: React.MutableRefObject<Map<string, number>>
  needsContextOnNextCodexSendRef: React.MutableRefObject<Record<string, boolean>>
  api: AgentPipelineApi
  setPanels: React.Dispatch<React.SetStateAction<AgentPanelState[]>>
  setLastPromptDurationMsByPanel: React.Dispatch<React.SetStateAction<Record<string, number>>>
  getModelProvider: (model: string) => ModelProvider
  ensureProviderReady: (provider: ModelProvider, reason: string) => Promise<void>
  connectWindowWithRetry: (
    winId: string, model: string, cwd: string,
    permissionMode: PermissionMode, sandbox: SandboxMode,
    initialHistory?: Array<{ role: 'user' | 'assistant'; text: string }>,
    interactionMode?: AgentInteractionMode,
  ) => Promise<void>
  connectWindow: (
    winId: string, model: string, cwd: string,
    permissionMode: PermissionMode, sandbox: SandboxMode,
    initialHistory?: Array<{ role: 'user' | 'assistant'; text: string }>,
    interactionMode?: AgentInteractionMode,
  ) => Promise<void>
  formatConnectionError: (e: unknown, provider?: string) => string
  appendPanelDebug: (winId: string, stage: string, detail: string) => void
  clearPanelTurnComplete: (winId: string) => void
  upsertPanelToHistory: (panel: AgentPanelState) => void
}

export interface AgentPipelineController {
  sendToAgent: (winId: string, text: string, imagePaths?: string[]) => Promise<void>
  closePanel: (panelId: string, opts?: { skipUpsertToHistory?: boolean }) => Promise<void>
  switchModel: (winId: string, nextModel: string) => Promise<void>
}

export function createAgentPipelineController(ctx: AgentPipelineContext): AgentPipelineController {

  async function sendToAgent(winId: string, text: string, imagePaths: string[] = []) {
    const w = ctx.panelsRef.current.find((x) => x.id === winId)
    if (!w) {
      ctx.setPanels((prev) => prev.map((x) => x.id !== winId ? x : { ...x, streaming: false, status: 'Panel not found – message dropped.' }))
      return
    }
    const interactionMode = parseInteractionMode(w.interactionMode)
    const provider = ctx.getModelProvider(w.model)

    if (text.trim() !== AUTO_CONTINUE_PROMPT || !ctx.activePromptStartedAtRef.current.has(winId)) {
      ctx.activePromptStartedAtRef.current.set(winId, Date.now())
    }

    let resolvedText = text
    try {
      const mentions = Array.from(text.matchAll(/@([^\s]+)/g))
      if (mentions.length > 0) {
        let context = ''
        for (const match of mentions) {
          const path = match[1]
          try {
            const file = await ctx.api.readWorkspaceTextFile(ctx.workspaceRoot, path)
            context += `\n\nFile: ${path}\n\`\`\`\n${file.content}\n\`\`\``
          } catch { /* ignore invalid paths */ }
        }
        resolvedText = text + context
      }
    } catch { /* fall back to raw text */ }

    try {
      ctx.appendPanelDebug(winId, 'send', `Received user message (${text.length} chars)`)
      ctx.setPanels((prev) =>
        prev.map((x) => x.id !== winId ? x : { ...x, status: `Checking ${provider} auth...` }),
      )
      const needContext = !w.connected && w.messages.length > 0
      const initialHistory = needContext ? panelMessagesToInitialHistory(w.messages) : undefined
      if (needContext && provider === 'codex' && !CODEX_API_MODELS.includes(w.model)) {
        ctx.needsContextOnNextCodexSendRef.current[winId] = true
      }
      if (!w.connected) {
        ctx.appendPanelDebug(winId, 'auth', `Checking provider "${provider}"`)
        await ctx.ensureProviderReady(provider, `${w.model}`)
        ctx.setPanels((prev) =>
          prev.map((x) => x.id !== winId ? x : { ...x, status: `Connecting to ${provider}...` }),
        )
        ctx.appendPanelDebug(winId, 'connect', `Connecting model ${w.model} (${provider})`)
        await ctx.connectWindowWithRetry(winId, w.model, w.cwd, w.permissionMode, w.sandbox, initialHistory, interactionMode)
        ctx.appendPanelDebug(winId, 'connect', 'Connected')
      }
      ctx.setPanels((prev) =>
        prev.map((x) => x.id !== winId ? x : { ...x, status: 'Sending message...' }),
      )
      ctx.appendPanelDebug(winId, 'turn/start', 'Starting turn...')
      if (provider !== 'codex' && provider !== 'gemini' && imagePaths.length > 0) {
        throw new Error('Image attachments are supported for Codex and Gemini panels only.')
      }
      const needsPriorMessages =
        provider === 'codex' &&
        !CODEX_API_MODELS.includes(w.model) &&
        w.messages.length > 0 &&
        (needContext || ctx.needsContextOnNextCodexSendRef.current[winId])
      const priorMessagesForContext = needsPriorMessages
        ? w.messages.map((m) => ({ role: m.role, content: m.content ?? '' }))
        : undefined
      await withTimeout(
        ctx.api.sendMessage(winId, resolvedText, imagePaths, priorMessagesForContext, interactionMode, ctx.applicationSettings.responseStyle),
        TURN_START_TIMEOUT_MS,
        'turn/start',
      )
      if (needsPriorMessages) {
        ctx.needsContextOnNextCodexSendRef.current[winId] = false
      }
      ctx.appendPanelDebug(winId, 'turn/start', 'Turn started')
    } catch (e: any) {
      ctx.activePromptStartedAtRef.current.delete(winId)
      ctx.clearPanelTurnComplete(winId)
      const errMsg = ctx.formatConnectionError(e, provider)
      ctx.appendPanelDebug(winId, 'error', errMsg)
      ctx.setPanels((prev) =>
        prev.map((x) =>
          x.id !== winId
            ? x
            : {
                ...x,
                streaming: false,
                connected: false,
                status: 'Disconnected',
                messages: [...x.messages, { id: newId(), role: 'system' as const, content: errMsg, format: 'text' as const, createdAt: Date.now() }],
              },
        ),
      )
    }
  }

  async function closePanel(panelId: string, opts?: { skipUpsertToHistory?: boolean }) {
    const panel = ctx.panelsRef.current.find((w) => w.id === panelId)
    if (panel && !opts?.skipUpsertToHistory) ctx.upsertPanelToHistory(panel)
    ctx.activePromptStartedAtRef.current.delete(panelId)
    ctx.clearPanelTurnComplete(panelId)
    ctx.setLastPromptDurationMsByPanel((prev) => {
      if (!(panelId in prev)) return prev
      const next = { ...prev }
      delete next[panelId]
      return next
    })
    await ctx.api.disconnect(panelId).catch(() => {})
    ctx.setPanels((prev) => prev.filter((w) => w.id !== panelId))
  }

  async function switchModel(winId: string, nextModel: string) {
    const panel = ctx.panelsRef.current.find((p) => p.id === winId)
    if (!panel) {
      ctx.setPanels((prev) => prev.map((x) => x.id !== winId ? x : { ...x, streaming: false, status: 'Panel not found – model switch failed.' }))
      return
    }

    const nextProvider = ctx.getModelProvider(nextModel)

    // Provider lock: prevent cross-provider model switches
    if (panel.provider !== nextProvider) {
      const providerNames: Record<ModelProvider, string> = {
        'claude': 'Claude',
        'codex': 'OpenAI Codex',
        'gemini': 'Google Gemini',
        'openrouter': 'OpenRouter',
      }
      const currentProviderName = providerNames[panel.provider] || panel.provider
      const nextProviderName = providerNames[nextProvider] || nextProvider
      const errMsg = `Cannot switch from ${currentProviderName} to ${nextProviderName}.\n\nThis is a ${currentProviderName} panel and can only use ${currentProviderName} models.\n\nTo use ${nextProviderName}, please create a new ${nextProviderName} panel using the + button.`
      ctx.setPanels((prev) =>
        prev.map((w) =>
          w.id !== winId
            ? w
            : {
                ...w,
                status: 'Model switch blocked',
                messages: [...w.messages, { id: newId(), role: 'system' as const, content: errMsg, format: 'text' as const, createdAt: Date.now() }],
              },
        ),
      )
      return
    }

    ctx.setPanels((prev) =>
      prev.map((w) =>
        w.id !== winId
          ? w
          : { ...w, model: nextModel, connected: false, status: 'Switching model...' },
      ),
    )
    const permissionMode = panel.permissionMode ?? 'verify-first'
    const sandbox = panel.sandbox ?? 'workspace-write'
    try {
      await ctx.ensureProviderReady(nextProvider, `${nextModel}`)
      await ctx.connectWindow(winId, nextModel, ctx.workspaceRoot, permissionMode, sandbox)
      ctx.setPanels((prev) =>
        prev.map((w) => {
          if (w.id !== winId) return w
          return { ...w, cwd: ctx.workspaceRoot, messages: withModelBanner(w.messages, nextModel) }
        }),
      )
    } catch (e) {
      const errMsg = ctx.formatConnectionError(e, nextProvider)
      ctx.setPanels((prev) =>
        prev.map((w) =>
          w.id !== winId
            ? w
            : {
                ...w,
                status: 'Disconnected',
                messages: [...w.messages, { id: newId(), role: 'system' as const, content: errMsg, format: 'text' as const, createdAt: Date.now() }],
              },
        ),
      )
    }
  }

  return { sendToAgent, closePanel, switchModel }
}
