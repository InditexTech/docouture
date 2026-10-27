# Tasks

## 1. Hero partials (escaped-source values)

- [x] 1.1 In `code/packages/ui-bundle/src/partials/hero.hbs`, render the excerpt with `{{{detag this}}}` and tags and both action labels with `{{{…}}}`; verify with the spec in 4.1 (excerpt, tags, labels show a single `&amp;`).
- [x] 1.2 In `code/packages/ui-bundle/src/partials/home-hero.hbs`, render tags and both action labels with `{{{…}}}`; verify with the home-hero cases in 4.1.

## 2. Navigation and raw-text partials

- [x] 2.1 In `nav-tree.hbs:81`, change the toggle `aria-label` to `{{{detag ./content attribute=true}}}`; verify with the nav `aria-label` case in 4.1.
- [x] 2.2 Before changing raw-text triple braces, grep `code/packages/example`, `code/packages/cli/templates/starter` and `docs/` for `nav_modules` titles and `site.title` values containing markup; record the result in the PR description. If any rely on markup, keep that spot unchanged.
- [x] 2.3 In `home-hero.hbs` change `{{{site.title}}}` to `{{site.title}}`, and in `search-dialog.hbs` change the chip label `{{{./title}}}` to `{{./title}}`; verify with the raw-text cases in 4.1.

## 3. Preview fixture

- [x] 3.1 Add `&`, `<` and `>` to the `:description:`, `:page-tags:` and `:page-action:` attributes of a page under `code/packages/ui-bundle/preview-src/`; verify by running the ui-bundle preview build and confirming the hero shows `&` (not `&amp;`).

## 4. Regression tests

- [x] 4.1 Add `code/packages/ui-bundle/src/partials/escaping.spec.ts` that renders `hero.hbs`, `home-hero.hbs`, `nav-tree.hbs` and `search-dialog.hbs` with the real helpers (stubbing `resolvePageURL`, `relativize`, `icon`) and asserts each spec scenario in `specs/ui-bundle-text-escaping/spec.md`; verify `pnpm nx test` for the ui-bundle project passes, and fails when a fix from 1.x/2.x is reverted.

## 5. Changelog and final checks

- [x] 5.1 Add a Fixed entry `- [#PR](URL) title` under `[Unreleased]` in `code/CHANGELOG.md` (the issue carries `kind/bug`); verify against the changelog skill's format and the pr-verify gate.
- [x] 5.2 Run `pnpm nx` lint and test for the ui-bundle project and a preview build from `code/`; verify all pass with no `&amp;amp;` in the built HTML.
