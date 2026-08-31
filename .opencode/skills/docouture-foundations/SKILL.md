---
name: docouture-foundations
description: "Design tokens, theming, breakpoints, typography and motion for the docouture Antora UI bundle. USE WHEN writing or editing any CSS in code/packages/ui-bundle, adding a colour/spacing/font value, implementing dark mode or responsive behaviour, or wiring PostCSS. EXAMPLES: 'what colour should this border be', 'add dark mode', 'make this responsive', 'why is my custom property missing in the build', 'set the heading font size'."
---

# Design tokens — Foundations

This project's own design token system, hand-maintained in
`code/packages/ui-bundle/src/css/dt-tokens.css` and `dt-breakpoints.css`. Everything
below already exists as plain CSS. Read it, import it, reference it. Never re-author
a value that already has a token.

## The three laws

1. **Never write a literal.** No hex, no px, no font stack, no duration, no z-index.
   Every value comes from a `--dt-*` custom property. If you cannot find a token
   for what you need, you are styling something the system does not model — say so
   rather than inventing a value.
2. **Never write a width media query by hand.** Use the `@custom-media` names.
3. **Never flatten custom properties at build time.** Theming, the density scale and
   the resolution tiers are all runtime custom-property swaps. `postcss-custom-properties`
   must run with `preserve: true` (or not at all — see `dt-custom-media.js` in
   `ui-bundle-anatomy`'s build-pipeline reference for how this is enforced today).

## Token grammar

```
--dt-<domain>-<group>-<variant>[-<state>]
```

kebab-case throughout. Domains: `color`, `size`, `typo`, `motion`, `z`, `comp`
(`--dt-comp-*` are component-scoped tokens; prefer the generic one when both exist).

Quick map of what to reach for:

| you want | token family | example |
| --- | --- | --- |
| text colour | `--dt-color-content-*` | `--dt-color-content-low` |
| surface colour | `--dt-color-bg-*` | `--dt-color-bg-low` |
| border colour | `--dt-color-border-*` | `--dt-color-border-low` |
| hover/pressed/disabled/focus | `--dt-color-*-states-*` | `--dt-color-border-states-focus` |
| accent hue | `--dt-color-alt-<hue>-{high,mid,low}` | `--dt-color-alt-blue-high` |
| chart series | `--dt-color-viz-*` | `--dt-color-viz-item-1-level-02` |
| any spacing or dimension | `--dt-size-N` | `--dt-size-100` (16px) |
| border width | `--dt-size-border-{none,default,high}` | resolution-aware |
| corner radius | `--dt-size-radius-{none,rounded,full}` | |
| text style | `--dt-typo-<role>-<size>[-high]` | `--dt-typo-body-m` |
| transition | `--dt-motion-{micro,macro}-*` | `--dt-motion-micro-states` |
| stacking | `--dt-z-*` | `--dt-z-tooltip` |

Full inventories: `reference/tokens.md`, `reference/typography.md`,
`reference/breakpoints.md`, `reference/motion.md`.

## Theming — class-based, not attribute-based

Theme switches with a **class on the root element**:

```html
<html class="dt-theme-light dt-scale-medium">
```

`.dt-theme-light` / `.dt-theme-dark`. Every component stylesheet is written
against those selectors, so a `[data-theme]` attribute would silently do nothing.
A `:host(.dt-theme-dark)` variant also exists for shadow DOM; irrelevant here
but do not delete it when copying CSS.

Persistence key is `dt-theme` in `localStorage`. There is no built-in
`prefers-color-scheme` fallback — that is ours to add, and it must only apply
when the user has made no explicit choice.

Never hardcode a dark value. `--dt-color-bg-default` is already `#fff` in light and
`#000` in dark; a rule that references it needs no dark-mode counterpart at all.
Only write a `.dt-theme-dark` block when a value genuinely is not expressible as a
token — e.g. the `--hljs-*` syntax palette.

## Density scale

`.dt-scale-medium` (default) and `.dt-scale-large` rescale **every** `--dt-size-*`
and `--dt-typo-font-size-*` / `--dt-typo-line-height-*`. `dt-size-100` is 16px at
medium and 20px at large. docouture ships `dt-scale-medium` and does not expose a switcher.

`.dt-pda-true` / `.dt-pda-false` enlarges touch targets for handheld terminals.
docouture sets neither, which defaults to `false`.

## Resolution tiers — pure CSS, no JavaScript

Two things retarget by device pixel ratio, entirely through media queries:

| | fallback | mid (≈1×) | high (≥2×) |
| --- | --- | --- | --- |
| `--dt-size-border-default` | 1px | 1px | **0.5px** |
| `--dt-size-border-high` | 2px | 2px | 1px |
| `--dt-typo-font-weight-default` | 400 | 350 | 350 |
| `--dt-typo-font-weight-mid` | 500 | 400 | 400 |
| `--dt-typo-font-weight-high` | 600 | 500 | 500 |

Hairlines only on displays that can render them; heavier weights on low-res displays
so the Light 350 stays legible. Do not reimplement this, do not detect DPR in JS, and
do not use `--dt-typo-font-weight-*` for emphasis — they are density compensation,
not a weight scale. Force a tier with `.dt-resolution-{standard,mid,high}` if ever needed.

## Breakpoints

Four tiers, mobile-first, consumed as `@custom-media`:

```css
@media (--dt-breakpoints-m) { … }        /* >= 1240px */
@media (--dt-breakpoints-xs-m) { … }     /* <= 1679.98px */
```

| tier | range | columns | margin | gutter |
| --- | --- | --- | --- | --- |
| XS | `<= 512px` | 6 | 16px | 16px |
| S | `>= 513px` | 12 | 32px | 24px |
| M | `>= 1240px` | 12 | 56px | 48px |
| L | `>= 1680px` | 12 | 64px | 56px |

`--dt-margin` and `--dt-gutter` already track the tier — use them for page padding
and grid gaps instead of re-deriving the numbers. Full list of names in
`reference/breakpoints.md`.

The `@custom-media` names are resolved from `code/packages/ui-bundle/src/css/dt-breakpoints.css`,
prepended to every stylesheet by `gulp.d/lib/dt-custom-media.js` before
`postcss-custom-media` runs. You never import either file yourself; if a breakpoint
you need is missing, add the `(--dt-breakpoints-*)` reference to your CSS and add the
matching `@custom-media` declaration to `dt-breakpoints.css` directly — it is hand-
maintained, no generation step to run.

## Typography

Composite `font:` shorthand tokens, each with a matching letter-spacing and
text-transform token. Always apply all three:

```css
.thing {
  font: var(--dt-typo-body-m);
  letter-spacing: var(--dt-typo-body-m-letter-spacing);
  text-transform: var(--dt-typo-body-m-text-transform);
  font-variant-numeric: var(--dt-typo-font-variant-numeric);
}
```

Roles: `display-{s,m,l}`, `title-{xs,s,m,l,xl}`, `body-{m,l}`, `label-{m,l}`,
`detail-m`, `code-m`. A `-high` suffix means the emphasised weight of the same style.

⚠ **Every `title-*` style is `text-transform: uppercase`.** That is correct for
application chrome and wrong for documentation prose. Article headings in docouture use
`title-*` sizing with the transform explicitly reset — that deviation is deliberate
and documented in `reference/typography.md`. Do not "fix" it back.

Fonts are loaded from Google Fonts, not bundled:

```
https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Noto+Sans+Mono:wght@100..900&display=swap
```

Families resolve as `"Inter"` and `"Noto Sans Mono"` via
`--dt-typo-font-family-{primary,monospace}`. Never add `@fontsource` packages or
`@font-face` blocks for these — the Google Fonts stylesheet in `head-styles.hbs` is
the one place that loads them.

## Motion

`--dt-motion-duration-{s,m,l}[-high]`, four `--dt-motion-easing-standard-{1..4}`,
and six ready-made composites you should use directly:

```css
transition: var(--dt-motion-micro-states);
```

`prefers-reduced-motion` is already handled inside `dt-tokens.css` — it collapses every
duration to `0.01ms` and every easing to `linear`. Do not add your own
`prefers-reduced-motion` block for anything driven by these tokens.

## Where things live

```
code/packages/ui-bundle/src/css/
  dt-tokens.css       size scale, colour palette, typography scale, motion, z-index —
                      the subset src/css/**/*.css actually references
  dt-breakpoints.css  the @custom-media declarations src/css/**/*.css actually references
```

Both are hand-maintained, ordinary source files — there is nothing generated to
regenerate and no sidecar to install. Adding a token is editing the file directly.

## In this repo

`code/packages/ui-bundle` is a fork of antora-ui-default and still carries its own
variable vocabulary (`--body-font-color`, `--panel-background`, `--nav-*`, …). Those
are **not** dead — `src/css/bridge.css` re-points each of them at a `--dt-*` token,
so the 18 legacy stylesheets keep working and re-theme for free.

- Styling existing chrome → change `bridge.css`, not the leaf stylesheet.
- Styling something new → use `--dt-*` directly, no bridge entry.
- Never add a new `--body-*` / `--nav-*` style variable. The bridge only shrinks.
