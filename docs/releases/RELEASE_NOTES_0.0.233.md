# Barnaby 0.0.233 - Release Notes

**Released:** March 2026

## Added

- GitHub Actions trusted publishing workflow for npm releases.
- GitHub Release workflow to build and attach Windows desktop artifacts.

## Changed

- Bumped Barnaby package version to `0.0.233`.
- Added npm package metadata for repository, homepage, and issue links.
- Included README screenshot assets in the published npm tarball.
- Updated GitHub Actions Node.js runtime to 22 for supported builds.

## Fixed

- npm package README asset links now resolve on the npm package page.
- Local `publish:npm` now builds the publishable package instead of the desktop bundle.

## Notes

- Artifact: `release/0.0.233/Barnaby_0.0.233_portable.exe`
