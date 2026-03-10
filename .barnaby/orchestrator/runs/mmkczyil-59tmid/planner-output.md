[
  {
    "title": "Baseline Workspace Snapshot",
    "description": "Collect a read-only snapshot of repository state (branch, modified/untracked files, key orchestrator directories) to establish current integration context without changing files.",
    "role": "researcher",
    "dependsOn": []
  },
  {
    "title": "Map Orchestrator Integration Touchpoints",
    "description": "Inspect orchestrator-related app surfaces (Electron main, renderer controllers/hooks, plugin host, and docs) to identify where integration is present and which components appear newly added or in-flight.",
    "role": "researcher",
    "dependsOn": [
      "Baseline Workspace Snapshot"
    ]
  },
  {
    "title": "Assess Integration Health and Gaps",
    "description": "Evaluate the observed touchpoints for completeness signals, risk areas, and likely partial implementations based on changed files and orchestration artifacts.",
    "role": "reviewer",
    "dependsOn": [
      "Map Orchestrator Integration Touchpoints"
    ]
  },
  {
    "title": "Draft Short Orchestrator Status Summary",
    "description": "Produce a concise integration status summary with current state, key findings, and immediate next checks, formatted for terminal-style signaling and without modifying repository content.",
    "role": "builder",
    "dependsOn": [
      "Assess Integration Health and Gaps"
    ]
  }
]