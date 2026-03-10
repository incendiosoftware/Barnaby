[
  {
    "title": "Catalog Orchestrator Artifacts",
    "description": "Read `.barnaby/orchestrator/` state, status, goal, and recent run metadata to identify current orchestration phase, run health, and pending items without editing any files.",
    "role": "researcher",
    "dependsOn": []
  },
  {
    "title": "Map Integration Surface Changes",
    "description": "Inspect changed Electron/main, renderer, controller, and plugin-host files from git status to identify orchestrator-related integration points and classify them as wired, partial, or pending.",
    "role": "researcher",
    "dependsOn": [
      "Catalog Orchestrator Artifacts"
    ]
  },
  {
    "title": "Draft Status Summary",
    "description": "Produce a short orchestrator integration status summary covering current state, key completed integrations, open gaps/risks, and immediate next checks, explicitly noting that no files were modified.",
    "role": "builder",
    "dependsOn": [
      "Map Integration Surface Changes"
    ]
  },
  {
    "title": "Compliance Review for Output Contract",
    "description": "Review the final response for required terminal signal/output formatting, brevity, and instruction compliance before returning the summary.",
    "role": "reviewer",
    "dependsOn": [
      "Draft Status Summary"
    ]
  }
]