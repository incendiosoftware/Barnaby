# Barnaby 0.0.242 - Release Notes

**Released:** March 2026

## Added

- Added an `Add Folder to Current Workspace` action so existing workspaces can be expanded without creating a new workspace first.
- Added a `Show debug log in bottom dock` setting for inline diagnostics access.

## Changed

- Improved workspace picker and workspace manager flows so opening settings happens in-place instead of forcing an immediate workspace switch.
- Default bottom dock layout now starts with `terminal` only and adds `debug-output` only when enabled.
- Hardened the message send IPC path against renderer teardown during in-flight sends.

## Fixed

- Prevented duplicate workspace path entries while combining current, saved, and history-derived workspace paths.
- Kept debug log panel visibility and application settings parsing in sync.

## Notes

- Artifact: `release/0.0.242/Barnaby_0.0.242_portable.exe`
