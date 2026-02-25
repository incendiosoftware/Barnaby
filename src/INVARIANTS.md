# App.tsx Behavioral Invariants

These invariants must be preserved during modularization.
Any extraction that could violate these requires explicit verification.

## 1. Message send/resend ordering

- `sendMessage` must complete panel state update (add user message, clear input)
  **before** calling `sendToAgent`.
- `sendToAgent` must not be called concurrently for the same panel.
  A second send while `streaming === true` must queue via `pendingInputs`.
- `kickQueuedMessage` fires only after `streaming` goes false (turn complete).
- Queue order is FIFO: `pendingInputs[0]` is always the next to send.

## 2. Stream chunk ordering

- `queueDelta` / `flushWindowDelta` must apply deltas in arrival order.
- Flush timer ensures partial deltas are applied even if no further chunks arrive.
- Delta buffers are keyed by panel ID; cross-panel contamination must never occur.

## 3. Reconnect idempotency

- `reconnectPanel` must not fire if a connection attempt is already in-flight
  for the same panel (`reconnectingRef` guards this).
- A successful `connectWindow` must clear the reconnecting flag.
- A failed `connectWindow` must clear the reconnecting flag and set panel status.
- `connectWindowWithRetry` retry loop must respect the cancelled flag
  if the panel is closed during retry.

## 4. Hydration precedence

- `appStateHydratedRef` must be set to `true` before any persistence effects
  write back to localStorage. Otherwise hydration data is overwritten with defaults.
- The large hydration effect (`api.loadAppState`) must run exactly once on mount.
- Workspace bootstrap must complete before panels attempt to connect.
  `workspaceBootstrapComplete` gates this.

## 5. Panel lifecycle boundaries

- `closePanel` must: (a) archive to history, (b) disconnect via `api.closeWindow`,
  (c) clean up refs (delta buffers, flush timers, activity, debug),
  (d) remove from `panels` state.
- This order matters: archiving before disconnect preserves conversation state.
- If the last panel is closed, a new default panel must be created.

## 6. Workspace switching atomicity

- `requestWorkspaceSwitch` must snapshot the current workspace UI state
  before applying the new workspace root.
- `applyWorkspaceRoot` must (a) save current snapshot, (b) set new root,
  (c) restore target snapshot or create fresh state, (d) trigger bootstrap.
- Persistence effects must not fire between snapshot-save and root-change
  (they would persist the stale root's data under the new key).

## 7. Effect ordering constraints

- Ref-sync effects (`panelsRef.current = panels`, etc.) must execute before
  any effect that reads those refs in the same render cycle.
- localStorage persistence effects must execute after hydration is complete
  (`appStateHydratedRef.current === true` guard).
- The autosave timer effect must not race with manual persistence calls.

## 8. Provider auth/connectivity

- `refreshProviderAuthStatus` must not run concurrently for the same provider
  (`providerAuthLoadingByName` guards this).
- API key save must persist to backend before refreshing auth status.
- Provider ping results must be keyed by `provider::modelId` to avoid
  cross-provider result contamination.

## 9. Chat history consistency

- `upsertPanelToHistory` must be called before `closePanel` removes panel state.
- `mergeChatHistoryEntries` deduplicates by ID; IDs must be globally unique.
- Chat history persistence via `api.saveChatHistory` is fire-and-forget
  but must not block the UI thread.

## 10. Context/token estimation

- `estimatePanelContextUsage` is a pure derivation from panel messages + model.
- It must never mutate panel state.
- It must be called with current (not stale) message arrays.
