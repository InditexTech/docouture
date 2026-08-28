---
name: docouture-documenting-changes
description: "How to update an existing docouture documentation site when a feature, change, deprecation or fix lands in the repo — figuring out what's affected from a diff/commit/PR, confirming with the user before writing, and keeping AGENTS.md's documentation-state ledger honest. USE WHEN a new feature was just added, something was deprecated or removed, a fix changes documented behaviour, or docs feel out of date relative to the code. EXAMPLES: 'I added a new CLI flag, update the docs', 'this API is now deprecated, reflect that in the docs', 'document this change', 'my docs are stale, what needs updating'."
---

# Documenting changes

This is the re-entry point for a docouture site that already exists (scaffolded and
drafted via `docouture-getting-started`) and needs to stay in sync as the repo evolves. Use
this every time something changes, not just once — it's the loop, not a one-shot pass.

If there's no site yet at all, this is the wrong skill — see `docouture-getting-started`
first.

This skill decides *what* changed and *whether* it needs a docs update; once it knows
which page(s) to touch, it hands off to the same two mechanics skills `docouture-getting-started`
does:

- **`docouture-docs-internals`** — module/page/nav mechanics.
- **`docouture-writing-docs-pages`** — AsciiDoc authoring itself.

See `reference/maintenance-loop.md` for the full mechanism: the `AGENTS.md`
documentation-state ledger, what counts as drift, and when to revisit the home page.

## The flow, in short

1. **Find out what changed.** Prefer inspecting the actual change first — a git diff, the
   commit(s) since the last documented pass, or a PR's description — over asking the user
   to enumerate it themselves. This is a starting point to *propose from*, not something to
   trust blindly: confirm your read of "what changed" with the user before writing
   anything, since inferred intent can be wrong (a refactor that touches many files is not
   the same as a new feature, even though both produce a large diff).
2. **Re-scan the repo's surface** the same way `docouture-getting-started`'s
   `content-sourcing.md` step 3 describes — exports, CLI commands, config keys, API
   definitions — and diff it against `AGENTS.md`'s ledger. See `reference/maintenance-loop.md`
   for exactly what counts as `new`, `stale` and `current`.
3. **Check whether this needs a new page, an edit to an existing one, or a structural
   change** (a whole new module, if this is a monorepo gaining a new publishable artifact —
   see `docouture-getting-started`'s `reference/structure-planning.md` for that decision; this
   skill doesn't re-litigate structure on its own, it flags when structure planning is
   needed and hands back to that skill for the decision).
4. **Write the update**, following whatever page pattern already fits
   (`docouture-docs-internals`'s `reference/page-patterns.md`) and the site's existing voice —
   a code-derived reference page reads differently from a hand-written guide, don't force
   one to imitate the other.
5. **Update the ledger** in `AGENTS.md` — mark the touched page(s) `current` again, add a
   row for anything genuinely new, and never silently regenerate a page marked `manual`
   (human-owned) without being asked.
6. **Check `nav.adoc`** for the module(s) touched — a page that exists on disk but isn't
   listed there builds fine and is simply unreachable; nothing warns about this on its own.

## What this skill deliberately doesn't do automatically

It never regenerates a whole site's structure from scratch on every change (that's
`docouture-getting-started`'s job, and only ever needed once, or for a genuine restructure),
and it never writes past what a diff/commit actually supports without checking with the
user first — a hybrid of "look at the change" and "confirm before touching docs," not pure
guesswork and not pure Q&A.
