/**
 * Empty state placeholder when chat timeline has no messages.
 */

import React from 'react'

export function ChatEmptyState() {
  return (
    <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-dashed border-neutral-300 bg-white/90 px-5 py-5 text-sm shadow-sm dark:border-neutral-700 dark:bg-neutral-900/70">
      <div className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
        Start a new agent turn
      </div>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        Ask for a plan, implementation, review, or debugging help in this workspace.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-full border border-neutral-300 bg-neutral-50 px-2 py-0.5 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          Enter to send
        </span>
        <span className="rounded-full border border-neutral-300 bg-neutral-50 px-2 py-0.5 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          Shift+Enter for new line
        </span>
        <span className="rounded-full border border-neutral-300 bg-neutral-50 px-2 py-0.5 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          Ctrl+Mousewheel to zoom text
        </span>
      </div>
    </div>
  )
}
