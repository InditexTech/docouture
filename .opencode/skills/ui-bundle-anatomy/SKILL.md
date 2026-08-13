---
name: ui-bundle-anatomy
description: "How the pdocs Antora UI bundle package (code/packages/ui-bundle) is structured and built — directory layout, the gulp/esbuild/PostCSS pipeline, the Handlebars template tree, the helper compilation contract, the TypeScript config split and the preview harness. USE WHEN adding or editing a partial, layout, helper, browser script or stylesheet in that package, changing anything under gulp.d, debugging a build/preview failure, or working out where a change belongs. EXAMPLES: 'add a new partial', 'my helper isn't registered', 'why is the font corrupted in the zip', 'add a language to syntax highlighting', 'the preview doesn't rebuild', 'where does site.js come from'."
---

# UI bundle — anatomy

`code/packages/ui-bundle` (`@inditextech/pdocs-ui-bundle`) is an **Antora UI bundle**:
a zip of layouts, partials, helpers, CSS, JS and images that Antora unpacks and uses to
render every page of a site. It is a fork of `antora-ui-default`, modernised (gulp 5,
esbuild, PostCSS 8, TypeScript) and re-skinned onto the IOP Design System.

It builds **one artifact**:

```
build/ui-bundle-<version>.zip   canonical, versioned — the thing you publish
build/ui-bundle.zip             copy of the above under a stable name
```

`<version>` is `package.json`'s version, moved in lockstep with the workspace by
`just bump`. The unversioned copy exists because Antora's `ui.bundle.url` takes a
literal path and does not glob, so a versioned-only output would force a playbook edit
on every bump.

This skill covers the package itself. For **what CSS to write** read `iop-ds-foundations`
(tokens, theming, breakpoints); for **what markup to emit** read `iop-ds-components`.

## Layout

| path | what it is |
| --- | --- |
| `src/ui.yml` | bundle descriptor. Only declares `static_files` (files copied to the site root verbatim) |
| `src/layouts/*.hbs` | page shells. `default.hbs`, `404.hbs`. A page picks one via `page-layout` |
| `src/partials/*.hbs` | every other template. Registered by basename, included as `{{> stem}}` |
| `src/helpers/*.ts` | Handlebars helpers. Filename = helper name. Compiled to CommonJS |
| `src/js/NN-*.ts` | browser behaviour, bundled into `js/site.js` |
| `src/js/vendor/*.bundle.ts` | separately bundled third-party scripts → `js/vendor/*.js` |
| `src/css/*.css` | stylesheets, all reached through `src/css/site.css` |
| `src/img/*.svg` | icons, optimised with svgo on release builds |
| `src/static/**` | copied to the **site root**, not the UI root (currently `.nojekyll`) |
| `types/ui.d.ts` | typings for the Handlebars call shape helpers receive |
| `types/browser.d.ts` | ambient globals for the browser scripts |
| `gulpfile.js`, `gulp.d/` | the build. Tasks in `gulp.d/tasks`, shared utilities in `gulp.d/lib` |
| `preview-src/` | standalone preview: `ui-model.yml` fixture plus `.adoc` pages |
| `index.js` | placeholder so the package is resolvable with `require.resolve` |

Generated, all gitignored: `public/` (preview site; `public/_` is the staged bundle),
`build/` (zips), `.tsbuild/helpers` (compiled helpers).

Inside the zip the tree is flat and fixed — Antora looks for these exact names:

```
ui.yml  layouts/  partials/  helpers/  css/site.css  js/site.js  js/vendor/  img/  font/
```

## Where a change goes

| you want to | edit | then |
| --- | --- | --- |
| change page structure / chrome | a partial in `src/partials`, or a layout | nothing — partials are auto-registered by basename |
| add styling | a file in `src/css` | add an `@import` to `src/css/site.css` **in the right position** |
| add page behaviour | a new `src/js/NN-name.ts` | add an explicit `import './NN-name'` to `src/js/index.ts` |
| add template logic | a new `src/helpers/name.ts` | nothing — but it **must** use `export =` |
| ship a third-party script | `src/js/vendor/name.bundle.ts` | reference `js/vendor/name.js` from a partial |
| copy a file to the site root | drop it in `src/static/` | list it under `static_files` in `src/ui.yml` |

Import order in `site.css` is load-bearing: design system tokens first, then `bridge.css`
(maps legacy `--body-*` names onto `--ids-*`), then `vars.css` (layout metrics only), then
the leaf stylesheets. Anything that consumes a token must come after the token layer.

Browser scripts are side-effect IIFEs and their numeric prefixes encode execution order,
so numbering and the explicit import list are both deliberate — no glob import.

## Constraints that fail silently

Each of these has cost someone a debugging session. They are enforced by nothing but this
list and the comments in the source.

- **Helpers must be CommonJS with `export =`.** Antora `require`s each file in `helpers/`
  and expects `module.exports` to *be* the function. That is why helpers go through `tsc`
  (`tsconfig.helpers.json` → `.tsbuild/helpers`) and not esbuild, whose CJS output would
  expose the function as `exports.default` — Handlebars would then register a
  non-callable helper and every use renders as nothing.
- **Never put a shared module in `src/helpers/`.** Every file there becomes a helper named
  after its basename. Shared types live in `types/ui.d.ts` for exactly this reason.
- **Never flatten custom properties at build time.** Dark mode, the density scale and the
  resolution tiers are runtime custom-property swaps done by the design system. A build
  that inlines their values ships a permanently light, fixed-density site.
- **Any `vfs.src` that can touch a binary needs `encoding: false, removeBOM: false`.**
  vinyl-fs 4 decodes contents as UTF-8 by default (v3 did not) and corrupts fonts and
  raster images — woff2 files came out of the zip at nearly double size and browsers
  rejected them with `incorrect file size in WOFF header`.
- **An async gulp task must await its own stream**, `await finished(stream.resume())`.
  Gulp waits on a returned stream *or* a returned promise; a promise that resolves *to* a
  stream is only awaited as a promise, so the task reports success before anything is
  written — and the stream stalls at the object-mode highWaterMark because nobody drains it.
- **Vendor entries must be named `*.bundle.ts`.** The infix is stripped to produce the
  output name; a file without it is not bundled at all.
- **Optional source directories must go through `existingGlobs`.** `src/css/vendor` and
  `src/font` do not exist until someone adds a vendored stylesheet or a self-hosted font,
  and vinyl-fs 4 throws ENOENT on a glob whose literal prefix is missing.
- **Lint and format are Nx targets, not gulp tasks.** The gulp wrappers for eslint and
  stylelint are ESM-only and this pipeline is CommonJS; Nx caches the standalone binaries
  anyway.
- **The inline theme bootstrap in `head-prelude.hbs` and `src/js/08-theme.ts` share a
  storage key and class names.** Change one, change the other. The inline copy exists to
  set the theme before first paint; IDS keys theming off a class on `<html>`
  (`ids-theme-dark` / `ids-theme-light`), not a data attribute.

## Commands

Run from `code/` (the Nx workspace root — `pnpm` does not resolve above it).

| command | does |
| --- | --- |
| `just preview-ui` | live-reloading preview on `http://localhost:5252` |
| `pnpm nx run @inditextech/pdocs-ui-bundle:build` | `gulp bundle` — clean, build, pack, alias |
| `pnpm nx run @inditextech/pdocs-ui-bundle:typecheck` | both tsconfigs (helpers strict, browser loose) |
| `pnpm nx run @inditextech/pdocs-ui-bundle:lint` | eslint + stylelint (`lint:fix` to autofix) |
| `pnpm nx run @inditextech/pdocs-ui-bundle:clean` | remove `build/`, `public/`, `.tsbuild/` |

Nx infers these targets from `package.json` scripts — the package has no `project.json`.
Caching, inputs and outputs come from `targetDefaults` in `code/nx.json`; `build` is cached
with output `{projectRoot}/build`, `preview` and `clean` are not cached.

Gulp task names, if you invoke gulp directly: `bundle` (default), `build`, `bundle:build`,
`bundle:pack`, `bundle:alias`, `clean`, `preview`, `preview:build`.

Environment:

| variable | effect |
| --- | --- |
| `LIVERELOAD=true` | enables gulp-connect livereload in the preview |
| `SOURCEMAPS=true` | emit sourcemaps from a non-preview build (preview always does) |
| `CI` | suppresses the bundle-path log from `bundle:alias`; also hides the edit-this-page link |

## Reference

- `reference/build-pipeline.md` — task graph, every file in `gulp.d`, the PostCSS chain,
  esbuild config, and what each piece replaced upstream.
- `reference/templates.md` — the full layout/partial tree, the UI model, the helper
  catalogue, and the conventions templates rely on.
- `reference/preview.md` — the preview harness, the sample UI model, and the TypeScript /
  eslint / stylelint configuration split.
