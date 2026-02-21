# Continue Conversation Context – Build Plan

Enable restored/loaded chat panels to send prior message context so the agent can continue the conversation instead of treating it as brand new.

---

## Summary of Changes

| Layer | What to add |
|-------|-------------|
| **GeminiClient** | `initialHistory` in connect options; seed `this.history` |
| **ClaudeClient** | Same |
| **Codex** | `priorMessagesForContext` in first send; prepend blob to text |
| **ConnectOptions** | `initialHistory?: Array<{ role; text }>` |
| **sendMessageEx payload** | `priorMessagesForContext?: Array<{ role; content }>` |
| **Renderer** | Pass context when `!connected && messages.length > 0` |
| **Reconnect** | Same context logic when reconnecting |

---

## 1. Types & Constants

### 1.1 History format (shared)

```ts
type HistoryEntry = { role: 'user' | 'assistant'; text: string }
```

### 1.2 Truncation limits

- `INITIAL_HISTORY_MAX_EXCHANGES = 12` (pairs of user+assistant)
- `INITIAL_HISTORY_MAX_MESSAGES = 24` (12 exchanges × 2)

---

## 2. GeminiClient (`electron/main/geminiClient.ts`)

- Add `initialHistory?: HistoryEntry[]` to `GeminiConnectOptions`
- In `connect()`, after `this.history = []`, set:
  ```ts
  if (options.initialHistory?.length) {
    this.history = options.initialHistory.slice(-INITIAL_HISTORY_MAX_MESSAGES)
  }
  ```

---

## 3. ClaudeClient (`electron/main/claudeClient.ts`)

- Add `initialHistory?: HistoryEntry[]` to `ClaudeConnectOptions`
- Same logic as Gemini in `connect()`

---

## 4. Codex (main process + sendMessageEx)

- No changes to `CodexAppServerClient.connect`
- In `sendMessageEx` handler: when payload includes `priorMessagesForContext`:
  - Format as blob: `"Previous conversation:\n\n" + messages.map(m => `${m.role}: ${m.content}`).join('\n\n') + "\n\nUser continues: "`
  - Prepend to `text` for that send only
  - Call `sendUserMessage(effectiveText)` (or `sendUserMessageWithImages` if images present)
- Codex client stays unchanged; main process does the string prepending

---

## 5. ConnectOptions & IPC

### 5.1 Extend ConnectOptions

In `electron/main/index.ts` (or CodexConnectOptions / shared type):

```ts
initialHistory?: Array<{ role: 'user' | 'assistant'; text: string }>
```

### 5.2 getOrCreateClient

Pass `initialHistory` through to `GeminiClient.connect` and `ClaudeClient.connect`.

### 5.3 agentorchestrator:connect

The options object already flows through; add `initialHistory` to the type and it will be passed.

---

## 6. sendMessageEx payload

Extend payload:

```ts
{
  text: string
  imagePaths?: string[]
  priorMessagesForContext?: Array<{ role: string; content: string }>  // for Codex first-send
}
```

When `priorMessagesForContext` is present, main process formats and prepends before calling the client.

---

## 7. Preload & Renderer API

### 7.1 api.connect

Options already accept arbitrary fields; `initialHistory` can be passed as-is once the type is updated.

### 7.2 api.sendMessage

Change signature to:

```ts
sendMessage(agentWindowId: string, text: string, imagePaths?: string[], priorMessagesForContext?: Array<{ role: string; content: string }>)
```

Or use an options object to avoid a long param list (optional).

---

## 8. Renderer (`src/App.tsx`)

### 8.1 Helper

```ts
function panelMessagesToInitialHistory(messages: ChatMessage[], maxMessages = 24): HistoryEntry[] {
  const trimmed = messages.slice(-maxMessages)
  return trimmed
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, text: (m.content ?? '').trim() }))
    .filter((m) => m.text.length > 0)
}
```

### 8.2 connectWindow

Add `initialHistory?: HistoryEntry[]` param. Pass to `api.connect` when present.

### 8.3 connectWindowWithRetry

Add `initialHistory` param and forward to `connectWindow`.

### 8.4 sendToAgent

- Compute `needContext = !w.connected && w.messages.length > 0`
- Compute `initialHistory = needContext ? panelMessagesToInitialHistory(w.messages) : undefined`
- When calling `connectWindowWithRetry`, pass `initialHistory`
- For Codex first-send: pass `priorMessagesForContext` when `needContext && provider === 'codex'`
- For Codex reconnect: need to pass context on first send after reconnect. Add ref `hasSentToThreadRef = useRef<Record<string, boolean>>({})`. Reset `hasSentToThreadRef.current[winId] = false` when connecting (in connectWindow success path or when we detect reconnect). Pass `priorMessagesForContext` when `!hasSentToThreadRef.current[winId] && w.messages.length > 0 && provider === 'codex'`, then set `hasSentToThreadRef.current[winId] = true` after send.

Simpler: pass `priorMessagesForContext` whenever `panel has messages` and `provider === 'codex'` and `!w.connected` at start of sendToAgent. That covers initial. For reconnect: at start of reconnect we set `connected: false`. So when we call connectWindow, then set connected true, then kickQueuedMessage – the kick will call sendToAgent. At that point `w` from `panels.find` might already have `connected: true` from the setPanels we did. So `needContext` would be false. We need to pass context on first send after reconnect for Codex. The simplest: **pass priorMessagesForContext whenever we have messages and provider is Codex and we just connected in this flow**. So: pass it when we called connect in this sendToAgent (i.e. `!w.connected` was true). That works for initial. For reconnect, we don't go through sendToAgent from the user – we go through kickQueuedMessage. At that moment connected is already true. So we need explicit tracking. Add `needsContextOnNextCodexSendRef` – set true when we connect (initial or reconnect) and panel has messages. Set false after we pass priorMessagesForContext in a send. Check this ref when building the sendMessage payload for Codex.

### 8.5 reconnectPanel

- When calling `connectWindow`, pass `initialHistory` when `w.messages.length > 0`
- Set `needsContextOnNextCodexSendRef.current[winId] = true` when we have messages and provider is codex (so the subsequent kick will include context)

---

## 9. Edge Cases

- **Empty messages**: Don't pass initialHistory or priorMessagesForContext if messages are empty
- **System messages**: Filter out `role === 'system'` when building history
- **Token limits**: Truncate to last 24 messages (12 exchanges) to stay within typical context windows
- **Images in history**: priorMessagesForContext uses `content` only; attachments in old messages are not re-sent (acceptable)

---

## 10. File Checklist

| File | Changes |
|------|---------|
| `electron/main/geminiClient.ts` | initialHistory in connect |
| `electron/main/claudeClient.ts` | initialHistory in connect |
| `electron/main/index.ts` | ConnectOptions, getOrCreateClient, sendMessageEx priorMessagesForContext handling |
| `electron/preload/index.ts` | sendMessage 4th param (if used) |
| `src/App.tsx` | panelMessagesToInitialHistory, connectWindow, connectWindowWithRetry, sendToAgent, reconnectPanel, needsContextOnNextCodexSendRef |
| `src/vite-env.d.ts` | Update api.sendMessage type if needed |

---

## 11. Testing

1. **Gemini/Claude**: Restore a panel with messages, send "continue from here" – agent should reference prior context
2. **Codex**: Same – first message should include transcript blob, agent responds in context
3. **Reconnect**: Kill Codex app-server mid-session, reconnect, send – should include context
4. **Active session**: Normal send without context (no regression)
5. **New panel**: No prior messages – no context sent (no regression)
