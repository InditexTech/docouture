# Design

## Context

See proposal.md. Today `code-npm_node-pr-verify.yml` gates on a hand-edited `[Unreleased]` and a category label; the release job (`workflow_dispatch` ACTION=release in `code-npm_node-publish-release-and-snapshot.yml`) runs `keep-a-changelog bump` then `sanitize-changelog.mjs`. A second bump exists in the snapshot job and must stay untouched. `code/packages/antora-extensions/lib/changelog-pages.js` parses `[#N](url)` entries. Reference implementation: weavejs#1236 / PRs #1252, #1286.

## Goals / Non-Goals

**Goals:**
- One script, two modes (range, `--pr N`) sharing the same resolution code.
- Release never silently produces a wrong changelog; failures happen before tagging.

**Non-Goals:**
- Retro-rewriting existing changelog sections.
- Keeping `skip-changelog`.
- Enforcing on day one.

## Decisions

- **Port the weavejs implementation rather than rewrite it.** `/Users/jesusmpc/Inditex/weavejs/.github/scripts/changelog-from-prs.mjs` already carries the already-released guard, pagination guard, write verification, `--wrap-titles` and rate-limit retry, and keeping the two repos aligned eases future syncs. Only the label mapping, the exclusion rule and metadata are adapted. A first from-scratch version was discarded for lacking those safeguards.
- **Issue as source of truth, PR as locator.** PRs found by first-parent commits since `git describe --tags --abbrev=0 --match '[0-9]*'`, mapped via GraphQL `associatedPullRequests` (merged, base = `--branch`) to `closingIssuesReferences`. Alternative: date ranges, rejected as fragile across hotfix branches (`main-*`).
- **Link to the issue, dedupe by issue number.** Handles multi-PR issues; verified compatible with `changelog-pages.js`.
- **Title verbatim, reusing `sanitize-changelog.mjs` normalisation.** Wording fixes happen by editing the issue.
- **Exemption = `skip-release` + Dependabot only.** `skip-changelog` dropped: with the issue as sole input there is no multi-PR label conflict, and `kind/internal`/`kind/epic` is the single "no entry" mechanism.
- **Warn-only rollout via `CHANGELOG_LINK_ENFORCE`**, flipped by a follow-up PR after one end-to-end release.
- **Generate step placed before `keep-a-changelog bump` in the release job only**; `fail-on-empty-release-notes: false` is already set, verify an empty `[Unreleased]` is tolerated.
- **Plain Node (.mjs), GraphQL via `fetch` with retry+backoff on 5xx/429/rate limits**, tests with `node --test` and an injected `fetch`, matching existing `.github/scripts` style. Needs only `GITHUB_TOKEN`, no `gh`.
- **Exclusion rule differs from weavejs:** weavejs drops any issue labelled `internal`; here `kind/internal`/`kind/epic` exclude an issue only when no real `kind/*` category is present, preserving the convention that a real category wins.
- **Release preview in two passes** (`--to HEAD^1 --branch <base>`, then `--pr N`) instead of one `--include-pr`, so the preview includes entries pending from `skip-release` PRs and the PR's own report.

## Risks / Trade-offs

- [Merge strategy assumption: first-parent maps to PRs] -> confirm the repo's merge strategy; validate with `--dry-run` on `1.2.0..1.3.0` and `1.3.1..1.3.2` against hand-written sections.
- [Hand-written sections up to 1.3.2 link PRs, generated ones link issues, so the already-released guard cannot match old entries] -> only matters for issues released before the first generated release; accepted.
- [Always-on check not in required checks, cf. "Code / Verify never reports"] -> list branch-protection update as a manual step in the PR.
- [Fork PR token is read-only] -> job-summary fallback.
- [Issue link format changes from PR to issue] -> confirm `changelog-pages.js` output.
- [No-issue PRs (#232, #249, #250, #294 style)] -> warn-only period, then `skip-release` bypass.
- [Legacy `skip-changelog` labels linger] -> ignored; retire label manually.
- [Maintenance branches `main-*`] -> `git describe` resolves by ancestry; test explicitly.
