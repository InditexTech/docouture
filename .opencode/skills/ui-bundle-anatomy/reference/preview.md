# Preview harness and configuration

## What the preview is

`gulp preview` builds a small standalone site into `public/` and serves it on
`http://localhost:5252`, so the bundle can be developed without running Antora at all. It
is the fastest loop available for template and CSS work.

```
public/
├── _/            the staged bundle (identical layout to the zip)
├── index.html    rendered from preview-src/index.adoc
├── 404.html      rendered from preview-src/404.adoc
└── *.svg|png     images copied from preview-src
```

`preview:build` runs the real `build` task and the page renderer in parallel, then
`preview:serve` starts gulp-connect and watches `[src, preview-src]`, re-running
`preview:build` on any change. `LIVERELOAD=true` additionally wires gulp-connect's
livereload so the browser refreshes itself.

The server binds `0.0.0.0`; `serve.js` rewrites the startup log to show `localhost` and
the machine's first non-internal IPv4 address, so the preview is reachable from a phone
on the same network.

## How pages are rendered

`gulp.d/tasks/build-preview-pages.js` reimplements just enough of Antora:

1. Load `preview-src/ui-model.yml` as the base UI model.
2. Compile every `src/layouts/*.hbs`, register every `src/partials/*.hbs`, register every
   compiled helper from `.tsbuild/helpers`, and copy `preview-src/**/*.{png,svg}` to
   `public/` — all four as one merged stream.
3. Register the two preview-only helpers `resolvePage` / `resolvePageURL`, which fake
   Antora's page resolution by turning `component:page.adoc` into `/page.html`.
4. Load any Asciidoctor extensions listed under `asciidoc.extensions` in the model,
   register them, and set a `<name>-loaded` AsciiDoc attribute for each. The current
   fixture declares none, so this is the hook to use when previewing an extension from
   `code/packages/asciidoc-extensions`, not something already wired up.
5. For each `preview-src/**/*.adoc`: convert it, lift the `page-` prefixed attributes into
   `page.attributes` (prefix stripped), set `page.title` / `description` / `layout` /
   `contents`, compute `siteRootPath` and `uiRootPath`, render the chosen layout, write
   `.html`.

`404.adoc` skips conversion entirely and is rendered with `{ layout: '404', title: 'Page
Not Found' }`.

Fixed AsciiDoc attributes for the preview: `experimental`, `icons=font`, `sectanchors`,
`source-highlighter=highlight.js`.

Handlebars errors are rewritten by `transformHandlebarsError` to name the offending file —
it digs the partial name out of the stack frame `at Object.ret [as <partial>]` and reports
`src/partials/<name>.hbs`, or `src/layouts/<layout>.hbs` when the failure is in the layout.

### Dependency-version footguns baked into this file

- `@asciidoctor/core` 3 dropped the v2 factory export; the module object itself carries
  `load`, `convert` and `Extensions`.
- `@asciidoctor/core` 4 made `load` and `convert` **async** and requires a string, not a
  Buffer. The transform awaits both.
- `js-yaml` 4 removed `safeLoad`; `load` is safe by default.
- The stream is finished on `'end'`, not `'finish'`. `concat-streams` yields a `Readable`,
  which never emits `'finish'` — merge-stream's Duplex did, and waiting for it left the
  preview build hanging forever.
- The default sink must actually forward files. A `Transform` whose callback is never
  invoked stalls the pipeline at the object-mode highWaterMark.

## `preview-src/ui-model.yml`

A hand-written fixture standing in for what Antora computes. It uses YAML anchors heavily
so that "the current version" and "the latest version" are the *same object* — several
partials compare with `eq`, which is identity for objects, so the anchors are what make
`is-current` / `is-latest` light up.

It defines three components (`abc`, `xyz`, `123`) with multiple versions, a navigation
tree, breadcrumbs, page versions and the `site.homeUrl`. It does **not** define every
branch a real Antora model has — `site.keys`, `page.attributes` and `asciidoc.extensions`
are all absent, so the partials guarded on them render nothing here. Extend the fixture
when you add a partial that reads a branch it does not cover, or you will only find the
gap in a real site build.

## How preview differs from a release build

| | preview | release |
| --- | --- | --- |
| JS/CSS minified | no | yes |
| sourcemaps | inline JS, `.map` for CSS | only with `SOURCEMAPS=true` |
| `postcss-calc` | runs | runs inside cssnano |
| `cssnano` + pseudo-element fixer | no | yes |
| SVG optimisation | skipped | svgo |
| output | `public/` | `public/_` then zipped into `build/` |

Anything that only breaks under minification — a `:before` selector, a mangled legal
comment — will not show up in the preview. Check the release build before trusting it.

## TypeScript configuration

Three configs, because the package compiles two different worlds.

| file | scope | notable |
| --- | --- | --- |
| `tsconfig.json` | `src/helpers/**`, `types/**` | typecheck only (`noEmit`), `types: ["node"]`, `lib: ES2022`, strict via `tsconfig.base.json` |
| `tsconfig.helpers.json` | same sources | the **emit** config: `outDir: .tsbuild/helpers`, no sourcemaps, comments kept |
| `tsconfig.browser.json` | `src/js/**`, `types/browser.d.ts` | DOM libs, `moduleResolution: bundler`, `strict: false`, `noImplicitAny: false`, `strictNullChecks: false`, `noUncheckedIndexedAccess: false`, `allowJs` |

`module: node16` is inherited from `tsconfig.base.json` and the package has no
`"type": "module"`, so helpers compile to CommonJS — which, with `export =` in the
sources, sets `module.exports` to the helper function itself. That is the whole reason
this config exists.

`tsconfig.browser.json`'s relaxations are **transitional**. Those files are the upstream
Antora default UI scripts carried over as loose ES5 with implicit `any` and unchecked DOM
lookups, exempted from `strict` so the fork could land without rewriting untested
behaviour. Tighten them file by file as the UI is rewritten; do not relax anything else in
the workspace to match.

`types/ui.d.ts` and `types/browser.d.ts` live outside `src/` deliberately — Antora
registers every file in `helpers/` as a helper, so a shared module placed there would
become a bogus helper named after its file.

## Lint configuration

`code/eslint.config.mjs` carries two overrides for this package:

- `packages/*/src/js/**/*.ts` — browser globals, and `no-var`, `no-unused-vars`,
  `@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-unused-expressions` turned
  off, for the same reason `tsconfig.browser.json` relaxes strictness. Drop these
  exemptions file by file as the scripts are rewritten.
- `packages/*/gulpfile.js`, `packages/*/gulp.d/**/*.js` — `sourceType: commonjs`, Node
  globals, `@typescript-eslint/no-require-imports` off. The gulp pipeline stays CommonJS
  on purpose.

Ignored globally: `build/`, `public/`, `.tsbuild/`, and `packages/*/src/js/vendor/*.min.js`.

`.stylelintrc.json` extends `stylelint-config-standard` and disables the rules that fight
either the upstream stylesheets or the design system's naming: `custom-property-pattern`,
`selector-class-pattern`, `no-descending-specificity`, `media-feature-range-notation`,
`alpha-value-notation`, `color-function-notation`,
`declaration-block-no-redundant-longhand-properties`, `shorthand-property-no-redundant-values`,
`value-keyword-case`, `comment-empty-line-before`.
