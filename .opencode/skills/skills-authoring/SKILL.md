---
name: skills-authoring
description: "How this repo's shipped docouture-* agent skills (skills/docouture-*, published to InditexTech/docouture and installed elsewhere via npx skills add) stay in sync with the authoring-guides source they're built from (code/authoring-guides/) and with the real implementation they describe (ui-bundle layouts/partials, asciidoc-extensions block registrations, this repo's and example's own real pages). Internal, contributor-facing only — never shipped. USE WHEN code/authoring-guides changes, a file under skills/docouture-* is edited, a skill is added to or removed from the set, ui-bundle or asciidoc-extensions gains or changes a layout/attribute/block, or before self-installing an updated skill set via npx skills add. EXAMPLES: 'I changed the home page authoring guide, what else needs updating', 'I added a new attribute to home-hero.hbs, does a skill need updating', 'add a new custom AsciiDoc block', 'ship an update to docouture-authoring-guides', 'add a new skill to the set we publish', 'why did the authoring guide say something that isn't true anymore'."
metadata:
  internal: true
---

# Keeping the shipped skills honest

Everything under `skills/docouture-*` is *shipped* — published to `InditexTech/docouture`,
installed via `npx skills add` into someone else's repo, describing docouture to an agent
documenting *their* product. This skill is about maintaining *this* repo: the two
directions content can drift apart in, and the checklist for each. It is itself
`.opencode`-only — an external consumer has no `code/authoring-guides/` to sync from, and
no `ui-bundle`/`asciidoc-extensions` source tree to audit against, so this procedure would
be dead weight in their copy.

## The propagation map

| source (hand-edited)                              | copy (also hand-edited, kept identical)              |
| --------------------------------------------------- | ------------------------------------------------------ |
| `code/authoring-guides/README.md`                  | `skills/docouture-authoring-guides/SKILL.md`          |
| `code/authoring-guides/home.md`, `sections/*.md`   | `skills/docouture-authoring-guides/reference/*.md`    |
| (fenced `### AsciiDoc skeleton` blocks, extracted) | `skills/docouture-authoring-guides/reference/skeletons/*.adoc` |
| every `skills/docouture-*` file                    | the identical `.agents/skills/docouture-*` file       |

The last row is a pre-existing precedent, not new: `.agents/skills/docouture-*` and
`skills/docouture-*` have always been two independently committed, byte-identical copies
(no sync script — `git log` on either shows the same commits touching both). Every rule
below that says "propagate a skill edit" means into *both* copies.

## Forward drift: `code/authoring-guides/` edited

1. Update the corresponding file under `skills/docouture-authoring-guides/reference/`.
2. If the edited page's skeleton changed, re-extract it into
   `reference/skeletons/<name>.adoc` — the guide copy holds a pointer
   (`See \`skeletons/<name>.adoc\`...`), never the fenced block inline; the fenced form only
   lives in `code/authoring-guides/` itself.
3. Check whether the edit touches a fact duplicated in the mechanics skills — the two
   known spots are `docouture-getting-started/reference/structure-planning.md`'s section
   table (deliberately trimmed to a pointer at the other end of this sync, don't let it
   grow back into a second copy) and `docouture-docs-internals/reference/page-patterns.md`'s
   home-page skeleton (a deliberately *shorter*, mechanics-only version of
   `docouture-authoring-guides/reference/home.md` — keep both readable if the underlying
   fact changes, don't let one silently go stale).
4. Mirror into `.agents/skills/docouture-authoring-guides/`.

## Reverse drift: the implementation moved, the guides didn't notice

The more dangerous direction — nothing prompts a docs update when `ui-bundle` or
`asciidoc-extensions` gains an attribute, layout, or block; the guide just quietly stops
being true. This bit us once already: `page-hero-image-bordered`, `:page-layout:
home-single`, `table-width=` and `video::` all shipped before any guide mentioned them.
Audit these exact files whenever one of them changes:

- `code/packages/ui-bundle/src/layouts/{home,home-single,default}.hbs` — layout variants
  and what each drops/shares.
- `code/packages/ui-bundle/src/partials/{home-hero,hero}.hbs` — the authoring-surface
  attributes, documented in that file's own header comment; treat that comment as ground
  truth, not the guide.
- `code/packages/asciidoc-extensions/lib/*.js` — every custom block/macro/attribute
  (`tabs`, `cards`, `accordion`, `feature-tabs`, `cta`, `label`, `mono`, `table-width.js`,
  `nowrap-cols.js`, `video-size.js`, `table-container.js`).
- The two real, living examples — treat these as ground truth for *convention* (section
  order, which attributes actually get used), not just what a sibling skill's own skeleton
  says, since that skeleton can itself be stale:
  - `docs/src/modules/ROOT/pages/index.adoc` (docouture's own home page)
  - `code/packages/example/docs/modules/ROOT/pages/index{,-single}.adoc` (Weave.js, both
    layout variants)

The audit runs both directions:

- For every attribute/block a guide documents, grep the source above to confirm it still
  exists and behaves as described.
- For every attribute/block the source implements, grep `docouture-authoring-guides` and
  `docouture-writing-docs-pages`/`docouture-docs-internals` to confirm *something*
  documents it. A hit in neither is exactly the gap that bit us before.
- For a structural convention (like section order), diff against the two real pages
  directly — don't trust a sibling skill's skeleton as the sole source of truth for it.

## The skill set itself changed (a skill added or removed)

1. `code/packages/cli/templates/agent-support/AGENTS.md` — the "This installs:" list.
2. This repo's own root `AGENTS.md` — same list, inside the `<!-- docouture:start -->`/
   `<!-- docouture:end -->` block (normally regenerated by `docouture new`/`upgrade`; hand-sync
   it here since this repo dogfoods its own tooling rather than re-scaffolding itself).
3. `code/packages/cli/src/commands/new.ts`'s `printNextSteps` — the printed skill list
   (and skim `new.spec.ts` for any assertion that would need updating alongside it, though
   today it only asserts skill directories are *absent*, never their full names).
4. `docs/src/modules/main/pages/reference-ai-first-approach.adoc` — the skill table.
5. Self-install: `npx skills@latest add InditexTech/docouture --all` to refresh this
   repo's own `skills-lock.json` and `.agents/skills/` mirror.
