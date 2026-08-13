# IDS breakpoints and resolution

Source of truth: `@inditex/sewingiopdsweb-styles/variables/breakpoints.css`
(auto-generated from `breakpoints/breakpoints.config.js`).

**Never write a width media query by hand.** The `@custom-media` names below are
injected into every stylesheet by the DS PostCSS plugin.

## Tiers

| tier | range | columns | margin | gutter | reference frame |
| --- | --- | --- | --- | --- | --- |
| XS | `<= 512px` | 6 | 16px | 16px | 320 |
| S | `513 – 1023.98px` | 12 | 32px | 24px | 700 |
| M | `1024 – 1679.98px` | 12 | 56px | 48px | 1280 |
| L | `>= 1680px` | 12 | 64px | 56px | 1728 |

Behaviour is fluid in every tier — the columns are a layout grid, not fixed widths.

> The Figma Breakpoints canvas states M as `1240–1679` and leaves `1024–1239`
> undocumented. That page is stale. The shipped config, and this project, use
> **M starting at 1024px**.

## Available `@custom-media` names

```css
/* individual, mobile-first */
--ids-breakpoints-xs        (max-width: 512px)
--ids-breakpoints-s         (min-width: 513px)
--ids-breakpoints-m         (min-width: 1024px)
--ids-breakpoints-l         (min-width: 1680px)

/* combined ranges */
--ids-breakpoints-m-l       (min-width: 1024px)
--ids-breakpoints-xs-s      (max-width: 1023.98px)
--ids-breakpoints-xs-m      (max-width: 1679.98px)
--ids-breakpoints-s-m       (min-width: 513px) and (max-width: 1679.98px)

/* isolated */
--ids-breakpoints-s-only    (min-width: 513px) and (max-width: 1023.98px)
--ids-breakpoints-m-only    (min-width: 1024px) and (max-width: 1679.98px)

/* device */
--ids-resolution-mid        1× displays
--ids-resolution-high       ≥2× displays
--ids-touchscreen           (hover: none), (any-pointer: coarse)
```

Usage:

```css
.nav { display: none; }

@media (--ids-breakpoints-m) {
  .nav { display: block; }
}
```

## Layout tokens

`--ids-margin` and `--ids-gutter` are reassigned per tier. Use them rather than
re-deriving the numbers:

```css
.page { padding-inline: var(--ids-margin); }
.grid { gap: var(--ids-gutter); }
```

## Resolution tiers ≠ breakpoints

Resolution is device pixel ratio, not viewport width. It is handled entirely in CSS
by the DS and affects only border widths and font weights — see `tokens.md`.
There is **no JavaScript involved**, and you should never add any.

Override classes exist if a surface must be pinned:
`.ids-resolution-standard`, `.ids-resolution-mid`, `.ids-resolution-high`.

## Legacy queries in this bundle

The antora-default fork used `768.5 / 769 / 1023.5 / 1024 / 1216` with a half-pixel
convention. The `1024` desktop cut happens to coincide with IDS M. Every one of these
is being replaced by a `@custom-media` name; if you find a raw width query in
`src/css`, it has not been migrated yet — migrate it rather than adding another.
