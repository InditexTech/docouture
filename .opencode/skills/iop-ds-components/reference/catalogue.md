# IDS component catalogue

Package root below is `@inditex/sewingiopdsweb-react-components@1.28.0`; paths are
relative to it. The Figma counterpart is *IDS &lt;Name&gt;* in file `k7yFLKOvab4OBB1v6xhM6i`
(one component per page).

`status` is how pdocs uses the component:

- **chrome** — rendered by a Handlebars partial
- **content** — mapped onto Asciidoctor output with CSS only
- **extension** — rendered by an Asciidoctor extension
- **available** — shipped by the DS, not used yet
- **n/a** — application-only, no place in a docs site

Always confirm class names against the stylesheet before writing markup:

```console
$ grep -o '\.ids-[a-z0-9_-]*' \
    code/node_modules/@inditex/sewingiopdsweb-react-components/tabs/tabs.css | sort -u
```

## Site chrome

| IDS component | block | path | status | pdocs use |
| --- | --- | --- | --- | --- |
| Header | `.ids-header` | `header/*.css` (3) | chrome | site navbar, brand, search slot |
| Menu | `.ids-menu` | `menu/*.css` | chrome | component/version explore panel |
| List | `.ids-list`, `.ids-list-item` | `list/*.css` (5) | chrome | nav tree, `nav-tree.hbs` |
| Toolbar | `.ids-toolbar` | `toolbar/toolbar.css` | chrome | page toolbar strip |
| Breadcrumbs | `.ids-breadcrumbs`, `.ids-breadcrumb-item` | `breadcrumbs/*.css` (4) | chrome | `breadcrumbs.hbs` |
| Pagination | `.ids-pagination` | `pagination/pagination.css` | chrome | prev/next page links |
| Sidebar | `.ids-sidebar` | `sidebar/*.css` (4) | chrome | mobile nav drawer |
| Search Field | `.ids-search-field` | `search-field/*.css` | chrome | navbar search, when a provider is configured |
| Dropdown | `.ids-dropdown` | `dropdown/*.css` | chrome | version selector menu |
| Button | `.ids-button` | `button/button.css` | chrome | every button; theme toggle, edit-this-page |
| Icon | `.ids-icon` | `icon/icon.css` | chrome | icon sizing wrapper |
| Divider | `.ids-divider` | `divider/divider.css` | chrome | panel separators |
| Avatar | `.ids-avatar` | `avatar/avatar.css` | available | |
| Badge | `.ids-badge` | `badge/badge.css` | available | |
| Tooltip | `.ids-tooltip` | `tooltip/*.css` (2) | available | needs JS positioning |
| Floating Button / Bar | `.ids-floating-*` | `floating-*/` | available | candidate for back-to-top |

## Document content

| IDS component | block | path | status | pdocs use |
| --- | --- | --- | --- | --- |
| Banner | `.ids-banner` | `banner/banner.css` | content | **admonitions** — see mapping below |
| Code Block | `.ids-code-block` | `code-block/code-block.css` | content | `<pre class="highlight">` output |
| Label | `.ids-label` | `label/label.css` | content | inline metadata |
| Text | `.ids-text` | `text/text.css` | content | prose helpers |
| Tag | `.ids-tag` | `tag/tag.css` | content | keywords, version chips |
| Image | `.ids-image` | `image/*.css` (4) | content | block images, with fallback/loader states |
| Loader | `.ids-loader` | `loader/loader.css` | available | |
| Skeleton | `.ids-skeleton` | `skeleton/skeleton.css` | available | |
| Empty State | `.ids-empty-state` | `empty-state/*.css` (2) | content | the 404 page |
| Grid Layout | `.ids-grid-layout` | `grid-layout/grid-layout.css` | content | card grids, uses `--ids-gutter` |

### Admonition mapping

Asciidoctor emits `.admonitionblock.note|tip|important|caution|warning`. Map each onto
a Banner modifier in CSS — no extension, no markup change:

| AsciiDoc | Banner modifier | hue |
| --- | --- | --- |
| `NOTE` | `.ids-banner--info` | `alt-blue` |
| `TIP` | `.ids-banner--success` | `alt-green` |
| `WARNING` | `.ids-banner--warning` | `alt-orange` |
| `IMPORTANT` | `.ids-banner--error` | `alt-red` |
| `CAUTION` | `.ids-banner--warning` | `alt-orange` |

The DS has five banner variants (`--ai`, `--info`, `--success`, `--warning`, `--error`)
and AsciiDoc has five admonitions, but they are not one-to-one: `CAUTION` and `WARNING`
both mean "be careful", so both take `--warning`. Do not invent a sixth variant.

## Candidates for Asciidoctor extensions

Content components with no AsciiDoc equivalent. Build in this order — each is one
extension emitting DS markup, with the DS stylesheet imported and little or no new CSS.

| IDS component | block | path | notes |
| --- | --- | --- | --- |
| Tabs | `.ids-tabs`, `.ids-tabs__list`, `.ids-tabs__indicator` | `tabs/*.css` (2) | modifiers `--solid` / `--underlined`; needs a small JS controller and `aria-selected` |
| Card | `.ids-card` | `card/card.css` | `--horizontal` / `--vertical` / `--selected`; slot elements for image corners |
| Accordion | `.ids-accordion` | `accordion/accordion.css` | `--expanded` / `--disabled`; wrap `<details>` so it degrades without JS |
| Progress Steps | `.ids-progress-step` | `progress-steps/*.css` (4) | numbered procedures |
| Timeline | `.ids-timeline-item-marker` | `timeline/*.css` (2) | changelogs, roadmaps |
| KPI | `.ids-kpi` | `kpi/kpi.css` | metric callouts |
| Lightbox | `.ids-lightbox` | `lightbox/lightbox.css` | image zoom; JS required |
| Media Gallery | `.ids-media-gallery` | `media-gallery/*.css` | screenshot galleries |
| Carousel | `.ids-carousel` | `carousel/carousel.css` | rarely right for docs |

## Not applicable

Form and application components — Datagrid, Date/Time/Color Picker, Text/Number/Password
Field, Select, Checkbox, Radio, Switch, Slider, Stepper, File Uploader, Modal, Message,
Event Calendar, Charts, Map Chart, AI Launcher, Code Editor, Android Status Bar.

A documentation site renders content; it does not collect input. If one of these seems
necessary, the requirement is probably wrong. Exceptions worth considering later:
Modal (image lightbox), Tree (nav), Notification (build/version banners).
