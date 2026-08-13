---
name: iop-ds-components
description: "Build UI in the pdocs Antora bundle out of IOP DS (IDS) components — reusing the design system's shipped BEM CSS instead of writing new styles. USE WHEN editing Handlebars layouts or partials in code/packages/ui-bundle, styling site chrome (header, nav, toolbar, breadcrumbs, pagination, toc, footer), rendering AsciiDoc content as a DS component, or writing an Antora/Asciidoctor extension. EXAMPLES: 'style the nav like the DS', 'add tabs to the docs', 'make admonitions look like IDS banners', 'add a card grid block macro'."
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
| derived from AsciiDoc that Asciidoctor already produces | CSS alone, mapped onto the converted HTML | admonitions → `.ids-banner`, tables, code blocks |
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

Real example, `banner/banner.css`:

```html
<div class="ids-banner ids-banner--info">
  <div class="ids-banner__content">
    <p class="ids-banner__message">…</p>
    <div class="ids-banner__actions">
      <button class="ids-banner__dismiss">…</button>
    </div>
  </div>
</div>
```

Rules:

- Never add a class to a DS block that is not in its stylesheet. To attach behaviour
  or layout, use a `data-*` attribute or wrap the block in your own element.
- Never override a DS declaration from another stylesheet. If a DS component is wrong
  for the job, it is the wrong component.
- Modifier names are fixed vocabulary — check the stylesheet, do not guess.
  `grep -o '\.ids-[a-z0-9_-]*' <file>.css | sort -u` lists every class it defines.

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
component's CSS means generating a derivative from it, the same shape as
`ids-tokens.css` and the `.ids-icon` rule in `icons.css`:

1. `just ids-install`, then read the real stylesheet(s) at
   `code/tools/ids/node_modules/@inditex/sewingiopdsweb-react-components/<dir>/*.css`
   (`ls` the directory first — components with several stylesheets need all of them:
   `breadcrumbs/` has 4, `modal/` 6).
2. For a small, stable rule set (a handful of declarations, like the icon sizing rule),
   copy it verbatim into the relevant `src/css/*.css` file with a comment naming the
   source path and DS version — see `icons.css` for the pattern.
3. For a larger component, or one likely to need re-syncing as the DS version bumps,
   extend `tools/ids/sync.mjs` to extract it mechanically instead of hand-copying —
   read that script before adding to it, it already does this for tokens and
   breakpoints. Emit the result as its own generated file under
   `packages/ui-bundle/src/css/`, `@import`ed from `site.css`, with the same
   "generated, do not edit" header the existing generated files use.

Either way: copy only the components actually used, and note the DS version copied
from (the DS has no semver guarantee on component CSS between versions).

## Licensing

The DS packages are `license: INDITEX`. `ui-bundle.zip` bakes in whatever's been
generated from them — currently the token layer and one icon-sizing rule; any
component CSS added per the section above joins that same generated surface.
`code/packages/ui-bundle/NOTICE` records what's derived and from where.
**If a pdocs site is ever published externally, or before generating a large chunk
of component CSS, this must be revisited with whoever owns DS licensing** — flag it
rather than shipping quietly.

## Reference

- `reference/catalogue.md` — IDS component → BEM block → package path → what pdocs uses it for
- `reference/extensions.md` — writing and registering Asciidoctor extensions here
