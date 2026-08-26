---
name: docs-internals
description: "How this Antora documentation site is put together: the playbook, the docs/antora.yml component descriptor, the four names that must agree, mono-module vs. multi-module layout, and the home-page vs. content-page patterns. USE WHEN adding a page or module, renaming the site/component, choosing between a single-module and multi-module layout, building a landing/home page, or diagnosing a site that builds with zero pages or fails with 'start page not found'. EXAMPLES: 'add a new module', 'rename this docs site', 'build a marketing home page', 'the site builds but has no pages', 'start page not found', 'should this be one module or several'."
---

# Site structure

This site was scaffolded by `pdocs new` (`@inditextech/pdocs-cli`). This skill covers the
pieces that make it hang together — where each name is set, how a page becomes reachable,
and the two page patterns (home vs. content) worth copying rather than reinventing.

- `reference/naming.md` — the four names that must agree, and how to fix them when they
  don't (`pdocs doctor` checks this automatically).
- `reference/page-patterns.md` — the home-page block structure and the recurring
  content-page shapes, plus mono-module vs. multi-module layout.
- `reference/antora-extensions.md` — what `@inditextech/pdocs-antora-extensions` (a
  different kind of extension from the authoring blocks in `writing-docs-pages`) provides:
  the module switcher, site footer, search index and `llms.txt` generation.

For AsciiDoc authoring itself — xrefs, admonitions, code blocks, this site's custom
blocks — see the `writing-docs-pages` skill.

## The moving pieces

```
docs/
  antora-playbook.yml          site title, content source, UI bundle, asciidoc/antora extensions
  antora-playbook.local.yml    same shape, but content.sources[] is just `branches: HEAD` —
                                 what `pdocs dev` and PR verification build against, since a
                                 PR/feature-branch checkout doesn't have `main` or a release tag
  package.json                 name, devDependencies (pdocs-cli, ui-bundle, the two extension
                                 packages), the `build`/`dev` scripts
  src/
    antora.yml                 component descriptor: name, title, version, nav
    modules/<module>/nav.adoc  navigation tree, one per module
```

The whole starter template — `package.json`, both playbooks, the nested `src/` — was
copied under this repository's own `docs/`, so `antora-playbook.yml` lives at
`<repo-root>/docs/antora-playbook.yml` and the component descriptor ends up one level
further down, at `docs/src/antora.yml`. That's why `antora-playbook.yml`'s
`content.sources[0]` reads `url: ..` (this repo's root, one level up from `docs/`) and
`start_path: docs/src`.

## Versioning

`docs/antora.yml`'s `version`/`prerelease` fields are identical on `main` regardless of
which versioning mode this site uses (`version: prerelease`, `prerelease: true`) — what
differs is only which git refs `antora-playbook.yml`'s `content.sources[0]` aggregates
from (`tags: ['stable']` vs. `tags: ['v*']`). If this site was scaffolded with
`--mode versioned`, see the `docs-versioning` skill for cutting a release; a
**standalone**-mode site (the default) has no separate skill for this — `pdocs doctor`
and the `pdocs-release.yml` workflow are all that's needed.
