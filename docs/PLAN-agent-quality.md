# Agent Quality Improvement Plan

## The Problem

Barnaby sends almost no guidance to the AI model. Compared to Cursor (which sends detailed system prompts, structured tool definitions, rich workspace context, and coding rules), Barnaby's Claude client sends:

```
You are a coding assistant running inside Barnaby. I have provided the workspace 
structure below. I will provide file contents when you ask or when I reference them.
```

The result: the same model produces dramatically worse output through Barnaby than through Cursor.

## Architecture Overview

### Current Flow

```
User message
  -> Prepend mode prefix (frontend, App.tsx)
  -> Resolve @file references (frontend, App.tsx)
  -> Send to client via IPC (sendMessageEx)
  -> Client sends with minimal system prompt
  -> AI Model responds (no tools for most clients)
```

### Target Flow

```
User message
  -> Resolve @file references (frontend, App.tsx)
  -> Pass interactionMode to backend (no more frontend prefix)
  -> Context Builder enriches message (git status, workspace metadata)
  -> Client builds rich system prompt (with mode, rules, workspace context)
  -> Client sends with tool definitions
  -> AI Model responds
  -> Tool execution loop (read/write/search/shell)
  -> AI Model continues until task complete
```

---

## Phase 1: Rich System Prompts ✅ IMPLEMENTED

**Goal:** Replace the minimal system prompts across all clients with comprehensive, Cursor-quality instructions.

### What was done

- Created `electron/main/systemPrompt.ts` with shared `buildSystemPrompt()` function
- Identity/role, behavioral rules, code quality rules, tool usage guidance, mode-specific instructions
- Integrated into all clients: Claude, OpenAI, OpenRouter, Gemini
- Frontend `interactionMode` passed through to backend
- Git status included in system prompt for all clients

---

## Phase 2: Tool Definitions for Claude and OpenRouter Clients ✅ IMPLEMENTED

**Goal:** Give the Claude CLI client and OpenRouter client the same tool capabilities that the OpenAI client already has.

### What was done

- Created `electron/main/agentTools.ts` — shared `AgentToolRunner` class with 5 tools (list_workspace_tree, search_workspace, read_workspace_file, write_workspace_file, run_shell_command)
- Refactored `OpenAIClient` to use shared `AgentToolRunner`, removing ~400 lines of duplicated code
- Upgraded `OpenRouterClient` from simple chat to full agent with tool execution loop (up to 8 rounds)
- Claude CLI already has native tools; upgraded `--permission-mode` to `bypassPermissions` for full autonomy
- Fixed `gitStatus` propagation bug across all clients (was fetched but dropped before reaching `buildSystemPrompt`)
- Fixed same bug in `CodexAppServerClient` (prepends git status to message text)

---

## Phase 5: Streaming & Inline Tool Activity ✅ IMPLEMENTED

**Goal:** Real-time streaming and visible tool activity for all providers.

### What was done

**Streaming:**
- OpenAI: switched `stream: false` to `stream: true` with SSE parsing (`consumeSSEStream`)
- OpenRouter: same SSE streaming implementation
- Claude CLI: switched to `--output-format stream-json --include-partial-messages --verbose` for true progressive streaming; rewrote JSON stream parser to handle Claude CLI format (`assistant`/`system`/`result` events vs Anthropic API SSE format)
- Gemini: was already streaming via CLI

**Session persistence (Claude):**
- Captures `session_id` from Claude CLI stream-json `system` init event
- Subsequent messages use `--resume <session_id>` to skip CLI startup overhead (model init, MCP server setup, tool discovery, permission negotiation)
- First message has full startup cost; second+ messages should be dramatically faster

**Inline tool activity UI:**
- Backend: all 5 clients now emit `thinking` events with format `Tool: detail` (e.g. `Read: src/App.tsx`)
- Frontend: thinking events accumulate as `🔄`-prefixed system messages (no longer replaced/stripped)
- Timeline parser: `🔄` system messages classified as `thinking` kind, rendered as compact single-line items
- Consecutive thinking items batched; >5 items auto-collapse into "N tool steps" toggle
- Bare tool names without details are filtered; consecutive duplicates deduplicated
- Removed old `isLikelyThinkingUpdate` heuristic that was mis-classifying assistant text as thinking

**UI polish:**
- Split panel button: replaced `+` icon with proper splitter icon (vertical bar with outward arrows)
- Tool steps toggle: uses React button (not native `<details>`) for reliable click handling
- Theme-compliant styling for tool step counter
- Auto-detection of diff-like content in any code block (not just `\`\`\`diff`) for red/green highlighting

---

## Phase 3: Automatic Context Enrichment ✅ IMPLEMENTED

**Goal:** Automatically attach relevant workspace context to every message, so the model doesn't start blind.

### What was done

1. **contextBuilder.ts** — `detectWorkspaceProfile()`, `formatWorkspaceProfile()`, `buildWorkspaceContextSummary()`:
   - Detects Node/TS, Python, Rust, Go, Java, .NET
   - Frameworks (React, Vue, Next, Express, etc.), package manager, test framework, build tool
   - Monorepo detection (pnpm/yarn/npm workspaces, Lerna, Nx, Cargo)

2. **Integration** — `buildDynamicContext()` in `systemPrompt.ts` calls `buildWorkspaceContextSummary(cwd)` and injects "Detected project profile" into the dynamic context. All clients (Claude, OpenAI, OpenRouter, Gemini) receive it via the shared system prompt. Git status is attached separately per client.

### Estimated impact

Medium. Reduces "cold start" problem where the model doesn't know what language, framework, or state the project is in.

---

## Phase 4: Structured Conversation History ✅ IMPLEMENTED

**Goal:** Replace text-transcript history formatting with proper API-structured messages.

### What was done

1. **ClaudeClient** (`electron/main/claudeClient.ts`)
   - Session resume handles multi-turn context natively — no need to send history on subsequent messages ✅
   - First message uses `truncateHistory()` from `historyTruncation.ts` (max 6 messages, assistant messages trimmed at 2000 chars) ✅

2. **CodexAppServerClient** (`electron/main/index.ts`)
   - `formatPriorMessagesForContext()` now uses `truncateHistoryWithMeta()`:
     - Sends only the last 4 messages (was 24)
     - Long assistant messages truncated (head + tail, default 2000 char limit)
     - Adds "N earlier messages omitted" when messages are dropped

3. **GeminiClient** (`electron/main/geminiClient.ts`)
   - Already uses `truncateHistoryWithMeta()` for context ✅

4. **Shared truncation** (`electron/main/historyTruncation.ts`)
   - `truncateHistory()` / `truncateHistoryWithMeta()` — trim assistant messages, cap message count, prioritise recent

### Estimated impact

Medium. Prevents context window pollution and keeps the model focused on the current task.

---

## Phase 5 Remaining: Per-Client Configuration ✅ IMPLEMENTED

**Goal:** Let each client optimize for its model's strengths.

### What was done

1. **Temperature** — OpenAI: 0.1, OpenRouter: 0.2 (unchanged, sensible defaults)
2. **Max tokens** — Added `max_tokens: 16_384` to OpenAI and OpenRouter request bodies to prevent runaway responses
3. **Model-specific prompts** — Deferred (low impact; current prompts work across models)

### Estimated impact

Low-medium individually, but compounds with the other phases.

---

## Phase 6: Multi-Agent Orchestration — FOUNDATION IMPLEMENTED

**Goal:** Enable Barnaby to break complex tasks into sub-tasks and delegate them to multiple specialised agents running in parallel, coordinated by an orchestrator.

*Inspired by multi-agent swarm architectures (e.g. Overstory) where a single coordinator fans work out to team leads, builders, and reviewers working in isolated git worktrees.*

### Part A: Agent-to-Orchestrator Communication Protocol

Sub-agents need a well-defined way to talk back to the orchestrator. Messages fall into three categories:

**Lifecycle signals** (mandatory — the orchestrator needs these to function):

| Signal | Meaning |
|--------|---------|
| `completed` | Agent finished its task. Includes a summary of what changed. |
| `failed` | Agent could not complete the task. Includes the reason. |
| `progress` | Incremental status update (current step, files touched so far). |

**Requests** (the agent asks the orchestrator to do something):

| Signal | Meaning |
|--------|---------|
| `need_context` | Agent needs information outside its scope (a file, a design decision). |
| `escalate` | A decision is above the agent's authority — orchestrator must decide. |
| `spawn_subtask` | Agent discovered a sub-problem that needs its own focused agent. |
| `blocked_by` | Agent cannot proceed until another agent's work is complete. |
| `request_review` | Agent's changes are ready for a reviewer to evaluate. |

**Reports** (informational — no immediate action required):

| Signal | Meaning |
|--------|---------|
| `discovered_issue` | Found a bug or problem unrelated to the current task. |
| `scope_warning` | Task is larger or different than originally estimated. |

**Message format:** structured envelope with a typed signal and natural-language payload.

```typescript
interface AgentMessage {
  type: 'lifecycle' | 'request' | 'report'
  signal: 'completed' | 'failed' | 'progress'
        | 'need_context' | 'escalate' | 'spawn_subtask' | 'blocked_by' | 'request_review'
        | 'discovered_issue' | 'scope_warning'
  body: string   // free-form text the orchestrator interprets
  agentId: string
  timestamp: number
}
```

This keeps the protocol machine-parseable (the orchestrator can switch on `type` and `signal`) while allowing rich, unstructured detail in `body`.

### Part B: Role-Based Agent Types (Hybrid Model)

Rather than fully predefined roles (rigid) or fully dynamic roles (unpredictable), use a **hybrid approach**: a small set of role templates that control tool access and core constraints, with the orchestrator filling in task-specific instructions per agent.

**Role templates:**

| Role | `list` / `search` / `read` | `write` | `shell` | Core constraint |
|------|----------------------------|---------|---------|-----------------|
| **Coordinator** | Yes | No | No | Plans and delegates only. Never edits code directly. Monitors agent lifecycle and manages merges. |
| **Builder** | Yes | Yes | Yes | Focused on a single task scope. Must report back when done. |
| **Reviewer** | Yes | No | Yes (tests only) | Evaluates builder output. Can approve, reject, or request changes. Cannot modify code. |
| **Researcher** | Yes | No | No | Gathers context and reports findings. No side effects. |

**Enforcement:** Tool restrictions are applied at the `AgentToolRunner` level by passing a filtered subset of the 5 existing tools based on the agent's role. This is not just a prompt instruction — the tools are literally absent from the agent's tool list, so the model cannot call them.

**Orchestrator workflow:**

1. Receives a complex task from the user
2. Breaks it into sub-tasks (optionally spawning a Researcher first to gather context)
3. For each sub-task, selects a role template and writes task-specific instructions
4. Spawns agents (parallel API calls from the Electron app)
5. Monitors agent messages, handles requests, resolves blockers
6. When a Builder signals `request_review`, spawns a Reviewer for that work
7. On approval, merges changes back (git worktree merge or sequential apply)

### Key design decisions still open

- **Git isolation strategy** — Use git worktrees for true parallel work, or sequential agents on a single branch? Worktrees are cleaner but add complexity.
- **Cost controls** — Max agents, max rounds per agent, and total token budget caps to prevent runaway swarms.
- **UI representation** — How does the Barnaby frontend visualise multiple agents? A dashboard view? Nested timelines? Agent cards with status badges?
- **Session model** — Does each agent get its own API session, or do they share a conversation context with the orchestrator?

### What was done (barnaby-app foundation)

1. **pluginHostTypes.ts** — `AgentRole`, `GoalRun`, `GoalRunTask`, `AgentSignal`, `AGENT_ROLE_PROMPTS`, `toolRestrictions` on `PanelCreateOptions`
2. **agentTools.ts** — `toolRestrictions` allowlist filters `getToolDefinitions()` and `executeTool()` (reviewers get read-only tools)
3. **Connect flow** — `toolRestrictions` passed from `pluginToolRestrictions` via `panelLifecycleController` → `ConnectOptions` → OpenAI/OpenRouter `AgentToolRunner`
4. **Orchestrator plugin** — Full goal run loop lives in `barnaby-orchestrator` package; app provides IPC, plugin host API, and UI (OrchestratorPane with Review/Goal Run mode toggle)

### New files anticipated (in barnaby-orchestrator plugin)

| File | Purpose |
|------|---------|
| `goalRunLoop.ts` | Task decomposition, agent spawning, signal parsing |
| `agentRoles.ts` | Role → tool mapping, system prompt fragments |

### Dependencies on earlier phases

- **Phase 2 (tools)** — `AgentToolRunner` already defines the 5 tools as a list; role-based filtering is a natural extension.
- **Phase 3 (context)** — The orchestrator needs `buildMessageContext()` to provide each agent with relevant workspace context at spawn time.
- **Phase 4 (history)** — Structured message arrays are essential for the orchestrator to track multi-agent conversation state cleanly.

### Estimated impact

High. This is a fundamental capability upgrade from single-agent to multi-agent, enabling Barnaby to tackle complex, multi-file tasks that currently require extensive human coordination.

---

## Implementation Priority

```
Phase 1 (system prompts)     ████████████████  DONE ✅
Phase 2 (tools)              ████████████████  DONE ✅
Phase 5 (streaming/UI)       ████████████████  DONE ✅ (remaining: tuning)
Phase 3 (context)            ████████████████  DONE ✅
Phase 4 (history)            ████████████████  DONE ✅
Phase 6 (multi-agent)        ████████░░░░░░░░  FOUNDATION DONE (tool restrictions, host API; plugin implements loop)
```

## Files Changed Summary

| File | Phase | Change |
|------|-------|--------|
| **NEW** `electron/main/systemPrompt.ts` | 1 | Shared system prompt builder |
| **NEW** `electron/main/agentTools.ts` | 2 | Shared tool definitions and executor |
| `electron/main/claudeClient.ts` | 1, 2, 5 | Rich system prompt, stream-json parsing, session resume via `--resume` |
| `electron/main/openaiClient.ts` | 1, 2, 5 | Use shared prompt and tools, SSE streaming, thinking events |
| `electron/main/openRouterClient.ts` | 1, 2, 5 | Rich prompt, tool support, SSE streaming, thinking events |
| `electron/main/geminiClient.ts` | 1, 5 | System prompt, git status, thinking events |
| `electron/main/codexAppServerClient.ts` | 5 | Git status in message text, thinking events from item notifications |
| `electron/main/index.ts` | 1, 2 | Context/gitStatus wiring, CodexAppServerClient git status fix |
| `src/App.tsx` | 1, 5 | interactionMode passthrough, thinking message accumulation, compact timeline rendering, diff detection, split icon |
| `src/chat/timelineParser.ts` | 5 | `🔄` system messages → `thinking` kind, removed assistant thinking heuristic |
| **NEW** `electron/main/orchestrator.ts` | 6 | Orchestrator logic: task decomposition, agent spawning, message routing, merge coordination |
| **NEW** `electron/main/agentRoles.ts` | 6 | Role templates: tool subsets, system prompt fragments, constraint definitions per role |

Phases 1–5 are self-contained and deployable independently. Phase 6 depends on Phases 2–4 being in place first.
