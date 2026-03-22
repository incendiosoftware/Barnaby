# Barnaby 0.0.249 - Release Notes

**Released:** March 2026

## Changed

- Refactored Electron main process: `index.ts` decomposed from ~4700 lines into focused modules (workspaceManager, windowManager, chatManager, terminalManager, explorerManager, gitManager, pluginHost, and dedicated ipcHandlers per domain)

## Fixed

- Workspace switching: fixed missing `forceClaimWorkspace` function declaration that caused the old and new workspace to compete with each other when switching
- TypeScript build errors introduced during refactor: corrected imports in `diagnostics.ts`, `ipcHandlers/diagnostics.ts`, `ipcHandlers/agent.ts`, `ipcHandlers/mcp.ts`, `ipcHandlers/fireharness.ts`, `pluginHost.ts`, and `index.ts`

## Notes

- Artifact: `release/0.0.249/Barnaby_0.0.249_portable.exe`
