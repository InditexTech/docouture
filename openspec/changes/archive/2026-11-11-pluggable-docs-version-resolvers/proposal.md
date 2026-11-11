## Why

In versioned (Full History) mode every release version comes from `docs/.release-version`, which duplicates the `docs/v*` tags Antora already treats as the source of truth. Maintaining it is costly: a post-release bump pushed to the protected release branch (needing an App token with ruleset bypass, #298), a `sync-prerelease` job under git-flow that exists only to carry that bump, a hard failure when a `docs/release` PR did not commit the file, and a `release: published` trigger that ignores `release.tag_name`. docouture is code-agnostic, so the fix cannot be "read the version from the code's manifest": each site must choose where its docs version comes from. This is the second half of #299; the first half (`release-resolve-descriptor`, archived) moved descriptor resolution and SemVer validation into `docouture release resolve`.

## What Changes

- Add `docouture.versionSource` to `docs/package.json` (next to `branching`/`prereleaseBranch`) with three built-in resolvers: `descriptor` (default, today's behavior), `github-release` (`release.tag_name`, optionally stripping `docouture.versionSourcePrefix`) and `tag-bump` (latest `docs/v*` tag plus a bump). An absent value means `descriptor`.
- `tag-bump` bumps patch on `docs/release`, minor on `docs/release-minor`, major on `docs/release-major` (highest wins when several are set). Ordering is semver-aware, including prerelease tags, and a bump from a prerelease tag follows `semver.inc` (`1.2.0-rc.1` patch becomes `1.2.0`). With no existing `docs/v*` tag it requires an explicit version through `workflow_dispatch`.
- Extend `docouture release resolve` with the new resolvers and inputs (event, release tag, PR labels, tags) and a machine-readable signal telling the workflow whether the descriptor bump and prerelease sync apply.
- Release workflow: the bump step and the `sync-prerelease` job run only under `descriptor`. Trigger conditions also match `docs/release-minor` and `docs/release-major`. Under `github-release`, a merged `docs/release` PR fails with a clear message.
- Preview workflow: reads `versionSource` with `node`. `descriptor` stays on bash with no install, `github-release` posts a fixed "docs follow the code release" message, and `tag-bump` installs dependencies and calls `release resolve` to show the version "if merged now".
- `docouture new` (versioned mode only): wizard prompt and `--version-source` flag, default `descriptor`, each option explained. For `tag-bump` it prints the `gh label create` commands for `docs/release-minor` and `docs/release-major`. Standalone sites are unaffected.
- `docouture upgrade`: on a versioned site without `versionSource`, write `"versionSource": "descriptor"` (idempotent, no behavior change) and print a pointer to the new command; no prompt. `upgrade` and `doctor` warn when the running CLI differs from the project's resolved dependency.
- New command `docouture version-source [descriptor|github-release|tag-bump] [--dry-run] [--version X.Y.Z]`, modeled on `branch-model`. It refuses standalone sites, sets `versionSource`, creates `docs/.release-version` (seeded with the next patch of the latest tag, or `--version`) for `descriptor`, and removes it for the others (warning if it held a pending value), printing the label commands for `tag-bump`.
- `docouture doctor`: show the active resolver; warn when `github-release`/`tag-bump` still has `.release-version`, when `descriptor` has no file, and when the installed CLI lacks `release resolve`.
- Docs, the `docouture-docs-versioning` skill, the scaffolded `AGENTS.md` and `getting-started` page, and release notes.

Non-goals: custom (script) or npm-package resolvers; automatic migration between resolvers during `upgrade`; standalone mode.

## Capabilities

### New Capabilities
- `docs-version-source`: the `versionSource` declaration in `docs/package.json` and how `new`, `upgrade`, `doctor` and `version-source` scaffold, backfill, check and switch it.

### Modified Capabilities
- `docs-release-resolve`: the `github-release` and `tag-bump` resolvers, their inputs, bump semantics, tag ordering, and the signal for descriptor-only steps.
- `docs-release-preview`: version and comment behavior under each source, and release-label handling for `docs/release-minor` and `docs/release-major`.
- `docs-release-prerelease-sync`: the bump and sync apply only under `descriptor`; the sync is skipped otherwise.

## Impact

- `code/packages/cli`: `src/commands/{release,new,upgrade,doctor}.ts`, new `src/commands/version-source.ts`, `src/lib/{release-resolve,doctor-checks}.ts` plus a new `package-version-source.ts`, `bin.ts`, `completion.ts`, the workflow templates (`docouture-release.yml`, `docouture-release-preview.yml`), starter `getting-started.adoc`, `agent-support/AGENTS.md`.
- `.github/workflows/docouture-release*.yml` (this repo's own copies).
- `docs/src/modules/main/pages/` (CLI reference, releasing and branching guides, release notes) and `skills/docouture-docs-versioning`.
- Existing sites keep working unchanged on `descriptor`. Sites must install the new CLI before upgrading workflows, since workflows run the project's installed CLI.
