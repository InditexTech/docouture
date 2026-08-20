# pdocs

Documentation platform built on [Antora](https://docs.antora.org/antora/latest/).

## Requirements

Node and pnpm are pinned in `code/.tool-versions` and provisioned through
`asdf`. Everyday commands go through [just](https://github.com/casey/just) (1.38
or newer), which is not pinned by the workspace — install it once, globally:

```console
$ brew install just     # or: cargo install just, mise use -g just
$ just bootstrap        # asdf install + pnpm install + preflight checks
```

Every command below works from anywhere in the repository.

### Registry credentials

Dependencies come from the public npm registry, with one exception: the IOP
Design System packages (`@inditex/sewingiopdsweb-*`) are published to Inditex
Artifactory. `code/.npmrc` routes that scope there and pins everything else to
`registry.npmjs.org`; the pin matters because a machine whose `~/.npmrc` sets a
different default would otherwise resolve all 790-odd packages through it, and
CI would resolve them from somewhere else.

Credentials are deliberately not in `code/.npmrc`, which is committed. Put them
in `~/.npmrc`:

```
//inditex.jfrog.io/artifactory/api/npm/node-public/:_auth=<base64 user:token>
```

Without them `pnpm install` fails with `ERR_PNPM_FETCH_401` against
`inditex.jfrog.io`. `just doctor` reports it as a missing design system.

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
`@inditextech/pdocs-example`.

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
  packages/example          real-world site; currently a stub
  packages/cli              `pdocs` CLI — scaffolds a standalone site (`pdocs new`),
                             bundling its own starter template
```

All toolchain configuration lives in `code/`, so `pnpm`, `nx` and `asdf` must be
invoked from there. `just` handles that for you, which is why the commands above
work from anywhere.

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

## License

MPL-2.0. `code/packages/ui-bundle` is a fork of
[antora-ui-default](https://gitlab.com/antora/antora-ui-default); see its
`LICENSE` and `NOTICE`.
