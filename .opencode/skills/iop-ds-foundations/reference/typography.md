# IDS typography

Source of truth: `@inditex/sewingiopdsweb-styles/typography.css` and `mixins/index.css`.

## How a text style is applied

A style is **four** declarations, not one. Use the mixin:

```css
.thing { @mixin ids-body-m; }
```

which expands to:

```css
.thing {
  font: var(--ids-typo-body-m);
  letter-spacing: var(--ids-typo-body-m-letter-spacing);
  text-transform: var(--ids-typo-body-m-text-transform);
  font-variant-numeric: var(--ids-typo-font-variant-numeric);
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

Mixin names are the style names prefixed `ids-`: `ids-display-l`, `ids-title-m`,
`ids-body-m-high`, `ids-code-m`, …

## Documentation deviation: uppercase titles

Every `title-*` style is `text-transform: uppercase`. That is right for application
chrome — panel headers, section labels — and wrong for long-form documentation, where
headings are sentences.

pdocs therefore applies title **sizing** to article headings while resetting the
transform:

```css
.doc h2 {
  @mixin ids-title-m;
  text-transform: none;
}
```

This is a deliberate, documented deviation. Chrome outside `.doc` — nav headings,
toolbar labels, footer — keeps the uppercase treatment. Do not "correct" either side.

Headings map as: `h1` → `title-l`, `h2` → `title-m`, `h3` → `title-s`,
`h4`/`h5`/`h6` → `title-xs`. Body prose is `body-l`; captions, table cells and
metadata are `detail-m`; code is `code-m`.

## Raw scales

Only reach for these when composing something the scale does not cover.

- `--ids-typo-font-size-{11,12,13,14,15,16,18,20,24,28,32,36,40,48,56,64,72,80}`
- `--ids-typo-line-height-{14,16,18,20,22,24,28,32,36,40,48,56,64,72,80,88,96,120}`
- `--ids-typo-letter-spacing-{none,mid}` — `0px`, `0.4px`
- `--ids-typo-text-transform-{none,lowercase,uppercase}`
- `--ids-typo-font-weight-{default,mid,high}` — resolution-dependent, see `tokens.md`

Token numbers are px **at `.ids-scale-medium`**. At `.ids-scale-large`,
`--ids-typo-font-size-16` is 21px. Never assume the number is the rendered size.

## Font families

| token | family |
| --- | --- |
| `--ids-typo-font-family-primary` | `Helvetica Now Text SW10` |
| `--ids-typo-font-family-monospace` | `NotoSansMono` |

Loaded from a public CDN as two stylesheets — no `@font-face` in this repo, no
`@fontsource` packages:

```
https://amgassets.inditex.com/amigaweb/typography/zara-helvetica-now/zara-helvetica-now-sw10.css
https://amgassets.inditex.com/amigaweb/typography/noto-sans-mono/noto-sans-mono.css
```

Sites served from a `.cn` hostname must use `amgassets.inditex.cn` instead; the DS
`fonts.js` does this by sniffing `location.hostname`, and the bundle replicates the
rule in `head-styles.hbs`.

The Figma Typography canvas also documents CJK, Ukrainian and Polish family tokens
(`Noto Sans SC` / `TC` / `Noto Sans`). The package does **not** ship them. If pdocs
ever needs a CJK locale, that is a gap to raise with the DS team, not to fill locally.

## Fallback stack

The CDN is a hard dependency of correct rendering, but must not break an offline
`just preview` or an air-gapped CI. `bridge.css` therefore sets the bundle's own
family variables with a fallback tail:

```css
--body-font-family: var(--ids-typo-font-family-primary), "Helvetica Neue", Arial, sans-serif;
--monospace-font-family: var(--ids-typo-font-family-monospace), ui-monospace, monospace;
```
