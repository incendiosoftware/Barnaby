/**
 * Chat input section - attachments, textarea, send button, footer (status, context, settings, model).
 */

import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  AgentInteractionMode,
  AgentPanelState,
  ModelConfig,
  ModelProvider,
  ProviderAuthStatus,
} from '../../types'
import { SendIcon, SpinnerIcon, StopIcon } from '../icons'
import {
  formatRateLimitLabel,
  getModelPingKey,
  getRateLimitPercent,
} from '../../utils/appCore'
import { INTERACTION_MODE_META, PANEL_INTERACTION_MODES, STATUS_SYMBOL_ICON_CLASS } from '../../constants'

type InputDraftEditState = { kind: 'queued'; index: number } | { kind: 'recalled' }
type SettingsPopover = 'mode' | 'model' | null

export interface ContextUsageInfo {
  modelContextTokens: number
  outputReserveTokens: number
  safeInputBudgetTokens: number
  estimatedInputTokens: number
  /** Tokens used for percent (backend input_tokens when available, else estimate) */
  inputTokensForPercent: number
  usedPercent: number
  fromBackend?: boolean
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
  modelConfig: ModelConfig
  providerAuthByName: Partial<Record<string, ProviderAuthStatus>>
  providerVerifiedByName: Record<string, boolean>
  modelPingResults: Record<string, { ok: boolean; durationMs: number; error?: string }>
  modelPingPending: Set<string>
  showOnlyResponsiveModels: boolean
  getModelProvider: (model: string) => ModelProvider
  isModelCatalogConfirmed?: (provider: ModelProvider, modelId: string) => boolean
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
  onSwitchModel: (modelId: string) => void
  onSummarizeContext: () => void
  promptShortcuts: string[]
  onInsertShortcut: (text: string) => void
  onDeleteShortcut: (index: number) => void
}

interface PopoverPosition {
  top: number
  left: number
  width: number
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
  modelConfig,
  providerAuthByName,
  providerVerifiedByName,
  modelPingResults,
  modelPingPending,
  showOnlyResponsiveModels,
  getModelProvider,
  isModelCatalogConfirmed,
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
  onSwitchModel,
  onSummarizeContext,
  promptShortcuts,
  onInsertShortcut,
  onDeleteShortcut,
}: ChatInputSectionProps) {
  const modeButtonRef = useRef<HTMLButtonElement | null>(null)
  const modelButtonRef = useRef<HTMLButtonElement | null>(null)
  const shortcutsButtonRef = useRef<HTMLButtonElement | null>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [shortcutsPosition, setShortcutsPosition] = useState<PopoverPosition | null>(null)
  const [shortcutContextMenu, setShortcutContextMenu] = useState<{ index: number; x: number; y: number } | null>(null)
  const [modePopoverPosition, setModePopoverPosition] = useState<PopoverPosition | null>(null)
  const [modelPopoverPosition, setModelPopoverPosition] = useState<PopoverPosition | null>(null)
  const lockTitle = 'This chat is read-only. Use Continue conversation to unlock and keep going.'
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
  const containerStyle: React.CSSProperties = {
    borderTopColor: 'var(--theme-border-default)',
    backgroundColor: isReadOnly
      ? 'color-mix(in srgb, var(--theme-bg-surface) 70%, var(--theme-bg-base) 30%)'
      : 'var(--theme-bg-surface)',
    color: 'var(--theme-text-primary)',
  }
  const inputStyle: React.CSSProperties = isReadOnly
    ? {
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        color: 'var(--theme-text-secondary)',
        fontSize: `${panelFontSizePx}px`,
        lineHeight: `${panelLineHeightPx}px`,
      }
    : {
        backgroundColor: 'var(--theme-bg-surface)',
        borderColor: 'var(--theme-border-default)',
        color: 'var(--theme-text-primary)',
        boxShadow: '0 1px 2px color-mix(in srgb, var(--theme-bg-base) 70%, transparent)',
        fontSize: `${panelFontSizePx}px`,
        lineHeight: `${panelLineHeightPx}px`,
      }
  const pickerButtonStyle: React.CSSProperties = {
    borderColor: 'var(--theme-border-default)',
    backgroundColor: 'color-mix(in srgb, var(--theme-bg-surface) 92%, var(--theme-bg-base) 8%)',
    color: 'var(--theme-text-secondary)',
  }
  const pickerButtonActiveStyle: React.CSSProperties = {
    borderColor: 'var(--theme-accent-strong)',
    backgroundColor: 'var(--theme-accent-tint)',
    color: 'var(--theme-accent-muted)',
  }
  const popoverStyle: React.CSSProperties = {
    borderColor: 'var(--theme-border-default)',
    backgroundColor: 'color-mix(in srgb, var(--theme-bg-surface) 94%, var(--theme-bg-base) 6%)',
    color: 'var(--theme-text-primary)',
    boxShadow: '0 12px 32px color-mix(in srgb, var(--theme-bg-base) 72%, transparent)',
  }
  const accentChipStyle: React.CSSProperties = {
    borderColor: 'color-mix(in srgb, var(--theme-accent-strong) 30%, var(--theme-border-default) 70%)',
    backgroundColor: 'color-mix(in srgb, var(--theme-accent-tint) 70%, var(--theme-bg-surface) 30%)',
    color: 'var(--theme-accent-muted)',
  }
  const accentChipButtonStyle: React.CSSProperties = {
    color: 'var(--theme-accent-muted)',
  }
  const accentChipButtonHoverStyle: React.CSSProperties = {
    backgroundColor: 'color-mix(in srgb, var(--theme-accent) 12%, transparent)',
  }
  const selectedMenuItemStyle: React.CSSProperties = {
    backgroundColor: 'var(--theme-accent-tint)',
    color: 'var(--theme-accent-muted)',
  }
  const rateBarFillStyle: React.CSSProperties = {
    backgroundColor: 'var(--theme-accent-strong)',
  }
  const isModelConfirmed = (modelId: string) => {
    const provider = getModelProvider(modelId)
    return isModelCatalogConfirmed ? isModelCatalogConfirmed(provider, modelId) : true
  }

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
  const visibleModelOptions = getModelOptions(panel.model, panel.provider).filter((id) => {
    if (!showOnlyResponsiveModels) return true
    const modelPingKey = getModelPingKey(panel.provider, id)
    const ping = modelPingResults[modelPingKey]
    const pending = modelPingPending.has(modelPingKey)
    return !pending && (ping === null || ping === undefined || ping.ok === true)
  })

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const computePopoverPosition = (button: HTMLButtonElement | null, width: number) => {
      if (!button) return null
      const rect = button.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const nextLeft = Math.min(
        Math.max(12, rect.left),
        Math.max(12, viewportWidth - width - 12),
      )
      return {
        top: Math.max(12, rect.top - 6),
        left: nextLeft,
        width,
      }
    }

    const updatePositions = () => {
      setModePopoverPosition(
        settingsPopover === 'mode' ? computePopoverPosition(modeButtonRef.current, 208) : null,
      )
      setModelPopoverPosition(
        settingsPopover === 'model' ? computePopoverPosition(modelButtonRef.current, 288) : null,
      )
    }

    updatePositions()
    if (!settingsPopover) return undefined

    window.addEventListener('resize', updatePositions)
    window.addEventListener('scroll', updatePositions, true)
    return () => {
      window.removeEventListener('resize', updatePositions)
      window.removeEventListener('scroll', updatePositions, true)
    }
  }, [settingsPopover])

  useEffect(() => {
    if (!showShortcuts && !shortcutContextMenu) return undefined
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest?.('[data-settings-popover-root="true"]')) return
      setShowShortcuts(false)
      setShortcutContextMenu(null)
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [showShortcuts, shortcutContextMenu])

  return (
    <div className="relative z-10 border-t px-[15px] py-2.5" style={containerStyle}>
      {panel.attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {panel.attachments.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]" style={accentChipStyle}>
              <span className="truncate max-w-[200px]" title={a.path}>{a.label}</span>
              <button
                type="button"
                className="rounded px-1 disabled:opacity-50 disabled:cursor-not-allowed"
                style={accentChipButtonStyle}
                title="Remove attachment"
                onClick={() => onRemoveAttachment(a.id)}
                disabled={inputLocked}
                onMouseEnter={(e) => Object.assign(e.currentTarget.style, accentChipButtonHoverStyle)}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
      {draftEdit && (
        <div className="mb-1.5 flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-[11px]" style={accentChipStyle}>
          <span>
            {draftEdit.kind === 'queued'
              ? `Editing queued message #${draftEdit.index + 1}.`
              : 'Editing recalled message.'}
          </span>
          <button
            type="button"
            className="rounded border-0 px-1.5 py-0.5 text-[10px] disabled:opacity-50 disabled:cursor-not-allowed"
            style={accentChipButtonStyle}
            onClick={onCancelDraftEdit}
            disabled={inputLocked}
            onMouseEnter={(e) => Object.assign(e.currentTarget.style, accentChipButtonHoverStyle)}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            Cancel
          </button>
        </div>
      )}
      <div className="mb-1.5 flex items-center gap-2 text-[11px]">
        <span style={{ color: 'var(--theme-text-tertiary)' }}>Mode</span>
        <div className="relative" data-settings-popover-root="true">
          <button
            type="button"
            ref={modeButtonRef}
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-medium transition-colors ${interactionModeBadgeClass} ${
              inputLocked ? 'cursor-not-allowed opacity-50' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
            title={inputLocked ? lockTitle : `Mode: ${INTERACTION_MODE_META[interactionMode].label}`}
            onClick={() => setSettingsPopover(settingsPopover === 'mode' ? null : 'mode')}
            disabled={inputLocked}
          >
            {renderInteractionModeSymbol(interactionMode)}
            {INTERACTION_MODE_META[interactionMode].label}
          </button>
          {settingsPopover === 'mode' && modePopoverPosition && createPortal(
            <div
              data-settings-popover-root="true"
              className="fixed z-[240] rounded-lg border p-1.5 backdrop-blur"
              style={{
                top: modePopoverPosition.top,
                left: modePopoverPosition.left,
                width: modePopoverPosition.width,
                maxHeight: 'min(24rem, calc(100vh - 24px))',
                transform: 'translateY(-100%)',
                ...popoverStyle,
              }}
            >
              {PANEL_INTERACTION_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={[
                    'w-full flex items-center gap-2 appearance-none border-0 text-left text-[11px] px-2 py-1.5 rounded',
                    mode === interactionMode
                      ? ''
                      : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
                  ].join(' ')}
                  style={mode === interactionMode ? selectedMenuItemStyle : undefined}
                  onClick={() => { onSetInteractionMode(mode); setSettingsPopover(null) }}
                >
                  {renderInteractionModeSymbol(mode)}
                  <span className="flex-1 truncate">{INTERACTION_MODE_META[mode].label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )}
        </div>
        <span style={{ color: 'var(--theme-text-tertiary)' }}>Model</span>
        <div className="relative" data-settings-popover-root="true">
          <button
            type="button"
            ref={modelButtonRef}
            className="h-7 inline-flex items-center gap-1.5 rounded-md border px-1.5 text-[11px] transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={settingsPopover === 'model' ? pickerButtonActiveStyle : pickerButtonStyle}
            title={inputLocked ? lockTitle : `Model: ${panel.model}`}
            onClick={() => setSettingsPopover(settingsPopover === 'model' ? null : 'model')}
            disabled={inputLocked}
          >
            {renderModelStatusDot(panel.model)}
            <span
              className={[
                'max-w-[160px] truncate',
                isModelConfirmed(panel.model) ? '' : 'text-neutral-500 dark:text-neutral-400',
              ].join(' ')}
            >
              {panel.model}
            </span>
          </button>
          {settingsPopover === 'model' && modelPopoverPosition && createPortal(
            <div
              data-settings-popover-root="true"
              className="fixed z-[240] overflow-y-auto rounded-lg border p-1.5 backdrop-blur"
              style={{
                top: modelPopoverPosition.top,
                left: modelPopoverPosition.left,
                width: modelPopoverPosition.width,
                maxHeight: 'min(16rem, calc(100vh - 24px))',
                transform: 'translateY(-100%)',
                ...popoverStyle,
              }}
            >
              {visibleModelOptions.map((id) => {
                const confirmed = isModelConfirmed(id)
                const selected = id === panel.model
                return (
                <button
                  key={id}
                  type="button"
                  className={[
                    'w-full flex items-center gap-2 appearance-none border-0 text-left text-[11px] px-2 py-1.5 rounded',
                    selected
                      ? (confirmed
                        ? ''
                        : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400')
                      : (confirmed
                        ? 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800'
                        : 'text-neutral-400 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:bg-neutral-800'),
                  ].join(' ')}
                  style={selected && confirmed ? selectedMenuItemStyle : undefined}
                  onClick={() => { onSwitchModel(id); setSettingsPopover(null) }}
                >
                  {renderModelStatusDot(id)}
                  <span className="truncate">{id}</span>
                </button>
                )
              })}
            </div>,
            document.body,
          )}
        </div>
        <div className="flex-1" />
        <div className="relative" data-settings-popover-root="true">
          <button
            type="button"
            ref={shortcutsButtonRef}
            className="h-7 inline-flex items-center gap-1 rounded-md border px-1.5 text-[11px] transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={showShortcuts ? pickerButtonActiveStyle : pickerButtonStyle}
            title="Prompt shortcuts"
            onClick={() => {
              const next = !showShortcuts
              setShowShortcuts(next)
              if (next && shortcutsButtonRef.current) {
                const rect = shortcutsButtonRef.current.getBoundingClientRect()
                const width = 260
                const nextLeft = Math.min(
                  Math.max(12, rect.right - width),
                  Math.max(12, window.innerWidth - width - 12),
                )
                setShortcutsPosition({
                  top: Math.max(12, rect.top - 6),
                  left: nextLeft,
                  width,
                })
              }
            }}
            disabled={inputLocked}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2 3.5H10M2 6H7M2 8.5H9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
            </svg>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
              <path d="M2 3L4 5L6 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {showShortcuts && shortcutsPosition && createPortal(
            <div
              data-settings-popover-root="true"
              className="fixed z-[240] overflow-y-auto rounded-lg border p-1.5 backdrop-blur"
              style={{
                top: shortcutsPosition.top,
                left: shortcutsPosition.left,
                width: shortcutsPosition.width,
                maxHeight: 'min(16rem, calc(100vh - 24px))',
                transform: 'translateY(-100%)',
                ...popoverStyle,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {promptShortcuts.length === 0 ? (
                <div className="px-2 py-2 text-[11px]" style={{ color: 'var(--theme-text-tertiary)' }}>
                  No shortcuts yet. Right-click a message to add one.
                </div>
              ) : (
                promptShortcuts.map((text, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="w-full flex items-center gap-2 appearance-none border-0 text-left text-[11px] px-2 py-1.5 rounded text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    onClick={() => {
                      onInsertShortcut(text)
                      setShowShortcuts(false)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setShortcutContextMenu({ index: idx, x: e.clientX, y: e.clientY })
                    }}
                    title={text}
                  >
                    <span className="truncate">{text}</span>
                  </button>
                ))
              )}
            </div>,
            document.body,
          )}
          {shortcutContextMenu && createPortal(
            <div
              data-settings-popover-root="true"
              className="fixed z-[250] rounded-md border p-1 shadow-lg backdrop-blur"
              style={{
                top: shortcutContextMenu.y,
                left: shortcutContextMenu.x,
                ...popoverStyle,
              }}
            >
              <button
                type="button"
                className="w-full flex items-center gap-2 appearance-none border-0 text-left text-[11px] px-3 py-1.5 rounded text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                onClick={() => {
                  onDeleteShortcut(shortcutContextMenu.index)
                  setShortcutContextMenu(null)
                }}
              >
                Delete shortcut
              </button>
            </div>,
            document.body,
          )}
        </div>
      </div>
      <div className="flex items-end gap-2 min-w-0">
        <textarea
          ref={textareaRef}
          className="flex-1 min-w-0 resize-none rounded-xl border px-3 py-2 outline-none font-chat placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
          style={inputStyle}
          placeholder={inputLocked ? 'This chat is read-only. Click Continue conversation in the header.' : 'Message the agent...'}
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
            <span className="text-[10px] font-mono leading-none" style={{ color: 'var(--theme-text-tertiary)' }} title="Response duration">
              {livePromptDurationLabel}
            </span>
          )}
          <button
            className={[
              'h-8 w-8 inline-flex items-center justify-center rounded-full border-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
              'hover:opacity-90 active:opacity-80',
            ].join(' ')}
            style={
              isBusy
                ? hasInput
                  ? {
                      backgroundColor: 'var(--theme-bg-elevated)',
                      color: 'var(--theme-text-primary)',
                    }
                  : {
                      backgroundColor: 'var(--theme-accent-tint)',
                      color: 'var(--theme-accent-muted)',
                    }
                : hasInput
                  ? {
                      backgroundColor: 'var(--theme-accent)',
                      color: 'var(--theme-accent-on-primary)',
                    }
                  : {
                      backgroundColor: 'color-mix(in srgb, var(--theme-bg-surface) 75%, var(--theme-bg-base) 25%)',
                      color: 'var(--theme-text-tertiary)',
                    }
            }
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
                  <span className="block h-full" style={{ ...rateBarFillStyle, width: `${100 - pct}%` }} />
                </span>
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400">{label}</span>
              </div>
            )
          })()}
        </div>
        <div className="min-w-0 flex flex-wrap items-center justify-end gap-1.5">
          {contextUsage && contextUsagePercent !== null && (
            <div
              className="inline-flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400"
              title={`${contextUsagePercent.toFixed(1)}% used\n${contextUsage.fromBackend ? 'Reported' : 'Estimated'} context usage\nModel window: ${contextUsage.modelContextTokens.toLocaleString()} tokens\nReserved output: ${contextUsage.outputReserveTokens.toLocaleString()} tokens\nSafe input budget: ${contextUsage.safeInputBudgetTokens.toLocaleString()} tokens\nInput tokens: ${contextUsage.inputTokensForPercent.toLocaleString()} tokens`}
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
              <span>{contextUsagePercent.toFixed(0)}%</span>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
