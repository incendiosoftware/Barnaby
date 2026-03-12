# Barnaby 0.0.235 - Release Notes

**Released:** March 2026

## Added

- Git operation preflight checks and coverage to catch unsafe release and workflow states earlier.
- A documented local release flow in `RELEASING.md`, including version validation and local Windows artifact preparation.

## Changed

- Release notes are now generated under `docs/releases/` instead of the repository root.
- The Windows packaging configuration and desktop workflow UI were refined alongside the `0.0.235` build.

## Fixed

- `package.json` and `package-lock.json` version alignment is now validated before running release preparation.
- The `0.0.235` local portable Windows build was regenerated at the expected artifact path.

## Notes

- Artifact: `release/0.0.235/Barnaby_0.0.235_portable.exe`
