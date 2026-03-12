# Releasing Barnaby

This repo publishes in two places from the same version:

- GitHub Releases for Windows `.exe` artifacts
- npm for `@barnaby.build/barnaby`

## Prerequisites

- Use Node 22 LTS
- Work from `main`
- Make sure `package.json` and `package-lock.json` have the same version
- GitHub Actions secrets include `NPM_TOKEN`
- The release workflows exist on `main`:
  - `.github/workflows/github-release.yml`
  - `.github/workflows/npm-publish.yml`

## Release Checklist

1. Confirm the worktree is clean enough to release. Do not accidentally commit `.barnaby` state files.
2. Bump the app version in `package.json` and `package-lock.json`.
3. Generate release notes and local release artifacts:

```sh
npm run release:prepare
```

4. Review the generated `docs/releases/RELEASE_NOTES_<version>.md`.
5. Commit the version bump and release notes.
6. Push `main`.
7. Create and publish a GitHub Release with tag `v<version>`.
   Example: `v0.0.235`
8. Watch GitHub Actions.

## Expected Automation

After the GitHub Release is published:

- `Build GitHub Release Assets` should build Windows artifacts and upload them to the GitHub Release
- `Publish to npm` should run `npm test`, build the package, verify the tarball, and publish to npm

## Verification

After both workflows finish, confirm:

- The GitHub Release has downloadable `.exe` assets
- npm shows the new version for `@barnaby.build/barnaby`

## Common Failures

- `package.json` and `package-lock.json` versions do not match
- The version already exists on npm
- `NPM_TOKEN` is missing or invalid
- The GitHub Release was created before the workflow changes were on `main`
- The release tag does not match the package version

## How To Ask Codex

For a local test build only:

`Bump Barnaby to the next patch version, keep npm/GitHub publish untouched, build me a local Windows artifact I can test, and do not create a GitHub Release.`

For a full release:

`Bump Barnaby to the next patch version, prepare the release, push main, create and publish the GitHub Release, and let the existing workflows publish to GitHub assets and npm.`

Useful safety clause:

`Do not touch unrelated .barnaby files, and stop if package.json/package-lock.json are inconsistent.`
