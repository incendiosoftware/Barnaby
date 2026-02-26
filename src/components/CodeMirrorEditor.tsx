import React, { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { markdown } from '@codemirror/lang-markdown'
import { xml } from '@codemirror/lang-xml'
import { yaml } from '@codemirror/lang-yaml'
import { rust } from '@codemirror/lang-rust'
import { cpp } from '@codemirror/lang-cpp'
import { sql } from '@codemirror/lang-sql'
import { java } from '@codemirror/lang-java'
import type { LanguageSupport } from '@codemirror/language'

function getLanguageSupport(filename: string): LanguageSupport | null {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, () => LanguageSupport> = {
    ts: () => javascript({ typescript: true }),
    tsx: () => javascript({ typescript: true, jsx: true }),
    js: () => javascript(),
    jsx: () => javascript({ jsx: true }),
    json: () => json(),
    css: () => css(),
    html: () => html(),
    md: () => markdown(),
    py: () => python(),
    yml: () => yaml(),
    yaml: () => yaml(),
    rs: () => rust(),
    go: () => javascript(), // fallback
    java: () => java(),
    c: () => cpp(),
    cpp: () => cpp(),
    xml: () => xml(),
    sql: () => sql(),
  }
  const fn = map[ext]
  return fn ? fn() : null
}

export type CodeMirrorEditorProps = {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  filename: string
  wordWrap?: boolean
  fontScale?: number
  darkMode?: boolean
  onSave?: () => void
  onSaveAs?: () => void
  onFocus?: () => void
  className?: string
  'data-testid'?: string
}

export function CodeMirrorEditor({
  value,
  onChange,
  readOnly = false,
  filename,
  wordWrap = false,
  fontScale = 1,
  darkMode = false,
  onSave,
  onSaveAs,
  onFocus,
  className = '',
  'data-testid': dataTestId,
}: CodeMirrorEditorProps) {
  const langSupport = useMemo(() => getLanguageSupport(filename), [filename])

  const extensions = useMemo(() => {
    const exts: import('@codemirror/state').Extension[] = [
      EditorView.theme({
        '&': {
          fontSize: `${12 * fontScale}px`,
          height: '100%',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        },
        '& .cm-scroller': {
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
        },
        '& .cm-content': {
          fontFamily: 'var(--app-font-editor, Consolas, "Courier New", monospace)',
          padding: '1rem',
        },
        '& .cm-gutters': {
          backgroundColor: 'transparent',
          border: 'none',
        },
        '&.cm-focused': { outline: 'none' },
      }),
    ]
    if (readOnly) {
      exts.push(EditorState.readOnly.of(true), EditorView.editable.of(false))
    }
    if (wordWrap) exts.push(EditorView.lineWrapping)
    if (langSupport) exts.push(langSupport)
    return exts
  }, [readOnly, wordWrap, fontScale, langSupport])

  const basicSetup = useMemo(
    () => ({
      lineNumbers: true,
      foldGutter: false,
      highlightActiveLineGutter: !readOnly,
      highlightActiveLine: !readOnly,
      bracketMatching: true,
      indentOnInput: !readOnly,
      autocompletion: false,
      searchKeymap: false,
    }),
    [readOnly],
  )

  const theme = useMemo(
    () =>
      EditorView.theme({
        '&': {
          backgroundColor: darkMode ? 'rgb(10 10 10)' : 'rgb(255 255 255)',
        },
        '& .cm-content': {
          caretColor: darkMode ? 'rgb(248 250 252)' : 'rgb(23 23 23)',
        },
        '& .cm-gutters': {
          color: darkMode ? 'rgb(163 163 163)' : 'rgb(115 115 115)',
        },
      }),
    [darkMode],
  )

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      basicSetup={basicSetup}
      extensions={[theme, ...extensions]}
      onFocus={onFocus}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault()
          if (e.shiftKey) onSaveAs?.()
          else onSave?.()
        }
      }}
      className={`flex-1 min-h-0 ${className}`.trim()}
      data-testid={dataTestId}
      height="100%"
    />
  )
}
