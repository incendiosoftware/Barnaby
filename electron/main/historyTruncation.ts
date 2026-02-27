/**
 * Conversation history truncation utility.
 *
 * Reduces token waste by trimming conversation history before it is
 * re-sent as context. Long assistant messages are summarised and the
 * number of retained messages is capped.
 */

export type HistoryMessage = {
    role: 'user' | 'assistant'
    text: string
}

export type TruncateOptions = {
    /** Maximum number of messages to keep (default: 6). */
    maxMessages?: number
    /** Truncate assistant messages longer than this (default: 2000 chars). */
    maxAssistantChars?: number
    /** Characters to keep from the start of a truncated message (default: 500). */
    headChars?: number
    /** Characters to keep from the end of a truncated message (default: 200). */
    tailChars?: number
}

const DEFAULT_MAX_MESSAGES = 6
const DEFAULT_MAX_ASSISTANT_CHARS = 2000
const DEFAULT_HEAD_CHARS = 500
const DEFAULT_TAIL_CHARS = 200

/**
 * Truncate conversation history to reduce token count.
 *
 * - Keeps only the last `maxMessages` messages
 * - User messages are kept intact (they contain the actual instructions)
 * - Long assistant messages are trimmed to head + tail with a truncation marker
 */
export function truncateHistory(
    history: HistoryMessage[],
    options?: TruncateOptions,
): HistoryMessage[] {
    const maxMessages = options?.maxMessages ?? DEFAULT_MAX_MESSAGES
    const maxAssistantChars = options?.maxAssistantChars ?? DEFAULT_MAX_ASSISTANT_CHARS
    const headChars = options?.headChars ?? DEFAULT_HEAD_CHARS
    const tailChars = options?.tailChars ?? DEFAULT_TAIL_CHARS

    // Take only the most recent messages
    const recent = history.length > maxMessages ? history.slice(-maxMessages) : [...history]

    return recent.map((msg) => {
        if (msg.role !== 'assistant' || msg.text.length <= maxAssistantChars) {
            return msg
        }
        // Truncate long assistant messages: keep head + tail with a marker
        const head = msg.text.slice(0, headChars)
        const tail = msg.text.slice(-tailChars)
        return {
            role: msg.role,
            text: `${head}\n\n[...truncated ${msg.text.length - headChars - tailChars} chars...]\n\n${tail}`,
        }
    })
}
