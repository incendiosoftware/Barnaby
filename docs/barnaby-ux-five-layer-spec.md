# Barnaby UX Five-Layer Spec

Date: 2026-02-21
Status: Draft (implementation-ready)
Owner: Barnaby app (renderer + main)

## 1. Purpose

Define a concrete Barnaby architecture for:

1. `context`
2. `rules`
3. `guidance`
4. `tooling`
5. `ui policy`

Goal: improve user experience by keeping chat clean by default while preserving full traceability for technical users.

## 2. Product Goals

1. New assistant replies and progress updates append clearly, without mid-thread jumps.
2. Default chat view prioritizes user-assistant conversation over tooling noise.
3. Project/run instructions are predictable and consistently applied.
4. Context passed to models is relevant, bounded, and auditable.
5. Users can opt into deeper diagnostics without forcing it on every turn.

## 3. Scope and Non-Goals

In scope:

1. Turn-time context assembly and truncation.
2. Instruction precedence and merge rules.
3. Assistant response style policy (concise/standard/detailed).
4. Tool event schema and visibility policy.
5. Chat/timeline rendering policy for diagnostics and activity.

Out of scope for this first spec:

1. Long-term semantic memory store across repositories.
2. Cloud sync of policy settings.
3. Replacing provider SDK/client implementations.

## 4. Layer 1: Context

## 4.1 Objective

Build a deterministic, bounded context bundle per turn so the model sees what matters and not raw noise.

## 4.2 Context Sources

1. Conversation state from current panel (`messages`, active streaming state).
2. Workspace state (cwd, git branch/status summary when available).
3. User-selected context (attachments/images/files when provided).
4. Retrieved code snippets (from explicit file references first, then local retrieval).
5. Current run settings (`provider`, `model`, permissions, response style).

## 4.3 Context Budget (Defaults)

1. Conversation window: last 24 user/assistant messages (already aligned with current behavior).
2. Retrieved snippets: max 12 snippets, each max 160 lines.
3. Total context payload target before send: 18k tokens soft cap.
4. If over cap, drop in this order:
   - oldest retrieved snippets
   - oldest assistant messages
   - oldest user messages (never drop latest user message)

## 4.4 Context Contract

```ts
type TurnContextBundle = {
  panelId: string
  provider: 'codex' | 'claude' | 'gemini'
  model: string
  requestText: string
  responseStyle: 'concise' | 'standard' | 'detailed'
  conversation: Array<{ role: 'user' | 'assistant'; content: string; createdAt?: number }>
  retrievedSnippets: Array<{
    path: string
    startLine: number
    endLine: number
    reason: 'explicit-reference' | 'search-match' | 'open-file'
    content: string
  }>
  attachments: Array<{ id: string; label: string; path: string; mimeType?: string }>
  workspace: {
    cwd: string
    branch?: string
    gitDirty?: boolean
  }
}
```

## 4.5 Implementation Notes

1. Keep canonical message storage unchanged.
2. Add a pure `buildTurnContextBundle(...)` utility in renderer before `api.sendMessage`.
3. Include a small debug summary (counts + dropped items) for diagnostics panel only.

Acceptance criteria:

1. Same input state always produces same context bundle.
2. Context size never exceeds hard cap.
3. Bundle summary visible in diagnostics, hidden in default chat.

## 5. Layer 2: Rules

## 5.1 Objective

Make instruction precedence explicit and conflict-resistant.

## 5.2 Rule Precedence

Higher item wins on conflict:

1. Runtime safety policy (non-overridable)
2. Repository runbook (`AGENTS.md`)
3. Workspace rules (`.cursor/rules/*.mdc`, later `.barnaby/rules/*`)
4. User preferences (app settings)
5. Per-turn user request text

## 5.3 Rule Engine Behavior

1. Parse rules into normalized clauses:
   - `must`
   - `must_not`
   - `default`
2. Resolve conflicts by precedence and keep a conflict trace.
3. Emit `ResolvedRuleSet` attached to turn diagnostics.

```ts
type ResolvedRuleSet = {
  must: string[]
  mustNot: string[]
  defaults: string[]
  conflicts: Array<{ clause: string; winner: string; loser: string }>
}
```

## 5.4 First Implementation Slice

1. Preserve current behavior, but add a visible "active rules" debug card in diagnostics.
2. Record top 10 resolved clauses for each turn.
3. Add a future-safe loader for `.barnaby/rules/*.md` (optional files, no failure if absent).

Acceptance criteria:

1. User can see why a behavior happened by opening diagnostics.
2. Repo runbook instructions are consistently applied across providers.

## 6. Layer 3: Guidance

## 6.1 Objective

Control assistant tone/output density without leaking internal orchestration details by default.

## 6.2 Guidance Profiles

Map directly to existing response style setting:

1. `concise`: short answer first, minimal debug/progress text.
2. `standard`: balanced explanation + key implementation detail.
3. `detailed`: full explanation + explicit trade-offs and verification notes.

## 6.3 Guidance Policy

1. User-visible replies should avoid raw internal event labels unless asked.
2. File path callouts are included only when:
   - user asks for code-level detail, or
   - assistant changed files and must report where.
3. Progress updates should be plain language, not event IDs.

## 6.4 Guidance Contract

```ts
type GuidancePolicy = {
  style: 'concise' | 'standard' | 'detailed'
  includeFileRefsByDefault: boolean
  includeToolEventNamesByDefault: boolean
  requireVerificationStatementOnCodeChanges: boolean
}
```

Default:

1. `includeFileRefsByDefault = false`
2. `includeToolEventNamesByDefault = false`
3. `requireVerificationStatementOnCodeChanges = true`

Acceptance criteria:

1. Non-technical users see cleaner replies by default.
2. Technical users can still request path-level precision on demand.

## 7. Layer 4: Tooling

## 7.1 Objective

Standardize tool events and classify visibility separately from execution.

## 7.2 Tool Event Envelope

```ts
type ToolEvent = {
  id: string
  panelId: string
  at: number
  source: 'renderer' | 'main' | 'provider'
  tool: string
  phase: 'start' | 'progress' | 'end' | 'error'
  summary: string
  detail?: string
  severity: 'info' | 'warn' | 'error'
  userVisibility: 'hidden' | 'collapsed' | 'inline'
}
```

## 7.3 Default Visibility Policy

1. `error` events: `inline`
2. High-value progress (build complete, tests failed, reconnect): `inline`
3. Low-level transport chatter (`assistantDelta`, raw provider notifications): `collapsed`
4. Noisy repetitive events: coalesce and keep `collapsed`

## 7.4 Coalescing Rules

1. Merge events with same `tool + summary + severity` within 8 seconds.
2. Keep latest timestamp and increment count.
3. Preserve first/last detail snippets for audit.

Acceptance criteria:

1. Default chat is readable during long-running operations.
2. Full event chain still available in diagnostics/history view.

## 8. Layer 5: UI Policy

## 8.1 Objective

Present conversation first, diagnostics second, while keeping deterministic timeline behavior.

## 8.2 Chat Surface Defaults

1. Primary transcript shows:
   - user messages
   - assistant messages
   - only high-value inline activity
2. Secondary diagnostics panel shows full event feed.
3. Timeline ordering is strict by event/message `createdAt` (append-by-arrival).

## 8.3 Disclosure Behavior

1. Latest active progress card open by default.
2. Completed low-value activity cards collapsed.
3. User toggles persist per panel for the session.

## 8.4 Settings Surface

Add/extend settings under Diagnostics:

1. `Show inline activity in chat` (on/off)
2. `Show low-level provider events` (off default)
3. `Always include file paths in assistant replies` (off default)
4. Existing per-type diagnostics colors remain available

## 8.5 Rendering Policy Contract

```ts
type UiPolicy = {
  showInlineActivity: boolean
  showLowLevelEvents: boolean
  showFileRefsByDefault: boolean
  autoCollapseCompletedActivity: boolean
}
```

Default:

1. `showInlineActivity = true`
2. `showLowLevelEvents = false`
3. `showFileRefsByDefault = false`
4. `autoCollapseCompletedActivity = true`

Acceptance criteria:

1. Users no longer see routine `src/...` style trace lines unless enabled or requested.
2. New assistant replies always appear at bottom in arrival order.

## 9. Rollout Plan

## Phase 1 (Low Risk, Immediate UX Gain)

1. Add visibility flags and hide low-level events from primary transcript.
2. Keep full diagnostics in settings panel.
3. Add "active rules" and "context bundle summary" debug cards.

## Phase 2 (Context and Rule Determinism)

1. Introduce `buildTurnContextBundle`.
2. Introduce normalized rule resolver + conflict trace.
3. Add tests for truncation and precedence.

## Phase 3 (Advanced UX Controls)

1. Add per-panel UI policy persistence.
2. Add richer event categories and filters.
3. Add telemetry counters for noise vs signal.

## 10. Test Plan

1. Unit tests:
   - context truncation order
   - rule precedence conflict resolution
   - tooling event coalescing
2. Integration tests:
   - long streaming turn does not flood transcript
   - diagnostic panel still exposes complete chain
   - toggles affect visibility without data loss
3. Manual UX checks:
   - first-time user can read transcript without internal jargon
   - technical user can open diagnostics and trace execution

## 11. Mapping to Current Code

Likely touchpoints:

1. `src/App.tsx` (settings, transcript filtering, diagnostics cards)
2. `src/chat/timelineParser.ts` (visibility + collapse policy)
3. `src/chat/timelineTypes.ts` (extended event/unit metadata)
4. `electron/preload/index.ts` (optional diagnostics payload exposure)
5. `electron/main/index.ts` (rule/context debug metadata plumbing)

## 12. Decision Record

1. Barnaby should remain transparent, but transparency defaults to collapsible diagnostics, not transcript noise.
2. Rules and context must be deterministic and inspectable.
3. UX policy and tooling policy are separate concerns: execution can stay rich while display stays clean.
