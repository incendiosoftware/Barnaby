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

## Phase 1: Rich System Prompts (Highest Impact, Lowest Effort) ✅ IMPLEMENTED

**Goal:** Replace the minimal system prompts across all clients with comprehensive, Cursor-quality instructions.

### Files to modify

- `electron/main/claudeClient.ts` — `COMPLETION_SYSTEM` constant
- `electron/main/openaiClient.ts` — `system` variable in `startTurn()`
- `electron/main/openRouterClient.ts` — `system` variable in `startTurn()`
- `electron/main/geminiClient.ts` — needs a system prompt (currently has none)

### New file: `electron/main/systemPrompt.ts`

Create a shared function:

```typescript
export function buildSystemPrompt(options: {
  workspaceTree: string
  cwd: string
  permissionMode: string
  sandbox: string
  interactionMode?: string
  gitStatus?: string
}): string
```

### System prompt content (in order)

1. **Identity and role** — "You are a coding agent running inside Barnaby, an AI orchestrator. You have access to the user's workspace and tools to read, search, write files, and run commands."

2. **Behavioral rules:**
   - Prefer action over deferral: locate files, apply edits, report what changed
   - Never invent file names, symbols, or behavior — verify via tools first
   - Cite evidence (file paths, line numbers) in answers
   - Keep working until the task is done or a clear blocker is identified
   - Don't narrate what you're about to do — just do it
   - Be concise — no filler, no restating the question

3. **Code quality rules:**
   - Don't add obvious/redundant comments
   - Preserve existing code style and indentation
   - When editing, show only the changed section with enough context to locate it
   - Don't generate binary data or extremely long hashes

4. **Tool usage guidance:**
   - Read files before editing them
   - Use search to find symbols rather than guessing file locations
   - Use shell commands for build/test/install tasks instead of returning checklists

5. **Mode-specific instructions** — Move from frontend `INTERACTION_MODE_META.promptPrefix` into system prompt:
   - agent: "Implement changes directly. Bias toward action."
   - plan: "Explore options and trade-offs first. Present a plan before making changes."
   - debug: "Investigate systematically. Gather evidence. Identify root cause before proposing fixes."
   - ask: "Read-only guidance mode. Explain clearly. Do not make code changes unless explicitly asked."

6. **Workspace context** — the tree, cwd, permission mode, sandbox mode

### Frontend change in `src/App.tsx`

- Pass `interactionMode` through to the client via the `sendMessageEx` payload (or a new field on connect options)
- Remove the `promptPrefix` prepending from `sendToAgent()` since it moves into the system prompt

### Estimated impact

Large. This alone should close 50-60% of the quality gap.

---

## Phase 2: Tool Definitions for Claude and OpenRouter Clients ✅ IMPLEMENTED

**Goal:** Give the Claude CLI client and OpenRouter client the same tool capabilities that the OpenAI client already has.

### Current tool support by client

| Client | Tools | Notes |
|--------|-------|-------|
| `OpenAIClient` | 5 tools | list_workspace_tree, search_workspace, read_workspace_file, write_workspace_file, run_shell_command |
| `ClaudeClient` | 0 (CLI has own) | Relies on Claude CLI built-in tools |
| `OpenRouterClient` | 0 | Simple chat completion |
| `CodexAppServerClient` | Server-managed | Codex server handles tools |
| `GeminiClient` | CLI-managed | Gemini CLI handles tools |

### Step 1: Extract shared tool infrastructure

Create new file: `electron/main/agentTools.ts`

Move the following from `openaiClient.ts` into the shared module:
- `agentTools()` — tool definition schemas
- `runTool()` — tool execution dispatcher
- `readWorkspaceFile()` — file reading with line range support
- `writeWorkspaceFile()` — file writing with permission checks
- `searchWorkspace()` — text search across workspace
- `runShellCommand()` — shell command execution
- `resolveWorkspacePath()` — path validation
- `limitToolOutput()` — output truncation

Export as:

```typescript
export class AgentToolRunner {
  constructor(options: { cwd: string; sandbox: string; permissionMode: string; allowedCommandPrefixes: string[] })
  getToolDefinitions(): ToolDefinition[]
  async executeTool(name: string, args: string): Promise<string>
}
```

### Step 2: Add tool loop to OpenRouterClient

`electron/main/openRouterClient.ts` — OpenRouter supports OpenAI-compatible tool calling format:
- Add `tools` and `tool_choice: 'auto'` to the request body
- Add tool execution loop (max 8 rounds, same as OpenAI client)
- Append tool result messages to conversation

### Step 3: Claude CLI tools

The `claude` CLI has its own built-in tools for file operations. The issue with `ClaudeClient` is not missing tools but the weak system prompt. Phase 1 addresses this. Verify the Claude CLI's `--permission-mode` flag is correctly enabling tool use.

### Estimated impact

Medium-high. OpenRouter models will go from "dumb chat" to capable agents. Claude CLI benefit is mainly from Phase 1.

---

## Phase 3: Automatic Context Enrichment

**Goal:** Automatically attach relevant workspace context to every message, so the model doesn't start blind.

### New file: `electron/main/contextBuilder.ts`

```typescript
export async function buildMessageContext(options: {
  cwd: string
  messageText: string
  includeGitStatus?: boolean
  includeRecentFiles?: boolean
}): Promise<string>
```

### Context to attach automatically

1. **Git status summary** (if workspace is a git repo):
   - Branch name, ahead/behind counts
   - List of modified/staged/untracked files
   - Use the existing `getGitStatus()` function in `index.ts`

2. **Workspace metadata** — Language detection (check for `package.json`, `Cargo.toml`, `go.mod`, `requirements.txt`, etc.) so the model knows the tech stack without having to search

### Where to integrate

In `electron/main/index.ts`, modify the `sendMessageEx` handler to call `buildMessageContext()` and append context to the message before passing to the client. Or: pass context options to the client's `connect()` method and let each client include it in the system prompt during `startTurn()`.

### What NOT to do

- Don't attach full file contents automatically (too expensive)
- Don't attach the entire git diff (too noisy)
- Keep automatic context lightweight — the model has tools to read more when needed

### Estimated impact

Medium. Reduces "cold start" problem where the model doesn't know what language, framework, or state the project is in.

---

## Phase 4: Structured Conversation History

**Goal:** Replace text-transcript history formatting with proper API-structured messages.

### Current state

- `ClaudeClient` formats history as `User:\n...\n\nAssistant:\n...` plain text via `buildPrompt()`
- `CodexAppServerClient` uses `formatPriorMessagesForContext()` which does the same
- `OpenAIClient` properly uses `{ role, content }` message arrays (good)

### Changes

1. **ClaudeClient** (`electron/main/claudeClient.ts`)
   - Instead of `buildPrompt()` that flattens history to text, send the current message only to stdin, and pass initial history via the `--resume` or `--continue` Claude CLI flags if available
   - If CLI doesn't support structured history, keep text format but improve: clear delimiters, truncate long assistant responses (currently unlimited)

2. **CodexAppServerClient** (`electron/main/index.ts`)
   - `formatPriorMessagesForContext()` prepends all history as text blob — wastes context window
   - Send only the last 2-4 messages as context (not all 24), summarize older history
   - Consider: "Previous conversation summary: [user asked about X, assistant modified files Y and Z]"

3. **History truncation** — Add smart truncation to all clients:
   - Trim assistant messages longer than ~2000 chars to a summary
   - Keep user messages intact (they contain the actual instructions)
   - Prioritize recent messages over old ones

### Estimated impact

Medium. Prevents context window pollution and keeps the model focused on the current task.

---

## Phase 5: Per-Client Configuration and Model-Aware Tuning

**Goal:** Let each client optimize for its model's strengths.

### Changes

1. **Temperature tuning** — `openaiClient.ts` uses `0.1`, OpenRouter uses `0.2`. Claude CLI and Gemini CLI don't set temperature. Add temperature configuration per-model.

2. **Max tokens / response length** — Set appropriate `max_tokens` for each model to prevent runaway responses.

3. **Model-specific prompt adjustments** — `buildSystemPrompt()` from Phase 1 could accept a `modelFamily` parameter:
   - Claude: responds well to XML-structured prompts with `<rules>` tags
   - GPT: responds well to numbered lists and explicit constraints
   - Gemini: responds well to conversational instructions

4. **Streaming for OpenAI and OpenRouter** — Both currently use `stream: false`. Switch to `stream: true` with SSE parsing so the user sees output immediately instead of waiting 30+ seconds.

### Estimated impact

Low-medium individually, but compounds with the other phases.

---

## Implementation Priority

Phase 1 should be done first — highest impact and unblocks everything else. Phases 2 and 3 can run in parallel. Phase 4 after Phase 2 (needs tool infrastructure). Phase 5 last.

```
Phase 1 (system prompts)     ████████████████  HIGH IMPACT
Phase 2 (tools)              ░░░░░████████████  MEDIUM-HIGH
Phase 3 (context)            ░░░░░████████      MEDIUM (parallel with 2)
Phase 4 (history)            ░░░░░░░░░░████     MEDIUM
Phase 5 (tuning)             ░░░░░░░░░░░░░░██  LOW-MEDIUM
```

## Files Changed Summary

| File | Phase | Change |
|------|-------|--------|
| **NEW** `electron/main/systemPrompt.ts` | 1 | Shared system prompt builder |
| **NEW** `electron/main/agentTools.ts` | 2 | Shared tool definitions and executor |
| **NEW** `electron/main/contextBuilder.ts` | 3 | Automatic context enrichment |
| `electron/main/claudeClient.ts` | 1, 4 | Rich system prompt, better history |
| `electron/main/openaiClient.ts` | 1, 2 | Use shared prompt and tools |
| `electron/main/openRouterClient.ts` | 1, 2 | Rich prompt, add tool support |
| `electron/main/geminiClient.ts` | 1 | Add system prompt |
| `electron/main/index.ts` | 3, 4 | Context enrichment, history improvement |
| `src/App.tsx` | 1 | Pass interactionMode to backend, remove frontend mode prefix |

Each phase is self-contained and deployable independently. An agent can pick up any single phase and implement it without needing the others to be complete first.
