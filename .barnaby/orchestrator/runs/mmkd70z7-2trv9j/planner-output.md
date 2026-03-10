[
  {
    "title": "Catalog orchestrator-related workspace changes",
    "description": "Scan modified and untracked files to identify components tied to orchestrator integration (electron main process, renderer controllers/hooks, workspace/orchestrator UI, and .barnaby orchestrator artifacts).",
    "role": "researcher",
    "dependsOn": []
  },
  {
    "title": "Inspect orchestrator runtime artifacts and state",
    "description": "Read current orchestrator state/status/goal and available run artifacts under .barnaby to determine current integration/runtime health signals without changing any files.",
    "role": "researcher",
    "dependsOn": [
      "Catalog orchestrator-related workspace changes"
    ]
  },
  {
    "title": "Draft short orchestrator integration status summary",
    "description": "Produce a concise summary covering what is integrated, what appears in-progress, and any immediate risks or unknowns based on code and artifact inspection.",
    "role": "builder",
    "dependsOn": [
      "Catalog orchestrator-related workspace changes",
      "Inspect orchestrator runtime artifacts and state"
    ]
  },
  {
    "title": "Review summary for accuracy and signal compliance",
    "description": "Verify the summary is consistent with observed workspace evidence, remains short, includes no file modifications, and conforms to required terminal output signals.",
    "role": "reviewer",
    "dependsOn": [
      "Draft short orchestrator integration status summary"
    ]
  }
]