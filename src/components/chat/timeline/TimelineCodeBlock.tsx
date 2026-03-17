/**
 * Collapsible code block with syntax highlighting or diff view.
 */

import React, { useCallback, useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { StandaloneTheme } from '../../../types'

export interface TimelineCodeBlockProps {
  codeBlockId: string
  lang: string
  normalized: string
  isDiff: boolean
  openByDefault: boolean
  isOpen: boolean
  onToggle: () => void
  activeTheme: StandaloneTheme
}

export const TimelineCodeBlock = React.memo(function TimelineCodeBlock({
  codeBlockId,
  lang,
  normalized,
  isDiff,
  openByDefault,
  isOpen,
  onToggle,
  activeTheme,
}: TimelineCodeBlockProps) {
  const lineCount = normalized ? normalized.split('\n').length : 0
  const [copyLabel, setCopyLabel] = useState<'Copy' | 'Copied!'>('Copy')

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    void navigator.clipboard.writeText(normalized).then(() => {
      setCopyLabel('Copied!')
      setTimeout(() => setCopyLabel('Copy'), 1500)
    })
  }, [normalized])
  const diffLines = normalized.split('\n')
  const shellStyle: React.CSSProperties = {
    borderColor: 'var(--theme-border-default)',
    backgroundColor: 'color-mix(in srgb, var(--theme-bg-surface) 86%, var(--theme-bg-base) 14%)',
    color: 'var(--theme-text-primary)',
  }
  const headerStyle: React.CSSProperties = {
    color: 'var(--theme-text-secondary)',
  }
  const diffBadgeStyle: React.CSSProperties = {
    borderColor: 'var(--theme-accent-strong)',
    backgroundColor: 'var(--theme-accent-tint)',
    color: 'var(--theme-accent-muted)',
  }
  const bodyStyle: React.CSSProperties = {
    borderColor: 'var(--theme-border-default)',
  }
  const diffSurfaceStyle: React.CSSProperties = {
    backgroundColor: 'color-mix(in srgb, var(--theme-bg-surface) 92%, var(--theme-bg-base) 8%)',
  }
  const diffCodeStyle: React.CSSProperties = {
    color: 'var(--theme-text-primary)',
  }
  const syntaxBackground = 'color-mix(in srgb, var(--theme-bg-surface) 92%, var(--theme-bg-base) 8%)'

  return (
    <div className="group my-2 rounded-lg border select-text" style={shellStyle}>
      <button
        type="button"
        data-chat-code-rollup="true"
        className="w-full text-left cursor-pointer px-3 py-2.5 text-[11px] font-medium flex items-center justify-between gap-2 bg-transparent border-0 outline-none hover:opacity-80"
        style={headerStyle}
        onClick={onToggle}
      >
        <span className="inline-flex items-center gap-1.5">
          <span>{lang} - {lineCount} lines</span>
          {isDiff && (
            <span className="rounded border px-1.5 py-0.5 text-[10px] leading-none" style={diffBadgeStyle}>
              DIFF
            </span>
          )}
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            role="button"
            tabIndex={-1}
            className="rounded px-1.5 py-0.5 text-[10px] leading-none hover:opacity-70 cursor-pointer"
            style={diffBadgeStyle}
            onClick={handleCopy}
          >
            {copyLabel}
          </span>
          <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        </span>
      </button>
      {isOpen && (
        <div className="rounded-b-lg overflow-hidden border-t" style={bodyStyle}>
          {isDiff ? (
            <div className="p-3 overflow-auto max-h-80 whitespace-pre select-text cursor-text" style={diffSurfaceStyle}>
              <code className="block text-[12px] leading-5 font-code select-text" style={diffCodeStyle}>
                {diffLines.map((line, idx) => (
                  <div
                    key={idx}
                    style={
                      line.startsWith('+')
                        ? { backgroundColor: 'color-mix(in srgb, var(--theme-accent-tint) 70%, transparent)', color: 'var(--theme-accent-muted)' }
                        : line.startsWith('-')
                          ? { backgroundColor: 'rgba(190, 24, 93, 0.14)', color: '#be123c' }
                          : undefined
                    }
                  >
                    {line}
                  </div>
                ))}
              </code>
            </div>
          ) : (
            <SyntaxHighlighter
              language={lang}
              style={activeTheme.codeSyntax === 'dark' ? oneDark : oneLight}
              customStyle={{
                margin: 0,
                padding: '0.75rem',
                maxHeight: '20rem',
                overflow: 'auto',
                fontSize: '12px',
                fontFamily: 'var(--app-font-code)',
                background: syntaxBackground,
                userSelect: 'text',
                WebkitUserSelect: 'text',
                cursor: 'text',
              }}
              showLineNumbers={true}
              wrapLines={false}
            >
              {normalized}
            </SyntaxHighlighter>
          )}
        </div>
      )}
    </div>
  )
})
