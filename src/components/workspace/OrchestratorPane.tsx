/**
 * OrchestratorPane – renderer-side UI for the orchestrator plugin.
 *
 * This component renders inside the workspace dock when the orchestrator
 * tab is selected AND the orchestrator plugin is active. It communicates
 * with the main-process plugin via IPC (through the preload bridge).
 *
 * Phase 1: Simple chat-like interface for goal intake + interview.
 * Future phases will add task list, kanban, progress dashboard, etc.
 */

import React, { useState, useRef, useEffect } from 'react'

export interface OrchestratorPaneProps {
    pluginDisplayName: string
    pluginVersion: string
    licensed: boolean
    onOpenSettings: () => void
}

interface ChatMessage {
    id: string
    role: 'user' | 'orchestrator' | 'system'
    text: string
    timestamp: number
}

export function OrchestratorPane({ pluginDisplayName, pluginVersion, licensed, onOpenSettings }: OrchestratorPaneProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: 'welcome',
            role: 'orchestrator',
            text: "Welcome to the Barnaby Orchestrator. Type a goal to get started \u2014 I'll help you refine it into an actionable plan.",
            timestamp: Date.now(),
        },
    ])
    const [inputValue, setInputValue] = useState('')
    const messagesEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    function handleSend() {
        const trimmed = inputValue.trim()
        if (!trimmed) return
        setMessages((prev) => [
            ...prev,
            { id: `user-${Date.now()}`, role: 'user' as const, text: trimmed, timestamp: Date.now() },
        ])
        setInputValue('')
        // TODO: Phase 1c — send to orchestrator brain via IPC
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    return (
        <div className="h-full min-h-0 flex flex-col bg-neutral-50 dark:bg-neutral-900">
            {/* Header */}
            <div className="px-3 py-2.5 border-b border-neutral-200/80 dark:border-neutral-800 text-xs flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${licensed ? 'bg-green-500 dark:bg-green-600' : 'bg-amber-500 dark:bg-amber-600'}`} />
                    <span className="font-medium text-neutral-700 dark:text-neutral-300">
                        {pluginDisplayName} <span className="text-neutral-400 dark:text-neutral-500 font-normal">v{pluginVersion}</span>
                    </span>
                </div>
                <button
                    type="button"
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md border-0 bg-white hover:bg-neutral-50 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200"
                    title="Orchestrator settings"
                    aria-label="Orchestrator settings"
                    onClick={onOpenSettings}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                </button>
            </div>

            {/* License gate */}
            {!licensed ? (
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-6 py-8 text-center">
                    <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">License Required</div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed mb-4">
                        Enter your orchestrator license key in Settings to enable goal-driven multi-agent workflows.
                    </p>
                    <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
                        onClick={onOpenSettings}
                    >
                        Open Settings
                    </button>
                </div>
            ) : (
                <>
                    {/* Chat messages */}
                    <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`text-xs leading-relaxed rounded-lg px-3 py-2 max-w-[90%] ${msg.role === 'user'
                                    ? 'ml-auto bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 border border-blue-200/50 dark:border-blue-800/50'
                                    : msg.role === 'orchestrator'
                                        ? 'mr-auto bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border border-neutral-200/50 dark:border-neutral-700/50'
                                        : 'mx-auto text-center text-neutral-500 dark:text-neutral-400 italic'
                                    }`}
                            >
                                {msg.text}
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="shrink-0 px-3 py-2.5 border-t border-neutral-200/80 dark:border-neutral-800">
                        <div className="flex gap-2">
                            <textarea
                                className="flex-1 min-h-[36px] max-h-[120px] resize-none rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-800 placeholder:text-neutral-400 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="Describe your goal..."
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                rows={1}
                            />
                            <button
                                type="button"
                                className="shrink-0 h-9 px-3 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={handleSend}
                                disabled={!inputValue.trim()}
                            >
                                Send
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
