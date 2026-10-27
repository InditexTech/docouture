# Tasks

## 1. Preview workflow (template)

- [x] 1.1 In `code/packages/cli/templates/workflows/docouture-release-preview.yml`, add the T signal (`release-type/*` without `skip-release`) as an env var and widen `release-preview`'s `if:` to `R && (D || T)`; verify by reading the `if:` against the gate table in design.md.
- [x] 1.2 In the "Comment on PR" step, rewrite A and B in the friendlier wording, with the "when the code Release is published, not on merge" sentence when T is set; verify against the Version errors scenarios in `specs/docs-release-preview/spec.md`.
- [x] 1.3 In the same step, post F (instead of C) when T is set and keep the existing-tag warning, rewritten as D; rewrite C and D; verify against the Docs release on merge and Combined code and docs release scenarios.
- [x] 1.4 Add `&& !T` to `release-preview-no-docs-changes` and reword E; add `&& !T` to `release-preview-no-release-label` and reword H; verify no label combination in the spec is matched by two comment jobs.
- [x] 1.5 Add the `release-preview-code-release` job (G) with gate `T && !R && D && !draft`, `pull-requests: write` only, same step shape as the no-release-label job, and update the file's header comment; verify against the Code release only scenarios.
- [x] 1.6 Update `code/packages/cli/src/commands/new.spec.ts` so the scaffolded preview is asserted to contain the new job and the F heading; run `pnpm nx test cli` from `code/` and verify it passes.

## 2. Preview workflow (this repository's copy)

- [x] 2.1 Apply the same edit to `.github/workflows/docouture-release-preview.yml`, keeping `branches: ['main*']`; verify `diff` between it and the template shows only the branch filter.
- [x] 2.2 Check whether trigger #3 in `code/packages/cli/templates/workflows/docouture-release.yml`'s header (and the repo copy) needs a one-line pointer to the preview; add it only if it reads as wrong or incomplete, then verify the two copies still match.

## 3. Documentation

- [x] 3.1 Add the "Combined code and docs releases" section to `docs/src/modules/main/pages/guides-releasing-a-documentation.adoc`: the `release: published` trigger (non-pre-release only), why `docs/release` + `release-type/*` backs off, why `skip-release` is not the answer, failure modes (no Release, draft, pre-release, bad version found after the code release, unvalidated version for `release-type/*`-only PRs) and manual recovery via `workflow_dispatch`; verify with `docouture build` (or the docs site build) with no errors.
- [x] 3.2 Add `docs/src/modules/main/pages/release-notes/1-3-2.adoc` covering this fix and #293, with "Do this": run `docouture upgrade`, review and commit `.github/workflows/`; add it to `release-notes/index.adoc` and to `nav.adoc` above v1.3.1; verify the docs build resolves the xrefs.
- [x] 3.3 Add the ledger row for `release-notes/1-3-2.adoc` to AGENTS.md's documentation-state table; verify the guide's row is still accurate.

## 4. Changelog and final checks

- [x] 4.1 Add `- [#PR](URL) \[tooling] Release preview misleads on combined code+docs releases (release-type/* without a published Release)` under `### Fixed` in `[Unreleased]` of `code/CHANGELOG.md` (issue #292 carries `kind/bug`); verify against the changelog skill's format.
- [x] 4.2 Run lint and tests for the cli project and the docs build from `code/`; verify everything passes and `openspec validate release-preview-combined-releases` is clean.
