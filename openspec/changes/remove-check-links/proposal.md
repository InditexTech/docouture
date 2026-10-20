# Proposal

## Why

The `check-links` gate (linkinator crawl of the built site) is flaky by nature and has blocked releases for reasons that are not real broken links: 1.2.0's release failed twice on healthy hosts (nodejs.org, github.com, ...), and its docs publish failed with 237 "broken" links because, with `site.url` set, pages link to the live site that does not exist until the publish finishes. It needs ever more special cases (ignore list, 403/429 as warnings, timeouts). Antora's own strict build already fails on broken `xref:` and missing includes. See GH #273.

## What Changes

- Remove the `Check links` step from the `docouture-pr-verify.yml`, `docouture-release.yml` and `docouture-publish.yml` workflow templates (and this repo's own copies).
- Remove `scripts/check-links.mjs`, the `check-links` npm script, the `linkinator` devDependency and the `docouture.checkLinks` block from the starter template.
- Remove the now-dead `repoIgnoreGlob` template value and `__DOCOUTURE_REPO_IGNORE_GLOB__` token.
- `docouture upgrade` removes the script, the `check-links` script entry, `docouture.checkLinks` and (when unused elsewhere) `linkinator` from existing sites, reports every change, prints a hint to re-run the package manager install, and warns about remaining `check-links` references in files it does not manage.
- Docs: update `reference-cli` and `reference-integrations`, add 1.3.0 release notes, CHANGELOG entry.
- **BREAKING**: sites that call `<pm> run check-links` themselves lose that script on upgrade.
- Single step in 1.3.0; no deprecation patch in 1.2.x. No opt-in replacement.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Tooling/removal only; the change opts out of specs (`skip_specs: true`). `starter-build-strictness` is unaffected: Antora's strict build stays.

## Impact

- `code/packages/cli`: `templates/workflows/*`, `templates/starter/{package.json,scripts}`, `src/lib/copy-template.ts`, `src/commands/{new,upgrade,branch-model}.ts`, `upgrade.spec.ts`.
- This repo's dogfood: `docs/scripts/check-links.mjs`, `docs/package.json`, `docs/pnpm-lock.yaml`, `.github/workflows/docouture-*.yml`, `code/eslint.config.mjs`.
- Docs and `code/CHANGELOG.md`.
- Validation after release (or with a snapshot CLI) by running `docouture upgrade` on this repo.
