/**
 * Panel lifecycle controller - connect, reconnect, stall detection.
 * Owns: connectWindow, reconnectPanel, connectWindowWithRetry, formatConnectionError,
 *       and the stall-watchdog interval.
 */

import type React from 'react'
import type {
  AgentInteractionMode,
  AgentPanelState,
  ChatMessage,
  ModelConfig,
  ModelProvider,
  PanelActivityState,
  PermissionMode,
  SandboxMode,
  WorkspaceSettings,
} from '../types'
import {
  CODEX_API_MODELS,
  CONNECT_TIMEOUT_MS,
  STALL_WATCHDOG_MS,
} from '../constants'
import {
  newId,
  panelMessagesToInitialHistory,
  withTimeout,
} from '../utils/appCore'

export interface PanelLifecycleApi {
  connect: (winId: string, opts: any) => Promise<any>
}

export interface PanelLifecycleContext {
  modelConfig: ModelConfig
  workspaceSettingsByPath: Record<string, WorkspaceSettings>
  workspaceRoot: string
  api: PanelLifecycleApi
  panelsRef: React.MutableRefObject<AgentPanelState[]>
  reconnectingRef: React.MutableRefObject<Set<string>>
  needsContextOnNextCodexSendRef: React.MutableRefObject<Record<string, boolean>>
  setPanels: React.Dispatch<React.SetStateAction<AgentPanelState[]>>
  kickQueuedMessage: (winId: string) => void
  getModelProvider: (model: string) => ModelProvider
  clampPanelSecurityForWorkspace: (
    cwd: string,
    sandbox: SandboxMode,
    permissionMode: PermissionMode,
  ) => { sandbox: SandboxMode; permissionMode: PermissionMode }
}

export interface PanelLifecycleController {
  connectWindow: (
    winId: string,
    model: string,
    cwd: string,
    permissionMode: PermissionMode,
    sandbox: SandboxMode,
    initialHistory?: Array<{ role: 'user' | 'assistant'; text: string }>,
    interactionMode?: AgentInteractionMode,
  ) => Promise<void>
  reconnectPanel: (winId: string, reason: string) => Promise<void>
  connectWindowWithRetry: (
    winId: string,
    model: string,
    cwd: string,
    permissionMode: PermissionMode,
    sandbox: SandboxMode,
    initialHistory?: Array<{ role: 'user' | 'assistant'; text: string }>,
    interactionMode?: AgentInteractionMode,
  ) => Promise<void>
  formatConnectionError: (e: unknown, provider?: string) => string
}

export function createPanelLifecycleController(ctx: PanelLifecycleContext): PanelLifecycleController {
  async function connectWindow(
    winId: string,
    model: string,
    cwd: string,
    permissionMode: PermissionMode,
    sandbox: SandboxMode,
    initialHistory?: Array<{ role: 'user' | 'assistant'; text: string }>,
    interactionMode?: AgentInteractionMode,
  ) {
    const mi = ctx.modelConfig.interfaces.find((m) => m.id === model)
    const provider = mi?.provider ?? 'codex'
    const clampedSecurity = ctx.clampPanelSecurityForWorkspace(cwd, sandbox, permissionMode)
    const ws = ctx.workspaceSettingsByPath[cwd]
    const allowedCommandPrefixes = ws?.allowedCommandPrefixes ?? []
    const allowedAutoReadPrefixes = ws?.allowedAutoReadPrefixes ?? []
    const allowedAutoWritePrefixes = ws?.allowedAutoWritePrefixes ?? []
    const deniedAutoReadPrefixes = ws?.deniedAutoReadPrefixes ?? []
    const deniedAutoWritePrefixes = ws?.deniedAutoWritePrefixes ?? []

    await withTimeout(
      ctx.api.connect(winId, {
        model,
        cwd,
        permissionMode: clampedSecurity.permissionMode,
        approvalPolicy: clampedSecurity.permissionMode === 'proceed-always' ? 'never' : 'on-request',
        sandbox: clampedSecurity.sandbox,
        interactionMode: interactionMode ?? 'agent',
        allowedCommandPrefixes,
        allowedAutoReadPrefixes,
        allowedAutoWritePrefixes,
        deniedAutoReadPrefixes,
        deniedAutoWritePrefixes,
        provider,
        modelConfig: mi?.config,
        initialHistory,
      }),
      CONNECT_TIMEOUT_MS,
      'connect',
    )
  }

  async function reconnectPanel(winId: string, reason: string) {
    if (ctx.reconnectingRef.current.has(winId)) return
    const w = ctx.panelsRef.current.find((x) => x.id === winId)
    if (!w) return
    ctx.reconnectingRef.current.add(winId)
    const provider = ctx.getModelProvider(w.model)
    if (provider === 'codex' && !CODEX_API_MODELS.includes(w.model) && w.messages.length > 0) {
      ctx.needsContextOnNextCodexSendRef.current[winId] = true
    }
    ctx.setPanels((prev) =>
      prev.map((p) =>
        p.id !== winId
          ? p
          : {
              ...p,
              connected: false,
              streaming: false,
              status: `Reconnecting: ${reason}`,
            },
      ),
    )
    try {
      const initialHistory = w.messages.length > 0 ? panelMessagesToInitialHistory(w.messages) : undefined
      await connectWindow(winId, w.model, w.cwd, w.permissionMode, w.sandbox, initialHistory, w.interactionMode)
      ctx.setPanels((prev) =>
        prev.map((p) =>
          p.id !== winId
            ? p
            : { ...p, status: 'Reconnected.' },
        ),
      )
      queueMicrotask(() => ctx.kickQueuedMessage(winId))
    } catch (e) {
      const errMsg = formatConnectionError(e, ctx.getModelProvider(w.model))
      ctx.setPanels((prev) =>
        prev.map((p) =>
          p.id !== winId
            ? p
            : {
                ...p,
                connected: false,
                streaming: false,
                status: 'Reconnect failed',
                messages: [...p.messages, { id: newId(), role: 'system' as const, content: errMsg, format: 'text' as const, createdAt: Date.now() }],
              },
        ),
      )
    } finally {
      ctx.reconnectingRef.current.delete(winId)
    }
  }

  async function connectWindowWithRetry(
    winId: string,
    model: string,
    cwd: string,
    permissionMode: PermissionMode,
    sandbox: SandboxMode,
    initialHistory?: Array<{ role: 'user' | 'assistant'; text: string }>,
    interactionMode?: AgentInteractionMode,
  ) {
    const RETRY_DELAY_MS = 2000
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await connectWindow(winId, model, cwd, permissionMode, sandbox, initialHistory, interactionMode)
        return
      } catch (e) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
        } else {
          throw e
        }
      }
    }
  }

  function formatConnectionError(e: unknown, provider?: string): string {
    const msg = e instanceof Error ? e.message : String(e)

    if (msg.includes('codex app-server closed') || msg.includes('codex app-server')) {
      return 'Codex disconnected. Run `codex app-server` in a terminal to debug, or `codex login` if needed. Send another message to reconnect.'
    }
    if (provider === 'codex' && msg.includes('no activity for 120 seconds')) {
      return 'Codex stopped responding (2 min). Try again or use fewer panels.'
    }

    if (msg.includes('timed out') && provider === 'claude') {
      if (msg.includes('no activity for 120 seconds')) {
        return 'Claude stopped responding (2 min). Usually network or API delay. Try again.'
      }
      return 'Claude timed out. Check credits at claude.ai or run `claude --version`. Send another message to retry.'
    }

    if (msg.includes('API key') && (msg.includes('missing') || msg.includes('OpenAI') || msg.includes('OpenRouter'))) {
      return 'API key missing. Add it in Settings → Connectivity.'
    }
    if ((provider === 'openai' || provider === 'openrouter') && msg.includes('timed out')) {
      return 'Request timed out. Check your connection and retry.'
    }

    if (provider === 'gemini' && msg.includes('timed out')) {
      return 'Gemini stopped responding. Check `gemini` CLI or try again.'
    }

    if (msg.includes('Not connected') || msg.includes('closed')) {
      return 'Connection closed. Send another message to reconnect.'
    }

    return `Error: ${msg}`
  }

  return { connectWindow, reconnectPanel, connectWindowWithRetry, formatConnectionError }
}
