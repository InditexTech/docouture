---
name: documenting-your-repo
description: "How to plan, populate and maintain documentation for this repo end-to-end — deciding what modules/pages should exist, sourcing content from wherever it actually lives (existing docs, README, code comments, API signatures, CLI definitions, config schemas — no fixed assumption about location), and keeping docs in sync as the repo grows. USE WHEN starting documentation from scratch, deciding what to document, checking whether docs coverage is complete, or documenting a newly added feature. EXAMPLES: 'build docs for this repo', 'what should my docs cover', 'is anything undocumented', 'document this new feature', 'my docs feel out of date'."
---

# Documenting your repo

This is the entry point for turning an empty (or half-empty) `docs/` site — scaffolded by
`pdocs new` — into real, maintained documentation. It's a planning and orchestration
skill, not a syntax reference: once a decision is made here, it hands off to the two
mechanics skills:

- **`docs-internals`** — once you know a module/page needs to exist, this is how
  `antora.yml`, `nav.adoc` and the home-page pattern actually work.
- **`writing-docs-pages`** — once you know what a page should say, this is the AsciiDoc
  syntax, xrefs and this site's custom blocks (`[tabs]`, `[cards]`, `[accordion]`, …).

Use this skill repeatedly, not just once — it's the loop that keeps documentation honest
as the repo evolves, not a one-shot wizard that's done after the first pass.

- `reference/structure-planning.md` — mono- vs. multi-module decision, the module menu,
  signals worth checking in the repo to shape it, and the home page's special (structure
  now, content later) treatment.
- `reference/content-sourcing.md` — where content comes from when nothing is prescribed:
  priority order across existing docs, README/CONTRIBUTING, and the repo's code itself
  (exports, doc-comments, CLI definitions, config schemas, tests-as-examples) — including
  the all-code, zero-prose case.
- `reference/maintenance-loop.md` — how to re-enter this skill later: the `AGENTS.md`
  documentation-state ledger, what counts as drift, and when to revisit the home page.

## The loop, in short

1. **Base check** — confirm identity/branding `pdocs new` already seeded (title, product
   name, description, favicon, light/dark logo). Look for existing brand assets elsewhere
   in the repo before asking the user to supply new ones.
2. **Structure planning** — decide mono- vs. multi-module and which modules exist. See
   `reference/structure-planning.md`. The home page's slot is asserted here — its content
   is not, see below.
3. **Content sourcing & drafting** — for every planned page, find where its content
   actually lives (don't assume — a repo with no `README` at all still has an API surface,
   a CLI, a config schema) and draft it. See `reference/content-sourcing.md`. Draft a rough
   home page early from whatever one-line description exists; treat it as unfinished.
4. **Maintenance loop** — re-run this skill whenever code grows a new surface (exported
   function, CLI command, config key) with nothing documenting it, whenever nav no longer
   matches the modules that exist, or periodically to refresh the home page once enough
   content exists to summarize well. See `reference/maintenance-loop.md`.

## What this skill does not opinionate about

Where in the repo the "real" information lives is entirely up to the repo itself — a
doc-comment, a type signature, a schema file, a test, a `--help` string, an existing
`README.md`, are all fair game and equally valid sources. This skill does not prescribe a
required location or format for source material; it only prescribes *that* every
documented surface is traceable to something real, and *where in `AGENTS.md`* that
traceability is recorded (see `reference/maintenance-loop.md`).
