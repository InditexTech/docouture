# docouture

Documentation platform built on [Antora](https://docs.antora.org/antora/latest/).
It's an Nx/pnpm monorepo that ships two things: a themed Antora UI bundle, and
the `docouture` CLI for scaffolding and running standalone documentation sites
outside this repository.

## Requirements

Node and pnpm are pinned in `code/.tool-versions` and provisioned through
`asdf`. Everyday commands go through [just](https://github.com/casey/just) (1.38
or newer), which is not pinned by the workspace — install it once, globally:

```console
$ brew install just     # or: cargo install just, mise use -g just
$ just bootstrap        # asdf install + pnpm install + preflight checks
```

Every command below works from anywhere in the repository. Dependencies come
entirely from the public npm registry — nothing here needs Artifactory
credentials or a VPN.

## Commands

```console
$ just                        # list every command
$ just build                  # build everything
$ just check                  # lint, typecheck and formatting — what CI runs
$ just dev example            # serve a site on :5000, live reload (site defaults to example)
$ just preview-ui             # UI-only dev server, live reload, :5252
$ just build-site example      # build one site
$ just doctor                 # diagnose a workspace that won't build
$ just bump minor             # set the version of every package
```

`just build` takes passthrough arguments — `just build --skip-nx-cache`. `just
dev` and `just build-site` take a bare package name, so `example` rather than
`@inditextech/docouture-example`.

`just bump` accepts `major`, `minor`, `patch`, a prerelease level or an explicit
`X.Y.Z`, and moves the workspace root and all three packages together — one
version describes one release of the platform. It rewrites `package.json` and
nothing else: no commit, no tag, no rebuild. The new version reaches
`ui-bundle-<version>.zip` on the next `just build`.

`just dev` rebuilds the site whenever its AsciiDoc or the UI bundle changes and
reloads the browser. Antora has no incremental mode, so each change re-runs the
whole build — fast for these sites, less so as one grows.

It takes a second argument for the port, so a second site package could run
alongside on its own port: `just dev example` in one terminal, `just dev
<site> 5001` in another.

When changing only the UI, prefer `just preview-ui`. It renders a single page
exercising admonitions, code blocks, lists, tables and the navigation, and
reloads on save without paying for an Antora run.

### just and package.json

`just` is the human-facing command surface; the `package.json` scripts are the
machine-facing one, and remain available for anything that cannot or should not
depend on `just` — CI images, editor task panels, a shell with no `just` on the
`PATH`:

```console
$ cd code && pnpm build       # equivalent to `just build`
```

Recipes delegate to `nx` or to a `package.json` script and never reimplement
build logic, so the two surfaces cannot drift apart. Keep it that way when
adding recipes: if a recipe needs new build behaviour, the behaviour belongs in
an Nx target or a package script, and the recipe only calls it.

## Layout

```
justfile                    every command; runs everything inside code/
code/                       the Nx workspace — see code/README.md
  packages/ui-bundle        the Antora UI bundle, published as a zip
  packages/example          real-world documentation site
  packages/cli              `docouture` CLI — scaffolds a standalone site (`docouture new`),
                             bundling its own starter template
```

All toolchain configuration lives in `code/`, so `pnpm`, `nx` and `asdf` must be
invoked from there. `just` handles that for you, which is why the commands above
work from anywhere.

## Packages

| Package                        | Purpose                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `packages/ui-bundle`           | The Antora UI bundle — layouts, styles, browser scripts, Handlebars helpers — published as a zip.  |
| `packages/example`             | Real-world documentation site built with this workspace's own packages.                            |
| `packages/cli`                 | `@inditextech/docouture-cli` — the `docouture` CLI: scaffolds a standalone site (`docouture new`). |
| `packages/antora-extensions`   | Antora pipeline extensions shared by docouture sites (navigation metadata, etc.).                  |
| `packages/asciidoc-extensions` | Asciidoctor extensions shared by docouture sites (content with no AsciiDoc equivalent).            |

See [`code/README.md`](code/README.md) for how the workspace itself is put
together.

## Content requires at least one commit

Antora reads content from a git repository. It will pick up **uncommitted**
working-tree changes, but the repository must have at least one commit, or the
content source resolves to nothing and the site builds with zero pages:

```
Start page specified for site not found: example::index.adoc
```

If you see that on a fresh clone with no history, make an initial commit.
`just doctor` checks for this, along with the toolchain versions and installed
dependencies.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the contribution workflow,
including the CLA prerequisite and the `code/CHANGELOG.md` entry every PR
touching `code/**` is expected to carry.

## License

Apache-2.0 — see [`LICENSE`](LICENSE), with one exception:
`code/packages/ui-bundle` is a fork of
[antora-ui-default](https://gitlab.com/antora/antora-ui-default) and mixes
MPL-2.0 (files that are a Modification of an upstream file) with
Apache-2.0 (files with no upstream counterpart). See that package's own
`LICENSE` and `NOTICE`, and each file's own SPDX header for which license
applies to it.
