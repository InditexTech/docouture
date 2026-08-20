---
name: starter-package
description: "The `code/packages/cli/templates/starter` template: what it contains, why it deliberately differs from `code/packages/example`, and how `pdocs new` turns it into a new standalone documentation site. USE WHEN editing the CLI's starter template, deciding whether a change belongs in the template or in `example`, or working out why a scaffolded site looks different from an in-monorepo one. EXAMPLES: 'what does pdocs new scaffold', 'why doesn't the scaffolded site use the pdocs UI bundle', 'can I add a page to the starter template', 'edit the CLI's starter template', 'why was code/packages/starter removed'."
---

# The starter template

There is no more in-workspace `starter` package to copy. `code/packages/starter` was
removed: it depended on three workspace packages via `workspace:*` —
`@inditextech/pdocs-ui-bundle`, `@inditextech/pdocs-antora-extensions`,
`@inditextech/pdocs-asciidoc-extensions` — none of which are published to npm
(`"private": true` on all three), so nothing about it actually worked once copied outside
this monorepo. The one surviving `starter` is
**`code/packages/cli/templates/starter`** — bundled into the `@inditextech/pdocs-cli` npm
package at CLI build time (`scripts/copy-templates.mjs`) and copied out by `pdocs new`
into a fresh directory, with `__PDOCS_NAME__`/`__PDOCS_TITLE__` tokens substituted for
whatever the invocation was given (`copy-template.ts`).

For the generic anatomy shared by an in-workspace site package — playbook keys, the
Nx/pnpm wiring, `scripts/dev.mjs`, the silent-failure list — read `docs-site-package`; that
skill is about `example`, the only site package left in this workspace. This skill is only
about the CLI's bundled template and what `pdocs new` does with it.

## What is in it

```
code/packages/cli/templates/starter/
  package.json                          __PDOCS_NAME__, private, deps: antora only
  antora-playbook.yml                   heavily commented — plain Antora default UI
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
| plain Antora default UI (`antora-ui-default` gitlab artifact), no pdocs extensions | the only UI/extension set that actually resolves outside this monorepo right now — see the removal rationale above |
| two content pages only | `index.adoc` proves `site.start_page` resolves; `getting-started.adoc` proves `nav.adoc`, `xref:` and `pdocs version` work. A third page proves nothing new |
| `devDependencies` include `@inditextech/pdocs-cli` | `pdocs version` (used in `getting-started.adoc` and `pdocs-release.yml`) needs to resolve as a local binary in the scaffolded site, not just whatever's on the scaffolding machine's `PATH` |
| one `pdocs-release.yml`, mode detected at run time | avoids shipping two near-identical files a site owner has to pick between and keep one of; the trade-off is a workflow that reads `docs/antora.yml` before it knows what else to do |

## Starter vs example

Different jobs, not the same shape anymore. `code/packages/cli/templates/starter` is what
an external, standalone site starts from; `example` is a real in-workspace site (the
Fumadocs migration target) that also happens to trial pdocs' own UI bundle and extensions.
Keep them from converging:

- **A change every scaffolded site needs goes in the CLI template** — a playbook key, an
  attribute, a workflow fix.
- **A change that demonstrates a pdocs-specific feature (UI bundle, custom AsciiDoc
  blocks, antora extensions) goes in `example`** — those features aren't available to a
  scaffolded site until the underlying packages are published, so the template can't use
  them yet regardless.

## Editing the template

- **Keep it working standalone.** It must build with nothing beyond what a fresh
  `pdocs new` output has — no `workspace:*`, no sibling packages, no assumption this repo
  exists.
- **Keep the playbook comments accurate.** They are the reason the file is worth reading;
  a key changed without its comment is worse than no comment.
- **Placeholders are `__PDOCS_NAME__` / `__PDOCS_TITLE__` only** — `copy-template.ts`'s
  `PLACEHOLDERS` map is the single source of truth for what gets substituted; adding a
  third placeholder means updating that map too.
- **New files here appear in every future `pdocs new` automatically** — `copyTemplate`
  copies the whole directory recursively; nothing needs registering per-file.

## Reference

- `docs-site-package` — the in-workspace site package (`example`): playbook keys, Nx
  wiring, dev server, failure modes.
- `docs-site-package/reference/versioning-modes.md` — the two release workflow variants,
  the PR-verification playbook, and what's still manual.
- `asciidoc` — pages, nav, xrefs, includes.
