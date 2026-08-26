---
name: iop-ds-foundations
description: "IOP Design System (IDS) design tokens, theming, breakpoints, typography and motion for the docouture Antora UI bundle. USE WHEN writing or editing any CSS in code/packages/ui-bundle, adding a colour/spacing/font value, implementing dark mode or responsive behaviour, or wiring PostCSS. EXAMPLES: 'what colour should this border be', 'add dark mode', 'make this responsive', 'why is my custom property missing in the build', 'set the heading font size'."
---

# IOP DS — Foundations

The design system is **shipped as npm packages**, not as a Figma spec you transcribe.
Everything below already exists as plain CSS. Read it, import it, reference it. Never
re-author it.

> **These packages are not a dependency of this workspace.** `code/packages/ui-bundle`
> ships a small, generated derivative (`src/css/ids-tokens.css`, `src/css/ids-breakpoints.css`)
> and nothing else — no `node_modules/@inditex/*` at the workspace root, no Artifactory
> credential needed for a normal `pnpm install`. To read the real DS source described in
> this skill, run `just ids-install` first: it installs the two packages into
> `code/tools/ids/node_modules/`, a sidecar outside the pnpm workspace, kept there for
> exactly this — reference while building or extending a component. See
> `code/tools/ids/README.md` and the `iop-ds-reference` skill for the full story
> (what's generated, how, and when to re-sync).

| package | version | role |
| --- | --- | --- |
| `@inditex/sewingiopdsweb-styles` | `1.28.0` | tokens, theming, breakpoints, motion, z-index, normalize, mixins, PostCSS plugin |
| `@inditex/sewingiopdsweb-react-components` | `1.28.0` | per-component BEM CSS (framework-agnostic) — see the `iop-ds-components` skill |

Figma (`aVzfmpuxRcJLsOLqZJaqAH` Foundations, `k7yFLKOvab4OBB1v6xhM6i` Core Components)
is the **specification**. The npm packages are the **implementation**, and where the
two disagree the packages win — the Figma breakpoint page, for one, is stale.
Use Figma only to understand intent. See `reference/figma.md`.

## The three laws

1. **Never write a literal.** No hex, no px, no font stack, no duration, no z-index.
   Every value comes from an `--ids-*` custom property. If you cannot find a token
   for what you need, you are styling something the DS does not model — say so
   rather than inventing a value.
2. **Never write a width media query by hand.** Use the `@custom-media` names.
3. **Never flatten custom properties at build time.** Theming, the density scale and
   the resolution tiers are all runtime custom-property swaps. `postcss-custom-properties`
   must run with `preserve: true` (or not at all).

## Token grammar

```
--ids-<domain>-<group>-<variant>[-<state>]
```

kebab-case throughout. Domains: `color`, `size`, `typo`, `motion`, `z`, `comp`
(`--ids-comp-*` are component-scoped tokens; prefer the generic one when both exist).

Quick map of what to reach for:

| you want | token family | example |
| --- | --- | --- |
| text colour | `--ids-color-content-*` | `--ids-color-content-low` |
| surface colour | `--ids-color-bg-*` | `--ids-color-bg-low` |
| border colour | `--ids-color-border-*` | `--ids-color-border-low` |
| hover/pressed/disabled/focus | `--ids-color-*-states-*` | `--ids-color-border-states-focus` |
| accent hue | `--ids-color-alt-<hue>-{high,mid,low}` | `--ids-color-alt-blue-high` |
| chart series | `--ids-color-viz-*` | `--ids-color-viz-item-1-level-02` |
| any spacing or dimension | `--ids-size-N` | `--ids-size-100` (16px) |
| border width | `--ids-size-border-{none,default,high}` | resolution-aware |
| corner radius | `--ids-size-radius-{none,rounded,full}` | |
| text style | `--ids-typo-<role>-<size>[-high]` | `--ids-typo-body-m` |
| transition | `--ids-motion-{micro,macro}-*` | `--ids-motion-micro-states` |
| stacking | `--ids-z-*` | `--ids-z-tooltip` |

Full inventories: `reference/tokens.md`, `reference/typography.md`,
`reference/breakpoints.md`, `reference/motion.md`.

## Theming — class-based, not attribute-based

The DS switches theme with a **class on the root element**:

```html
<html class="ids-theme-light ids-scale-medium">
```

`.ids-theme-light` / `.ids-theme-dark`. Every DS component stylesheet is written
against those selectors, so a `[data-theme]` attribute would silently do nothing.
The DS also emits `:host(.ids-theme-dark)` variants for shadow DOM; irrelevant here
but do not delete them when copying CSS.

Persistence key is `ids-theme` in `localStorage` (`IDS_THEME_STORAGE_KEY`).
The DS does **not** ship a `prefers-color-scheme` fallback — that is ours to add,
and it must only apply when the user has made no explicit choice.

Never hardcode a dark value. `--ids-color-bg-default` is already `#fff` in light and
`#000` in dark; a rule that references it needs no dark-mode counterpart at all.
Only write a `.ids-theme-dark` block when a value genuinely is not expressible as a
token — e.g. the `--hljs-*` syntax palette.

## Density scale

`.ids-scale-medium` (default) and `.ids-scale-large` rescale **every** `--ids-size-*`
and `--ids-typo-font-size-*` / `--ids-typo-line-height-*`. `ids-size-100` is 16px at
medium and 20px at large. docouture ships `ids-scale-medium` and does not expose a switcher.

`.ids-pda-true` / `.ids-pda-false` enlarges touch targets for handheld terminals.
docouture sets neither, which defaults to `false`.

## Resolution tiers — pure CSS, no JavaScript

The DS retargets two things by device pixel ratio, entirely through media queries:

| | fallback | mid (≈1×) | high (≥2×) |
| --- | --- | --- | --- |
| `--ids-size-border-default` | 1px | 1px | **0.5px** |
| `--ids-size-border-high` | 2px | 2px | 1px |
| `--ids-typo-font-weight-default` | 400 | 350 | 350 |
| `--ids-typo-font-weight-mid` | 500 | 400 | 400 |
| `--ids-typo-font-weight-high` | 600 | 500 | 500 |

Hairlines only on displays that can render them; heavier weights on low-res displays
so the Light 350 stays legible. Do not reimplement this, do not detect DPR in JS, and
do not use `--ids-typo-font-weight-*` for emphasis — they are density compensation,
not a weight scale. Force a tier with `.ids-resolution-{standard,mid,high}` if ever needed.

## Breakpoints

Four tiers, mobile-first, consumed as `@custom-media`:

```css
@media (--ids-breakpoints-m) { … }        /* >= 1024px */
@media (--ids-breakpoints-s-only) { … }   /* 513–1023.98px */
```

| tier | range | columns | margin | gutter |
| --- | --- | --- | --- | --- |
| XS | `<= 512px` | 6 | 16px | 16px |
| S | `>= 513px` | 12 | 32px | 24px |
| M | `>= 1024px` | 12 | 56px | 48px |
| L | `>= 1680px` | 12 | 64px | 56px |

`--ids-margin` and `--ids-gutter` already track the tier — use them for page padding
and grid gaps instead of re-deriving the numbers. Full list of names in
`reference/breakpoints.md`.

The `@custom-media` names are resolved from `code/packages/ui-bundle/src/css/ids-breakpoints.css`
— a generated derivative of the DS's own `variables/breakpoints.css`, prepended to every
stylesheet by `gulp.d/lib/ids-custom-media.js` before `postcss-custom-media` runs. You never
import either file yourself; if a breakpoint you need is missing from the derivative, add
the `(--ids-breakpoints-*)` reference to your CSS and run `just ids-install && just ids-sync`
— the generator only emits breakpoints it finds actually referenced.

## Typography

Composite `font:` shorthand tokens, each with a matching letter-spacing and
text-transform token. Always apply all three, or use the mixin:

```css
.thing {
  font: var(--ids-typo-body-m);
  letter-spacing: var(--ids-typo-body-m-letter-spacing);
  text-transform: var(--ids-typo-body-m-text-transform);
  font-variant-numeric: var(--ids-typo-font-variant-numeric);
}

/* identical, and preferred: */
.thing { @mixin ids-body-m; }
```

Roles: `display-{s,m,l}`, `title-{xs,s,m,l,xl}`, `body-{m,l}`, `label-{m,l}`,
`detail-m`, `code-m`. A `-high` suffix means the emphasised weight of the same style.

⚠ **Every `title-*` style is `text-transform: uppercase`.** That is correct for
application chrome and wrong for documentation prose. Article headings in docouture use
`title-*` sizing with the transform explicitly reset — that deviation is deliberate
and documented in `reference/typography.md`. Do not "fix" it back.

Fonts are loaded from a public CDN, not bundled:

```
https://amgassets.inditex.com/amigaweb/typography/zara-helvetica-now/zara-helvetica-now-sw10.css
https://amgassets.inditex.com/amigaweb/typography/noto-sans-mono/noto-sans-mono.css
```

Families resolve as `Helvetica Now Text SW10` and `NotoSansMono` via
`--ids-typo-font-family-{primary,monospace}`. Hosts ending `.cn` must swap the CDN to
`amgassets.inditex.cn`. Never add `@fontsource` packages or `@font-face` blocks for these.

## Motion

`--ids-motion-duration-{s,m,l}[-high]`, four `--ids-motion-easing-standard-{1..4}`,
and six ready-made composites you should use directly:

```css
transition: var(--ids-motion-micro-states);
```

`prefers-reduced-motion` is already handled inside `motion.css` — it collapses every
duration to `0.01ms` and every easing to `linear`. Do not add your own
`prefers-reduced-motion` block for anything driven by these tokens.

## Where things live

Real DS source (needs `just ids-install` first — see the intro):

```
code/tools/ids/node_modules/@inditex/sewingiopdsweb-styles/
  variables/index.css       themes, scales, resolution tiers, margins/gutters
  variables/breakpoints.css @custom-media source of truth (do not import directly)
  typography.css            composite font tokens
  motion.css                durations, easings, composites, reduced-motion
  zindex.css                --ids-z-*
  mixins/index.css          @define-mixin ids-*
  normalize.css scrollbar.css
  postcss/custom-media.cjs  PostCSS plugin (reference only — the build uses its own
                            equivalent, gulp.d/lib/ids-custom-media.js, sourced from
                            the committed derivative; see iop-ds-reference skill)
```

The generated derivative the build actually consumes:

```
code/packages/ui-bundle/src/css/
  ids-tokens.css       the --ids-* declarations src/css/**/*.css references, generated
  ids-breakpoints.css  the @custom-media declarations src/css/**/*.css references, generated
  ids.lock.json        DS version + source hashes the above were generated from
```

To look a token up, grep the real package rather than guessing:

```console
$ just ids-install   # first time only
$ grep -o '\-\-ids-color-alt-[a-z-]*:#[0-9a-f]*' \
    code/tools/ids/node_modules/@inditex/sewingiopdsweb-styles/variables/index.css
```

## In this repo

`code/packages/ui-bundle` is a fork of antora-ui-default and still carries its own
variable vocabulary (`--body-font-color`, `--panel-background`, `--nav-*`, …). Those
are **not** dead — `src/css/bridge.css` re-points each of them at an `--ids-*` token,
so the 18 legacy stylesheets keep working and re-theme for free.

- Styling existing chrome → change `bridge.css`, not the leaf stylesheet.
- Styling something new → use `--ids-*` directly, no bridge entry.
- Never add a new `--body-*` / `--nav-*` style variable. The bridge only shrinks.
