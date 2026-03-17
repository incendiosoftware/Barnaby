# Contributing to Barnaby

Thanks for your interest in contributing.

## Ground Rules

- All changes must come through pull requests.
- Do not push directly to `main`.
- Keep pull requests focused and small where possible.
- Add or update tests for behavior changes.

## Development

- Install dependencies: `npm install`
- Start dev mode: `npm run dev`
- Run tests: `npm run test`
- Build: `npm run build`

## Releasing

**Do NOT run `npm publish` locally.** Publishing is handled entirely by GitHub Actions using repo secrets. Local npm tokens are not used.

To release a new version:

1. `npm run package` — bumps version and builds the portable artifact.
2. Write release notes at `docs/releases/RELEASE_NOTES_{version}.md`.
3. `node scripts/validate-version-files.mjs` — confirms package.json and package-lock.json versions match.
4. Commit: `Release v{version}`.
5. `git push origin HEAD`
6. `git tag v{version}` then `git push origin v{version}`
7. `gh release create v{version} --title "Barnaby v{version}" --notes-file "docs/releases/RELEASE_NOTES_{version}.md" --target main`

Creating the GitHub Release triggers two workflows:

- **`.github/workflows/npm-publish.yml`** — builds, tests, and publishes `@barnaby.build/barnaby` to npm (uses the `NPM_TOKEN` repo secret).
- **`.github/workflows/github-release.yml`** — builds Windows portable and setup EXEs and uploads them to the release.

Monitor progress at https://github.com/incendiosoftware/Barnaby/actions.

## Pull Request Checklist

- [ ] Linked issue or clear problem statement
- [ ] Tests added/updated where relevant
- [ ] No secrets or credentials included
- [ ] Documentation updated for user-facing changes

## Security

For security issues, follow `SECURITY.md` and do not file a public bug report.
