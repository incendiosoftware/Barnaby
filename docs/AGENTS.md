# Agent Runbook

This repository builds a local desktop executable (Electron). It is not a web deployment target.

## Default Commands (Standard Nomenclature)

- Install deps: `npm install`
- **run dev**: `npm run dev`
- **build**: `npm run build` (portable artifact, no version bump)
- **package**: `npm run package` (bump version + distributable)
- **publish**: `npm run publish` (release to GitHub)

## Build Policy

- **build** = artifact only, uses current version. Use for testing or CI.
- **package** = bump version + distributable. Use when preparing a new release.
- **publish** = release to GitHub. Run after package + commit + push.
- Do not assume publish unless user explicitly asks.

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
- **publish** (release to GitHub): `npm run publish` (or `gh workflow run release.yml -f releasable=true --ref main`)
- **Full prep** (bump + notes + build): `npm run release:prepare`
- **Push with publish**: package → commit → push → `npm run publish`

### Release Notes Rules

- Preferred release notes file: `RELEASE_NOTES_<version>.md`
- Generate scaffold file for current version: `npm run release:notes`
- The release workflow uses `RELEASE_NOTES_<version>.md` if present, otherwise auto-generates fallback notes.

## Plan Mode Workflow

- If the user sets `Mode: Plan`, do not make code or file changes in that turn unless they explicitly switch modes or approve implementation.
- In plan mode, provide implementation options, trade-offs, and concrete steps first.
- If asked "are you finished?" during plan mode, report that implementation is not finished yet and state what planning deliverables remain.
- After plan approval, move to implementation and execute the agreed steps.
