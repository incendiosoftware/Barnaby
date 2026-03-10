[
  {
    "title": "Collect orchestrator artifacts",
    "description": "Read orchestrator-specific metadata and status sources (e.g., .barnaby/orchestrator/state.json, status.md, goal.md, recent run folders) to capture current run state, goals, and signal conventions without editing anything.",
    "role": "researcher",
    "dependsOn": []
  },
  {
    "title": "Scan integration touchpoints",
    "description": "Inspect changed integration files in Electron/main, renderer controllers, and plugin host boundaries to identify what orchestrator wiring exists, what is newly added, and any obvious gaps or inconsistencies.",
    "role": "researcher",
    "dependsOn": ["Collect orchestrator artifacts"]
  },
  {
    "title": "Draft status summary",
    "description": "Produce a short orchestrator integration status summary covering current readiness, key implemented paths, outstanding risks/gaps, and whether required terminal signals appear correctly represented.",
    "role": "builder",
    "dependsOn": ["Scan integration touchpoints"]
  },
  {
    "title": "Constraint and signal compliance review",
    "description": "Review the draft to ensure it is concise, grounded in inspected files, includes terminal signal reporting as requested, and confirms no file modifications were made.",
    "role": "reviewer",
    "dependsOn": ["Draft status summary"]
  }
]