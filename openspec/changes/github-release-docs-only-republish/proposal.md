## Why

Under `docouture.versionSource: "github-release"`, a docs-only pull request cannot release the docs: a merged PR carrying `docs/release` makes `docouture release resolve` fail with `unsupported` after the merge, and the only way to publish a docs-only fix is a manual `workflow_dispatch` with an explicit version. A PR carries no version under this source, but the version can come from the highest published GitHub Release, which the resolver already knows how to parse (prefix strip, SemVer check). Follow-up to #299. Closes #313.

## What Changes

- `docouture release resolve` gains a `--releases <tag,tag,...>` input: the tags of the repository's published (non-draft, non-prerelease) GitHub Releases. Under `github-release`, a `pull_request` event carrying `docs/release` resolves to the highest SemVer among them instead of failing. The existing `--release-tag` (the Release that just published) keeps working and takes precedence when both are given.
- Selection: keep tags that start with `docouture.versionSourcePrefix` (all tags when no prefix is declared), strip the prefix, drop anything that is not SemVer or is a SemVer prerelease, pick the highest. Input order does not matter.
- With no usable tag, the command still fails, with a message that names the prefix and how many releases were considered.
- `docouture-release.yml` (repo copy and `code/packages/cli/templates/workflows` template): on a merged `docs/release` PR under `github-release`, list the repository's published Releases with `gh api` and pass the tags as `--releases`. The docs tag `docs/vX.Y.Z` is force-recreated as for any republish; no descriptor bump and no git-flow sync.
- `docouture-release-preview.yml`: under `github-release`, a `docs/release` PR says merging republishes docs `vX.Y.Z` (the highest Release). A PR without the label is no longer pointed at a failing path. If a `release-type/*` label is also present the existing "docs follow the code release" wording stays.
- Docs: a scenario-by-source matrix (code + docs PR, docs-only PR, `workflow_dispatch` against `descriptor` / `tag-bump` / `github-release`) in `guides-releasing-a-documentation.adoc`, mirrored in `skills/docouture-docs-versioning`, a release note, the `AGENTS.md` documentation-state ledger, and the `reference-cli.adoc` flag list.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `docs-release-resolve`: the `github-release resolver` requirement no longer fails for a `docs/release` pull request when releases are supplied, and gains the highest-SemVer selection rules and the `--releases` input; the `Resolve command interface` requirement lists the new input.
- `docs-release-preview`: the `Preview by version source` requirement states the republished version under `github-release` instead of "no version".

## Impact

- Code: `code/packages/cli/src/lib/release-resolve.ts`, `src/commands/release.ts` (flag parsing, usage text, report output), and their specs (`release.spec.ts` and the resolver tests).
- Workflows: `.github/workflows/docouture-release.yml` and `docouture-release-preview.yml`, plus the two templates in `code/packages/cli/templates/workflows`. The repo copy of the release workflow already differs from the template; the change keeps each consistent with its own file.
- Docs and skills: `docs/` pages named above, `skills/docouture-docs-versioning`, `AGENTS.md` ledger.
- Behavior change for existing `github-release` sites: a `docs/release` PR that used to fail now republishes. No breaking change for `descriptor` or `tag-bump`.
- Needs no new permissions: listing Releases works with the read-only `GITHUB_TOKEN` already available to both workflows.

## Assumptions

- SemVer-prerelease tags (for example `1.5.0-rc.1`) on a non-prerelease GitHub Release are excluded so "latest" means stable; to be confirmed during review.
- Tags that do not match the prefix, or are not SemVer, are skipped silently rather than failing.
