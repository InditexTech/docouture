# Design

## Context

See proposal.md. Antora 3.2 hands partials two kinds of text:

- **Already escaped**: `page.description` and `page.attributes.*` (built from Asciidoctor `doc.getAttributes()`, whose header values get special-character substitution), plus nav item `content` (rendered AsciiDoc HTML).
- **Raw**: `site.title`, `page.component.title`, `nav_modules` titles and footer text, read from the playbook and `antora.yml`.

Handlebars `{{x}}` escapes, `{{{x}}}` does not. The bug is `{{x}}` on already-escaped values. The inverse, `{{{x}}}` on raw values, lets `<` through. Existing precedent: `head-info.hbs` already uses `{{{detag this attribute=true}}}` for the meta description, and `hero.hbs` uses `{{{page.title}}}`.

## Goals / Non-Goals

**Goals:**
- Escaped-source values print once-escaped; raw-source values are escaped exactly once.
- A regression test that renders the real partials.

**Non-Goals:**
- Changing the `detag` or `split` helpers.
- Sanitizing author-controlled HTML more broadly (e.g. `nav-switcher` description, which is raw and printed with `{{{…}}}`; left as is, see Open Questions).

## Decisions

1. **Excerpt uses `{{{detag this}}}`, not `{{{this}}}`.** Matches the plain-text meta description and drops any inline tags. No `attribute=true`, since it sits in element content, not an attribute.
2. **Tags and action labels use `{{{…}}}`.** They are escaped by Asciidoctor; `detag` is unnecessary. Same fix applied to `hero.hbs` and `home-hero.hbs`, including the secondary action label.
3. **Nav `aria-label` uses `{{{detag ./content attribute=true}}}`.** Content is already-escaped HTML; `detag` strips tags and `attribute=true` escapes quotes for the attribute context. `nav-switcher.hbs:45` stays `{{detag ./title}}` because `./title` is raw.
4. **Raw-text triple braces become double braces** for `site.title` (`home-hero.hbs`) and `./title` in the `search-dialog.hbs` chip label, so the same value is escaped identically to its sibling `data-category` usage.
5. **Test by rendering real partials with Handlebars in vitest (node)**, registering the actual compiled helpers and stubbing `resolvePageURL`/`relativize`/`icon` as needed. Alternative considered: asserting on built preview HTML via gulp, rejected as slow and indirect. A `preview-src` fixture is added for manual visual checks only.

## Risks / Trade-offs

- [An author relied on markup in a raw title via `{{{…}}}`, e.g. `nav_modules` title with `<code>`] -> Changing to `{{…}}` would show it literally. Confirm no repo usage in `code/packages/example`, the starter template and docs before applying; if found, keep that spot as is and drop decision 4 for it.
- [Partial-render harness is new in this package] -> Keep it a small helper inside the spec file rather than shared test infrastructure.
- [`nav-switcher` `{{{./title}}}` (raw) stays triple-braced] -> Left out here to keep scope bounded; noted as follow-up.

## Open Questions

- Should `nav-switcher.hbs` raw `{{{./title}}}` and description be escaped too, as a follow-up consistent with decision 4?
- Whether the issue body should be widened beyond its title (non-blocking).
