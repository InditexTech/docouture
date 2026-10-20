## 1. Shared helper

- [x] 1.1 Add `setBranching(file, branching, prereleaseBranch?)` in `code/packages/cli/src/lib/` (JSON read-modify-write, key order kept, `prereleaseBranch` right after `branching`, removed for trunk-based) with a spec covering add, correct, remove and key order; verify with `pnpm nx test cli`.

## 2. CLI commands

- [x] 2.1 `new.ts`: call the helper after the template copy so git-flow gets `prereleaseBranch`, trunk-based none; update `new.spec.ts`; verify tests pass.
- [x] 2.2 `branch-model.ts`: replace private `writeBranching` with the helper (add on git-flow, remove on trunk); update `branch-model.spec.ts`; verify tests pass.
- [x] 2.3 `upgrade.ts`: derive via `detectBranches`, for git-flow write/correct both fields in `docs/package.json` and print a note, no hard fail; legacy and already-correct cases in `upgrade.spec.ts`; verify tests pass.
- [x] 2.4 `doctor-checks.ts`/`doctor.ts`: report missing or mismatched `prereleaseBranch` under git-flow with `docouture upgrade` as fix; update specs; verify tests pass.
- [x] 2.5 Update `COMMAND_INFO` in `bin.ts` for `upgrade`, `branch-model`, `doctor` and `reference-cli.adoc` together; verify the docs build (`docouture build`) and CLI help output.

## 3. Release workflow

- [x] 3.1 Template `docouture-release.yml`: export `branching`, `prereleaseBranch`, `version`, `existed` as `release` job outputs, read from `docs/package.json` (absent = trunk-based; git-flow without `prereleaseBranch` fails pointing at `docouture upgrade`); update header comment.
- [x] 3.2 Add `sync-prerelease` job (needs `release`; git-flow, versioned, not a republish) with App token (`contents`, `pull-requests`, `workflows` write), skip checks, `automated/sync-docs-release-<ver>-to-<prerelease>` branch with `--force-with-lease`, PR reuse, 5xx retry, `kind/internal` label, failure comment on the merged `docs/release` PR.
- [x] 3.3 Change `publish` to `needs: [release, sync-prerelease]` with `if: always() && needs.release.result == 'success'`; add a render test asserting the git-flow output contains the sync job and trunk-based skips it; verify with `actionlint` and the CLI specs.
- [x] 3.4 Mirror the workflow in `.github/workflows/docouture-release.yml` (trunk-based, sync skipped) and fix the "straight to the release branch" wording in `docouture-publish-prerelease.yml` (template and repo copy); verify `actionlint`.

## 4. Documentation and metadata

- [x] 4.1 Grep `release-version`, `branching`, `prerelease branch` in `docs/`, `code/packages/cli/templates/starter`, `code/authoring-guides` and `skills/` to resolve the design's open question; list hits in the PR.
- [x] 4.2 Update `guides-branching-model.adoc` (sync PR step, new field, rewrite the "never persisted" section and workflow table) and `guides-releasing-a-documentation.adoc` (sync PR, App permissions, red-run-but-published behavior); update any hit from 4.1 and keep skills in sync per `skills-authoring`; verify `docouture build` passes.
- [x] 4.3 Add a migration note (run `docouture upgrade` on git-flow sites, grant App PR permissions) to release notes, a `[Unreleased]` entry in `code/CHANGELOG.md` per the `changelog` skill, and refresh the AGENTS.md documentation-state ledger.
