# Tasks

## 1. Templates and scaffolding

- [x] 1.1 Delete `templates/starter/scripts/check-links.mjs`; drop the `check-links` script, `linkinator` and `docouture.checkLinks` from `templates/starter/package.json`; verify `docouture new` output (see `new.spec.ts`) contains none of them
- [x] 1.2 Remove the `Check links` step and its comments from the three workflow templates; verify `grep -ri check-links code/packages/cli/templates` is empty
- [x] 1.3 Remove `repoIgnoreGlob` (helper in `new.ts`, `TemplateValues` field and token in `copy-template.ts`, stubs in `upgrade.ts` and `branch-model.ts`); verify `pnpm nx test cli` and typecheck pass

## 2. `docouture upgrade` cleanup

- [x] 2.1 Stop copying `starter/scripts`; delete `docs/scripts/check-links.mjs` (and the directory if empty) with plan/report and `--dry-run` support; verify new tests in `upgrade.spec.ts` replacing the old check-links.mjs ones
- [x] 2.2 Add a `package.json` cleanup helper removing the `check-links` script, `docouture.checkLinks` and unused `linkinator`, preserving indent; verify unit tests for: all present, `linkinator` used by another script (kept and reported), already clean (no-op)
- [x] 2.3 Print the `<pm> install` hint when dependencies changed and warn on leftover `check-links` references in `.github/`; verify tests for both outputs
- [x] 2.4 Update the stale comments in `upgrade.ts` about `check-links.mjs`; verify no `check-links` mentions remain in `code/packages/cli/src` except the cleanup logic

## 3. Dogfood and docs

- [x] 3.1 Remove `Check links` steps from this repo's `.github/workflows/docouture-{pr-verify,release,publish}.yml`, `docs/scripts/check-links.mjs`, the `check-links` script/`linkinator`/`checkLinks` from `docs/package.json`, the eslint ignore in `code/eslint.config.mjs`, then refresh `docs/pnpm-lock.yaml`; verify `pnpm install --frozen-lockfile` and `docouture build` succeed in `docs/`
- [x] 3.2 Update `reference-cli.adoc` (upgrade section) and `reference-integrations.adoc`; add `release-notes/1-3-0.adoc` (breaking removal, upgrade steps), nav entry and AGENTS.md ledger rows; verify `docouture build` passes
- [x] 3.3 Add the `code/CHANGELOG.md` `[Unreleased]` entry following the changelog skill; verify the pr-verify CHANGELOG gate rules are met

## 4. Integration

- [x] 4.1 After a snapshot CLI exists, run `docouture upgrade --dry-run` then `docouture upgrade` against an old-style scaffold and this repo; verify the reported changes and a clean `build`
