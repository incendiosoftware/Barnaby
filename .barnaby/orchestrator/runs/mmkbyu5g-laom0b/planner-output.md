[
  {
    "title": "Inventory Orchestrator-Relevant Artifacts",
    "description": "Scan existing changed/untracked files and identify those directly related to orchestrator integration (state, status, runs, goal files, orchestrator UI/controllers, plugin host and app core integration points) without editing anything.",
    "role": "researcher",
    "dependsOn": []
  },
  {
    "title": "Trace Integration Surface Across Main and Renderer",
    "description": "Inspect key Electron main-process and renderer files to map how orchestrator state, runtime events, and panel streaming are wired end-to-end, noting any incomplete links or newly added entry points.",
    "role": "researcher",
    "dependsOn": [
      "Inventory Orchestrator-Relevant Artifacts"
    ]
  },
  {
    "title": "Assess Workspace Status and Signal Readiness",
    "description": "Evaluate repository cleanliness and execution constraints for orchestrator status reporting, including impact of unrelated dirty changes and whether required terminal signaling steps can run safely in read-only inspection mode.",
    "role": "reviewer",
    "dependsOn": [
      "Trace Integration Surface Across Main and Renderer"
    ]
  },
  {
    "title": "Produce Short Integration Status Summary",
    "description": "Draft a concise orchestrator integration status summary covering current wiring, observed gaps/risks, and immediate next checks, then return the required terminal signals/output format exactly as instructed.",
    "role": "builder",
    "dependsOn": [
      "Assess Workspace Status and Signal Readiness"
    ]
  }
]