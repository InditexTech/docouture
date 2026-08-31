# Design tokens — typography

Hand-maintained in `code/packages/ui-bundle/src/css/dt-tokens.css`.

## How a text style is applied

A style is **four** declarations, not one:

```css
.thing {
  font: var(--dt-typo-body-m);
  letter-spacing: var(--dt-typo-body-m-letter-spacing);
  text-transform: var(--dt-typo-body-m-text-transform);
  font-variant-numeric: var(--dt-typo-font-variant-numeric);
}
```

Applying only `font:` loses the tracking and casing and is a bug.
`font-variant-numeric` is `tabular-nums lining-nums` globally — figures align in tables.

## The scale

`weight / size / line-height`, all as tokens. Weight column names the weight token,
whose numeric value depends on the resolution tier.

| style | weight token | size | line-height | tracking | transform |
| --- | --- | --- | --- | --- | --- |
| `display-s` | default | 32 | 40 | `-2px` | none |
| `display-m` | default | 48 | 56 | `-2px` | none |
| `display-l` | default | 64 | 72 | `-2px` | none |
| `title-xs` | default | 16 | 24 | none | **uppercase** |
| `title-s` | default | 20 | 32 | none | **uppercase** |
| `title-m` | default | 24 | 36 | none | **uppercase** |
| `title-l` | default | 32 | 48 | none | **uppercase** |
| `title-xl` | default | 48 | 72 | none | **uppercase** |
| `body-m` | default | 14 | 22 | none | none |
| `body-m-high` | mid | 14 | 22 | none | none |
| `body-l` | default | 16 | 24 | none | none |
| `body-l-high` | mid | 16 | 24 | none | none |
| `label-m` | default | 11 | 16 | none | uppercase |
| `label-m-high` | high | 11 | 16 | `0.4px` | uppercase |
| `label-l` | default | 13 | 20 | none | uppercase |
| `label-l-high` | high | 13 | 20 | `0.4px` | uppercase |
| `detail-m` | default | 12 | 18 | none | none |
| `detail-m-high` | mid | 12 | 18 | none | none |
| `code-m` | default | 14 | 20 | none | none |

`-high` is the emphasised variant of the same style — same size, heavier weight.
Use it instead of setting `font-weight` yourself.

## Documentation deviation: uppercase titles

Every `title-*` style is `text-transform: uppercase`. That is right for application
chrome — panel headers, section labels — and wrong for long-form documentation, where
headings are sentences.

docouture therefore applies title **sizing** to article headings while resetting the
transform:

```css
.doc h2 {
  font: var(--dt-typo-title-m);
  letter-spacing: var(--dt-typo-title-m-letter-spacing);
  text-transform: none;
  font-variant-numeric: var(--dt-typo-font-variant-numeric);
}
```

This is a deliberate, documented deviation. Chrome outside `.doc` — nav headings,
toolbar labels, footer — keeps the uppercase treatment. Do not "correct" either side.

Headings map as: `h1` → `title-l`, `h2` → `title-m`, `h3` → `title-s`,
`h4`/`h5`/`h6` → `title-xs`. Body prose is `body-l`; captions, table cells and
metadata are `detail-m`; code is `code-m`.

## Raw scales

Only reach for these when composing something the scale does not cover.

- `--dt-typo-font-size-{11,12,13,14,15,16,18,20,24,28,32,36,40,48,56,64,72,80}`
- `--dt-typo-line-height-{14,16,18,20,22,24,28,32,36,40,48,56,64,72,80,88,96,120}`
- `--dt-typo-letter-spacing-{none,mid}` — `0px`, `0.4px`
- `--dt-typo-text-transform-{none,lowercase,uppercase}`
- `--dt-typo-font-weight-{default,mid,high}` — resolution-dependent, see `tokens.md`

Token numbers are px **at `.dt-scale-medium`**. At `.dt-scale-large`,
`--dt-typo-font-size-16` is 21px. Never assume the number is the rendered size.

## Font families

| token | family |
| --- | --- |
| `--dt-typo-font-family-primary` | `"Inter"` |
| `--dt-typo-font-family-monospace` | `"Noto Sans Mono"` |

Loaded from Google Fonts as one variable-font stylesheet — no `@font-face` in this
repo, no `@fontsource` packages:

```
https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Noto+Sans+Mono:wght@100..900&display=swap
```

`head-styles.hbs` is the only place that references this URL.

## Fallback stack

Google Fonts is a hard dependency of correct rendering, but must not break an
offline `just preview` or an air-gapped CI. `bridge.css` therefore sets the bundle's
own family variables with a fallback tail:

```css
--body-font-family: var(--dt-typo-font-family-primary), "Helvetica Neue", Arial, sans-serif;
--monospace-font-family: var(--dt-typo-font-family-monospace), ui-monospace, monospace;
```
