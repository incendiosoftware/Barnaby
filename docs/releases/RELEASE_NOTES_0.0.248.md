# Barnaby 0.0.248 - Release Notes

**Released:** March 2026

## Added

- Orchestrator Task List mode: manage standalone tasks with persistent storage under `.barnaby/orchestrator/tasks/`
- Start/Continue action opens a chat panel pre-loaded with task context and a per-task log file
- Inline task editing (double-click to rename), reordering, and deletion
- Panel close detection prompts task completion status
- `onCreateTaskPanel` callback wires task list items to new agent panels

## Changed

- Orchestrator mode selector now includes `task-list` alongside `goal-run` and `review`
- Input area hidden when in task-list mode (tasks use their own inline controls)
- `closePanel` in App.tsx now notifies orchestrator task list on panel close

## Fixed

- N/A

## Notes

- Artifact: `release/0.0.248/Barnaby_0.0.248_portable.exe`
