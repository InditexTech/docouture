# Design tokens — inventory

Hand-maintained in `code/packages/ui-bundle/src/css/dt-tokens.css`. Values below are
transcribed for reading convenience; **that file is authoritative** — if you need
certainty, grep it directly.

## Colour

Every colour token has a light and a dark value. A rule that references the token
needs no dark-mode counterpart.

### content — text and icons

| token | light | dark |
| --- | --- | --- |
| `--dt-color-content-default` | `#000000` | `#ffffff` |
| `--dt-color-content-low` | `#757575` | `#c4c4c4` |
| `--dt-color-content-inverse` | `#ffffff` | `#000000` |
| `--dt-color-content-states-hover` | `#757575` | `#c4c4c4` |
| `--dt-color-content-states-pressed` | `#363636` | `#d4d4d4` |
| `--dt-color-content-states-disabled` | `#b3b3b3` | `#757575` |

### bg — surfaces

| token | light | dark |
| --- | --- | --- |
| `--dt-color-bg-default` | `#ffffff` | `#000000` |
| `--dt-color-bg-low` | `#f7f7f7` | `#363636` |
| `--dt-color-bg-inverse` | `#000000` | `#ffffff` |
| `--dt-color-bg-overlay` | `#ffffffcc` | `#000000cc` |
| `--dt-color-bg-states-hover` | `#f7f7f7` | `#434343` |
| `--dt-color-bg-states-pressed` | `#ededed` | `#515151` |
| `--dt-color-bg-states-disabled` | `#f7f7f7` | `#434343` |

### border

| token | light | dark |
| --- | --- | --- |
| `--dt-color-border-default` | `#000000` | `#ffffff` |
| `--dt-color-border-low` | `#e3e3e3` | `#5e5e5e` |
| `--dt-color-border-inverse` | `#ffffff` | `#000000` |
| `--dt-color-border-states-hover` | `#757575` | `#c4c4c4` |
| `--dt-color-border-states-pressed` | `#363636` | `#d4d4d4` |
| `--dt-color-border-states-disabled` | `#ededed` | `#434343` |
| `--dt-color-border-states-focus` | `#0170e9` | `#0084ff` |

`--dt-color-border-states-focus` is the **only** focus colour. Every focus ring in
the bundle is `outline: var(--dt-size-border-high) solid var(--dt-color-border-states-focus)`
with `outline-offset: var(--dt-size-25)`.

### core — brand

| token | light | dark |
| --- | --- | --- |
| `--dt-color-core-ai-high` | `#1a1aff` | `#6680ff` |
| `--dt-color-core-ai-low` | `#f5f5fd` | `#02004e` |
| `--dt-color-core-sales` | `#23f444` | `#23f444` |

### alt — accent hues

`high` is the saturated hue (text/icon/solid fill), `low` is the tint (subtle surface),
`mid` is an alias onto the corresponding `viz` colour.

| hue | high (L/D) | low (L/D) |
| --- | --- | --- |
| red | `#c93b3a` / `#fe9693` | `#fff0f0` / `#4a0e0f` |
| orange | `#b65321` / `#feb48d` | `#fff4e5` / `#4a1e0a` |
| green | `#178329` / `#9df5ab` | `#f1fdf1` / `#0a2a12` |
| teal | `#0c7878` / `#80e8d1` | `#ebfffa` / `#023f31` |
| blue | `#1b5ea7` / `#89c1fe` | `#ebf5ff` / `#07294a` |
| purple | `#6b3daf` / `#d4bbfb` | `#f6f0ff` / `#28144a` |
| pink | `#d32475` / `#fabbe8` | `#fff5fc` / `#481339` |

There is **no** `success` / `warning` / `error` semantic colour family. Status meaning
is carried by the `alt` hues:

| meaning | token |
| --- | --- |
| info / note | `--dt-color-alt-blue-*` |
| success / tip | `--dt-color-alt-green-*` |
| warning / caution | `--dt-color-alt-orange-*` |
| error / important | `--dt-color-alt-red-*` |
| ai | `--dt-color-core-ai-*` |

### viz — data visualisation

`--dt-color-viz-basic-level-{01..04}`, `--dt-color-viz-item-{1..5}-level-{01..04}`,
`--dt-color-viz-semantic-{others,success,danger,ai}`. Use for charts and diagrams only,
never for UI chrome.

### comp — component-scoped

`--dt-comp-button-*`, `--dt-comp-switch-*`, `--dt-comp-datagrid-*`,
`--dt-comp-skeleton-*`, `--dt-comp-media-gallery-overlay`, `--dt-comp-ai-launcher-content`.
Prefer the generic token; reach for `--dt-comp-*` only when restyling that exact component.

## Size

One scale for spacing, dimensions, gaps and radii. Values shown for `.dt-scale-medium`
(docouture default); `.dt-scale-large` rescales all of them.

| token | medium | large |
| --- | --- | --- |
| `--dt-size-0` | 0px | 0px |
| `--dt-size-6` | 1px | 1px |
| `--dt-size-12` | 2px | 2px |
| `--dt-size-25` | 4px | 6px |
| `--dt-size-50` | 8px | 12px |
| `--dt-size-75` | 12px | 16px |
| `--dt-size-100` | 16px | 20px |
| `--dt-size-125` | 20px | 26px |
| `--dt-size-150` | 24px | 32px |
| `--dt-size-200` | 32px | 40px |
| `--dt-size-250` | 40px | 50px |
| `--dt-size-300` | 48px | 64px |
| `--dt-size-350` | 56px | 72px |
| `--dt-size-400` | 64px | 84px |
| `--dt-size-450` | 72px | 94px |
| `--dt-size-500` | 80px | 104px |
| `--dt-size-600` | 96px | 124px |
| `--dt-size-700` | 112px | 144px |
| `--dt-size-800` | 128px | 168px |
| `--dt-size-900` | 144px | 188px |

Mnemonic at medium scale: **token number ÷ 6.25 = px**, so `--dt-size-100` is 16px.
Do not rely on it at large scale — the ladder is authored, not computed.

Larger steps (`dt-size-1000`…`dt-size-2400`) don't exist in this scale — use the
largest one that does.

### Semantic size — resolution-aware

| token | standard | mid | high |
| --- | --- | --- | --- |
| `--dt-size-border-none` | 0px | 0px | 0px |
| `--dt-size-border-default` | 1px | 1px | 0.5px |
| `--dt-size-border-high` | 2px | 2px | 1px |
| `--dt-size-radius-none` | 0px | 0px | 0px |
| `--dt-size-radius-rounded` | 4px | 4px | 4px |
| `--dt-size-radius-full` | 144px | 144px | 144px |

Radius does not vary; only border width does.

### Layout

`--dt-margin` and `--dt-gutter` change per breakpoint — see `breakpoints.md`.
`--comp-grid-margin-{xs,s,m,l}` hold the fixed per-tier values (16/32/56/64px).

## Font weight

| token | standard | mid-res | high-res |
| --- | --- | --- | --- |
| `--dt-typo-font-weight-default` | 400 | 350 | 350 |
| `--dt-typo-font-weight-mid` | 500 | 400 | 400 |
| `--dt-typo-font-weight-high` | 600 | 500 | 500 |

These are **density compensation, not an emphasis scale**. For emphasis use the
`-high` variant of a typography style (`--dt-typo-body-m-high`), which selects
`font-weight-mid` for you.

## z-index

| token | value |
| --- | --- |
| `--dt-z-auto` | `auto` |
| `--dt-z-base` | 0 |
| `--dt-z-sticky` | 1 |
| `--dt-z-modal-drawer` | 10 |
| `--dt-z-modal` | 20 |
| `--dt-z-dropdown` | 100 |
| `--dt-z-overlay` | 400 |
| `--dt-z-toast` | 700 |
| `--dt-z-tooltip` | 900 |
| `--dt-z-max` | 9999 |

The bundle's legacy `--z-index-{nav,toolbar,page-version-menu,navbar}` map onto
`--dt-z-{base,sticky,dropdown,sticky}` through `bridge.css`.
