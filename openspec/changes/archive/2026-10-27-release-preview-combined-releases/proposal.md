# Proposal

## Why

Issue #292. `docouture-release-preview.yml` comments on pull requests with wording that is wrong when a `release-type/*` label is present. A PR with `docs/release` + `release-type/*` is told "Merging this Pull Request will release the docs site", but `docouture-release.yml` backs off on the `pull_request` path and releases the docs only when a non-pre-release GitHub Release is published. A PR with `release-type/*` alone is told it "will not trigger a docs release", although the docs are released when that Release is published. If no Release is published (failure, draft, pre-release), no docs are released and nothing says so.

## What Changes

- `docouture-release-preview.yml` (CLI template and the repository's own copy) branches on `release-type/*` (ignoring it when `skip-release` is present, as `docouture-release.yml` does):
  - Combined `docs/release` + `release-type/*`: new comment F, "Docs will be released with the code release, not on merge", replaces the "release on merge" comment. Version checks and the existing-tag warning are kept.
  - `release-type/*` only, touching `docs/**`: new job and comment G, "The docs release follows the code release".
  - A and B (missing or invalid `docs/.release-version`) say the failure happens when the code Release is published, not on merge, when `release-type/*` is present.
  - The "no meaningful release" (E) and "will not trigger a docs release" (H) comments are suppressed when `release-type/*` applies.
- All preview comments (A to H, F, G) are reworded to say what happens, why, and what to do.
- `guides-releasing-a-documentation.adoc` gains a "Combined code and docs releases" section.
- `code/CHANGELOG.md` gets a Fixed entry; release notes `v1.3.2` are added (one release together with #293).

Not changing: `docouture-release.yml` logic, `docouture doctor`, and any repository-level "code release publishes a Release: yes/no" switch (follow-up).

## Capabilities

### New Capabilities
- `docs-release-preview`: which comment the docs release preview posts for each combination of `docs/release`, `release-type/*`, `skip-release`, docs changes, draft and fork state.

### Modified Capabilities

## Impact

- `code/packages/cli/templates/workflows/docouture-release-preview.yml`, `.github/workflows/docouture-release-preview.yml`
- `code/packages/cli/src/commands/new.spec.ts` (assertions on the scaffolded preview)
- `docs/src/modules/main/pages/guides-releasing-a-documentation.adoc`, release notes `1-3-2.adoc`, `release-notes/index.adoc`, `nav.adoc`, AGENTS.md ledger
- `code/CHANGELOG.md`
- Existing sites get the new wording only after `docouture upgrade`.
