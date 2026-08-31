# docouture workspace

This directory is the Nx workspace root. All toolchain configuration lives here,
not at the repository root, so anything invoked directly — `pnpm`, `nx`, `asdf`
— must run from `code/`: `.tool-versions` is resolved by walking up from the
current directory, so the shims are only visible inside this directory.

For everyday work use `just` from the repository root, which runs every command
in here for you. See [`../README.md`](../README.md) for the command list. What
follows is how the workspace itself is put together.

## Packages

| Package              | Purpose                                                                                                                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui-bundle` | The Antora UI bundle: layouts, styles, browser scripts and Handlebars helpers. Produces `build/ui-bundle-<version>.zip`, plus an unversioned `build/ui-bundle.zip` copy.                                               |
| `packages/example`   | Real-world site; destination of the Fumadocs migration. Currently a stub.                                                                                                                                              |
| `packages/cli`       | `@inditextech/docouture-cli` — the `docouture` CLI: scaffolds a standalone site (`docouture new`, bundling its own `templates/starter`) and sets a site's Antora version (`docouture version`) outside this workspace. |

`example` consumes `ui-bundle` through a `workspace:*` dependency, so Nx rebuilds the
bundle before it. `packages/cli/templates/starter` — what `docouture new` scaffolds — does
not: it depends on `ui-bundle`, `antora-extensions` and `asciidoc-extensions` as real npm
packages (pinned to the exact CLI version that generated it), not workspace links, since
none of them are published to the real npm registry yet (see `.github/workflows/
release.yml`'s own comment) — only local/snapshot installs resolve those pins today. See
`.opencode/skills/starter-package`.

The versioned zip is the artifact to publish — it is the only thing that records
which bundle a consumer downloaded. The unversioned copy is a byte-identical
convenience: Antora's `ui.bundle.url` takes a literal path and does not glob, so
without it every playbook would need editing on every version bump. Both are
rebuilt from scratch on each `bundle` run, so stale versions do not accumulate.

## The dev servers

There are two, and they answer different questions.

`packages/example` has a `dev` target (`just dev example`) that serves
`build/site` on :5000, watches `docs/` and `../ui-bundle/src`, re-runs Antora on
change and reloads the browser. It is the real site, so it is the one to trust —
but a UI edit costs a bundle rebuild plus a full Antora run, and Antora has no
incremental mode.

`packages/ui-bundle` has a `preview` target (`just preview-ui`) that renders
`preview-src/index.adoc` — a single page exercising admonitions, code blocks,
lists, tables and the navigation — and reloads on save. No Antora, no content.
Prefer it when the content is not what you are changing.

Neither server has runtime dependencies: `scripts/dev.mjs` and the gulp preview
both build on what ships with Node and the existing toolchain.

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

## Design tokens

The UI bundle has its own design token and component system, hand-maintained
under `src/css/` (`dt-tokens.css`, `dt-breakpoints.css`, `dt-components.css`).
There's no external dependency and no generation step — these are ordinary
source files, edited directly like any other CSS in the bundle.

Three rules follow from this, and the build enforces the third:

1. No literal colours, sizes, fonts, durations or z-indexes in `src/css`. Every
   value is a `--dt-*` token. `highlight.css` is the one exception — there's no
   token for a syntax palette.
2. No hand-written width media queries. Write `@media (--dt-breakpoints-m)`;
   `gulp.d/lib/dt-custom-media.js` injects the declarations and
   `postcss-custom-media` resolves them.
3. **Custom properties are never flattened.** Theming, the density scale and the
   resolution tiers are all runtime custom-property swaps, so
   `postcss-custom-properties` was removed from the chain. Re-adding it without
   `preserve: true` ships a permanently light, fixed-density site.

`src/css/bridge.css` is the seam: antora-ui-default's variable vocabulary
(`--body-font-color`, `--panel-background`, …) is re-pointed at `dt-*` tokens
there, so the inherited stylesheets re-theme without being rewritten. It only
shrinks — entries are deleted as chrome moves onto this bundle's own
components.

Theme is a class on `<html>` (`.dt-theme-light` / `.dt-theme-dark`), never a
data attribute, because that is what the stylesheets select on. It is set
before first paint by an inline script in `partials/head-prelude.hbs` and
toggled by `src/js/08-theme.ts`; both share the `dt-theme` storage key. With
JavaScript off the page renders light, which is the `:root` default.

Typefaces (Inter, Noto Sans Mono) are loaded from Google Fonts and are not
bundled; `bridge.css` carries a fallback stack so an offline preview still
renders.

Working conventions and the full token inventory live in
`.opencode/skills/docouture-foundations` and
`.opencode/skills/docouture-components`.

## Notes on this fork of the Antora default UI

`packages/ui-bundle` began as a fork of
[antora-ui-default](https://gitlab.com/antora/antora-ui-default) — see its
`LICENSE` and `NOTICE` for the resulting MPL-2.0/Apache-2.0 split. The
upstream dependency set dated from 2020 and does not install or run on
current Node, so the build was modernised:

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
