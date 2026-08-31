# Design tokens — breakpoints and resolution

Hand-maintained in `code/packages/ui-bundle/src/css/dt-breakpoints.css`.

**Never write a width media query by hand.** The `@custom-media` names below are
prepended to every stylesheet by `gulp.d/lib/dt-custom-media.js` before
`postcss-custom-media` runs.

## Tiers

| tier | range | columns | margin | gutter | reference frame |
| --- | --- | --- | --- | --- | --- |
| XS | `<= 512px` | 6 | 16px | 16px | 320 |
| S | `513 – 1239.98px` | 12 | 32px | 24px | 700 |
| M | `1240 – 1679.98px` | 12 | 56px | 48px | 1280 |
| L | `>= 1680px` | 12 | 64px | 56px | 1728 |

Behaviour is fluid in every tier — the columns are a layout grid, not fixed widths.

M is a deliberate project override — `dt-breakpoints.css`'s own header comment notes
it starts at 1240px, not the 1024px the value was originally carried over from.

## Available `@custom-media` names

Only what `dt-breakpoints.css` actually declares — add a name there directly if you
need one that isn't listed:

```css
/* individual, mobile-first */
--dt-breakpoints-xs        (max-width: 512px)
--dt-breakpoints-s         (min-width: 513px)
--dt-breakpoints-m         (min-width: 1240px)
--dt-breakpoints-l         (min-width: 1680px)

/* combined ranges */
--dt-breakpoints-xs-s      (max-width: 1239.98px)
--dt-breakpoints-xs-m      (max-width: 1679.98px)
--dt-breakpoints-s-m       (min-width: 513px) and (max-width: 1679.98px)
```

Usage:

```css
.nav { display: none; }

@media (--dt-breakpoints-m) {
  .nav { display: block; }
}
```

## Layout tokens

`--dt-margin` and `--dt-gutter` are reassigned per tier. Use them rather than
re-deriving the numbers:

```css
.page { padding-inline: var(--dt-margin); }
.grid { gap: var(--dt-gutter); }
```

## Resolution tiers ≠ breakpoints

Resolution is device pixel ratio, not viewport width. It is handled entirely in CSS,
in `dt-tokens.css`, and affects only border widths and font weights — see `tokens.md`.
There is **no JavaScript involved**, and you should never add any.

Override classes exist if a surface must be pinned:
`.dt-resolution-standard`, `.dt-resolution-mid`, `.dt-resolution-high`.

## Legacy queries in this bundle

The antora-default fork used `768.5 / 769 / 1023.5 / 1024 / 1216` with a half-pixel
convention. Every one of these is being replaced by a `@custom-media` name; if you
find a raw width query in `src/css`, it has not been migrated yet — migrate it rather
than adding another.
