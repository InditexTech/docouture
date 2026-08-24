---
name: starter-package
description: "The `code/packages/cli/templates/starter` template: what it contains, why it deliberately differs from `code/packages/example`, and how `pdocs new` turns it into a new standalone documentation site. USE WHEN editing the CLI's starter template, deciding whether a change belongs in the template or in `example`, or working out why a scaffolded site looks different from an in-monorepo one. EXAMPLES: 'what does pdocs new scaffold', 'why does the scaffolded site depend on the pdocs UI bundle via npm instead of the sibling workspace package', 'can I add a page to the starter template', 'edit the CLI's starter template', 'why was code/packages/starter removed'."
---

# The starter template

There is no more in-workspace `starter` package to copy. `code/packages/starter` was
removed: it depended on three workspace packages via `workspace:*` —
`@inditextech/pdocs-ui-bundle`, `@inditextech/pdocs-antora-extensions`,
`@inditextech/pdocs-asciidoc-extensions` — and none of those resolve outside this
monorepo via a `workspace:*` range, so nothing about it actually worked once copied out.
The one surviving `starter` is
**`code/packages/cli/templates/starter`** — bundled into the `@inditextech/pdocs-cli` npm
package at CLI build time (`scripts/copy-templates.mjs`) and copied out by `pdocs new`
into a fresh directory, with `__PDOCS_NAME__`/`__PDOCS_TITLE__`/`__PDOCS_CLI_VERSION__`
tokens substituted for whatever the invocation was given (`copy-template.ts`).

All three now made it back into this template — as real npm devDependencies, pinned to
the exact same version as `@inditextech/pdocs-cli` (the packages release in lockstep),
with the playbook's `ui.bundle.url`/`asciidoc.extensions`/`antora.extensions` pointing at
them under `node_modules` (GH-96: this is what lets a scaffolded site actually use the
custom AsciiDoc blocks — `[tabs]`, `[cards]`, `[accordion]`, … — the `writing-docs-pages`
skill `pdocs new` also scaffolds documents, and what makes the UI bundle's own search
dialog have something to search).

For the generic anatomy shared by an in-workspace site package — playbook keys, the
Nx/pnpm wiring, `scripts/dev.mjs`, the silent-failure list — read `docs-site-package`; that
skill is about `example`, the only site package left in this workspace. This skill is only
about the CLI's bundled template and what `pdocs new` does with it.

## What is in it

```
code/packages/cli/templates/starter/
  package.json                          __PDOCS_NAME__, private, deps: antora + pdocs-ui-bundle + the two pdocs extension packages
  antora-playbook.yml                   heavily commented — pdocs UI bundle via node_modules
  antora-playbook.pr-verify.yml         HEAD-only companion, used by pdocs-pr-verify.yml
  docs/
    antora.yml                          name/title: __PDOCS_NAME__/__PDOCS_TITLE__, version: ~
    modules/ROOT/
      nav.adoc
      pages/index.adoc                  "what is here"
      pages/getting-started.adoc        add a page, build, set a version
  .github/workflows/
    pdocs-publish.yml                   build (and, once it exists, deploy) on push
    pdocs-pr-verify.yml                 HEAD-only build on every pull_request
    pdocs-release.yml                   cuts a release for either mode — detects which
    pdocs-release-preview.yml           comments the target version/tag on a docs/release-labelled PR, before merge
  .gitignore
```

One release workflow handles both modes — it reads `docs/antora.yml`'s `version:` field
(`next` → Mode 1, `prerelease` → Mode 2) rather than being told which is in effect; see
`reference/versioning-modes.md`'s "Cutting a release" section for the detection and the
two trigger paths (`workflow_dispatch`, and a `docs/release`/`docs/force-release`-labelled
PR merging into `main*`).

## Why it looks the way it does

| choice | reason |
| --- | --- |
| `version: ~` in `docs/antora.yml` | unversioned component — no version segment in URLs. A site that needs versions opts in later; starting versioned is hard to undo. |
| pdocs UI bundle as an npm devDependency, `ui.bundle.url` reading it from `node_modules` | works the moment `npm install` has run, no build-time fetch from a URL, and stays pinned to the exact bundle version this template was generated with |
| two content pages only | `index.adoc` proves `site.start_page` resolves; `getting-started.adoc` proves `nav.adoc`, `xref:` and `pdocs version` work. A third page proves nothing new |
| `devDependencies` include `@inditextech/pdocs-cli` | `pdocs version` (used in `getting-started.adoc` and `pdocs-release.yml`) needs to resolve as a local binary in the scaffolded site, not just whatever's on the scaffolding machine's `PATH` |
| one `pdocs-release.yml`, mode detected at run time | avoids shipping two near-identical files a site owner has to pick between and keep one of; the trade-off is a workflow that reads `docs/antora.yml` before it knows what else to do |

## Starter vs example

Different jobs, not the same shape anymore. `code/packages/cli/templates/starter` is what
an external, standalone site starts from; `example` is a real in-workspace site (the
Fumadocs migration target) that also happens to trial pdocs' own extensions ahead of the
UI bundle. Keep them from converging:

- **A change every scaffolded site needs goes in the CLI template** — a playbook key, an
  attribute, a workflow fix.
- **A change that demonstrates a pdocs-specific feature not yet in the template goes in
  `example`** instead — anything genuinely still workspace-only.
- Neither the UI bundle nor the two extension packages are workspace-only concerns
  anymore — all three are real npm devDependencies in the template (see the table
  above). Each requires its package to actually be resolvable on whatever registry the
  scaffolded site installs against — the real npmjs registry once `publish-npm` in
  `release.yml` is turned on, or a local Verdaccio registry via `just release-local` /
  `just local-registry-start` for testing before that.

## Editing the template

- **Keep it working standalone.** It must build with nothing beyond what a fresh
  `pdocs new` output has — no `workspace:*`, no sibling packages, no assumption this repo
  exists.
- **Keep the playbook comments accurate.** They are the reason the file is worth reading;
  a key changed without its comment is worse than no comment.
- **Placeholders are `__PDOCS_NAME__` / `__PDOCS_TITLE__` / `__PDOCS_CLI_VERSION__`** —
  `copy-template.ts`'s `PLACEHOLDERS` map is the single source of truth for what gets
  substituted; adding a fourth placeholder means updating that map too.
- **New files here appear in every future `pdocs new` automatically** — `copyTemplate`
  copies the whole directory recursively; nothing needs registering per-file.

## Reference

- `docs-site-package` — the in-workspace site package (`example`): playbook keys, Nx
  wiring, dev server, failure modes.
- `docs-site-package/reference/versioning-modes.md` — the two release workflow variants,
  the PR-verification playbook, and what's still manual.
- `asciidoc` — pages, nav, xrefs, includes.
