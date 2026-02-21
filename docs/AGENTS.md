# Agent Runbook

This repository builds a local desktop executable (Electron). It is not a web deployment target.

## Default Commands

- Install deps: `npm install`
- Dev run: `npm run dev`
- Standard build (default): `npm run build` (portable-only artifact)
- Dist-only build: `npm run build:dist` (no release artifact)
- Full release build (only when explicitly requested): `npm run build:release`

## Build Policy

- Every build command that uses `build:dist` auto-bumps app version.
- For generic requests like "build", "build app", or "build and run", use `npm run build`.
- Do not assume publish/deploy. Treat build as local artifact generation.
- Only run `build:release` when user explicitly asks for release/installer/full publish artifacts.

## Reporting Requirements

After any build, report:

1. App version used
2. Artifact path in `release/<version>/`
3. File timestamp and size
4. Whether app was launched after build

## Run After Build

For "build and run":

1. Run `npm run build`
2. Launch app (typically `npx electron .` unless user explicitly requests running the portable exe directly)

## Release Automation Shortcuts

Use these exact flows when the user asks:

- **Local build only**: `npm run build:dist:raw`
- **Local releasable build (bumps version + creates notes + builds portable)**: `npm run release:prepare`
- **Push only**: `git add -A && git commit -m "<message>" && git push origin main`
- **Push with release**:
  1. `git push origin main`
  2. Trigger release workflow: `gh workflow run release.yml -f releasable=true --ref main`
  3. GitHub Action `release.yml` builds portable and publishes release/tag `v<package.json version>`
- **Build with release (no push trigger needed)**:
  - Run workflow manually: GitHub Actions -> `Release` -> `Run workflow` -> `releasable=true`
  - Or with CLI: `gh workflow run release.yml -f releasable=true`

### Release Notes Rules

- Preferred release notes file: `RELEASE_NOTES_<version>.md`
- Generate scaffold file for current version: `npm run release:notes`
- The release workflow uses `RELEASE_NOTES_<version>.md` if present, otherwise auto-generates fallback notes.

## Plan Mode Workflow

- If the user sets `Mode: Plan`, do not make code or file changes in that turn unless they explicitly switch modes or approve implementation.
- In plan mode, provide implementation options, trade-offs, and concrete steps first.
- If asked "are you finished?" during plan mode, report that implementation is not finished yet and state what planning deliverables remain.
- After plan approval, move to implementation and execute the agreed steps.
