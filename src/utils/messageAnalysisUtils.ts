import type { ChatMessage } from '../types'
import { AUTO_CONTINUE_PROMPT, THINKING_MAX_CHARS } from '../constants'

export function looksIncomplete(content: string): boolean {
  const t = content.trim().toLowerCase()
  if (!t) return false
  const incompletePhrases = [
    "i'm about to",
    'about to edit',
    'about to implement',
    "i have a concrete",
    "i'll ",
    'let me ',
    'i will ',
    'implementing now',
    'implementing the',
    'now and edit',
  ]
  for (const p of incompletePhrases) {
    if (t.includes(p)) return true
  }
  if (t.endsWith('...')) return true
  return false
}

export function isLikelyThinkingUpdate(content: string): boolean {
  const text = content.trim()
  if (!text) return false
  if (text.length > THINKING_MAX_CHARS) return false
  if (text.includes('```')) return false
  if (/^#{1,6}\s/m.test(text)) return false
  const paragraphCount = (text.match(/\n\s*\n/g) || []).length + 1
  if (paragraphCount >= 2) return false
  const lower = text.toLowerCase().replace(/\s+/g, ' ')
  const markers = [
    "i'll ",
    'i will ',
    "i'm ",
    'i am ',
    'let me ',
    'next i',
    'now i',
    'working on',
    'checking',
    'verifying',
    'reviewing',
    'searching',
    'scanning',
    'applying',
    'updating',
    'editing',
    'running',
    'testing',
    'implementing',
    'i found ',
    'i located ',
    'i patched ',
    'i fixed ',
    'i am checking ',
    "i'm checking ",
  ]
  if (markers.some((m) => lower.includes(m))) return true
  if (
    /^i\s/.test(lower) &&
    /\b(checking|verifying|reviewing|scanning|searching|looking|working|patching|editing|updating|running|testing|implementing|applying|fixing|changing|replacing|adding|removing|wiring)\b/.test(lower)
  ) {
    return true
  }
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (
    lines.length >= 2 &&
    /\b(i|i'm|i am|i'll|i will)\b/.test(lower) &&
    /\b(next|then|now)\b/.test(lower)
  ) {
    return true
  }
  return false
}

export function stripSyntheticAutoContinueMessages(messages: ChatMessage[]): ChatMessage[] {
  const filtered = messages.filter((message) => {
    if (message.role !== 'user') return true
    if ((message.attachments?.length ?? 0) > 0) return true
    return message.content.trim() !== AUTO_CONTINUE_PROMPT
  })
  return filtered.length === messages.length ? messages : filtered
}

export function filterMessagesForPresentation(
  messages: ChatMessage[],
  responseStyle: 'concise' | 'standard' | 'detailed',
): ChatMessage[] {
  const visibleMessages = stripSyntheticAutoContinueMessages(messages)
  if (responseStyle === 'detailed') return visibleMessages
  if (responseStyle === 'concise') {
    return visibleMessages.filter((m) => !(m.role === 'assistant' && isLikelyThinkingUpdate(m.content)))
  }
  const next: ChatMessage[] = []
  for (let i = 0; i < visibleMessages.length; i += 1) {
    const current = visibleMessages[i]
    const isThinking = current.role === 'assistant' && isLikelyThinkingUpdate(current.content)
    if (!isThinking) {
      next.push(current)
      continue
    }
    let endOfThinkingRun = i
    while (
      endOfThinkingRun + 1 < visibleMessages.length &&
      visibleMessages[endOfThinkingRun + 1].role === 'assistant' &&
      isLikelyThinkingUpdate(visibleMessages[endOfThinkingRun + 1].content)
    ) {
      endOfThinkingRun += 1
    }
    let turnBoundary = endOfThinkingRun + 1
    while (turnBoundary < visibleMessages.length && visibleMessages[turnBoundary].role !== 'user') {
      turnBoundary += 1
    }
    const hasFinalAssistantInTurn = visibleMessages
      .slice(endOfThinkingRun + 1, turnBoundary)
      .some((m) => m.role === 'assistant' && !isLikelyThinkingUpdate(m.content))
    if (!hasFinalAssistantInTurn) {
      const latestThinking = visibleMessages[endOfThinkingRun]
      const prev = next[next.length - 1]
      const isDuplicate =
        prev &&
        prev.role === 'assistant' &&
        isLikelyThinkingUpdate(prev.content) &&
        prev.content.trim() === latestThinking.content.trim()
      if (!isDuplicate) {
        next.push(latestThinking)
      }
    }
    i = endOfThinkingRun
  }
  return next
}

export function looksLikeDiff(code: string): boolean {
  const lines = code.split('\n')
  let plusCount = 0
  let minusCount = 0
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) plusCount++
    else if (line.startsWith('-') && !line.startsWith('---')) minusCount++
  }
  return plusCount + minusCount >= 3 && plusCount > 0 && minusCount > 0
}
