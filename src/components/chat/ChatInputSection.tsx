/**
 * Chat input section - attachments, textarea, send button, footer (status, context, settings, model).
 */

import React from 'react'
import type {
  AgentInteractionMode,
  AgentPanelState,
  ModelConfig,
  ModelProvider,
  PermissionMode,
  ProviderAuthStatus,
  SandboxMode,
} from '../../types'
import { SendIcon, SpinnerIcon, StopIcon } from '../icons'
import {
  formatRateLimitLabel,
  getModelPingKey,
  getRateLimitPercent,
} from '../../utils/appCore'
import { INTERACTION_MODE_META, PANEL_INTERACTION_MODES, STATUS_SYMBOL_ICON_CLASS } from '../../constants'

type InputDraftEditState = { kind: 'queued'; index: number } | { kind: 'recalled' }
type SettingsPopover = 'mode' | 'sandbox' | 'permission' | 'model' | null

export interface ContextUsageInfo {
  modelContextTokens: number
  outputReserveTokens: number
  safeInputBudgetTokens: number
  estimatedInputTokens: number
  usedPercent: number
}

function renderSandboxSymbol(mode: SandboxMode) {
  if (mode === 'read-only') {
    return (
      <svg className={STATUS_SYMBOL_ICON_CLASS} viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="4.1" y="7.1" width="7.8" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.1" />
        <path d="M5.9 7.1V5.5C5.9 4.34 6.84 3.4 8 3.4C9.16 3.4 10.1 4.34 10.1 5.5V7.1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M8 9.3V10.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg className={STATUS_SYMBOL_ICON_CLASS} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 4.8H6L7.2 6H14V12.8H2V4.8Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M2 6H14" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  )
}

function renderPermissionSymbol(mode: PermissionMode) {
  if (mode === 'verify-first') {
    return (
      <svg className={STATUS_SYMBOL_ICON_CLASS} viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="6.8" cy="6.8" r="3.5" stroke="currentColor" strokeWidth="1.1" />
        <path d="M5.4 6.8L6.5 7.9L8.4 6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9.6 9.6L13.2 13.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg className={STATUS_SYMBOL_ICON_CLASS} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.8" stroke="currentColor" strokeWidth="1.1" />
      <path d="M5.4 8H10.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M8.8 6.4L10.6 8L8.8 9.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function renderInteractionModeSymbol(mode: AgentInteractionMode) {
  if (mode === 'agent') {
    return (
      <svg className={STATUS_SYMBOL_ICON_CLASS} viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="3.1" y="4.5" width="9.8" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.1" />
        <path d="M8 2.8V4.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <circle cx="5.9" cy="8.2" r="0.7" fill="currentColor" />
        <circle cx="10.1" cy="8.2" r="0.7" fill="currentColor" />
        <path d="M6.1 10H9.9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    )
  }
  if (mode === 'plan') {
    return (
      <svg className={STATUS_SYMBOL_ICON_CLASS} viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="2.5" y="3.2" width="8.8" height="10.3" rx="1.3" stroke="currentColor" strokeWidth="1.1" />
        <path d="M4.5 6H9.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M4.5 8.4H8.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M9.8 10.8L12.9 7.7L14.3 9.1L11.2 12.2L9.4 12.6L9.8 10.8Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      </svg>
    )
  }
  if (mode === 'debug') {
    return (
      <svg className={STATUS_SYMBOL_ICON_CLASS} viewBox="0 0 16 16" fill="none" aria-hidden>
        <ellipse cx="8" cy="8.5" rx="3" ry="3.3" stroke="currentColor" strokeWidth="1.1" />
        <path d="M8 3.1V5.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M5.1 6.6L3.2 5.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M10.9 6.6L12.8 5.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M5 10.1L3.1 11.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M11 10.1L12.9 11.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg className={STATUS_SYMBOL_ICON_CLASS} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.8" stroke="currentColor" strokeWidth="1.1" />
      <path d="M6.8 6.2C6.8 5.54 7.34 5 8 5C8.66 5 9.2 5.54 9.2 6.2C9.2 6.72 8.88 7.03 8.42 7.4C7.94 7.78 7.6 8.13 7.6 8.8V9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="8" cy="11.2" r="0.8" fill="currentColor" />
    </svg>
  )
}

export interface ChatInputSectionProps {
  panel: AgentPanelState
  inputLocked: boolean
  panelFontSizePx: number
  panelLineHeightPx: number
  hasInput: boolean
  isBusy: boolean
  draftEdit: InputDraftEditState | null
  sendTitle: string
  livePromptDurationLabel: string | null
  timelineMessageColor: string
  contextUsage: ContextUsageInfo | null
  contextUsagePercent: number | null
  contextUsageStrokeColor: string
  activityDotClass: string
  activityLabel: string
  activityTitle: string
  isRunning: boolean
  showCompletionNotice: boolean
  settingsPopover: SettingsPopover
  interactionMode: AgentInteractionMode
  effectiveSandbox: SandboxMode
  effectivePermissionMode: PermissionMode
  sandboxLockedToView: boolean
  permissionDisabledByReadOnlySandbox: boolean
  permissionLockedToVerifyFirst: boolean
  modelConfig: ModelConfig
  providerAuthByName: Partial<Record<string, ProviderAuthStatus>>
  providerVerifiedByName: Record<string, boolean>
  modelPingResults: Record<string, { ok: boolean; durationMs: number; error?: string }>
  modelPingPending: Set<string>
  showOnlyResponsiveModels: boolean
  getModelProvider: (model: string) => ModelProvider
  getModelOptions: (includeCurrent?: string, filterProvider?: ModelProvider) => string[]
  textareaRef: (el: HTMLTextAreaElement | null) => void
  onInputChange: (value: string) => void
  onFocus: () => void
  onPasteImage: (file: File) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onContextMenu: (e: React.MouseEvent<HTMLTextAreaElement>) => void
  onSend: () => void
  onInterrupt: () => void
  onCancelDraftEdit: () => void
  onRemoveAttachment: (attachmentId: string) => void
  setSettingsPopover: (next: SettingsPopover) => void
  onSetInteractionMode: (mode: AgentInteractionMode) => void
  onSetPanelSandbox: (value: SandboxMode) => void
  onSetPanelPermission: (value: PermissionMode) => void
  onSandboxLockedClick: () => void
  onSwitchModel: (modelId: string) => void
  onSummarizeContext: () => void
}

export function ChatInputSection({
  panel,
  inputLocked,
  panelFontSizePx,
  panelLineHeightPx,
  hasInput,
  isBusy,
  draftEdit,
  sendTitle,
  livePromptDurationLabel,
  timelineMessageColor,
  contextUsage,
  contextUsagePercent,
  contextUsageStrokeColor,
  activityDotClass,
  activityLabel,
  activityTitle,
  isRunning,
  showCompletionNotice,
  settingsPopover,
  interactionMode,
  effectiveSandbox,
  effectivePermissionMode,
  sandboxLockedToView,
  permissionDisabledByReadOnlySandbox,
  permissionLockedToVerifyFirst,
  modelConfig,
  providerAuthByName,
  providerVerifiedByName,
  modelPingResults,
  modelPingPending,
  showOnlyResponsiveModels,
  getModelProvider,
  getModelOptions,
  textareaRef,
  onInputChange,
  onFocus,
  onPasteImage,
  onKeyDown,
  onContextMenu,
  onSend,
  onInterrupt,
  onCancelDraftEdit,
  onRemoveAttachment,
  setSettingsPopover,
  onSetInteractionMode,
  onSetPanelSandbox,
  onSetPanelPermission,
  onSandboxLockedClick,
  onSwitchModel,
  onSummarizeContext,
}: ChatInputSectionProps) {
  const lockTitle = 'This chat is read-only. Start a new chat to continue.'
  const sendButtonDisabled = inputLocked || (!isBusy && !hasInput)
  const summarizeDisabled = inputLocked || isBusy
  const interactionModeBadgeClass =
    interactionMode === 'plan'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200'
      : interactionMode === 'debug'
        ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-200'
        : interactionMode === 'ask'
          ? 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/35 dark:text-violet-200'
          : 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/35 dark:text-blue-200'

  const isReadOnly = inputLocked
  const containerClass = isReadOnly
    ? "relative z-10 border-t border-neutral-200/80 p-2.5 bg-neutral-100 dark:bg-neutral-900 dark:border-neutral-800"
    : "relative z-10 border-t border-neutral-200/80 dark:border-neutral-800 p-2.5 bg-white dark:bg-neutral-950"

  return (
    <div className={containerClass}>
      {panel.attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {panel.attachments.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
              <span className="truncate max-w-[200px]" title={a.path}>{a.label}</span>
              <button
                type="button"
                className="rounded px-1 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed dark:hover:bg-blue-900/40"
                title="Remove attachment"
                onClick={() => onRemoveAttachment(a.id)}
                disabled={inputLocked}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
      {draftEdit && (
        <div className="mb-1.5 flex items-center justify-between gap-2 rounded-md border border-blue-200/80 bg-blue-50/80 px-2 py-1 text-[11px] text-blue-800 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-200">
          <span>
            {draftEdit.kind === 'queued'
              ? `Editing queued message #${draftEdit.index + 1}.`
              : 'Editing recalled message.'}
          </span>
          <button
            type="button"
            className="rounded border border-blue-300/80 px-1.5 py-0.5 text-[10px] hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-blue-700 dark:hover:bg-blue-900/50"
            onClick={onCancelDraftEdit}
            disabled={inputLocked}
          >
            Cancel
          </button>
        </div>
      )}
      <div className="mb-1.5 flex items-center gap-2 text-[11px]">
        <span className="text-neutral-500 dark:text-neutral-400">Mode</span>
        <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-medium ${interactionModeBadgeClass}`}>
          {renderInteractionModeSymbol(interactionMode)}
          {INTERACTION_MODE_META[interactionMode].label}
        </span>
      </div>
      <div className="flex items-end gap-2 min-w-0">
        <textarea
          ref={textareaRef}
          className={[
            "flex-1 min-w-0 resize-none rounded-xl border px-3 py-2 shadow-sm outline-none font-chat",
            isReadOnly
              ? "bg-transparent border-transparent text-neutral-600 cursor-not-allowed dark:text-neutral-400 placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
              : "bg-white border-neutral-300 text-neutral-900 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 placeholder:text-neutral-500 dark:bg-neutral-800 dark:border-neutral-600 dark:text-neutral-100 dark:placeholder:text-neutral-400 dark:focus:border-blue-700 dark:focus:ring-blue-900/40"
          ].join(' ')}
          style={{ fontSize: `${panelFontSizePx}px`, lineHeight: `${panelLineHeightPx}px` }}
          placeholder={inputLocked ? 'This chat is read-only. Start a new chat to continue.' : 'Message the agent...'}
          rows={1}
          value={panel.input}
          disabled={inputLocked}
          readOnly={inputLocked}
          onFocus={onFocus}
          onChange={(e) => onInputChange(e.target.value)}
          onPaste={(e) => {
            const items = Array.from(e.clipboardData?.items ?? []).filter((it) => it.type.startsWith('image/'))
            if (items.length === 0) return
            e.preventDefault()
            for (const item of items) {
              const file = item.getAsFile()
              if (file) onPasteImage(file)
            }
          }}
          onKeyDown={onKeyDown}
          onContextMenu={onContextMenu}
        />
        <div className="shrink-0 flex flex-col items-center gap-0.5">
          {livePromptDurationLabel && (
            <span className="text-[10px] font-mono leading-none text-neutral-500 dark:text-neutral-400" title="Response duration">
              {livePromptDurationLabel}
            </span>
          )}
          <button
            className={[
              'h-8 w-8 inline-flex items-center justify-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
              isBusy
                ? hasInput
                  ? 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60'
                : hasInput
                  ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-sm'
                  : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-900 dark:text-neutral-600',
            ].join(' ')}
            onClick={() => {
              if (inputLocked) return
              if (isBusy) {
                if (draftEdit?.kind === 'recalled') onSend()
                else onInterrupt()
              } else {
                onSend()
              }
            }}
            disabled={sendButtonDisabled}
            title={inputLocked ? lockTitle : sendTitle}
          >
            {isBusy && !hasInput ? (
              <SpinnerIcon size={18} className="animate-spin motion-reduce:animate-none" />
            ) : isBusy && draftEdit?.kind !== 'recalled' ? (
              <StopIcon size={18} />
            ) : (
              <SendIcon size={18} />
            )}
          </button>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 min-w-0 text-xs">
        <div className="min-w-0 flex-1 flex flex-wrap items-center gap-2 text-neutral-600 dark:text-neutral-300">
          {panel.status && (
            <span className="text-[11px] truncate max-w-[180px]" style={{ color: timelineMessageColor }} title={panel.status}>
              {panel.status}
            </span>
          )}
          {contextUsage && contextUsagePercent !== null && (
            <div
              className="inline-flex items-center gap-1"
              title={`${contextUsagePercent.toFixed(1)}% used\nEstimated context usage\nModel window: ${contextUsage.modelContextTokens.toLocaleString()} tokens\nReserved output: ${contextUsage.outputReserveTokens.toLocaleString()} tokens\nSafe input budget: ${contextUsage.safeInputBudgetTokens.toLocaleString()} tokens\nEstimated input: ${contextUsage.estimatedInputTokens.toLocaleString()} tokens`}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" className="shrink-0 -rotate-90">
                <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2" />
                <circle
                  cx="8" cy="8" r="6" fill="none"
                  stroke={contextUsageStrokeColor}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 6}`}
                  strokeDashoffset={`${2 * Math.PI * 6 * (1 - Math.max(0, Math.min(100, contextUsagePercent)) / 100)}`}
                />
              </svg>
            </div>
          )}
          <span
            className="inline-flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-300"
            title={activityTitle}
            aria-label={`Panel activity ${activityLabel}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${activityDotClass} ${isRunning ? 'animate-pulse' : ''}`}
              aria-hidden
            />
            {activityLabel}
          </span>
          {showCompletionNotice && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200"
              aria-live="polite"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              complete
            </span>
          )}
          {(() => {
            const pct = getRateLimitPercent(panel.usage)
            const label = formatRateLimitLabel(panel.usage)
            if (pct === null || !label) {
              return null
            }
            return (
              <div className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-16 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                  <span className="block h-full bg-blue-600" style={{ width: `${100 - pct}%` }} />
                </span>
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400">{label}</span>
              </div>
            )
          })()}
        </div>
        <div className="min-w-0 flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            className="h-7 inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2 text-[11px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            title={
              inputLocked
                ? lockTitle
                : isBusy
                  ? 'Wait for the current turn to finish before summarizing context.'
                  : 'Compress this session into a checkpoint summary and reset context.'
            }
            onClick={onSummarizeContext}
            disabled={summarizeDisabled}
          >
            Summarize Session
          </button>
          <div className="relative" data-settings-popover-root="true">
            <button
              type="button"
              className={[
                'h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                settingsPopover === 'mode'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                  : 'bg-transparent text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700',
              ].join(' ')}
              title={inputLocked ? lockTitle : `Mode: ${INTERACTION_MODE_META[interactionMode].label}`}
              onClick={() => setSettingsPopover(settingsPopover === 'mode' ? null : 'mode')}
              disabled={inputLocked}
            >
              {renderInteractionModeSymbol(interactionMode)}
            </button>
            {settingsPopover === 'mode' && (
              <div className="absolute right-0 bottom-[calc(100%+6px)] z-[120] w-48 rounded-lg border border-neutral-300/90 bg-neutral-50/95 p-1.5 text-neutral-800 shadow-2xl ring-1 ring-black/10 backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95 dark:text-neutral-100 dark:ring-white/10">
                {PANEL_INTERACTION_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={[
                      'w-full appearance-none border-0 text-left text-[11px] px-2 py-1.5 rounded',
                      interactionMode === mode
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                        : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
                    ].join(' ')}
                    title={INTERACTION_MODE_META[mode].hint}
                    onClick={() => {
                      onSetInteractionMode(mode)
                      setSettingsPopover(null)
                    }}
                  >
                    {INTERACTION_MODE_META[mode].label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative" data-settings-popover-root="true">
            <button
              type="button"
              className={[
                'h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                settingsPopover === 'sandbox'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                  : 'bg-transparent text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700',
              ].join(' ')}
              title={
                inputLocked
                  ? lockTitle
                  : sandboxLockedToView
                    ? 'Sandbox: View only (locked by Workspace settings)'
                    : `Sandbox: ${effectiveSandbox}`
              }
              onClick={() => {
                if (sandboxLockedToView) {
                  onSandboxLockedClick()
                }
                setSettingsPopover(settingsPopover === 'sandbox' ? null : 'sandbox')
              }}
              disabled={inputLocked}
            >
              {renderSandboxSymbol(effectiveSandbox)}
            </button>
            {settingsPopover === 'sandbox' && (
              <div className="absolute right-0 bottom-[calc(100%+6px)] z-[120] w-48 rounded-lg border border-neutral-300/90 bg-neutral-50/95 p-1.5 text-neutral-800 shadow-2xl ring-1 ring-black/10 backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95 dark:text-neutral-100 dark:ring-white/10">
                {sandboxLockedToView ? (
                  <>
                    <div className="w-full text-left text-[11px] px-2 py-1.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                      View
                    </div>
                    <div className="px-2 pt-1 pb-1 text-[10px] text-neutral-500 dark:text-neutral-400">
                      Expand sandbox in Workspace settings.
                    </div>
                  </>
                ) : (
                  ([
                    ['read-only', 'Read only'],
                    ['workspace-write', 'Workspace write'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={[
                        'w-full appearance-none border-0 text-left text-[11px] px-2 py-1.5 rounded',
                        effectiveSandbox === value
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                          : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
                      ].join(' ')}
                      onClick={() => onSetPanelSandbox(value)}
                    >
                      {label}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="relative" data-settings-popover-root="true">
            <button
              type="button"
              className={[
                'h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                settingsPopover === 'permission'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                  : 'bg-transparent text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700',
              ].join(' ')}
              title={
                inputLocked
                  ? lockTitle
                  : permissionDisabledByReadOnlySandbox
                    ? 'Permissions disabled while workspace sandbox is Read only'
                    : permissionLockedToVerifyFirst
                      ? 'Permissions: Verify first (locked by Workspace settings)'
                      : `Permissions: ${effectivePermissionMode}`
              }
              disabled={inputLocked || permissionDisabledByReadOnlySandbox}
              onClick={() => setSettingsPopover(settingsPopover === 'permission' ? null : 'permission')}
            >
              {renderPermissionSymbol(effectivePermissionMode)}
            </button>
            {settingsPopover === 'permission' && !permissionDisabledByReadOnlySandbox && (
              <div className="absolute right-0 bottom-[calc(100%+6px)] z-[120] w-52 rounded-lg border border-neutral-300/90 bg-neutral-50/95 p-1.5 text-neutral-800 shadow-2xl ring-1 ring-black/10 backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95 dark:text-neutral-100 dark:ring-white/10">
                {permissionLockedToVerifyFirst ? (
                  <>
                    <div className="w-full text-left text-[11px] px-2 py-1.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                      Verify first
                    </div>
                    <div className="px-2 pt-1 pb-1 text-[10px] text-neutral-500 dark:text-neutral-400">
                      Locked by Workspace settings.
                    </div>
                  </>
                ) : (
                  ([
                    ['verify-first', 'Verify first'],
                    ['proceed-always', 'Proceed always'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={[
                        'w-full appearance-none border-0 text-left text-[11px] px-2 py-1.5 rounded',
                        effectivePermissionMode === value
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                          : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
                      ].join(' ')}
                      onClick={() => onSetPanelPermission(value)}
                    >
                      {label}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="relative" data-settings-popover-root="true">
            {(() => {
              const renderModelStatusDot = (modelId: string) => {
                const prov = getModelProvider(modelId)
                const key = getModelPingKey(prov, modelId)
                const pending = modelPingPending.has(key)
                const ping = modelPingResults[key]
                if (pending) {
                  return (
                    <svg className="h-2 w-2 shrink-0 animate-spin text-neutral-400" viewBox="0 0 16 16" fill="none" aria-label="Testing...">
                      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
                      <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  )
                }
                if (ping) {
                  return (
                    <span
                      className={`inline-block w-2 h-2 rounded-full shrink-0 ${ping.ok ? 'bg-emerald-500' : 'bg-red-500'}`}
                      title={ping.ok ? `Working (${ping.durationMs}ms)` : (ping.error ?? 'Failed')}
                    />
                  )
                }
                const pStatus = providerAuthByName[prov]
                const pVerified = providerVerifiedByName[prov]
                const dotCls = !pStatus
                  ? 'bg-neutral-400 dark:bg-neutral-500'
                  : !pStatus.installed
                    ? 'bg-red-500'
                    : pStatus.authenticated
                      ? (pVerified ? 'bg-emerald-500' : 'bg-amber-500')
                      : 'bg-amber-500'
                const dotTitle = !pStatus
                  ? 'Checking provider status...'
                  : !pStatus.installed
                    ? pStatus.detail ?? 'CLI not found'
                    : pStatus.authenticated
                      ? (pVerified ? pStatus.detail ?? 'Connected' : 'Authenticated. Waiting for first response to verify.')
                      : pStatus.detail ?? 'Login required'
                return (
                  <span
                    className={`inline-block w-2 h-2 rounded-full shrink-0 ${dotCls}`}
                    title={dotTitle}
                  />
                )
              }
              return (
                <>
                  <button
                    type="button"
                    className={[
                      'h-7 inline-flex items-center gap-1.5 rounded-md border px-1.5 text-[11px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                      settingsPopover === 'model'
                        ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200'
                        : 'border-neutral-200/70 bg-neutral-50/75 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-200 dark:hover:bg-neutral-800',
                    ].join(' ')}
                    title={inputLocked ? lockTitle : `Model: ${panel.model}`}
                    onClick={() => setSettingsPopover(settingsPopover === 'model' ? null : 'model')}
                    disabled={inputLocked}
                  >
                    {renderModelStatusDot(panel.model)}
                    <span className="max-w-[160px] truncate">{panel.model}</span>
                  </button>
                  {settingsPopover === 'model' && (
                    <div className="absolute right-0 bottom-[calc(100%+6px)] z-[120] w-72 max-h-64 overflow-y-auto rounded-lg border border-neutral-300/90 bg-neutral-50/95 p-1.5 text-neutral-800 shadow-2xl ring-1 ring-black/10 backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95 dark:text-neutral-100 dark:ring-white/10">
                      {getModelOptions(panel.model, panel.provider).filter((id) => {
                        if (!showOnlyResponsiveModels) return true
                        const modelPingKey = getModelPingKey(panel.provider, id)
                        const ping = modelPingResults[modelPingKey]
                        const pending = modelPingPending.has(modelPingKey)
                        // Show if not pending and (no ping yet or ping is ok)
                        return !pending && (ping === null || ping === undefined || ping.ok === true)
                      }).map((id) => (
                        <button
                          key={id}
                          type="button"
                          className={[
                            'w-full flex items-center gap-2 appearance-none border-0 text-left text-[11px] px-2 py-1.5 rounded',
                            id === panel.model
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                              : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
                          ].join(' ')}
                          onClick={() => { onSwitchModel(id); setSettingsPopover(null) }}
                        >
                          {renderModelStatusDot(id)}
                          <span className="truncate">{id}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
