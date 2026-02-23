# Barnaby

Barnaby is a desktop AI agent orchestrator for **agentic coordination** — connecting Codex, Claude, Gemini CLIs and OpenRouter APIs to deliver windowed agents, workspace-aware context, and a polished UI experience.

- **Agentic coordination**: Run multiple agents in parallel, compare models side-by-side, keep separate conversations per panel
- **CLI providers**: Codex, Claude, Gemini — use your existing CLI logins, no API keys in Barnaby
- **API provider**: OpenRouter — free-tier and paid models via API key (ideal when CLI quotas are exhausted)
- **UI experience**: Split layouts (horizontal, vertical, grid), workspace window, dark/light themes, zoom, activity timeline

Latest Binary Release  
[Download Barnaby v0.0.98](https://github.com/incendiosoftware/Barnaby/releases/tag/v0.0.98)

Website: https://barnaby.build  
Written By: Stuart Mackereth  
Company: Incendio Trading Limited  
Email: incendiosoftware@gmail.com  

## Screenshots

![Barnaby dark screenshot](docs/screenshots/barnaby-dark.png)

![Barnaby light screenshot](docs/screenshots/barnaby-light.png)

## Overview

Barnaby provides:

- **Multiple agent panels** with split layouts (horizontal, vertical, grid)
- **Workspace window** with agent orchestrator, file explorer, Git status, and workspace settings
- **Workspace selection** and per-workspace model defaults
- **Provider routing** for Codex, Claude, Gemini (CLI) and OpenRouter (API)
- **Connectivity checks** for each provider
- **Streaming chat** with markdown, code blocks, and collapsible activity timeline
- **Queue-aware sending** and auto-scroll
- **View menu**: layout, workspace window toggle, zoom, fullscreen

## Why Barnaby

Barnaby unifies **CLI-based** providers (Codex, Claude, Gemini) and **API-based** OpenRouter so you can orchestrate agents without vendor lock-in.

- **Agentic coordination**: Multiple agents side-by-side, workspace-aware context, parallel conversations
- **Windowed agents**: Split layouts so you can compare models or keep contexts separate
- **CLI providers**: Use your provider subscriptions via their CLI; Barnaby does not handle keys or billing
- **OpenRouter**: API key in Barnaby settings; access free-tier and paid models when CLI quotas are exhausted

Compared to single-chat tools: Barnaby gives you parallel windowed agents and workspace-aware orchestration.

## Prerequisites

- Node.js 18+ recommended
- npm
- **CLI providers** (optional): Codex, Claude, and/or Gemini CLI installed and authenticated
- **API provider** (optional): OpenRouter API key from https://openrouter.ai/keys

## Provider Coverage

| Provider   | Type | Setup                                      |
|------------|------|--------------------------------------------|
| Codex      | CLI  | Install CLI, sign in via terminal          |
| Claude     | CLI  | Install CLI, sign in via terminal          |
| Gemini     | CLI  | Install CLI, sign in with Google          |
| OpenRouter | API  | API key in Barnaby connectivity settings  |

OpenRouter offers free-tier models (e.g. Llama, Mistral) and paid models; useful when CLI quotas are exhausted.

## CLI Setup (Codex, Claude, Gemini)

For CLI providers, required CLIs must be installed, signed in, and resolvable from your terminal.

1. Install each CLI from its official docs.
2. Open a new terminal after install.
3. Verify CLIs are available on `PATH`:

```sh
codex --version
claude --version
gemini --version
```

4. Authenticate each CLI (follow the provider's login flow).
5. Sanity-check outside Barnaby by running one simple prompt in each CLI you plan to use.

## OpenRouter Setup

1. Get an API key from https://openrouter.ai/keys
2. In Barnaby: open connectivity settings, select OpenRouter, enter your API key
3. Choose a model (e.g. free-tier Llama 3.3 70B) and connect

## Development

From repo root:

```sh
npm install
npm run dev
```

## Build Commands (Standard Nomenclature)

| Command | Meaning | Script |
|---------|---------|--------|
| **run dev** | Run in dev mode | `npm run dev` |
| **build** | Build without version bump | `npm run build` |
| **package** | Build + bump version + create distributable | `npm run package` |
| **publish** | Release to GitHub with release notes | `npm run publish` |

Flow: dev → build → package → publish

- **build** = portable `.exe` in `release/<version>/` (uses current version)
- **package** = bump patch version, build, artifact in `release/<new-version>/`
- **publish** = trigger GitHub Actions to publish the current version (commit & push first)

Other scripts: `build:dist`, `build:portable:raw`, `build:release`, `release:notes`, `release:prepare`

Release notes: `RELEASE_NOTES_<version>.md` (generate with `npm run release:notes`). The release workflow updates the latest release link in this README automatically.

## Project Structure

```text
docs/            Documentation (AGENTS.md, BACKLOG.md, STATUS_LOG.md)
electron/       Electron main and preload
src/            React renderer UI
public/         Static assets
release/        Packaged outputs
```

## Notes

- Workspace root should be the repository root unless you want broader file scope.
- If Codex fails with `codex app-server closed`, run `codex app-server` manually in terminal to inspect.

## Manual Test Checklist

- Multi-instance: open two Barnaby executables and confirm both launch
- Workspace lock: instance A opens workspace X; instance B tries X → blocked with in-use message
- Different workspaces: instance A on X, instance B on Y → allowed
- Lock release: close A, confirm B can open X
- Crash-stale-lock: force-close A, wait for stale timeout, confirm another instance can claim X
