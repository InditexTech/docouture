---
name: docs-site-package
description: "How a documentation site package in pdocs (code/packages/example, code/packages/starter) is put together — the playbook, the component descriptor, the docs/ tree, the UI bundle link, and the Nx/pnpm wiring that makes `just dev` and `just build-site` work. USE WHEN creating a new site package, editing antora-playbook.yml or docs/antora.yml, changing a site's title, start page, output dir or content source, pointing a site at a different UI bundle, setting up multi-version docs (release tags, a stable/prerelease branch pair, the version dropdown, `urls.latest_version_segment`), or debugging a site that builds with zero pages, a missing start page or a stale UI. EXAMPLES: 'add a new docs site', 'the site builds but has no pages', 'start page not found', 'my UI change doesn't show up in the site', 'point this site at a published bundle', 'why is the content path repo-root relative', 'just dev says port in use', 'set up docs versioning', 'add a stable vs prerelease toggle', 'why does the version dropdown only show one entry'."
---

# Documentation site packages

`code/packages/starter` and `code/packages/example` are **site packages**: each one is an
Antora playbook plus the AsciiDoc it builds, wired into the workspace so Nx builds the UI
bundle first. They are byte-for-byte the same shape — `starter` is the minimal site meant
to be copied, `example` is the destination of the Fumadocs migration and currently a stub.

This skill is the package level: playbook, descriptor, wiring, commands. For **what to
write inside `docs/`** (pages, nav, xrefs, includes, extensions) read `asciidoc`; for the
UI those sites render through, read `ui-bundle-anatomy`.

## Layout

```
code/packages/<site>/
  package.json              name @inditextech/pdocs-<site>, private, deps: ui-bundle
  antora-playbook.yml       build entry point — the only Antora config
  docs/
    antora.yml              component descriptor: name, title, version, nav
    modules/ROOT/
      nav.adoc              navigation tree
      pages/*.adoc          one page per site URL
  build/site/               generated, gitignored — the built site
```

No `project.json`: Nx infers `build`, `dev` and `clean` from the `package.json` scripts,
and `targetDefaults` in `code/nx.json` supplies caching (`build` is cached with output
`{projectRoot}/build`; `dev` and `clean` are not).

## The four names that must agree

A site builds to zero pages, or dies on "start page not found", when these drift apart.

| value | lives in | must match |
| --- | --- | --- |
| component name (`example`) | `docs/antora.yml` → `name` | the `<component>::` prefix of `site.start_page`. It is also the site's **first URL segment** — `weavejs` in `/weavejs/main/…` — and has nothing to do with the `docs/` directory |
| start page (`index.adoc`) | playbook → `site.start_page` | a real file under `modules/ROOT/pages/` |
| content path | playbook → `content.sources[].start_path` | the directory holding `docs/antora.yml`, **relative to the repository root** |
| package name (`pdocs-<site>`) | `package.json` → `name` | the directory name — `just dev <site>` interpolates both |

## The playbook

`antora-playbook.yml` is the whole build. The shape both sites share, and why:

| key | value here | why |
| --- | --- | --- |
| `site.title` | per site | rendered in the header |
| `site.url` | commented out | required for sitemap and canonical links; only set for a real deployment |
| `site.start_page` | `<component>::index.adoc` | what `/` redirects to |
| `content.sources[].url` | `../../..` | the **git repository**, not a directory of files |
| `content.sources[].start_path` | `code/packages/<site>/docs` | resolved from the repo root, hence fully qualified |
| `content.sources[].branches` | `HEAD` | whatever is checked out, so uncommitted edits are picked up |
| `ui.bundle.url` | `../ui-bundle/build/ui-bundle.zip` | the sibling package's unversioned copy |
| `ui.bundle.snapshot` | `true` | local build, changes constantly — do not cache it |
| `output.dir` | `build/site` | matches the Nx `outputs` glob; changing it breaks caching |
| `output.clean` | `true` | Antora otherwise leaves whatever is already in the output directory, so a renamed component or a deleted page keeps being served from a previous build |
| `runtime.log.failure_level` | `warn` | a broken xref fails the build instead of shipping a gap |
| `asciidoc.attributes` | `experimental`, `icons: font`, `sectanchors`, `idprefix: ''`, `idseparator: '-'` | see `asciidoc` skill for what each enables |

`url: .`/`../../..` is the single most surprising line: Antora clones or reads a **git
repository**, so `start_path` is relative to the repository root regardless of where the
playbook sits. In a repository where the playbook is at the root, the source collapses to
`url: .` / `start_path: docs`.

Full key-by-key map, including the keys neither site sets yet (multiple sources, versioned
branches, extensions, `urls.*`): `reference/playbook.md`.

## Descriptor keys that are not Antora's

`site.keys` in the playbook is declared `primitive-map` — flat primitives only — and convict
rejects any playbook key outside its schema, so anything structured a site needs is authored
in `docs/antora.yml` and read by `@inditextech/pdocs-antora-extensions` (registered under
`antora.extensions`). Antora itself drops these keys; the extension reads them from the raw
aggregate before it does.

| key | what it does |
| --- | --- |
| `nav_modules` | per-module title, description and sprite icon for the side menu's module switcher. A **list**, never a map: `camelCaseKeys` rewrites nested keys and would rename every kebab-case module |
| `nav_modules[].switcher: false` | annotate a navigation tree without offering it as a module to switch to — what a landing page's own `modules/ROOT/nav.adoc` is |
| `nav_modules[].start_page` | where the switcher and the footer send someone who picks that module; a page ID. Defaults to the first internal page in its navigation |
| `footer` | the site footer's authored link groups: `footer.groups[].links[].{text,url}`. Group 1 is the footer's links column; group 2 is used for the modules column only on a site with fewer than two navigable modules |

`url` in a footer link is either a page ID — the same string you would write inside
`xref:…[]`, resolved against that component — or a literal URL. A page ID that resolves to
nothing is dropped with a warning rather than rendered as a dead link.

A page can also borrow another module's navigation with `:page-nav-module:`, which is how a
landing in `ROOT` gets a side menu at all. See the `ui-bundle-anatomy` skill.

## Constraints that fail silently

- **Antora needs at least one commit.** It reads content from git. A repository with no
  history resolves the content source to nothing and the site builds with zero pages,
  reported only as `Start page specified for site not found: <site>::index.adoc`.
  `just doctor` checks for this.
- **Uncommitted changes are picked up, untracked-and-ignored files are not.** `branches:
  HEAD` reads the worktree, but anything matched by `.gitignore` is invisible to the build.
- **The UI bundle must exist before the site builds.** The `workspace:*` dependency plus
  `dependsOn: ["^build"]` makes Nx build it first — which is why `just dev` and
  `just build-site` go through Nx and never call `antora` directly.
- **`snapshot: true` is what makes UI edits visible.** Without it Antora caches the bundle
  in `.cache` and every rebuild renders the stale UI. It must flip to `false` when the URL
  points at a published, immutable bundle.
- **`--fetch` belongs to the one-off build only.** `package.json`'s `build` script passes
  it; `scripts/dev.mjs` deliberately omits it, because on a watch loop it would re-fetch
  every remote content source on every keystroke.
- **`output.dir` is duplicated in `nx.json`.** Nx caches `{projectRoot}/build`. Point the
  playbook elsewhere and the build still works, once, then serves cached emptiness.
- **Versions move in lockstep.** `just bump` rewrites the workspace root and all three
  packages to one version. A site package's version is not independently meaningful.
- **The dev server is not Nx-managed.** `just dev` builds through Nx, then `exec`s
  `pnpm -C packages/<site> run dev`. `EADDRINUSE` on 5000 is usually a second dev server —
  or, on macOS, the AirPlay receiver. `just dev <site> <port>` takes a second port.

## Commands

Everything runs from anywhere via `just`; the raw form needs `code/` as the working
directory.

| command | does |
| --- | --- |
| `just dev example` | Nx build, then serve `build/site` on :5000 with rebuild-and-reload |
| `just dev starter 5001` | same, second port — two sites side by side |
| `just build-site starter` | `nx run @inditextech/pdocs-starter:build` |
| `just build` | every package, UI bundle included |
| `just preview-ui` | UI-only preview on :5252 — prefer it when content is not what changed |
| `pnpm -C packages/example run build` | raw Antora run, no Nx, no UI rebuild |

`scripts/dev.mjs` (shared by both sites, dependency-free) watches `docs/`,
`antora-playbook.yml` and `../ui-bundle/src`. A UI change rebuilds the bundle *and* the
site; a content change rebuilds the site only. A failed rebuild keeps serving the previous
output rather than a half-written site. Reload is an SSE stream plus a snippet injected
into HTML responses as they are served — nothing is written into the built site.

## Adding a site

Copy `starter`, rename in four places, install. Exact steps, including the Nx and
`just dev` conventions the name has to satisfy: `reference/new-site.md`.

## Versioning a site

`starter` still builds a single, unversioned component (`version: ~` in
`docs/antora.yml`). `example` is versioned under **Mode 2 (Stable + Prerelease)**
(GH #80): `main` permanently aggregates as the `prerelease` version, and a rolling
`stable` tag — force-moved to a fresh commit on each release by the
`pdocs-release.yml` workflow template (`.github/workflows/pdocs-release.yml` in a site
scaffolded by `pdocs new`) — aggregates as the `stable` version. The other supported
shape, **Mode 1 (Full History)** — a `next` branch plus every release tag kept forever —
is not wired up anywhere yet (GH #81). Full guidance, playbook examples and URL-routing
notes (`urls.latest_version_segment`): `reference/versioning-modes.md`.

## Reference

- `reference/playbook.md` — every playbook key that matters here, the ones deliberately
  unset, and how to retarget the UI bundle for a real deployment.
- `reference/new-site.md` — creating a new site package, and extracting one into a
  repository of its own.
- `reference/versioning-modes.md` — the two docs versioning modes (Mode 1: versioned tags,
  Mode 2: stable + prerelease), with `antora.yml`/playbook examples for each, and how
  `pdocs-release.yml` cuts a Mode 2 `stable` release.
