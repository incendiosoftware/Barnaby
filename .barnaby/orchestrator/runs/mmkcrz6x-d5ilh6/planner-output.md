[
  {
    "title": "Collect Integration-Relevant Workspace Signals",
    "description": "Read git status and scan changed/untracked files to isolate orchestrator-integration touchpoints (electron main, renderer controllers, orchestrator state/status artifacts, release notes) without editing anything.",
    "role": "researcher",
    "dependsOn": []
  },
  {
    "title": "Map Current Orchestrator Wiring",
    "description": "Inspect key source files to identify how orchestrator requests, status propagation, plugin host interactions, and UI surfacing are currently connected; capture concrete evidence lines for each integration path.",
    "role": "builder",
    "dependsOn": [
      "Collect Integration-Relevant Workspace Signals"
    ]
  },
  {
    "title": "Assess Integration Readiness and Gaps",
    "description": "Evaluate observed wiring for operational status, regressions, missing links, and risk areas; classify findings into working, partial, and unknown states for a concise status outcome.",
    "role": "reviewer",
    "dependsOn": [
      "Map Current Orchestrator Wiring"
    ]
  },
  {
    "title": "Produce Short Orchestrator Status Summary with Terminal Signals",
    "description": "Draft a brief final summary tailored to the orchestrator goal, including current status, key evidence, and blockers/next checks, and format output to include the required terminal signals while preserving read-only behavior.",
    "role": "builder",
    "dependsOn": [
      "Assess Integration Readiness and Gaps"
    ]
  }
]