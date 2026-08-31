---
name: docouture-components
description: "Build UI in the docouture Antora bundle out of this project's own components — reusing dt-components.css's shipped BEM CSS instead of writing new styles. USE WHEN editing Handlebars layouts or partials in code/packages/ui-bundle, styling site chrome (header, nav, toolbar, breadcrumbs, pagination, toc, footer), rendering AsciiDoc content as a component, or writing an Antora/Asciidoctor extension. EXAMPLES: 'style the nav like the rest of the bundle', 'add tabs to the docs', 'make admonitions look consistent', 'add a card grid block macro'."
metadata:
  internal: true
---

# Components in the Antora bundle

`code/packages/ui-bundle/src/css/dt-components.css` ships **framework-agnostic BEM
CSS** for every component this bundle uses — hand-maintained, ordinary source, nothing
generated. The stylesheets reference nothing but `--dt-*` tokens and plain class names.

**The rule: copy an existing component's real CSS as your reference, emit its markup.
Never re-implement a component's styling from memory.**

Read the `docouture-foundations` skill first for tokens, theming and breakpoints.

## Where a component can come from

Decide in this order. Stop at the first that fits.

1. **Already a component in `dt-components.css`** — use its BEM markup as-is. No new CSS.
2. **An existing component with different content** — same CSS, our markup in its slots.
   Still no new CSS.
3. **Site chrome with no existing equivalent** (breadcrumb-to-edit-link row, version
   selector) — compose from existing primitives (button, list, tag, divider) and add the
   minimum layout CSS, using only tokens.
4. **Nothing in `dt-components.css` models it** — say so explicitly before inventing. A
   new visual pattern in a documentation site is usually a sign an existing component
   was misidentified, or that this is a genuinely new one worth adding directly to
   `dt-components.css`.

## Where the markup comes from

| the thing is | it lives in | example |
| --- | --- | --- |
| site chrome, present on every page | a Handlebars partial in `src/partials` | header, nav, toolbar, footer, toc |
| derived from AsciiDoc that Asciidoctor already produces | CSS alone, mapped onto the converted HTML | admonitions (Asciidoctor's own `.admonitionblock`, styled + icon-masked in `doc.css` — no component of its own), tables, code blocks |
| authored content with no AsciiDoc equivalent | an Asciidoctor extension in `code/packages/asciidoc-extensions` | tabs, card grid, steps, timeline |

Never emit component markup from `src/js`. JavaScript adds behaviour to server-rendered
markup — it does not create it. A page must be readable and correctly styled with JS off.

## BEM conventions

```
.dt-<component>                     block
.dt-<component>__<part>             element
.dt-<component>--<modifier>         block modifier
.dt-<component>__<part>--<modifier> element modifier
```

Real example, `button/button.css`:

```html
<button class="dt-button dt-button--primary dt-button--large">
  <div class="dt-button__content">
    <span class="dt-button__icon dt-button__icon-icon">…</span>
    Label
  </div>
</button>
```

Rules:

- Never add a class to a component block that is not in its stylesheet. To attach
  behaviour or layout, use a `data-*` attribute or wrap the block in your own element.
- Never override a component declaration from another stylesheet. If an existing
  component is wrong for the job, it is the wrong component.
- Modifier names are fixed vocabulary — check the stylesheet, do not guess.
  `grep -o '\.dt-[a-z0-9_-]*' <file>` lists every class a component actually defines —
  run it before writing markup for any component, every time. Guessing from the
  four-line grammar above is how bugs 2–4 in issue #6 happened.

### Exceptions to the grammar

The four-line grammar is the default, not a guarantee. Real departures from it exist in
`dt-components.css`, sometimes in the same file:

1. **Single-dash sub-blocks.** Several components define a second, related block with a
   single dash instead of a leading `.dt-<component>` + `__part`, e.g. `.dt-list-item`
   (inside `list`, alongside the true block `.dt-list`), `.dt-option-picker-item` /
   `.dt-option-picker-button` (inside `option-picker`), `.dt-tabs-item` (its own block,
   not `.dt-tabs__item`). These are still proper blocks — they use `__part` and
   `--modifier` internally — the single dash is just how the sub-block is named
   relative to its parent.
2. **Chained elements.** `card/card.css`'s image slots go two levels deep with a
   second `__`: `.dt-card__image__slot`, `.dt-card__image__slot-bottom-left`. Not
   textbook BEM (an element is not supposed to have its own sub-elements), but real,
   shipped, and not worth "fixing" — copy it as-is.

Either way: the grep rule above is what tells you which one you're looking at. Do not
assume grammar from a component's name.

## State and interaction

Component stylesheets style state through real CSS state, not classes: `:hover`,
`:focus-visible`, `:disabled`, `[aria-expanded]`, `[aria-selected]`, `[aria-current]`.
Drive components with correct ARIA and the styling follows. Adding `.is-active` will do
nothing.

Focus rings are uniform and already in the component CSS:

```css
outline: var(--dt-size-border-high) solid var(--dt-color-border-states-focus);
outline-offset: var(--dt-size-25);
```

Never remove an outline without replacing it with this one.

## Adding a component

There is no generation step and no manifest — `dt-components.css` is authored directly,
the same as any other stylesheet in this bundle:

1. Write the component's CSS straight into `dt-components.css`, in its own section
   with a header comment (see the file's existing sections for the convention),
   using only `--dt-*` tokens.
2. Emit its BEM markup from wherever the content actually originates (a partial, or an
   Asciidoctor extension — see "Where the markup comes from" above).

Add only what's actually used — an unused component is dead weight in every site this
bundle ships to.

## Reference

- `reference/catalogue.md` — every component in `dt-components.css`: BEM block, what
  docouture uses it for
- `reference/extensions.md` — writing and registering Asciidoctor extensions here
