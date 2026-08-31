# Component catalogue

Every component `dt-components.css` actually defines, with what docouture uses it for.
Always confirm class names against the stylesheet before writing markup — it's a
single file, not a package to install:

```console
$ grep -o '\.dt-[a-z0-9_-]*' code/packages/ui-bundle/src/css/dt-components.css | sort -u
```

## Components

| component | block | docouture use |
| --- | --- | --- |
| Text | `.dt-text` | typography utilities (`.dt-text--*`) — chrome copy only, not doc prose (see `vars.css`) |
| Button | `.dt-button` | every button: `--ghost`/`--icon-only` header toolbar actions (GH-7, GH-8), the `[card]` call to action (GH-20) |
| Tag | `.dt-tag` | `--solid`/`--selected` header toolbar version tag (GH-7) |
| Option picker | `.dt-option-picker`, `.dt-option-picker-item`, `.dt-option-picker-button` | grouped toggle control |
| List | `.dt-list`, `.dt-list-item` | nav `<ul>` reset (GH-8); `[--tree--level-N]` layout/indent only — state colours are docouture's own, see `side-menu.css` |
| Logo | `.dt-logo` | product symbol fill (GH-8) |
| Grid layout | `.dt-grid-layout` | `[--with-margin]` header/toolbar/hero container (GH-8, GH-9); also the content/ToC container (GH-10, `main.hbs`) |
| Breadcrumbs | `.dt-breadcrumbs`, `.dt-breadcrumb-item` | `breadcrumbs.hbs` — deliberately a partial vendor: only the flex-row container and the crumb + divider, not the JS-driven overflow-collapse trigger this bundle never renders |
| Label | `.dt-label` | `--white` hero page tags (GH-9); `--grey` `[card,labels=…]` meta chips (GH-20); `--green`/`--orange` "Latest"/"Prerelease" pill on the version dropdown (GH-103) |
| Card | `.dt-card` | `--vertical`/`__image`/`__content` — the card behind the `[cards]` block (GH-20, `asciidoc-extensions/lib/card-grid.js`) |
| Tabs | `.dt-tabs-item` | `[feature-tabs]` labels (GH-22) and the content-tabs extension — a single-dash sub-block, not a typo for `.dt-tabs__item`; only this file is vendored, not the flex-row/sliding-indicator variant this bundle never renders |
| Accordion | `.dt-accordion` | GH-61, backs `[%collapsible]` via `.doc details` restyling (see `accordion.css`'s own header for why it doesn't apply the selectors directly) |
| Modal | `.dt-modal` | GH-66, the search dialog shell — a native `<dialog>` carries `.dt-modal`'s flex-centering layout instead of a React portal |
| Overlay | `.dt-overlay` | the search dialog's backdrop |
| Search field | `.dt-search-field-minimal` | the search dialog's input row; also styles `preview-src/layouts/icons.hbs`'s filter box (GH-66) |
| Highlight | `.dt-highlight__mark` | matched-term highlight in search results |
| Empty state | `.dt-empty-state`, `.dt-empty-state-footer` | "no results" state |
| Loader | `.dt-loader` | index-loading state |
| Floating button | `.dt-floating-button` | XS search trigger (S4, GH-68) |

`timeline.css`/`timeline-item.css` are also present (vendored for an `--expandable`
variant accordion.css needed a base for, GH-61) but nothing in this bundle renders a
timeline directly — don't treat their presence as "timeline is available to use", they
exist to back the Accordion entry above.

## Admonitions

Asciidoctor emits `.admonitionblock.note|tip|important|caution|warning` on its own —
there's no vendored "notification" component behind them. `doc.css` maps each type
straight onto two custom properties, tint and icon mask:

| AsciiDoc | tint | icon |
| --- | --- | --- |
| `NOTE` | `--dt-color-alt-purple-low` | `sticky-note` |
| `TIP` | `--dt-color-alt-teal-low` | `message-circle` |
| `WARNING` | `--dt-color-alt-orange-low` | `triangle-alert` |
| `IMPORTANT` | `--dt-color-alt-blue-low` | `circle-check-big` |
| `CAUTION` | `--dt-color-alt-red-low` | `octagon-alert` |

See `doc.css`'s `.doc .admonitionblock.*` rules — five small blocks, no shared base
class, easy to misread as more than they are.

## Adding to this catalogue

A new component belongs here once it's written into `dt-components.css` (see
SKILL.md's "Adding a component") — add a row with its block, what it's for, and any
grammar exception it carries.
