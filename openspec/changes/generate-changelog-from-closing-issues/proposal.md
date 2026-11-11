# Proposal

## Why

Every PR touching `code/**` must hand-edit `[Unreleased]` in `code/CHANGELOG.md`. This causes merge conflicts on the same lines, forgotten entries, and drift between PR title, issue title and changelog line. The entry format is already mechanical. InditexTech/weavejs solved this (weavejs#1236) by generating entries at release time from the issues merged PRs close. See InditexTech/docouture#300.

## What Changes

- Port `.github/scripts/changelog-from-prs.mjs` (and its tests) from InditexTech/weavejs#1252/#1286/#1288, adapted to this repo's `kind/*` labels and a Documentation section. Two modes: range mode (last numeric tag..`--to`, restricted to PRs merged into `--branch`, writes `[Unreleased]`) and `--pr N` mode (read-only preview/check), plus `--dry-run` (compares with the hand-written `[--to]` section), `--report`, `--enforce` and `--wrap-titles`.
- Entries are generated from each merged PR's closing issues (GitHub `closingIssuesReferences`): `- [#N](.../issues/N) <issue title verbatim>`, deduplicated by issue number. Section is chosen from the issue's `kind/*` label (first match wins); no label falls back to Changed with a warning; `kind/internal`/`kind/epic` produce no entry, even with another `kind/*` label, but are listed in the report.
- Every PR must close an issue (closing keyword or Development sidebar). Bypass: the `skip-release` label; Dependabot is exempt. A bypassed PR with no issue gets no entry; a `skip-release` PR that closes an issue still gets its entry.
- **BREAKING (contributor workflow)**: contributors no longer edit `code/CHANGELOG.md`. The `skip-changelog` label is dropped entirely and has no effect; the issue's labels alone decide whether and where an entry appears.
- The script skips an issue already listed in an earlier released section (with a warning), verifies before writing that only `[Unreleased]` changes and each added entry appears exactly once, and fails instead of silently truncating when a GitHub pagination limit is hit.
- Add an always-on `code-changelog-check.yml` workflow (not path-filtered, `issues: read`, runs the script's tests, warn-only first via `CHANGELOG_LINK_ENFORCE`, job summary for fork PRs).
- Release job in `code-npm_node-publish-release-and-snapshot.yml` runs the script before `keep-a-changelog bump`; the snapshot job is untouched. Script errors fail the job before the tag is created.
- Remove the hand-edit gates in `code-npm_node-pr-verify.yml` ("Require CHANGELOG.md update", "Require a changelog category label", `skip-changelog` resolution) and replace `code-release_preview.yml`'s "CHANGELOG.md has changes" check with a two-pass generation (entries pending on the base branch, then this PR's), titles wrapped in code spans in the comment, and a job-summary preview for fork PRs.
- Add `.github/pull_request_template.md` with a `Closes #` prompt.
- Update `CONTRIBUTING.md`, the `changelog` skill, `AGENTS.md` (rewrite the CHANGELOG critical-rule paragraph), the `code/CHANGELOG.md` intro, and `.github/workflows/docs/*`.
- Reference implementation: `/Users/jesusmpc/Inditex/weavejs` (script, tests, `code-changelog-check.yml`, release job, release preview, docs).
- Rollout: single PR merged with `skip-release`; validate with `--dry-run` on `1.2.0..1.3.0` and `1.3.1..1.3.2`; warn-only first, a follow-up PR enforces.

## Capabilities

### New Capabilities
- `changelog-generation`: how `[Unreleased]` entries are derived at release time from merged PRs' closing issues, and how PRs are checked/previewed against that rule.

### Modified Capabilities

## Impact

- Code: new `.github/scripts/changelog-from-prs.mjs` (+ tests); `.github/scripts/sanitize-changelog.mjs` now exports `normalizeInvisibleWhitespace`.
- Workflows: `code-npm_node-pr-verify.yml`, `code-npm_node-publish-release-and-snapshot.yml`, `code-release_preview.yml`, new `code-changelog-check.yml`.
- Docs/meta: `CONTRIBUTING.md`, `AGENTS.md`, `.opencode/skills/changelog/SKILL.md`, `code/CHANGELOG.md` intro, `.github/workflows/docs/*`, new PR template.
- Manual (outside repo): add the new check to branch protection required checks; retire the `skip-changelog` label and update the `skip-release` label description.
- Compat: new entries link issues (`issues/N`) instead of PRs (`pull/N`); `changelog-pages.js` parses `[#N](url)` and must keep working.
