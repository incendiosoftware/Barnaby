[
  {
    "title": "Catalog Workspace Change Surface",
    "description": "Read git status and key metadata to identify modified/untracked areas relevant to orchestrator integration without editing any files.",
    "role": "researcher",
    "dependsOn": []
  },
  {
    "title": "Inspect Orchestrator Integration Artifacts",
    "description": "Review orchestrator-related docs/config/runtime files (for example .barnaby/orchestrator and integration touchpoints in electron/src) to determine current integration state and obvious gaps.",
    "role": "researcher",
    "dependsOn": ["Catalog Workspace Change Surface"]
  },
  {
    "title": "Draft Short Integration Status Summary",
    "description": "Produce a concise status summary covering what appears integrated, what is in progress, and key risks/blockers, explicitly noting that no files were modified.",
    "role": "builder",
    "dependsOn": ["Inspect Orchestrator Integration Artifacts"]
  },
  {
    "title": "Run Discrete Summary Quality Review",
    "description": "Check the summary for accuracy, brevity, and alignment with observed workspace evidence; ensure claims are evidence-backed and non-speculative.",
    "role": "reviewer",
    "dependsOn": ["Draft Short Integration Status Summary"]
  },
  {
    "title": "Emit Required Terminal Signals",
    "description": "Return the final orchestrator status response and include the required terminal signal format/instructions exactly as requested.",
    "role": "builder",
    "dependsOn": ["Run Discrete Summary Quality Review"]
  }
]