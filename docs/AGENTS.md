# Agent Runbook

This repository builds a local desktop executable (Electron). It is not a web deployment target.

## Default Commands (Standard Nomenclature)

- Install deps: `npm install`
- **run dev**: `npm run dev`
- **build**: `npm run build` (portable artifact, no version bump)
- **package**: `npm run package` (bump version + distributable)

## Build Policy

- **build** = artifact only, uses current version. Use for testing or CI.
- **package** = bump version + distributable. Use when preparing a new release.
- Do not assume publish unless user explicitly asks.

## Incremental Semantics

Each instruction includes all prior steps. Do not repeat work:
- **package** = bump + build (do not run build separately first).

When user says "build and package", treat as **package** (package includes build; do not run build twice).

## Reporting Requirements

After any build, report:

1. App version used
2. Artifact path in `release/<version>/`
3. File timestamp and size
4. Whether app was launched after build

## Run After Build

- **build and run** (no version bump): `npm run build` → launch app
- **package and run** (version bump + distributable): `npm run package` → launch app

## Release Automation Shortcuts

Use these exact flows when the user asks:

- **build** (no bump): `npm run build`
- **package** (bump + distributable): `npm run package`
- **Full prep** (bump + notes + build): `npm run release:prepare`

## Plan Mode Workflow

- If the user sets `Mode: Plan`, do not make code or file changes in that turn unless they explicitly switch modes or approve implementation.
- In plan mode, provide implementation options, trade-offs, and concrete steps first.
- If asked "are you finished?" during plan mode, report that implementation is not finished yet and state what planning deliverables remain.
- After plan approval, move to implementation and execute the agreed steps.
