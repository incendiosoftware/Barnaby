/**
 * Collapsible code block with syntax highlighting or diff view.
 */

import React from 'react'
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
  const diffLines = normalized.split('\n')

  return (
    <div className="group my-2 rounded-lg border border-neutral-300/80 dark:border-neutral-700/80 bg-neutral-100/80 dark:bg-neutral-900/65">
      <button
        type="button"
        data-chat-code-rollup="true"
        className="w-full text-left cursor-pointer px-3 py-2.5 text-[11px] font-medium text-neutral-700 dark:text-neutral-200 flex items-center justify-between gap-2 bg-transparent border-0 outline-none hover:opacity-80"
        onClick={onToggle}
      >
        <span className="inline-flex items-center gap-1.5">
          <span>{lang} - {lineCount} lines</span>
          {isDiff && (
            <span className="rounded border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 text-[10px] leading-none text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
              DIFF
            </span>
          )}
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
      </button>
      {isOpen && (
        <div className="rounded-b-lg overflow-hidden border-t border-neutral-300/70 dark:border-neutral-700/80">
          {isDiff ? (
            <div className="p-3 overflow-auto max-h-80 whitespace-pre bg-white/80 dark:bg-neutral-950/80">
              <code className="block text-[12px] leading-5 font-code text-blue-950 dark:text-blue-100">
                {diffLines.map((line, idx) => (
                  <div
                    key={idx}
                    className={[
                      line.startsWith('+') ? 'bg-emerald-100/80 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200' : '',
                      line.startsWith('-') ? 'bg-rose-100/80 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200' : '',
                    ].join(' ')}
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
                background: activeTheme.codeSyntax === 'dark' ? 'rgba(10, 10, 10, 0.5)' : 'rgba(255, 255, 255, 0.5)',
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
