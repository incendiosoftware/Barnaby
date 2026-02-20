# Barnaby Agent Orchestrator

Desktop Agent IDE app (React/Electron) for running and coordinating multiple local AI agent panels using subscriptions not API tokens.

## Overview

Barnaby provides:

- Subscription based parallel agents, not expensive API
- Multiple agent panels with split layouts (horizontal, vertical, grid)
- Workspace selection and per-workspace defaults
- Model setup and provider routing (Codex and Gemini)
- Streaming chat with markdown rendering
- Queue-aware sending and auto-scroll in chat windows
- Menu actions for workspace management (new/open/recent/close/exit)

## Prerequisites

- Node.js 18+ recommended
- npm
- For Codex provider:
  - Codex CLI installed and available in `PATH`
  - Logged in once from terminal (for example: `codex auth` or your installed CLI login flow)
- For Gemini provider:
  - Gemini API key configured in **Edit -> Model setup...**

## Development

From repo root:

```sh
npm install
npm run dev
```

## Build

```sh
npm run build:dist
```

`build:dist` automatically increments the app version on every run.

This generates:

- `dist/` (renderer)
- `dist-electron/` (main/preload)

## Packaging

```sh
npm run build
```

`build` now creates **portable-only** output (Windows) and increments version via `build:dist`.

For full release artifacts (installer + portable), run:

```sh
npm run build:release
```

## Project Structure

```text
electron/        Electron main and preload
src/             React renderer UI
public/          Static assets
release/         Packaged outputs
```

## Notes

- Workspace root should be the repository root unless you intentionally want broader file scope.
- If Codex fails with `codex app-server closed`, run `codex app-server` manually in terminal to inspect the underlying error.
