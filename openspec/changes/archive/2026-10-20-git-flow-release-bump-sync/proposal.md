## Why

Under git-flow, `docouture-release.yml` (versioned mode) bumps `docs/.release-version` and pushes it only to the release branch. The prerelease branch (`develop`) never receives the bump, so it goes stale, the next `develop` -> `main` release PR can conflict on that file, and a bad resolution could silently re-release an old version. Issue #238 (PR #264).

## What Changes

- `docs/package.json` becomes the single declared source of the flow: trunk-based `{ "branching": "trunk-based" }`; git-flow `{ "branching": "git-flow", "prereleaseBranch": "<name>" }`.
- New shared helper `setBranching(file, branching, prereleaseBranch?)` (JSON read-modify-write, key order kept, field removed for trunk-based), used by `new`, `branch-model` and `upgrade`. `copy-template` is unchanged.
- `docouture upgrade` derives branches via `detectBranches()` and, for git-flow, writes/corrects both fields in `docs/package.json` (backfills older sites) and prints a note.
- `docouture doctor` reports a missing or mismatched `prereleaseBranch` under git-flow.
- `docouture-release.yml` template: the `release` job exports `branching`, `prereleaseBranch`, `version`, `existed`; a new `sync-prerelease` job (before `publish`) opens a PR from the release branch into the prerelease branch carrying the bump. `publish` runs after `release` succeeded even if sync failed (tolerant); a sync failure still turns the run red.
- Mirror in this repo's `.github/workflows/docouture-release.yml` (sync skipped, trunk-based); fix wording in `docouture-publish-prerelease.yml`.
- Docs, help text, CHANGELOG and AGENTS.md ledger updated.

## Capabilities

### New Capabilities
- `cli-branching-declaration`: how the CLI declares and maintains the flow and prerelease branch in `docs/package.json`.
- `docs-release-prerelease-sync`: how the release workflow propagates the `.release-version` bump to the prerelease branch under git-flow.

### Modified Capabilities

## Impact

- `code/packages/cli`: `src/commands/{new,branch-model,upgrade}.ts`, `src/lib/doctor-checks.ts`, new lib helper, `bin.ts` COMMAND_INFO, `templates/workflows/docouture-release.yml`, `docouture-publish-prerelease.yml`, specs.
- `.github/workflows/docouture-release.yml`.
- Docs: `guides-branching-model`, `guides-releasing-a-documentation`, `reference-cli`, release notes, starter/skills copies if they mention the flow.
- GitHub App needs `pull-requests: write` (and likely `workflows: write`). Existing git-flow sites need one `docouture upgrade`.
