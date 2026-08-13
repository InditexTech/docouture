# pdocs workspace

This directory is the Nx workspace root. All toolchain configuration lives here,
not at the repository root, so anything invoked directly — `pnpm`, `nx`, `asdf`
— must run from `code/`: `.tool-versions` is resolved by walking up from the
current directory, so the shims are only visible inside this directory.

For everyday work use `just` from the repository root, which runs every command
in here for you. See [`../README.md`](../README.md) for the command list. What
follows is how the workspace itself is put together.

## Packages

| Package              | Purpose                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/ui-bundle` | The Antora UI bundle: layouts, styles, browser scripts and Handlebars helpers. Produces `build/ui-bundle-<version>.zip`, plus an unversioned `build/ui-bundle.zip` copy. |
| `packages/starter`   | The smallest complete Antora site. Copy this when starting a new documentation project.                                                                                  |
| `packages/example`   | Real-world site; destination of the Fumadocs migration. Currently a stub.                                                                                                |

`starter` and `example` both consume `ui-bundle` through a `workspace:*`
dependency, so Nx rebuilds the bundle before either site.

The versioned zip is the artifact to publish — it is the only thing that records
which bundle a consumer downloaded. The unversioned copy is a byte-identical
convenience: Antora's `ui.bundle.url` takes a literal path and does not glob, so
without it every playbook would need editing on every version bump. Both are
rebuilt from scratch on each `bundle` run, so stale versions do not accumulate.

## The UI preview

`packages/ui-bundle` has a `preview` target that renders `preview-src/index.adoc`
— a single page exercising admonitions, code blocks, lists, tables and the
navigation — and reloads on save. Prefer it over building a whole site when
changing the UI.

## Adding an extension package

Future Antora and Asciidoctor extensions belong in their own packages:

- `packages/antora-ext-*` — Antora extensions, registered under
  `antora.extensions` in a playbook.
- `packages/asciidoc-ext-*` — Asciidoctor extensions, registered under
  `asciidoc.extensions`.

Both are loaded by Antora as CommonJS, so compile TypeScript with `module` left
at the inherited `node16` setting and no `"type": "module"` in the package.
Depend on them from a site package with `workspace:*` and reference them by
package name in the playbook; pnpm's workspace link makes them resolvable.

## Notes on this fork of the Antora default UI

`packages/ui-bundle` began as a fork of
[antora-ui-default](https://gitlab.com/antora/antora-ui-default) (MPL-2.0; see
its `LICENSE` and `NOTICE`). The upstream dependency set dated from 2020 and
does not install or run on current Node, so the build was modernised:

- **gulp 4 → 5.** gulp 4 pulls chokidar 2 → fsevents 1.x, a native module that
  no longer builds.
- **browserify + browser-pack-flat + uglify + concat → esbuild.** One tool, and
  it compiles the TypeScript sources directly.
- **gulp-imagemin → svgo.** Upstream pulled four optimizers, three of them
  native binaries with `postinstall` downloaders; every image in this UI is an
  SVG, so those three optimized nothing.
- **highlight.js 9 → 11.** 9.18.3 is deprecated upstream. `highlight.css` was
  rewritten against v11 scopes — v10 removed `hljs-class` and
  `hljs-builtin-name`.
- **eslint and stylelint moved out of gulp into Nx targets.** The gulp wrappers
  for both are ESM-only and cannot be required from this CommonJS pipeline.
- **merge-stream → `gulp.d/lib/concat-streams.js`.** merge-stream is
  unmaintained and drops data with vinyl-fs 4 on current Node.

Two upstream behaviours are worth knowing about when editing the pipeline:

- vinyl-fs 4 decodes file contents as UTF-8 by default, which corrupts binary
  assets. Every `vfs.src` here passes `encoding: false, removeBOM: false`.
- `@asciidoctor/core` 4 made `load` and `convert` async and replaced the v2
  factory export with a plain module object.

### Deliberately relaxed lint rules

The browser scripts in `packages/ui-bundle/src/js/` are upstream's original ES5,
carried over as-is. They are exempt from `strict` type-checking
(`tsconfig.browser.json`) and from `no-var` and friends (`eslint.config.mjs`),
because converting 488 lines of untested DOM code was not worth the regression
risk during the port. Tighten these file by file as the UI redesign rewrites
them; the exemption is scoped to that one directory and should not spread.
