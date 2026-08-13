---
name: iop-ds-components
description: "Build UI in the pdocs Antora bundle out of IOP DS (IDS) components — reusing the design system's shipped BEM CSS instead of writing new styles. USE WHEN editing Handlebars layouts or partials in code/packages/ui-bundle, styling site chrome (header, nav, toolbar, breadcrumbs, pagination, toc, footer), rendering AsciiDoc content as a DS component, or writing an Antora/Asciidoctor extension. EXAMPLES: 'style the nav like the DS', 'add tabs to the docs', 'make admonitions look like IDS banners', 'add a card grid block macro'."
---

# IOP DS — Components in the Antora bundle

The DS ships **framework-agnostic BEM CSS** for every component in
`@inditex/sewingiopdsweb-react-components@1.28.0`. The React code is irrelevant to us;
the stylesheets reference nothing but `--ids-*` tokens and plain class names.

**The rule: import the DS stylesheet, emit its markup. Never re-implement a component's
styling.** React is a devDependency for reading markup structure only — nothing from
it reaches the browser.

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

Add the import to `src/css/site.css`, in the chrome/content section, after the token
imports and after `bridge.css`:

```css
@import url(~@inditex/sewingiopdsweb-react-components/banner/banner.css);
```

`postcss-import` plus the existing `~` resolution handle it; the rules are inlined into
`css/site.css` in the built zip. Import only the components actually used — the package
has ~90 of them and none are tree-shaken.

Components with several stylesheets need all of them (`breadcrumbs/` has 4, `modal/` 6).
`ls node_modules/@inditex/sewingiopdsweb-react-components/<dir>/*.css` before importing.

## Licensing

The DS packages are `license: INDITEX`. pdocs is MPL-2.0 and its `ui-bundle.zip` bakes
these stylesheets in. This is accepted because the resulting sites are internal.
`code/packages/ui-bundle/NOTICE` records it. **If a pdocs site is ever published
externally, this must be revisited** — flag it rather than shipping quietly.

## Reference

- `reference/catalogue.md` — IDS component → BEM block → package path → what pdocs uses it for
- `reference/extensions.md` — writing and registering Asciidoctor extensions here
