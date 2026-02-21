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

## Plan Mode Workflow

- If the user sets `Mode: Plan`, do not make code or file changes in that turn unless they explicitly switch modes or approve implementation.
- In plan mode, provide implementation options, trade-offs, and concrete steps first.
- If asked "are you finished?" during plan mode, report that implementation is not finished yet and state what planning deliverables remain.
- After plan approval, move to implementation and execute the agreed steps.
