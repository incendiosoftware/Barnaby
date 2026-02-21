# Barnaby

Barnaby is a desktop AI agent runtime that lets you use your existing AI subscriptions (ChatGPT, Claude, Gemini) as autonomous coding agents.

No API keys.
No usage billing.
Just your subscriptions — unlocked.

Website: https://barnaby.build

## Screenshots

### Dark

![Barnaby dark screenshot](docs/screenshots/barnaby-dark.png)

### Light

![Barnaby light screenshot](docs/screenshots/barnaby-light.png)

## Overview

Barnaby provides:

- Subscription based parallel agents, not expensive API
- Multiple agent panels with split layouts (horizontal, vertical, grid)
- Workspace selection and per-workspace defaults
- Model setup and provider routing (Codex, Claude, and Gemini)
- Connectivity checks for Codex, Claude, and Gemini CLIs
- Streaming chat with markdown rendering
- Queue-aware sending and auto-scroll in chat windows
- Menu actions for workspace management (new/open/recent/close/exit)

## Why Barnaby (Subscription vs API)

Barnaby is built around local CLI sessions instead of direct API key wiring.

- Subscription/CLI login model (Barnaby default):
  - Uses your existing provider login/session (for example ChatGPT/Codex CLI or Gemini CLI)
  - No API key handling inside the app
  - No separate per-project API key setup before first use
- Direct API model (not Barnaby's primary path):
  - Requires managing API keys and key security
  - Usually introduces separate usage-based API billing
  - Better when you need custom low-level API controls not exposed in CLI flows

For most desktop workflow use, the subscription/CLI path gives faster setup and lower operational overhead.

## Prerequisites

- Node.js 18+ recommended
- npm
- Codex CLI installed and authenticated (available in `PATH`)
- Claude CLI installed (available in `PATH`)
- Gemini CLI installed and authenticated (available in `PATH`)

## Provider Coverage

- CODEX: full support (connectivity checks + model routing in panels)
- CLAUDE: full support (connectivity checks + model routing in panels)
- GEMINI: full support (connectivity checks + model routing in panels)
- Other CLIs: can be added when they provide a stable non-interactive CLI flow (`--print`/`--prompt` style) and an adapter is implemented

## CLI Setup (Codex + Claude + Gemini)

Barnaby connects to local CLI sessions, so the required CLIs must be installed, signed in, and resolvable from your terminal.

1. Install each CLI from its official docs.
2. Open a new terminal after install.
3. Verify CLIs are available on `PATH`:

```sh
codex --version
claude --version
gemini --version
```

On Windows, you can also confirm command resolution with:

```powershell
where codex
where claude
where gemini
```

4. Authenticate each CLI (follow the provider's login flow). If your CLI supports an explicit auth command, use that; otherwise run the CLI once and complete the sign-in prompts.
5. Sanity-check outside Barnaby by running one simple prompt/command in each CLI you plan to use.

If either command is not found, restart the terminal (or OS) so `PATH` updates apply.

## Development

From repo root:

```sh
npm install
npm run dev
```

## Build Commands

- Standard local build (portable-only artifact): `npm run build`
- Dist-only build (no release artifact): `npm run build:dist`
- Full release build (installer + portable): `npm run build:release`

`build:dist` automatically increments the app version on every run.

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

## Manual Test Checklist

- Multi-instance behavior: open two Barnaby executables at once and confirm both launch successfully.
- Workspace lock behavior: in instance A open workspace `X`, then in instance B try to open the same workspace `X`; confirm instance B is blocked with an in-use message.
- Different workspace behavior: with instance A on workspace `X`, open workspace `Y` in instance B; confirm this is allowed.
- Lock release behavior: close instance A and confirm instance B can then open workspace `X`.
- Crash-stale-lock recovery: force-close instance A (simulate crash), wait for stale timeout, then confirm another instance can claim/open workspace `X`.
