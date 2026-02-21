# Chat Window Retrospective Parser Spec

Date: 2026-02-20
Status: Design proposal
Owner: Barnaby renderer (`src/App.tsx`)

## 1. Problem Statement

The chat window currently renders raw accumulated messages and a separate activity footer. As conversations grow, readability drops because transient "thinking" and activity updates remain noisy and fragmented.

We need a retrospective parser layer that re-reads recent chat state and improves presentation after text is already accumulated.

Target capabilities:

1. Retrospective formatting improvements.
2. Collapsing old thinking and activity panels.
3. Keeping the latest activity panel open.
4. Combining adjacent activity panels when they occur sequentially.
5. Showing source code while it is being developed, then collapsing it when complete.

Scope for retrospective parsing is limited to a recent window (default: last 10 units).

## 2. Current Design (As Implemented)

## 2.1 Event and Message Flow

1. `CodexAppServerClient` parses JSON-RPC notifications from `codex app-server`.
2. It emits:
   - `assistantDelta`
   - `assistantCompleted`
   - `rawNotification`
   - `usageUpdated`
3. Main process forwards events to renderer using `agentorchestrator:event`.
4. Renderer appends streaming assistant markdown content via `deltaBuffers` and `flushWindowDelta()`.

Key references:
- `electron/main/codexAppServerClient.ts`
- `electron/main/index.ts`
- `src/App.tsx`

## 2.2 Chat Rendering

1. Chat history is stored as `ChatMessage[]` per panel.
2. Streaming assistant content is appended directly to the last assistant message.
3. "Thinking" collapse is heuristic-only per message using `isLikelyThinkingUpdate()`.
4. Code blocks are rendered with markdown and collapsed by line count threshold (`COLLAPSIBLE_CODE_MIN_LINES`).

## 2.3 Activity Rendering

1. Activity is tracked separately from chat in `panelActivityById`.
2. Activity feed keeps recent 10 entries with lightweight coalescing:
   - same label + same detail + within 4 seconds increments `count`.
3. Activity panel open state is manually toggled with `activityOpenByPanel[panelId]`.

## 2.4 Persistence

1. Persisted conversation history stores raw chat messages.
2. Activity open/close and retrospective presentation state are not persisted in a structured way.

## 2.5 Current Gaps Against Requested Behavior

1. No explicit retrospective parser pass over last N units.
2. Old thinking panels are not auto-collapsed by recency policy.
3. Activity panel auto-open policy for latest event does not exist.
4. Adjacent activity blocks are only merged if identical label/detail within 4s; broader semantic grouping is missing.
5. Code blocks collapse by static line-count default, not by lifecycle stage (developing vs complete).

## 3. UX Target Behavior

For each panel, the chat viewport should show an interpreted timeline, not only raw message stream.

Default behavior:

1. Parse only the most recent 10 timeline units (configurable).
2. Apply formatting normalization to those units.
3. Collapse older thinking/activity units automatically.
4. Keep only the latest activity unit expanded.
5. While assistant is actively developing code, show code section expanded.
6. On completion, auto-collapse completed code/activity units unless manually pinned open.

## 4. Design Options

## Option A: Derived Retrospective Timeline (Recommended)

Build a pure transform in renderer:

- Input: panel raw messages + panel activity recent entries + panel streaming state.
- Output: `TimelineUnit[]` for rendering.
- No mutation of persisted message history.

Pros:
- Lowest migration risk.
- Preserves source-of-truth chat logs.
- Easy to A/B and roll back.

Cons:
- Slight runtime compute overhead per render.
- Requires memoization discipline.

## Option B: Persist Normalized Timeline

Persist parser output and render directly from normalized form.

Pros:
- Fast rendering.
- Stable replay of exact UI structure.

Cons:
- Complex migration/versioning.
- Hard to recover from parser bugs.
- Increases persistence coupling.

## Option C: Mutate ChatMessage History In Place

Rewrite stored messages retrospectively.

Pros:
- Minimal extra data model.

Cons:
- Risks data loss and hard-to-debug history corruption.
- Poor auditability.
- Not suitable for future model/provider changes.

Recommendation: Option A.

## 5. Proposed Architecture (Option A)

## 5.1 New Concepts

Introduce renderer-only timeline units:

```ts
type TimelineUnitKind = 'user' | 'assistant' | 'thinking' | 'activity' | 'code' | 'system'

type TimelineUnit = {
  id: string
  panelId: string
  sourceMessageIds: string[]
  kind: TimelineUnitKind
  title?: string
  body: string
  markdown: boolean
  createdAt: number
  updatedAt: number
  status: 'in_progress' | 'completed'
  collapsible: boolean
  defaultOpen: boolean
}
```

Key policy state:

- `RETROSPECTIVE_WINDOW = 10`
- `AUTO_COLLAPSE_OLDER_THAN_INDEX = 0` for activity/thinking (only latest stays open)
- `manualOpenOverridesByUnitId: Record<string, boolean>`
- `manualPinByUnitId: Record<string, boolean>`

## 5.2 Parser Pipeline

1. Gather panel inputs:
   - recent chat messages for panel
   - recent activity entries
   - panel `streaming` flag
2. Convert raw records to seed units.
3. Run retrospective normalization pass over trailing window (last 10 units):
   - normalize spacing, trim repeated scaffolding phrases
   - convert obvious pseudo-bullets to markdown bullets where safe
   - keep original text body preserved (no semantic rewrite)
4. Merge adjacent activity units when:
   - same `kind`
   - within merge window (suggested 8 seconds)
   - no user message between them
5. Split/annotate code blocks:
   - detect fenced blocks in assistant markdown
   - when `streaming`, mark latest code unit `in_progress` and open
   - on `assistantCompleted`, mark `completed`, default collapse
6. Compute default open/closed state:
   - latest activity unit: open
   - older activity units: closed
   - latest in-progress code unit: open
   - completed code units in retrospective window: closed unless pinned
   - older thinking units: closed
7. Apply manual overrides (user toggles win over defaults).

## 5.3 Rendering Model

Replace direct message map rendering with timeline unit rendering adapter:

1. `buildTimelineForPanel(panelId, panelState, activityState) -> TimelineUnit[]`
2. `renderTimelineUnit(unit)` with shared disclosure component.
3. Keep existing markdown and code renderer internals where possible.

## 5.4 Data Safety

- Raw `ChatMessage[]` remains canonical and persisted unchanged.
- Timeline units are ephemeral view models.
- Parser must be deterministic for same input state.

## 6. Cursor / Antigravity Comparison

This is behavior-based parity guidance, not strict clone requirements.

## Cursor-style patterns

1. Sequential tool/activity updates are grouped into compact progress sections.
2. Latest active section is expanded; completed sections collapse.
3. Code and diffs are visible during generation, then tucked away unless expanded.

## Antigravity-style patterns

1. Event stream is treated as structured timeline cards, not plain transcript rows.
2. Intermediate "agent thinking/progress" is deemphasized after completion.
3. Activity readability improves by aggregation and status labeling.

## Barnaby target delta

1. Keep Barnaby's current lightweight markdown chat.
2. Add parser-driven timeline behavior to close the readability gap.
3. Avoid over-heavy trace UIs that hide primary conversation content.

## 7. Implementation Plan

## Phase 1: Extract Parser and Timeline Types

Files:
- `src/App.tsx` (integration points)
- `src/chat/timelineParser.ts` (new)
- `src/chat/timelineTypes.ts` (new)

Steps:
1. Define timeline types and parser inputs.
2. Move heuristics (`isLikelyThinkingUpdate`, activity grouping rules) into parser module.
3. Add pure unit tests for parser behavior.

## Phase 2: Integrate Retrospective Window and Disclosure Policy

Steps:
1. Add `RETROSPECTIVE_WINDOW` config (default 10).
2. Build per-panel timeline via `useMemo`.
3. Replace message-loop rendering with timeline-loop rendering.
4. Implement "latest activity open" policy and auto-collapse old thinking/activity.

## Phase 3: Code Lifecycle Handling

Steps:
1. Track code unit status (`in_progress` vs `completed`) from streaming/completion events.
2. Keep live code open during streaming.
3. Collapse code unit on completion unless manually pinned open.

## Phase 4: QA Hardening

Steps:
1. Add visual regression/e2e checks for collapse/open behavior.
2. Validate with long running sessions and queued turns.
3. Verify no regression in persisted chat history format.

## 8. Acceptance Criteria

1. For each panel, only the most recent activity unit is auto-open by default.
2. Older thinking/activity units auto-collapse within the retrospective window.
3. Adjacent activity units merge into one unit when no user interruption exists.
4. Live code remains open while streaming and auto-collapses after completion.
5. Parser does not alter persisted raw chat messages.
6. Manual toggle overrides persist for current session.

## 9. Risks and Mitigations

1. Risk: Over-aggressive merging hides detail.
   Mitigation: conservative merge keys + expandable details summary.
2. Risk: Parser recomputation causes UI jank on large transcripts.
   Mitigation: memoize by panel message/activity version and limit to trailing window.
3. Risk: Heuristics misclassify assistant final answers as "thinking."
   Mitigation: improve detection with markdown/code/heading guards and allow manual override.

## 10. Open Decisions

1. Counting unit for "last 10":
   - Option A: 10 timeline units (recommended)
   - Option B: 10 assistant turns
   - Option C: 10 paragraphs
2. Manual pin persistence:
   - Session-only (recommended first)
   - Persist in app state
3. Merge window duration:
   - 8 seconds (recommended start)
   - configurable via app settings later

