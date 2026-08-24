# `code-release-preview`

[`code-release_preview.yml`](../code-release_preview.yml) is the same workflow (name, filename, job shape, triggers) as weave.js's workflow of the same name, adapted to pdocs' own `release-type/*` label + `CHANGELOG.md` convention (already used identically by [`code-npm_node-publish-release-and-snapshot.yml`](../code-npm_node-publish-release-and-snapshot.yml)) and to pdocs being trunk-based only.

## Triggers

Any pull request targeting `main`/`main-*`, on `labeled`, `synchronize`, `ready_for_review` or `opened`.

## Where does it run?

`ubuntu-24.04` GitHub infrastructure.

## How does it work?

Three jobs, gated by a shared `check-changes-in-paths` job (`dorny/paths-filter` on `code/**` and `.github/workflows/code**`, same paths `code-npm_node-pr-verify.yml` requires a `CHANGELOG.md` entry for) and by whether the PR carries a `release-type/*` label:

- Label present + matching path changes → `release-preview`.
- Label present, no matching path changes → `release-preview-no-code-changes`.
- No label, matching path changes → `release-preview-no-release-labels`.

None of these jobs release anything — they only comment on the PR with what _would_ happen, so a reviewer can catch a missing `CHANGELOG.md` entry or a missing label before merge, the same way weave.js's does.

## Divergences from weave.js's workflow of the same name

- **No merge-strategy preview**: weave.js's `release-preview` job also computes and comments a "Merge Strategy" line (squash vs. merge-commit), driven by a `DEVELOPMENT_FLOW` repo variable and hotfix-branch-name heuristics for its gitflow-style branching. pdocs is trunk-based only (main + PRs, no long-lived develop/hotfix branches to choose a strategy between — see `code-npm_node-publish-release-and-snapshot.md`'s "No gitflow sync-to-develop PR" note), so that step, its "Check merge strategy" logic and its comment line are dropped entirely.
- **No `DEVELOPMENT_FLOW`-gated no-labels job**: weave.js only shows `release-preview-no-release-labels` when `vars.DEVELOPMENT_FLOW != 'trunk-based-development'`. Since pdocs is always trunk-based, this job always fires when a matching-path PR carries no `release-type/*` label — no variable to gate on.
- **Explicit `GITHUB_TOKEN`/`pull-requests: write` per job**: weave.js's workflow leaves these implicit (no `permissions:` block, no job-level `env:` for the token in its `release-preview` job's final comment step). Ported here with an explicit `permissions: pull-requests: write` and job-level `GITHUB_TOKEN` env in all three jobs, matching the least-privilege style `code-npm_node-publish-release-and-snapshot.yml` already uses.
- **Path filter**: `code/**` and `.github/workflows/code**`, not weave.js's bare `code/**` — matching the filter `code-npm_node-pr-verify.yml` already uses for its own `CHANGELOG.md` check.
- **Action pins**: `dorny/paths-filter` and `release-flow/keep-a-changelog-action` are pinned to the same commit SHAs `code-npm_node-publish-release-and-snapshot.yml` already uses, rather than weave.js's own (potentially different) pins.

## Jobs

- ### `check-changes-in-paths`

  Runs `dorny/paths-filter` against `code/**` and `.github/workflows/code**`, exposing whether either path changed as `outputs.detected`. Only runs at all when the PR is non-draft or already carries a `release-type/*` label.

- ### `release-preview`

  Runs when a `release-type/*` label is present and matching paths changed.

  - Checkout the merge commit.
  - Map the `release-type/*` label to a semver bump (`hotfix`/`multi-hotfix`/`patch` → `patch`, `minor` → `minor`, `major` → `major`).
  - Fail with a PR comment if `code/CHANGELOG.md` has no diff against the previous commit.
  - Compute the next version via `release-flow/keep-a-changelog-action` (dry-run bump, same action the real release workflow uses).
  - Comment on the PR with the version that will be released and the `[Unreleased]` entries that will move under it.

- ### `release-preview-no-code-changes`

  Runs when a `release-type/*` label is present but neither `code/**` nor `.github/workflows/code**` changed. Comments that this PR will not trigger a release.

- ### `release-preview-no-release-labels`

  Runs when matching paths changed but no `release-type/*` label is present. Comments that this PR needs a `release-type/*` label to trigger a release.
