# IDS tokens — inventory

Source of truth: `@inditex/sewingiopdsweb-styles@1.28.0`.
Values below are transcribed for reading convenience; **the package is authoritative**.
If you need certainty, grep `node_modules/@inditex/sewingiopdsweb-styles/variables/index.css`.

## Colour

Every colour token has a light and a dark value. A rule that references the token
needs no dark-mode counterpart.

### content — text and icons

| token | light | dark |
| --- | --- | --- |
| `--ids-color-content-default` | `#000000` | `#ffffff` |
| `--ids-color-content-low` | `#757575` | `#c4c4c4` |
| `--ids-color-content-inverse` | `#ffffff` | `#000000` |
| `--ids-color-content-states-hover` | `#757575` | `#c4c4c4` |
| `--ids-color-content-states-pressed` | `#363636` | `#d4d4d4` |
| `--ids-color-content-states-disabled` | `#b3b3b3` | `#757575` |

### bg — surfaces

| token | light | dark |
| --- | --- | --- |
| `--ids-color-bg-default` | `#ffffff` | `#000000` |
| `--ids-color-bg-low` | `#f7f7f7` | `#363636` |
| `--ids-color-bg-inverse` | `#000000` | `#ffffff` |
| `--ids-color-bg-overlay` | `#ffffffcc` | `#000000cc` |
| `--ids-color-bg-states-hover` | `#f7f7f7` | `#434343` |
| `--ids-color-bg-states-pressed` | `#ededed` | `#515151` |
| `--ids-color-bg-states-disabled` | `#f7f7f7` | `#434343` |

### border

| token | light | dark |
| --- | --- | --- |
| `--ids-color-border-default` | `#000000` | `#ffffff` |
| `--ids-color-border-low` | `#e3e3e3` | `#5e5e5e` |
| `--ids-color-border-inverse` | `#ffffff` | `#000000` |
| `--ids-color-border-states-hover` | `#757575` | `#c4c4c4` |
| `--ids-color-border-states-pressed` | `#363636` | `#d4d4d4` |
| `--ids-color-border-states-disabled` | `#ededed` | `#434343` |
| `--ids-color-border-states-focus` | `#0170e9` | `#0084ff` |

`--ids-color-border-states-focus` is the **only** focus colour. Every focus ring in
the bundle is `outline: var(--ids-size-border-high) solid var(--ids-color-border-states-focus)`
with `outline-offset: var(--ids-size-25)`, matching the DS components.

### core — brand

| token | light | dark |
| --- | --- | --- |
| `--ids-color-core-ai-high` | `#1a1aff` | `#6680ff` |
| `--ids-color-core-ai-low` | `#f5f5fd` | `#02004e` |
| `--ids-color-core-sales` | `#23f444` | `#23f444` |

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
is carried by the `alt` hues, exactly as the DS Banner does:

| meaning | token |
| --- | --- |
| info / note | `--ids-color-alt-blue-*` |
| success / tip | `--ids-color-alt-green-*` |
| warning / caution | `--ids-color-alt-orange-*` |
| error / important | `--ids-color-alt-red-*` |
| ai | `--ids-color-core-ai-*` |

### viz — data visualisation

`--ids-color-viz-basic-level-{01..04}`, `--ids-color-viz-item-{1..5}-level-{01..04}`,
`--ids-color-viz-semantic-{others,success,danger,ai}`. Use for charts and diagrams only,
never for UI chrome.

### comp — component-scoped

`--ids-comp-button-*`, `--ids-comp-switch-*`, `--ids-comp-datagrid-*`,
`--ids-comp-skeleton-*`, `--ids-comp-media-gallery-overlay`, `--ids-comp-ai-launcher-content`.
Prefer the generic token; reach for `--ids-comp-*` only when restyling that exact component.

## Size

One scale for spacing, dimensions, gaps and radii. Values shown for `.ids-scale-medium`
(pdocs default); `.ids-scale-large` rescales all of them.

| token | medium | large |
| --- | --- | --- |
| `--ids-size-0` | 0px | 0px |
| `--ids-size-6` | 1px | 1px |
| `--ids-size-12` | 2px | 2px |
| `--ids-size-25` | 4px | 6px |
| `--ids-size-50` | 8px | 12px |
| `--ids-size-75` | 12px | 16px |
| `--ids-size-100` | 16px | 20px |
| `--ids-size-125` | 20px | 26px |
| `--ids-size-150` | 24px | 32px |
| `--ids-size-200` | 32px | 40px |
| `--ids-size-250` | 40px | 50px |
| `--ids-size-300` | 48px | 64px |
| `--ids-size-350` | 56px | 72px |
| `--ids-size-400` | 64px | 84px |
| `--ids-size-450` | 72px | 94px |
| `--ids-size-500` | 80px | 104px |
| `--ids-size-600` | 96px | 124px |
| `--ids-size-700` | 112px | 144px |
| `--ids-size-800` | 128px | 168px |
| `--ids-size-900` | 144px | 188px |

Mnemonic at medium scale: **token number ÷ 6.25 = px**, so `--ids-size-100` is 16px.
Do not rely on it at large scale — the ladder is authored, not computed.

The Figma sizing page documents further steps (`ids-size-1000`…`ids-size-2400`) that
the package does not ship. If you need one, it does not exist — use the largest that does.

### Semantic size — resolution-aware

| token | standard | mid | high |
| --- | --- | --- | --- |
| `--ids-size-border-none` | 0px | 0px | 0px |
| `--ids-size-border-default` | 1px | 1px | 0.5px |
| `--ids-size-border-high` | 2px | 2px | 1px |
| `--ids-size-radius-none` | 0px | 0px | 0px |
| `--ids-size-radius-rounded` | 4px | 4px | 4px |
| `--ids-size-radius-full` | 144px | 144px | 144px |

Radius does not vary; only border width does.

### Layout

`--ids-margin` and `--ids-gutter` change per breakpoint — see `breakpoints.md`.
`--comp-grid-margin-{xs,s,m,l}` hold the fixed per-tier values (16/32/56/64px).

## Font weight

| token | standard | mid-res | high-res |
| --- | --- | --- | --- |
| `--ids-typo-font-weight-default` | 400 | 350 | 350 |
| `--ids-typo-font-weight-mid` | 500 | 400 | 400 |
| `--ids-typo-font-weight-high` | 600 | 500 | 500 |

These are **density compensation, not an emphasis scale**. For emphasis use the
`-high` variant of a typography style (`--ids-typo-body-m-high`), which selects
`font-weight-mid` for you.

## z-index

| token | value |
| --- | --- |
| `--ids-z-auto` | `auto` |
| `--ids-z-base` | 0 |
| `--ids-z-sticky` | 1 |
| `--ids-z-modal-drawer` | 10 |
| `--ids-z-modal` | 20 |
| `--ids-z-dropdown` | 100 |
| `--ids-z-overlay` | 400 |
| `--ids-z-toast` | 700 |
| `--ids-z-tooltip` | 900 |
| `--ids-z-max` | 9999 |

The bundle's legacy `--z-index-{nav,toolbar,page-version-menu,navbar}` map onto
`--ids-z-{base,sticky,dropdown,sticky}` through `bridge.css`.
