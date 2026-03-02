/**
 * Message row - user/assistant/system/thinking with markdown, code blocks, attachments.
 */

import React, { useCallback, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AgentInteractionMode, ChatRole, MessageFormat, PastedImageAttachment, StandaloneTheme } from '../../../types'
import type { TimelineUnit } from '../../../chat/timelineTypes'
import { TimelineCodeBlock } from './TimelineCodeBlock'
import { COLLAPSIBLE_CODE_MIN_LINES, INTERACTION_MODE_META } from '../../../constants'
import { LIMIT_WARNING_PREFIX, looksLikeDiff, toLocalFileUrl } from '../../../utils/appCore'

export interface TimelineMessageRowProps {
  unit: TimelineUnit
  messageId: string
  role: ChatRole
  content: string
  format: MessageFormat
  attachments: PastedImageAttachment[] | undefined
  createdAt: number | undefined
  isCodeLifecycleUnit: boolean
  codeUnitPinned: boolean
  shouldCollapseThinking: boolean
  thinkingOpen: boolean
  thinkingInProgress: boolean
  thinkingSummary: string
  isDebugSystemNote: boolean
  isLimitSystemWarning: boolean
  isContextCompactionNotice: boolean
  canShowGrantPermissionButton: boolean
  messageContainerStyle: React.CSSProperties | undefined
  showCompletedDurationOnMessage: boolean
  completedPromptDurationLabel: string | null
  completedPromptTimestamp: number | null
  isLastUserMessage: boolean
  isLastAssistantMessage: boolean
  isStreaming: boolean
  canRecallLastUserMessage: boolean
  resendingPanelId: string | null
  panelId: string
  activeTheme: StandaloneTheme
  debugNoteColor: string
  timelineMessageColor: string
  codeBlockOpenById: Record<string, boolean>
  setCodeBlockOpenById: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  setTimelineOpenByUnitId: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  setTimelinePinnedCodeByUnitId: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  onChatLinkClick: (href: string) => void
  onGrantPermissionAndResend: () => void
  onRecallLastUserMessage: () => void
}

export const TimelineMessageRow = React.memo(function TimelineMessageRow(props: TimelineMessageRowProps) {
  const {
    unit,
    messageId,
    role,
    content,
    format,
    attachments,
    isCodeLifecycleUnit,
    codeUnitPinned,
    shouldCollapseThinking,
    thinkingOpen,
    thinkingInProgress,
    thinkingSummary,
    isDebugSystemNote,
    isLimitSystemWarning,
    isContextCompactionNotice,
    canShowGrantPermissionButton,
    messageContainerStyle,
    showCompletedDurationOnMessage,
    completedPromptDurationLabel,
    completedPromptTimestamp,
    isLastUserMessage,
    isLastAssistantMessage,
    isStreaming,
    canRecallLastUserMessage,
    resendingPanelId,
    panelId,
    activeTheme,
    debugNoteColor,
    timelineMessageColor,
    codeBlockOpenById,
    setCodeBlockOpenById,
    setTimelineOpenByUnitId,
    setTimelinePinnedCodeByUnitId,
    onChatLinkClick,
    onGrantPermissionAndResend,
    onRecallLastUserMessage,
  } = props

  const codeBlockIndexRef = useRef(0)
  codeBlockIndexRef.current = 0

  const createMarkdownComponents = useCallback(
    (isThinkingCollapsed: boolean) => ({
      pre(preProps: React.ComponentPropsWithoutRef<'pre'>) {
        const first = React.Children.toArray(preProps.children)[0] as React.ReactElement<{ className?: string; children?: React.ReactNode }> | undefined
        const codeClass = typeof first?.props?.className === 'string' ? first.props.className : ''
        const rawChildren = first?.props?.children
        const codeText = Array.isArray(rawChildren) ? rawChildren.join('') : String(rawChildren ?? '')
        const normalized = codeText.replace(/\n$/, '')
        const lineCount = normalized ? normalized.split('\n').length : 0
        const lang = codeClass.startsWith('language-') ? codeClass.slice('language-'.length) : 'code'
        const isDiff = lang === 'diff' || looksLikeDiff(normalized)
        const openByDefault = isCodeLifecycleUnit
          ? unit.status === 'in_progress' || codeUnitPinned
          : lineCount <= COLLAPSIBLE_CODE_MIN_LINES
        const idx = codeBlockIndexRef.current++
        const codeBlockId = `${messageId}:${idx}`
        const isOpen = codeBlockOpenById[codeBlockId] ?? openByDefault

        return (
          <TimelineCodeBlock
            codeBlockId={codeBlockId}
            lang={lang}
            normalized={normalized}
            isDiff={isDiff}
            openByDefault={openByDefault}
            isOpen={isOpen}
            onToggle={() =>
              setCodeBlockOpenById((prev) => {
                const current = prev[codeBlockId] ?? openByDefault
                return { ...prev, [codeBlockId]: !current }
              })
            }
            activeTheme={activeTheme}
          />
        )
      },
      code(codeProps: React.ComponentPropsWithoutRef<'code'>) {
        const { children, className } = codeProps
        const isBlock = typeof className === 'string' && className.includes('language-')
        if (isBlock) return <code className={className}>{children}</code>
        return (
          <code className="px-1 py-0.5 rounded bg-blue-100 text-blue-900 dark:bg-blue-950/50 dark:text-blue-200">
            {children}
          </code>
        )
      },
      a(aProps: React.ComponentPropsWithoutRef<'a'>) {
        const { href, children } = aProps
        const target = typeof href === 'string' ? href : ''
        return (
          <a
            href={target || undefined}
            title={target || undefined}
            className="text-blue-700 underline underline-offset-2 decoration-blue-400 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
            onClick={(e) => {
              if (!target) return
              e.preventDefault()
              void onChatLinkClick(target)
            }}
          >
            {children}
          </a>
        )
      },
    }),
    [
      messageId,
      isCodeLifecycleUnit,
      codeUnitPinned,
      unit.status,
      codeBlockOpenById,
      setCodeBlockOpenById,
      activeTheme,
      onChatLinkClick,
    ]
  )

  const hasFencedCodeBlocks = content.includes('```')
  const assistantMessageContainerStyle =
    role === 'assistant' && !shouldCollapseThinking
      ? {
        backgroundColor: activeTheme.assistantBubbleBg,
        borderColor: activeTheme.borderStrong,
      }
      : undefined
  const mergedMessageContainerStyle: React.CSSProperties = {
    ...(assistantMessageContainerStyle ?? {}),
    ...(messageContainerStyle ?? {}),
    ...(isDebugSystemNote ? { backgroundColor: activeTheme.errorStatus } : {}),
  }

  const containerClasses = [
    'w-full relative group font-chat',
    shouldCollapseThinking
      ? 'py-1'
      : [
        'rounded-2xl px-3.5 py-2.5 border shadow-sm',
        role === 'user'
          ? 'bg-blue-50/90 border-blue-200 text-blue-950 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-100'
          : 'border-neutral-200/90 text-neutral-900 dark:border-neutral-800 dark:text-neutral-100',
        role === 'system'
          ? 'bg-neutral-50 border-neutral-200 text-neutral-700 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-300'
          : '',
        isLimitSystemWarning
          ? 'bg-amber-50/95 border-amber-300 text-amber-900 dark:bg-amber-950/35 dark:border-amber-800 dark:text-amber-200'
          : '',
        isContextCompactionNotice
          ? 'bg-cyan-50/95 border-cyan-300 text-cyan-900 dark:bg-cyan-950/35 dark:border-cyan-800 dark:text-cyan-200'
          : '',
        isDebugSystemNote
          ? 'border-red-200 text-red-900 dark:border-red-900 dark:text-red-200'
          : '',
      ].join(' '),
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div key={messageId} data-unit-id={unit.id} className="w-full">
      <div className={containerClasses} style={mergedMessageContainerStyle}>
        {role === 'user' && isLastUserMessage && resendingPanelId === panelId && (
          <div className="absolute inset-0 rounded-2xl animate-pulse bg-blue-200/30 dark:bg-blue-400/10 pointer-events-none" />
        )}
        {isCodeLifecycleUnit && hasFencedCodeBlocks && (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              className="text-[11px] px-2 py-1 rounded border border-neutral-300 bg-white/80 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              onClick={() =>
                setTimelinePinnedCodeByUnitId((prev) => ({
                  ...prev,
                  [unit.id]: !codeUnitPinned,
                }))
              }
              title={codeUnitPinned ? 'Unpin code blocks' : 'Keep code blocks open after completion'}
            >
              {codeUnitPinned ? 'Pinned open' : 'Pin open'}
            </button>
          </div>
        )}
        {shouldCollapseThinking ? (
          <details
            open={thinkingOpen}
            onToggle={(e) => {
              const next = e.currentTarget.open
              setTimelineOpenByUnitId((prev) => (prev[unit.id] === next ? prev : { ...prev, [unit.id]: next }))
            }}
            className="group"
          >
            <summary
              className={`list-none cursor-pointer py-0.5 text-[10.5px] flex items-center justify-between gap-2 font-thinking ${thinkingInProgress ? 'animate-pulse motion-reduce:animate-none' : ''}`}
              style={{ color: timelineMessageColor }}
            >
              <span>{thinkingSummary}</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                className="transition-transform group-open:rotate-180"
                aria-hidden
              >
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <div className="mt-1 pl-0 py-1 text-[12px] leading-5 [&_*]:!text-current font-thinking" style={{ color: timelineMessageColor }}>
              {role === 'assistant' && format === 'markdown' ? (
                <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none break-words [overflow-wrap:anywhere] prose-p:my-0.5 prose-p:leading-snug prose-headings:my-1 prose-ul:my-0.5 prose-li:my-0 prose-code:text-[currentColor] font-chat">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={createMarkdownComponents(true)}>
                    {content}
                  </ReactMarkdown>
                </div>
              ) : (
                <div
                  className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[12px] ${isDebugSystemNote
                    ? 'italic'
                    : isLimitSystemWarning
                      ? 'font-semibold text-amber-900 dark:text-amber-200'
                      : isContextCompactionNotice
                        ? 'font-semibold text-cyan-900 dark:text-cyan-200'
                        : 'text-neutral-700 dark:text-neutral-300'
                    }`}
                  style={isDebugSystemNote ? { color: debugNoteColor } : undefined}
                >
                  {content}
                </div>
              )}
            </div>
          </details>
        ) : role === 'assistant' && format === 'markdown' ? (
          <div className="prose prose-neutral dark:prose-invert max-w-none break-words [overflow-wrap:anywhere] prose-p:my-0.5 prose-p:leading-snug prose-ul:my-0.5 prose-li:my-0 prose-code:text-blue-800 dark:prose-code:text-blue-300 font-chat">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={createMarkdownComponents(false)}>
              {content}
            </ReactMarkdown>
            {isLastAssistantMessage && isStreaming && (
              <span className="inline-block ml-0.5 w-2 h-4 bg-current opacity-80 animate-pulse motion-reduce:animate-none" aria-hidden>▊</span>
            )}
          </div>
        ) : content ? (
          <div className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${isDebugSystemNote ? 'italic text-red-800 dark:text-red-200' : ''}`}>
            {canShowGrantPermissionButton ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{content}</span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-200 dark:hover:bg-blue-900/40"
                  onClick={onGrantPermissionAndResend}
                >
                  Grant Permission
                </button>
              </div>
            ) : (
              content
            )}
          </div>
        ) : null}
        {attachments && attachments.length > 0 && (
          <div className={`${content ? 'mt-2' : ''} flex flex-wrap gap-2`}>
            {attachments.map((attachment) => {
              const src = toLocalFileUrl(attachment.path)
              const blocksLocalFileUrl = src.startsWith('file://') && /^https?:$/i.test(window.location.protocol)
              if (blocksLocalFileUrl) {
                return (
                  <span
                    key={attachment.id}
                    className="inline-flex max-w-[220px] items-center rounded-md border border-blue-200/80 bg-blue-50 px-2 py-1 text-[11px] text-blue-900 dark:border-blue-900/70 dark:bg-blue-950/20 dark:text-blue-200"
                    title={attachment.path}
                  >
                    {attachment.label || 'Local image'}
                  </span>
                )
              }
              return (
                <img
                  key={attachment.id}
                  src={src}
                  alt={attachment.label || 'Image attachment'}
                  title={attachment.path}
                  className="h-20 w-20 rounded-md border border-blue-200/80 object-cover bg-blue-50 dark:border-blue-900/70 dark:bg-blue-950/20"
                  loading="lazy"
                />
              )
            })}
          </div>
        )}
        {showCompletedDurationOnMessage && completedPromptDurationLabel && (
          <div className="mt-2 flex justify-end">
            <span
              className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400"
              title={
                completedPromptTimestamp
                  ? `Completed at ${new Date(completedPromptTimestamp).toLocaleTimeString()}\nDuration: ${completedPromptDurationLabel}`
                  : `Response duration: ${completedPromptDurationLabel}`
              }
            >
              t+{completedPromptDurationLabel}
            </span>
          </div>
        )}
        {isLastUserMessage && (
          <div className="flex justify-end mt-1.5 mb-0.5 mr-0.5 gap-1 opacity-0 pointer-events-none transition-opacity motion-reduce:transition-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
            {canRecallLastUserMessage && (
              <button
                type="button"
                className="h-6 w-6 inline-flex items-center justify-center rounded-md bg-white/80 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/25 dark:text-blue-200 dark:hover:bg-blue-900/40"
                onClick={onRecallLastUserMessage}
                title="Recall this message for quick correction"
                aria-label="Recall this message for editing"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M3 11.5L2.8 13.2L4.5 13L12.2 5.3L10.7 3.8L3 11.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                  <path d="M9.9 4.6L11.4 6.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M2.5 13.5H13.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
