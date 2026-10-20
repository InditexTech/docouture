# Design

## Context

`docouture-release.yml` (template under `code/packages/cli/templates/workflows/`) pushes the `.release-version` bump to `__DOCOUTURE_RELEASE_BRANCH__` only. Branch names are today derived live by `lib/branch-detect.ts` (`detectBranches`) from the playbook and the workflow; `docs/package.json`'s `docouture.branching` is an advisory label that `doctor` compares. `upgrade` never touches `docs/package.json`; `branch-model` has a private `writeBranching`. `copy-template` substitutes whole-line tokens, which cannot drop a JSON line cleanly. karatetools-oss has the same bug and no docs-side reference for a fix; only PR mechanics come from its `sync-to-develop.yml` and Java `finalize-release`.

## Goals / Non-Goals

**Goals:** one declared source for flow and prerelease name readable by the workflow; a sync PR that carries the bump to the prerelease branch; repair of existing sites through `upgrade`.

**Non-Goals:** syncing non-release merges (karatetools `sync-to-develop.yml`); release-train suffix branches; changing trunk-based behavior; fixing downstream re-rendering regressions beyond what `upgrade` now does.

## Decisions

1. **`docs/package.json` is the flow source (trunk: `branching` only; git-flow: plus `prereleaseBranch`).** Cheap `node -p` read, no YAML parsing. Alternatives: playbook parsing (globs/lists/HEAD edge cases), literal compare of rendered branches (goes stale), repo variables (not set up by `docouture new`), two sources with cross-check (rejected: redundant).
2. **Helper instead of a template placeholder.** JSON cannot drop a line without comma handling and has no comments, so `copy-template` stays unchanged and `setBranching` in a shared lib does read-modify-write, key order kept, `prereleaseBranch` right after `branching`. Replaces `writeBranching` in `branch-model.ts`.
3. **`upgrade` corrects and prints, no hard fail.** Derives via `detectBranches`; the playbook stays what Antora uses and `package.json` is kept in sync by `new`, `branch-model`, `upgrade`.
4. **Sync PR, not direct push.** Follows the karatetools convention; bump stays committed on the release branch. A conflict surfaces in the PR instead of silently.
5. **Job order: `release` -> `sync-prerelease` -> `publish`, tolerant.** `publish` uses `always() && needs.release.result == 'success'` so a sync failure or skip never blocks it. Sync needs only release outputs (`branching`, `prereleaseBranch`, `version`, `existed`). Alternatives: after publish or parallel (equally valid; chosen order is the user's decision), strict (a missing App permission would leave a tag with no published docs).
6. **Failure policy:** sync failure turns the run red and comments on the merged `docs/release` PR; no `continue-on-error`.
7. **Sync job mechanics:** checkout release branch, App token with `contents`, `pull-requests`, `workflows` write; skip if prerelease branch missing or `merge-base --is-ancestor`; branch `automated/sync-docs-release-<ver>-to-<prerelease>`, `--force-with-lease`; reuse open PR; 3 retries on 5xx re-querying first; `kind/internal` if the label exists.

## Risks / Trade-offs

- `package.json` duplicates the branch name -> kept correct by the three commands; `doctor` flags drift.
- App lacks `pull-requests`/`workflows` write -> documented; run goes red but docs publish.
- Existing git-flow sites have the old workflow and no field -> one `docouture upgrade`, called out in release notes.
- Existing `new` specs assert the rendered `package.json` -> update.

## Migration Plan

Release with notes: run `docouture upgrade` on git-flow sites and grant the App PR permissions. Rollback: revert; trunk-based sites are unaffected (sync skipped, field unchanged).

## Open Questions

- Whether starter template docs or shipped skills mention the bump flow (grep `release-version`, `branching` during implementation).
