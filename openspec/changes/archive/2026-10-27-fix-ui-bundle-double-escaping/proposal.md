# Proposal

## Why

GitHub issue #291: the hero excerpt (`:description:`) shows `&amp;` instead of `&`, because `partials/hero.hbs` prints it with `{{this}}` while Antora already supplies it HTML-escaped. The same pattern affects every value read from `page.attributes.*` (tags, action labels), which Asciidoctor escapes in header attribute values. `home-hero.hbs` and the `aria-label` in `nav-tree.hbs` repeat it. At the same time, a few raw-text values (playbook/descriptor titles) are printed with triple braces, which is the inverse inconsistency.

## What Changes

- `hero.hbs`: render the excerpt with `{{{detag this}}}`; render tags and both action labels with `{{{…}}}`.
- `home-hero.hbs`: render tags and action labels with `{{{…}}}`; render `site.title` (raw playbook text) with `{{…}}`.
- `nav-tree.hbs`: the toggle `aria-label` uses `{{{detag ./content attribute=true}}}` (nav content is already escaped HTML).
- `search-dialog.hbs`: render the module `./title` (raw descriptor text) with `{{…}}` in the chip label.
- Add a partial-render spec (`src/partials/escaping.spec.ts`) and a `preview-src` fixture with `&`, `<` and `>` in attributes.
- Add a Fixed entry to `code/CHANGELOG.md` under `[Unreleased]`.

No breaking changes.

## Capabilities

### New Capabilities
- `ui-bundle-text-escaping`: how the UI bundle's partials escape Antora-supplied (already-escaped) versus raw (playbook/descriptor) text, so a reserved character renders once-escaped.

### Modified Capabilities

(none)

## Impact

- Code: `code/packages/ui-bundle/src/partials/{hero,home-hero,nav-tree,search-dialog}.hbs`.
- Tests: new `code/packages/ui-bundle/src/partials/escaping.spec.ts`; `code/packages/ui-bundle/preview-src/` fixture.
- Docs/metadata: `code/CHANGELOG.md`. No API or dependency changes.
