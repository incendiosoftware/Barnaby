[
  {
    "title": "Catalog Orchestrator-Relevant Changes",
    "description": "Read git status and list changed/untracked files that are likely tied to orchestrator integration (orchestrator state files, controller/runtime wiring, plugin host/client surfaces, and UI panes) without editing anything.",
    "role": "researcher",
    "dependsOn": []
  },
  {
    "title": "Inspect Key Integration Paths",
    "description": "Open and inspect the highest-signal files (main process clients/tools, renderer controllers/hooks, orchestrator pane, and shared types/constants) to determine current integration state, notable additions, and potential gaps.",
    "role": "researcher",
    "dependsOn": [
      "Catalog Orchestrator-Relevant Changes"
    ]
  },
  {
    "title": "Draft Short Integration Status Summary",
    "description": "Produce a concise status summary covering what appears integrated, what is in-progress, and any immediate risks/unknowns, explicitly noting that findings are from read-only inspection.",
    "role": "builder",
    "dependsOn": [
      "Inspect Key Integration Paths"
    ]
  },
  {
    "title": "Review Summary Accuracy and Terminal Signaling",
    "description": "Validate the summary against inspected evidence, ensure no file modifications were made, and confirm output includes the required terminal signals/instructions format.",
    "role": "reviewer",
    "dependsOn": [
      "Draft Short Integration Status Summary"
    ]
  }
]