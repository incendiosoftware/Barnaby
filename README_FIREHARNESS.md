# Agent Orchestrator (MVP)

Local Windows app that talks to your ChatGPT subscription by spawning the Codex CLI in `app-server` mode and streaming messages over JSON-RPC (stdio).

## Prereqs

- Install Codex CLI and ensure `codex` is on your `PATH`
- Log in once in a terminal:
  - `codex login`

## Run

### Portable EXE (electron-builder)

- `release/0.0.1/AgentOrchestrator_0.0.1_portable.exe`

### Installer (NSIS)

- `release/0.0.1/AgentOrchestrator_0.0.1_setup.exe`

### Dev

- `npm install`
- `npm run dev`

## Notes

- Default working folder is `E:\Retirement\FIREMe` (editable in Settings inside the app).
- If you see “Starting codex app-server…” forever, open a terminal and run `codex app-server` to confirm it works and is logged in.

