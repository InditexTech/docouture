---
name: starter-package
description: "The `code/packages/starter` template: what it contains, why each file is minimal, and how to copy it into a new documentation site or extract it into a repository of its own. USE WHEN starting a new docs site from starter, reviewing or editing starter's own files, deciding whether a change belongs in starter or in a derived site, or lifting starter out of the monorepo into a standalone repo. EXAMPLES: 'create a new docs site from starter', 'what do I have to rename after copying starter', 'can I add a page to starter', 'starter builds but example does not', 'move starter to its own repository', 'why does starter have only two pages'."
---

# The starter package

`code/packages/starter` is a **template, not a product**. It is the smallest complete
Antora site that still builds in this workspace, and it exists so a new documentation site
is a `cp -R` plus four renames rather than a from-scratch assembly.

For the generic anatomy shared by every site package — playbook keys, the Nx/pnpm wiring,
`scripts/dev.mjs`, the silent-failure list — read `docs-site-package`. For what to write
inside `docs/` read `asciidoc`. This skill is only about starter's role as the template.

## What is in it

```
code/packages/starter/
  package.json              @inditextech/pdocs-starter, private, workspace:* ui-bundle
  antora-playbook.yml       heavily commented — the comments are the deliverable
  docs/
    antora.yml              name: starter, title: Starter, version: ~
    modules/ROOT/
      nav.adoc              two entries
      pages/index.adoc      "what is here" — points at the four files above
      pages/getting-started.adoc  add a page, build the site, preview the UI
  build/site/               generated, gitignored
```

Four content files. That is deliberate: every page in starter is copied into every site
derived from it, so anything that is not immediately deletable or immediately true of the
new site is a liability.

## Why it looks the way it does

| choice | reason |
| --- | --- |
| `version: ~` in `docs/antora.yml` | unversioned component — no version segment in URLs. A site that needs versions opts in later; starting versioned is hard to undo. |
| two pages only | `index.adoc` proves `site.start_page` resolves; `getting-started.adoc` proves `nav.adoc` and `xref:` work. A third page proves nothing new. |
| playbook comments outnumber the config | the playbook is the file a new site's author edits first. The comments explain `url: ../../..`, `snapshot: true` and the commented-out `site.url` at the point of use, so the explanation survives the copy. |
| `site.title: Documentation`, not `Starter` | the title is expected to change; a generic value reads as a placeholder rather than something to leave alone. |
| `site.url` commented, not blank | an empty `site.url` is a build-time error in some Antora versions; a comment carries the reason it is absent. |
| pages reference the *starter* build command | after the rename in step 4 they name the new site. See the checklist. |

## Starter vs example

Same shape, different job. `starter` is the thing you copy; `example` is the destination of
the Fumadocs migration and will accumulate real content. Keep them from converging:

- **A change that every future site needs goes in `starter`** — a playbook key, an
  attribute, a structural convention.
- **A change that demonstrates something goes in `example`** — sample pages, extensions
  being trialled, migrated content.
- Never grow starter to show a feature off. Cost is paid by every copy.

## Copying it

Copy, rename in four places, install. The four values that must agree are the same four in
`docs-site-package`'s table; the exact edits and the verification steps are in
`reference/checklist.md`, and the workspace conventions the new name must satisfy
(directory name, `private: true`, `workspace:*`, version) are in
`docs-site-package/reference/new-site.md`.

Do not rename starter itself and do not build a site on top of it in place. The copy is
cheap; the template is not replaceable.

## Extracting it standalone

Starter is written so that leaving the monorepo is a deletion:

```yaml
content:
  sources:
    - url: .
      start_path: docs
      branches: HEAD
```

The playbook already carries this collapsed form as a comment. Two other things change —
the UI bundle stops being a sibling (published URL, `snapshot: false`), and
`scripts/dev.mjs` drops its UI watch on its own, logging `no sibling ui-bundle package,
watching content only`. Details: `docs-site-package/reference/new-site.md`.

## Editing starter itself

- **Keep it building.** `just build-site starter` and `just dev starter 5001`. Starter is
  the canary: if the workspace wiring breaks, it breaks here first and with the least
  noise.
- **Keep the playbook comments accurate.** They are the reason the file is worth copying.
  A key changed without its comment is worse than no comment.
- **Do not add dependencies.** `antora` and the workspace UI bundle. Anything else becomes
  a dependency of every derived site.
- **Do not commit `build/`.** Gitignored; `just clean` removes it.
- **`version: ~` stays** unless the whole convention changes.

## Reference

- `reference/checklist.md` — the copy-and-rename checklist, file by file, with the
  verification build.
- `docs-site-package` — playbook keys, Nx wiring, dev server, failure modes.
- `asciidoc` — pages, nav, xrefs, includes.
