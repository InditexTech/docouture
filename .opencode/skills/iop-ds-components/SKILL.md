---
name: iop-ds-components
description: "Build UI in the pdocs Antora bundle out of IOP DS (IDS) components — reusing the design system's shipped BEM CSS instead of writing new styles. USE WHEN editing Handlebars layouts or partials in code/packages/ui-bundle, styling site chrome (header, nav, toolbar, breadcrumbs, pagination, toc, footer), rendering AsciiDoc content as a DS component, or writing an Antora/Asciidoctor extension. EXAMPLES: 'style the nav like the DS', 'add tabs to the docs', 'make admonitions look like IDS notifications', 'add a card grid block macro'."
---

# IOP DS — Components in the Antora bundle

The DS ships **framework-agnostic BEM CSS** for every component in
`@inditex/sewingiopdsweb-react-components@1.28.0`. The React code is irrelevant to us;
the stylesheets reference nothing but `--ids-*` tokens and plain class names.

**The rule: copy the DS component's real CSS as your reference, emit its markup. Never
re-implement a component's styling from memory.** React is there for reading markup
structure only — nothing from it reaches the browser.

> **`@inditex/sewingiopdsweb-react-components` is not installed in this workspace** —
> `code/packages/ui-bundle/package.json` has no dependency on it, and `pnpm install` at
> the workspace root never touches Artifactory. To read the real stylesheets this skill
> describes, run `just ids-install` first: it installs the DS into a sidecar,
> `code/tools/ids/node_modules/`, kept outside the pnpm workspace for exactly this. See
> `code/tools/ids/README.md` and the `iop-ds-reference` skill.
>
> This changes how you ship a component's CSS, too — see "Importing DS component CSS"
> below: it is no longer a live `@import`, it is a generated derivative, same shape as
> the icon sprite and the token layer.

Read the `iop-ds-foundations` skill first for tokens, theming and breakpoints.

## Where a component can come from

Decide in this order. Stop at the first that fits.

1. **Already a DS component** — import `…-react-components/<dir>/<file>.css` and emit
   its BEM markup. No new CSS.
2. **A DS component with different content** — same CSS, our markup in its slots.
   Still no new CSS.
3. **Site chrome with no DS equivalent** (breadcrumb-to-edit-link row, version
   selector) — compose from DS primitives (button, list, tag, divider) and add the
   minimum layout CSS, using only tokens.
4. **Nothing in the DS models it** — say so explicitly before inventing. A new visual
   pattern in a documentation site is usually a sign the DS component was misidentified.

## Where the markup comes from

| the thing is | it lives in | example |
| --- | --- | --- |
| site chrome, present on every page | a Handlebars partial in `src/partials` | header, nav, toolbar, footer, toc |
| derived from AsciiDoc that Asciidoctor already produces | CSS alone, mapped onto the converted HTML | admonitions → `.ids-notification`, tables, code blocks |
| authored content with no AsciiDoc equivalent | an Asciidoctor extension in `code/packages/asciidoc-extensions` | tabs, card grid, steps, timeline, KPI |

Never emit component markup from `src/js`. JavaScript adds behaviour to server-rendered
markup — it does not create it. A page must be readable and correctly styled with JS off.

## BEM conventions

```
.ids-<component>                     block
.ids-<component>__<part>             element
.ids-<component>--<modifier>         block modifier
.ids-<component>__<part>--<modifier> element modifier
```

Real example, `notifications/notification/notification.css`:

```html
<div class="ids-notification ids-notification--expandable">
  <div class="ids-notification-icon">…</div>
  <div class="ids-notification-content">
    <div class="ids-notification-main">
      <p class="ids-notification-text">…</p>
      <button class="ids-notification-toggle">…</button>
    </div>
  </div>
  <button class="ids-notification-close">…</button>
</div>
```

Note this is not textbook BEM: `ids-notification-info` / `-success` / `-warning` / `-error`
/ `-ai` / `-loading` are **variant modifiers** with a single dash, sitting next to the
properly double-dashed `ids-notification--expandable` in the same file. See Exceptions
below — this is not a typo, it is how the file ships.

Rules:

- Never add a class to a DS block that is not in its stylesheet. To attach behaviour
  or layout, use a `data-*` attribute or wrap the block in your own element.
- Never override a DS declaration from another stylesheet. If a DS component is wrong
  for the job, it is the wrong component.
- Modifier names are fixed vocabulary — check the stylesheet, do not guess.
  `grep -o '\.ids-[a-z0-9_-]*' <file>.css | sort -u` lists every class it defines —
  run it before writing markup for any component, every time. Guessing from the
  four-line grammar above is how bugs 2–4 in issue #6 happened.

### Exceptions to the grammar

The four-line grammar is the default, not a guarantee. Two different departures from
it both exist in the shipped CSS, in the same package, sometimes the same file:

1. **Single-dash sub-blocks.** Many components define a second, related block with a
   single dash instead of a leading `.ids-<component>` + `__part`, e.g.
   `.ids-list-item` (inside `list/`, alongside the true block `.ids-list`),
   `.ids-tabs-item` (inside `tabs/`, alongside `.ids-tabs__list` /
   `.ids-tabs__indicator`), `.ids-timeline-item*`, `.ids-menu-item`,
   `.ids-empty-state-footer`, `.ids-tree-*`, `.ids-lightbox-wrapper`,
   `.ids-option-picker-item`, `.ids-field-actions`, `.ids-search-field-minimal`. These
   are still proper blocks — they use `__part` and `--modifier` internally — the
   single dash is just how the sub-block is named relative to its parent.
2. **Single-dash modifiers.** Rarer, and the one that actually breaks the grammar:
   Notification's colour variants (`-info`, `-success`, `-warning`, `-error`, `-ai`,
   `-loading`) are modifiers, not sub-blocks, written with one dash while
   `--expandable` in the same file uses two.

Either way: the grep rule above is what tells you which one you're looking at. Do not
assume grammar from a component's name.

## State and interaction

DS stylesheets style state through real CSS state, not classes: `:hover`, `:focus-visible`,
`:disabled`, `[aria-expanded]`, `[aria-selected]`, `[aria-current]`. Drive components
with correct ARIA and the styling follows. Adding `.is-active` will do nothing.

Focus rings are uniform and already in the DS CSS:

```css
outline: var(--ids-size-border-high) solid var(--ids-color-border-states-focus);
outline-offset: var(--ids-size-25);
```

Never remove an outline without replacing it with this one.

## Importing DS component CSS

There is no live `@import` of `@inditex/sewingiopdsweb-react-components` — that package
is deliberately not part of this workspace's install (see the intro). Shipping a DS
component's CSS means adding it to the generated derivative
`packages/ui-bundle/src/css/ids-components.css`:

1. `just ids-install`, then read the real stylesheet(s) at
   `code/tools/ids/node_modules/@inditex/sewingiopdsweb-react-components/<dir>/*.css`
   (`ls` the directory first — components with several stylesheets need all of them:
   `breadcrumbs/` has 4, `modal/` 6, `menu/` 9, `list/` 5).
2. Add one line per file to `packages/ui-bundle/src/css/ids-components.yml` (component
   directory → leaf file names, same shape as `src/img/icons.yml` for icons), with a
   trailing comment naming what uses it.
3. `just ids-sync`. This regenerates `ids-components.css` (concatenated, reformatted
   for a readable diff, in manifest order) and pulls any `--ids-*` token the new CSS
   references into `ids-tokens.css` automatically — same generator, same "generated,
   do not edit" header convention as the token layer.

The one exception is `.ids-icon`'s sizing rule in `icons.css`: a single 77-byte rule,
hand-copied rather than run through the manifest — not worth a generator entry, and
it predates this pipeline. Don't extend that pattern for anything larger; a second
component belongs in the manifest.

Either way: add only the components actually used, and let `just ids-sync` record the
DS version and source hashes in `ids.lock.json` (the DS has no semver guarantee on
component CSS between versions).

## Licensing

The DS packages are `license: INDITEX`. `ui-bundle.zip` bakes in whatever's been
generated from them — the token layer, one icon-sizing rule, and whatever
`packages/ui-bundle/src/css/ids-components.yml` currently lists (check that file for
the live set — it changes as components are added). Every manifest addition joins that
same generated surface. `code/packages/ui-bundle/NOTICE` records what's derived and
from where. **If a pdocs site is ever published externally, or before vendoring a
large chunk of component CSS, this must be revisited with whoever owns DS
licensing** — flag it rather than shipping quietly.

## Reference

- `reference/catalogue.md` — IDS component → BEM block → package path → what pdocs uses it for
- `reference/extensions.md` — writing and registering Asciidoctor extensions here
