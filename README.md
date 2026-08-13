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

## Commands

```console
$ just                        # list every command
$ just build                  # build everything
$ just check                  # lint, typecheck and formatting — what CI runs
$ just preview                # UI dev server, live reload, :5252
$ just build-site starter     # build one site
$ just serve starter          # serve build/site on :5000 (site defaults to starter)
$ just doctor                 # diagnose a workspace that won't build
$ just bump minor             # set the version of every package
```

`just build` takes passthrough arguments — `just build --skip-nx-cache`. `just
serve` and `just build-site` take a bare package name, so `example` rather than
`@inditextech/pdocs-example`.

`just bump` accepts `major`, `minor`, `patch`, a prerelease level or an explicit
`X.Y.Z`, and moves the workspace root and all three packages together — one
version describes one release of the platform. It rewrites `package.json` and
nothing else: no commit, no tag, no rebuild. The new version reaches
`ui-bundle-<version>.zip` on the next `just build`.

When changing the UI, prefer `just preview` over building a whole site. It
renders a single page exercising admonitions, code blocks, lists, tables and the
navigation, and reloads on save.

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
  packages/starter          the smallest complete site; copy it to start one
  packages/example          real-world site; currently a stub
```

All toolchain configuration lives in `code/`, so `pnpm`, `nx` and `asdf` must be
invoked from there. `just` handles that for you, which is why the commands above
work from anywhere.

## Content requires at least one commit

Antora reads content from a git repository. It will pick up **uncommitted**
working-tree changes, but the repository must have at least one commit, or the
content source resolves to nothing and the site builds with zero pages:

```
Start page specified for site not found: starter::index.adoc
```

If you see that on a fresh clone with no history, make an initial commit.
`just doctor` checks for this, along with the toolchain versions and installed
dependencies.

## License

MPL-2.0. `code/packages/ui-bundle` is a fork of
[antora-ui-default](https://gitlab.com/antora/antora-ui-default); see its
`LICENSE` and `NOTICE`.
