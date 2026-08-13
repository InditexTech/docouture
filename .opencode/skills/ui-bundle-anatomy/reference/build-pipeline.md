# Build pipeline

The build is gulp 5 driving vinyl streams, with esbuild for JavaScript, PostCSS for CSS
and `tsc` for the helpers. `gulpfile.js` only wires tasks together; every task body lives
in `gulp.d/tasks/` and every shared utility in `gulp.d/lib/`.

`gulp.d/tasks/index.js` auto-loads the task directory with `require-directory`, renaming
`build-preview-pages.js` to `task.buildPreviewPages` — a new file in that directory is
picked up with no registration.

## Task graph

```
bundle  (default)
├── bundle:build
│   ├── clean            rm build/ public/ .tsbuild/
│   └── build            stage src/ → public/_
├── bundle:pack          zip public/_ → build/ui-bundle-<version>.zip
└── bundle:alias         copy that zip → build/ui-bundle.zip

preview
├── preview:build            (parallel)
│   ├── build                same task, preview=true
│   └── preview:build-pages  preview-src/*.adoc → public/*.html
└── preview:serve            gulp-connect on :5252, watch [src, preview-src]
```

`build` is told it is a preview build by sniffing `process.argv` for a task name starting
with `preview` — the same task function serves both, differing only in minification,
sourcemaps, SVG optimisation and `postcss-calc`.

`bundle:alias` is a separate task rather than a callback on the pack stream so that
gulp's `series` guarantees the zip is fully written and closed before anything reads it
back. It copies rather than symlinks: a link does not survive a CI artifact upload and is
awkward on Windows checkouts.

## `gulp.d/tasks`

| file | role |
| --- | --- |
| `build.js` | the whole staging pipeline: CSS, JS, helpers, templates, images, fonts, static |
| `pack.js` | zips the staged directory into the versioned artifact |
| `alias.js` | copies the versioned zip to the unversioned name |
| `remove.js` | `clean`; streams paths through `fs.remove` |
| `serve.js` | gulp-connect server; rewrites `0.0.0.0` in its log to `localhost` + LAN IP |
| `build-preview-pages.js` | the preview renderer — see `preview.md` |
| `index.js` | auto-loader |

## `gulp.d/lib`

| file | why it exists |
| --- | --- |
| `compile-helpers.js` | runs `tsc -p tsconfig.helpers.json` into `.tsbuild/helpers`, returns that dir |
| `concat-streams.js` | replaces **merge-stream**, unmaintained and broken against vinyl-fs 4 — merging a 2-file stream with a 29-file stream yielded 3 files, so most of the UI never reached the bundle. Drains sources in order via an async generator |
| `existing-globs.js` | drops globs whose containing directory is missing; vinyl-fs 4 throws ENOENT where v3 yielded nothing |
| `optimize-svg.js` | replaces **gulp-imagemin**, which pulled three native optimisers that no longer build on current Node and optimised zero files here (every image is an SVG) |
| `create-task.js` | attaches `displayName` / `description` / `flags` to a task function |
| `export-tasks.js` | builds the gulpfile's export object; a task passed twice becomes `default` |

`compileHelpers()` deduplicates concurrent calls with a single in-flight promise: `build`
and `preview:build-pages` run in parallel and both need the compiled helpers, so without
it two `tsc` processes would write to the same `outDir` at once. The result is
deliberately **not** cached beyond that — each preview rebuild recompiles, so helper edits
show up in the running preview.

`optimize-svg.js` imports svgo lazily (`await import`) because svgo is ESM-only and this
pipeline is CommonJS. Its `preset-default` overrides keep `cleanupIds` and `removeDesc`
off: IDs are referenced by `<use href="…#icon-foo">` from templates and by CSS. svgo 4
dropped `removeViewBox` from the preset, so the viewBox that drives icon scaling survives
without an override.

## What `build` stages

Everything below is concatenated into one stream and written to `public/_` (or, for the
release build, the same directory that `pack` then zips).

| source | output |
| --- | --- |
| `ui.yml` | `ui.yml` |
| `src/js/index.ts` | `js/site.js` (esbuild, IIFE) |
| `src/js/vendor/*.bundle.ts` | `js/vendor/*.js` (esbuild, IIFE, one per entry) |
| `src/js/vendor/*.min.js` | `js/vendor/*.js` (copied, `.min` stripped) |
| `src/css/site.css`, `src/css/vendor/*.css` | `css/*.css` (PostCSS) |
| `src/font/*.{ttf,woff,woff2}` | `font/*` |
| `src/img/**/*.{gif,ico,jpg,png,svg}` | `img/**` (svgo on release builds) |
| `.tsbuild/helpers/*.js` | `helpers/*.js` |
| `src/layouts/*.hbs` | `layouts/*.hbs` |
| `src/partials/*.hbs` | `partials/*.hbs` |
| `src/static/**/*` (not `*~`) | bundle root, dotfiles included |

The static glob is written as `['static/**/*', '!static/**/*~']`. Upstream used
`static/**/*[!~]`, which under glob-stream 8 matches no dotfiles — `.nojekyll` was
silently dropped — and stalls the stream.

## PostCSS chain

Order matters; the list is built in `build.js`.

1. `postcss-import` — inlines the `@import` graph rooted at `site.css`.
2. `track-imported-stylesheet-mtimes` (local) — rolls the newest mtime of any imported
   file onto the entry file, so the preview watch rebuilds when a partial stylesheet changes.
3. `postcss-mixins` — expands the IDS typography mixins (`@mixin ids-body-m;`). The
   `@define-mixin` rules are loaded by path from `@inditex/sewingiopdsweb-styles/mixins/index.css`
   because they are never imported by a stylesheet.
4. `@inditex/sewingiopdsweb-styles/postcss/custom-media.cjs` — prepends the design system's
   `@custom-media` breakpoint declarations to every stylesheet.
5. `postcss-custom-media` — resolves them, so rules can write `@media (--ids-breakpoints-m)`.
6. `postcss-url` — rewrites `~…font…/files/*.{ttf,woff,woff2}` URLs, copying the matched
   font out of `node_modules` into `font/` and pointing at `../font/<basename>`.
7. `postcss-calc` — **preview only**; cssnano already applies it on release builds.
8. `autoprefixer`.
9. **release only**: `cssnano` (`preset: 'default'`) then `pseudo-element-fixer`, a local
   plugin that normalises single-colon `:before` / `:after` back to `::` after minification.

The plugin list uses PostCSS 8 conventions. Upstream targeted PostCSS 7, where a plugin
was a bare function and cssnano could be called as `cssnano(opts)(css, result)`; under 8
a plugin is an object and calling it throws.

`postcss-custom-properties` used to run here and was **removed on purpose** — see the
custom-property constraint in `SKILL.md`. Every browser in the `browserslist` target
supports custom properties natively, so nothing replaced it.

## esbuild

Replaces upstream's browserify + browser-pack-flat + uglify chain: one pass resolves the
module graph, strips types and minifies.

```js
{ bundle: true, format: 'iife', platform: 'browser', target: ['es2018'],
  minify: !preview, sourcemap: preview ? 'inline' : false,
  legalComments: 'inline', metafile: true, write: false, logLevel: 'silent' }
```

`ESBUILD_TARGET` is kept in step with the `browserslist` field in `package.json` by hand —
esbuild does not read browserslist. `write: false` keeps the output in memory so it can be
wrapped as a Vinyl file and merged into the same stream as everything else.

The `metafile` is used for one thing: `newestMtimeOf` takes the newest mtime across every
input of the bundle and stamps it on the Vinyl file, so gulp's incremental preview rebuild
notices edits to imported modules rather than only to the entry point.

Vendor scripts are discovered by scanning `src/js/vendor` for `*.bundle.ts` and emitting
`js/vendor/<name>.js`. Today that is `highlight.bundle.ts`, which registers an explicit
list of highlight.js languages — add an import plus a `registerLanguage` call to support
another. It was upgraded from highlight.js 9 to 11: the entry moved from `lib/highlight`
to `lib/core` and `highlightBlock` became `highlightElement`.

## Packing

`pack.js` streams `public/_/**/*` with `dot: true, encoding: false, removeBOM: false` into
`@vscode/gulp-vinyl-zip` (falling back to `gulp-vinyl-zip`). The encoding options are the
ones whose absence corrupts fonts; `dot: true` is what carries `.nojekyll` into the zip.
