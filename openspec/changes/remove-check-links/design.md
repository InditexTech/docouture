# Design

## Context

`docouture upgrade` today only overwrites: workflows and `docs/scripts/` are re-copied from templates, playbooks get `failure_level` patched via a plan/report flow (`setFailureLevel`), and `docs/package.json` is touched only for `docouture.branching` (`setBranching`). There is no file-deletion path. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Fresh scaffolds contain no check-links artifacts.
- `upgrade` cleans existing sites automatically, reports each change, and is safe on customised sites.

**Non-Goals:**
- No replacement link checker, no opt-in mode.
- `upgrade` does not run the package manager install.
- No new OpenSpec capability.

## Decisions

1. **Workflows need no upgrade logic.** They are regenerated wholesale, so dropping the template step removes it from existing sites.
2. **`upgrade` stops copying `starter/scripts`.** With the script deleted from the template, `starter/scripts` is removed; the copy of `scriptsTemplateDir` and its dry-run plan go away. Upgrade instead deletes `docs/scripts/check-links.mjs` if present, and removes `docs/scripts/` only if it ends up empty.
3. **`package.json` edit mirrors `setBranching`.** A helper parses `docs/package.json`, deletes `scripts["check-links"]` and `docouture.checkLinks` (dropping `docouture` keys left empty is not done; only the named keys are removed), and removes `devDependencies.linkinator` only if no other script value mentions `linkinator`. Preserve indentation and key order via JSON.parse/stringify with detected indent. Alternative considered: report-only manual steps; rejected for end-user effort.
4. **Report, never silent.** Each removal prints an `updated`/`removed` line; `--dry-run` lists them under `would write`/`would remove`.
5. **Install hint, not install.** When `package.json` changed (dependency removed), print `run '<pm> install' to refresh your lockfile`, using the detected package manager. Stale lockfiles break `--frozen-lockfile` CI, hence the hint. Alternative: run install; rejected (network side effect, CLI never does it).
6. **Leftover-reference warning.** After cleanup, scan `.github/` and `docs/package.json` scripts for `check-links`; warn per file about references upgrade does not manage.
7. **Remove `repoIgnoreGlob` end to end** (helper in `new.ts`, `TemplateValues` field, token map, stubs in `upgrade.ts` and `branch-model.ts`) since it only fed `checkLinks.ignore`.
8. **Dogfood via upgrade.** After release or a snapshot CLI, run `docouture upgrade` on this repo to clean its own `docs/` and workflows, doubling as a real test; the eslint ignore for the script is removed by hand.

## Risks / Trade-offs

- [Sites calling `check-links` in their own CI break] -> leftover-reference warning plus **BREAKING** release note.
- [Stale lockfile fails frozen installs] -> install hint printed prominently.
- [User's own `linkinator` use] -> dependency kept when another script references it; report says so.
- [Loss of raw external link detection] -> accepted; Antora strict build covers xrefs and includes.
- [Hand-formatted `package.json` reformatted] -> preserve detected indent; only named keys removed.
