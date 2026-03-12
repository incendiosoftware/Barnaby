# Barnaby 0.0.237 - Release Notes

**Released:** March 2026

## Added

- An application setting to always reopen the most recent workspace at startup instead of showing the chooser.
- A save-and-close action in the orchestrator settings modal for persisting license changes without leaving the modal in an ambiguous state.

## Changed

- Startup workspace restoration now keeps recent workspace history available even when full session restore is disabled.
- Closing or deleting the active workspace now returns Barnaby to a neutral chooser state instead of silently hopping to another workspace.

## Fixed

- Startup behavior is now deterministic between "open last workspace" and "show chooser" flows.
- Persisted app-state parsing now keeps recent workspace metadata and the new startup preference aligned with saved settings.

## Notes

- Artifact: `release/0.0.237/Barnaby_0.0.237_portable.exe`
