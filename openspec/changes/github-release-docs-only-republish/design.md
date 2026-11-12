# Design

## Context

`resolveGithubRelease` (`code/packages/cli/src/lib/release-resolve.ts`) is pure: the command gathers every input and the resolver decides. Today it returns an `unsupported` error for a `pull_request` event carrying `docs/release`, before it looks at any tag. `tag-bump` already shows the pattern for list inputs: the workflow fetches tags through `gh api` and passes them as `--tags`, and the resolver filters and orders them with `highestSemver` (`src/lib/semver.ts`).

Both workflows exist twice: the template under `code/packages/cli/templates/workflows` (with `__DOCOUTURE_*__` placeholders) and the repo's own copy under `.github/workflows`, which differs only by those substitutions. The release workflow's job `if:` already keeps a PR with both `docs/release` and `release-type/*` on the Release-published path, so that path is unaffected. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- One tested implementation of "which Release is the latest" shared by the release and preview workflows.
- A docs-only `docs/release` PR under `github-release` republishes the highest stable Release's version without a manual dispatch.

**Non-Goals:**
- Changing `descriptor` or `tag-bump` behavior.
- Letting a PR choose a version under `github-release`; the Release remains the source of truth.
- Reading GitHub Release notes or any other Release metadata.

## Decisions

**Filtering and ordering live in the CLI (`--releases`), not in shell.** The workflows pass raw tags from `gh api --paginate repos/<repo>/releases --jq '.[] | select(.draft|not) | select(.prerelease|not) | .tag_name'`, joined with commas, and the resolver does prefix filtering, SemVer validation and ordering. Alternative: jq in each workflow, as the issue literally proposes. Rejected: it duplicates the logic in two workflows and is not unit-testable. The draft and GitHub-prerelease filter stays in the workflow query because that metadata is not in a tag name.

**Highest SemVer, not newest.** `highestSemver` is reused. Alternative: first item by creation date. Rejected by the user: a backport released after `1.4.0` must not make a docs-only PR republish `1.3.9`. Input order is irrelevant, so the workflows need no sorting.

**SemVer prereleases are excluded in the resolver.** A `1.5.0-rc.1` tag on a Release not flagged as GitHub prerelease would otherwise win and publish a release-candidate docs tag from a docs-only PR. "Latest Release" then means stable in both layers. Non-SemVer tags are skipped, not fatal: with a prefix they are most likely another package's release.

**`--release-tag` stays and wins over `--releases`.** The Release-published event passes exactly the Release that just published; it must not be second-guessed by a list that might contain a higher unrelated version. Only when no release tag is given does the list apply.

**Failure modes are explicit.** No usable Release names the prefix and the number of releases considered. A PR event with neither tag nor releases (an old workflow copy, or a caller that did not fetch) fails with a message about needing a published Release. Both keep the `unsupported`/`missing` error kinds so `--report` mode (preview) still reports instead of exiting non-zero.

**Preview calls the resolver.** It currently hard-codes "no version" for `github-release`. It will fetch Releases with the same query and call `docouture release resolve --report`, as it already does for `tag-bump`, so the posted version cannot drift from what the merge does. `github-release` previews therefore need `npm install`, like `tag-bump`; `descriptor` stays install-free. The `release-type/*` branch of the comment is kept ahead of the new text.

**Release workflow structure.** A step before "Resolve version" runs only for `pull_request` events when the source is `github-release` and writes the comma-joined tags to a step output; "Resolve version" passes it as `--releases`. The source and prefix are read by the CLI as today, so the workflow adds no new parsing of `docs/package.json`.

## Risks / Trade-offs

- [A repo with no prefix publishing several packages picks the highest tag across all of them] → Documented: declare `versionSourcePrefix`; the preview shows the version before merge.
- [`gh api --paginate` on a repo with very many Releases is slow] → Releases are returned newest first and a docs-only republish is rare; accepted, revisit only if it shows up.
- [Preview and release resolve at different times, so the version can differ] → The preview text already says the version can change if another Release publishes first.
- [Republishing overwrites the `docs/vX.Y.Z` tag] → That is the existing republish behavior for every source; this change adds no new force-push semantics.
- [Existing `github-release` sites with the old preview wording get a behavior change] → Release note and upgrade instructions; `docouture upgrade` refreshes the workflow templates.

## Migration Plan

Ship the CLI change and both templates together; sites pick them up with `docouture upgrade`. A site that does not upgrade keeps the old failing path (the old workflow never passes `--releases`, which now yields the clear "needs a published Release" message rather than the old wording). No rollback tooling needed: reverting the templates restores the previous behavior.
