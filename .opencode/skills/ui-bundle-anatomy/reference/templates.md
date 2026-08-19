# Templates, helpers and the UI model

Antora renders each page by picking a layout from `layouts/`, evaluating it with
Handlebars against the **UI model**, and resolving `{{> name}}` against the partials
registered from `partials/`. Registration is by basename — there is no manifest.

## Layouts

| layout | used for |
| --- | --- |
| `default.hbs` | every page |
| `home.hbs` | the landing page (`:page-layout: home`) |
| `404.hbs` | the not-found page |

A page selects one with the `page-layout` AsciiDoc attribute; the default is `default`.
`default.hbs` and `404.hbs` are the same shell — doctype, `<head>` via the `head` partial,
then `header` / `body` / `footer` — differing in the `<body>` class (`article` vs
`status-404`) and the `defaultPageTitle` hash argument passed to `head`.

`home.hbs` shares the `head`, `header` (in its `variant='home'` state) and side menu with
the doc view, and replaces everything below them: no hero, no ToC, no `.doc` article and no
page footer. Its `main` is a design system grid holding a sticky hero column and a content
column into which `page.contents` is dropped whole — see `src/css/home.css`. Its footer is
`site-footer`, not `footer`.

`default.hbs` also puts `page.attributes.role` (or `page.role`) on the body element, which
is how a page opts into per-page styling.

## Partial tree

```
default.hbs
├── head                    (defaultPageTitle=…)
│   ├── head-prelude        charset, viewport, inline theme bootstrap
│   ├── head-title          <title>: page | site, "|"-separated
│   ├── head-info           canonical, rel=prev/next, description, keywords, generator
│   ├── head-styles         IDS webfont CSS from the CDN, then css/site.css
│   ├── head-meta           empty extension point
│   ├── head-scripts        Google Analytics, if site.keys.googleAnalytics
│   └── head-icons          favicon, currently commented out
├── header
│   ├── header-scripts      empty extension point
│   └── header-content      navbar: brand, optional search field, burger, menu
├── body
│   ├── nav                 .nav-container, data-component / data-version
│   │   ├── nav-menu        the current component's nav tree
│   │   │   └── nav-tree    recursive; recurses into itself with level=(increment level)
│   │   └── nav-explore     component + version switcher
│   └── main
│       ├── toolbar
│       │   ├── nav-toggle
│       │   ├── breadcrumbs
│       │   ├── page-versions
│       │   ├── theme-toggle
│       │   └── edit-this-page
│       ├── toc             (not on 404) empty shell; filled by 02-on-this-page.ts
│       ├── article         (not on 404) h1 + {{{page.contents}}} + pagination
│       │   └── pagination
│       └── article-404     (404 only)
└── footer
    ├── footer-content      static copy; still says "Antora default UI"
    └── footer-scripts      js/site.js, js/vendor/highlight.js, optional search scripts
```

`main.hbs` branches on `(eq page.layout '404')` to choose between `article-404` and
`toc` + `article`.

`home.hbs`'s own tree is `head` + `header` (`variant='home'`) + `nav` + `home` (the two
grid columns) + `site-footer` + `footer-scripts`. `site-footer.hbs` is four columns —
brand, authored links, module links, copyright — where the two link columns come from
`page.componentVersion.footer`, attached by `@inditextech/pdocs-antora-extensions` from the
`footer` key in `antora.yml` (the playbook's `site.keys` is a flat primitive map and cannot
carry a list). The modules column lists every navigation tree that has a `startUrl`, and
falls back to the second authored group when the component has fewer than two of them.

`nav-menu.hbs` and `nav-switcher.hbs` both key off
`(or page.attributes.[nav-module] page.module)`, so a page can borrow another module's
navigation with `:page-nav-module:`. The landing needs it: it lives in `ROOT`, which
usually has no navigation of its own. The alternative is giving `ROOT` a `nav.adoc` and
declaring it `switcher: false` in `nav_modules` — a menu that belongs to no module. There
is deliberately no implicit fallback to "the first tree".

`footer-scripts.hbs` references a `search-scripts` partial when `env.SITE_SEARCH_PROVIDER`
is set. **That partial does not exist in this bundle** — setting the variable without
adding it will fail the render. `header-content.hbs` has the matching search input behind
the same flag.

`footer-content.hbs` and the top navbar in `header-content.hbs` are still upstream
placeholder content (dummy Products/Services dropdowns, an MPL notice about the Antora
default UI). Treat them as unfinished, not as intent.

## Conventions templates rely on

- **`{{{uiRootPath}}}`** — path from the current page to the UI root (`_`). Every asset
  reference uses it, triple-braced so it is not HTML-escaped.
- **`{{{relativize url}}}`** — every internal link goes through it, so a site works served
  from a subdirectory or straight off the filesystem.
- **`{{{…}}}` for anything containing markup** — `page.contents`, nav `content`,
  breadcrumb `content`, titles.
- **`data-*` attributes carry state to the browser scripts.** `#site-script` exposes
  `data-ui-root-path`, read by `06-copy-to-clipboard.ts`; `toc.hbs` carries `data-title`
  and `data-levels`; `nav.hbs` carries `data-component` / `data-version`; nav panels are
  keyed by `data-panel=menu|explore`.
- **Controls that need JavaScript ship hidden.** `theme-toggle.hbs` is `hidden` until
  `08-theme.ts` unhides it; `.nav-menu-toggle` starts `display: none`. A page must be
  readable and correctly styled with JS off.
- **State is expressed as `is-*` classes** in this bundle's own chrome (`is-current`,
  `is-active`, `is-current-page`, `is-latest`, `is-missing`). Note that DS components do
  **not** work this way — see `iop-ds-components`.
- **The inline theme bootstrap in `head-prelude.hbs`** runs before first paint, reads
  `localStorage['ids-theme']`, falls back to `prefers-color-scheme`, and adds
  `ids-theme-<theme>` plus `ids-scale-medium` to `<html>`. It duplicates logic in
  `src/js/08-theme.ts` on purpose; keep the storage key and class names in sync.

## UI model

The shape Antora passes to the templates. `preview-src/ui-model.yml` imitates a subset of
it — see `preview.md` for what the fixture omits.

| key | contents |
| --- | --- |
| `site` | `url`, `title`, `homeUrl`, `components[]` (each with `versions[]`, `latestVersion`), `keys` |
| `page` | `title`, `contents`, `url`, `description`, `keywords`, `layout`, `attributes` (the `page-` prefixed AsciiDoc attributes, prefix stripped), `component`, `componentVersion`, `version`, `navigation`, `breadcrumbs`, `versions`, `previous`, `next`, `canonicalUrl`, `editUrl`, `fileUri`, `origin`, `home`, `role` |
| `uiRootPath` | path to the UI root from this page |
| `siteRootPath` | path to the site root from this page |
| `antoraVersion` | generator version, used in a meta tag |
| `env` | `process.env`, so templates can branch on `CI`, `SITE_SEARCH_PROVIDER`, `FORCE_SHOW_EDIT_PAGE_LINK` |

`page.attributes` is where per-page switches live: `toctitle`, `toclevels`, `pagination`
(`prev`/`next`/unset), `role`.

## Helpers

Ours, in `src/helpers/` — filename is the helper name, each file ends in `export =`:

| helper | behaviour |
| --- | --- |
| `and a b` | with two operands returns the **deciding value**, not a boolean, so it doubles as a selector; with more, reduces to a boolean |
| `or a b` | same, as a fallback selector — `{{detag (or page.title defaultPageTitle)}}` |
| `not v` | negation |
| `eq a b` / `ne a b` | strict (in)equality |
| `increment n` | `n + 1`, treating falsy as 0 — drives `nav-tree` depth |
| `detag html` | strip all HTML tags; `attribute=true` also escapes `"` for attribute values |
| `relativize to` | rewrite a root-relative URL relative to the current page; also accepts the legacy `(to, from)` form |
| `year` | current year |

Both `and` and `or` inspect `arguments.length` because Handlebars appends an options
object to every call — that is why the arity checks look off by one.

`relativize` returns `#` for an empty target, passes through anything not starting with
`/`, and prefixes `site.path` when the page URL is unknown. It preserves a `#fragment`
across the rewrite.

`resolvePage` and `resolvePageURL` are registered **only by the preview harness**. They do
not exist in a real Antora build — do not use them from a partial.

Handlebars' own built-ins (`if`, `unless`, `each`, `with`, `lookup`) are used throughout;
`with` is the idiomatic way this bundle guards optional model branches.

## Adding a partial or helper

A partial: create `src/partials/name.hbs`, include it as `{{> name}}`. No registration
step, no build config. It appears in the bundle on the next build.

A helper: create `src/helpers/name.ts`, export with `export =` (not `export default`),
type the trailing options argument as `HelperOptions` from `../../types/ui` if you need
`hash` or `data.root`. It is compiled by `tsc`, staged into `helpers/`, and registered by
Antora under its basename.
