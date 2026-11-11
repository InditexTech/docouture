# Proposal

## Why

On a repo whose release branch is covered by a ruleset requiring pull requests, the `Bump release descriptor` step of `docouture-release.yml` is rejected (GH013) even though the GitHub App is on the ruleset's bypass list. The `Git app token` step in the `release` job narrows the installation token with `owner`, `repositories` and `permission-contents`; with those inputs removed, the same push is accepted as a bypassed violation. The tag push succeeds but `docs/.release-version` is left on the released version. See InditexTech/docouture#298.

## What Changes

- In the `release` job of `docouture-release.yml`, the `Git app token` step no longer sets `owner`, `repositories` or `permission-contents`.
- The workflow header's "Docouture hardening" note stops claiming the token is narrowed and states why the release job's token is not narrowed (loses ruleset bypass, #298).
- The same edits are applied to this repository's own rendered copy, `.github/workflows/docouture-release.yml`.
- The releasing guide documents the tradeoff: narrowed tokens give least privilege but can lose ruleset bypass on protected branches.
- `publish` (pushes `gh-pages`) and `sync-prerelease` (pushes an `automated/sync-*` branch and opens a PR) keep their narrowed tokens: neither writes to the release branch.

## Capabilities

### New Capabilities
- `docs-release-app-token`: the credential the release job uses to push the release tag and the descriptor bump to a protected release branch.

### Modified Capabilities

## Impact

- `code/packages/cli/templates/workflows/docouture-release.yml` (template, scaffolded by `docouture new` / `docouture upgrade`)
- `.github/workflows/docouture-release.yml` (this repo's copy)
- `docs/src/modules/main/pages/guides-releasing-a-documentation.adoc`
- Security: the release job's App token gets all of the App's installation permissions instead of `contents: write` on one repository. Sites that already patched their copy (e.g. weavejs#1285) converge with upstream after `docouture upgrade`.
- Root cause of the lost bypass is unconfirmed upstream; the fix is empirical.
