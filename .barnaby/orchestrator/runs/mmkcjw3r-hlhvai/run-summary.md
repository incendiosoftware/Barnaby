# Goal Run Report

**Goal:** Inspect this workspace and produce a short orchestrator integration status summary. Do not modify files. Return terminal signals as instructed.
**Status:** failed
**Tasks:** 4
**Duration:** 73s

## Tasks

[failed] **Collect orchestrator artifacts** (researcher) - failed
Failed: Task "Collect orchestrator artifacts" did not return a terminal [SIGNAL:...] response.

[skipped] **Scan integration touchpoints** (researcher) - skipped
Dependencies: Collect orchestrator artifacts

[skipped] **Draft status summary** (builder) - skipped
Dependencies: Scan integration touchpoints

[skipped] **Constraint and signal compliance review** (reviewer) - skipped
Dependencies: Draft status summary

## Summary

Goal run failed. 1/4 tasks failed: Collect orchestrator artifacts