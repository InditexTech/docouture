# IOP Design System sidecar

This directory is **not** an Nx project and **not** a pnpm workspace member —
it is deliberately outside the `packages/*` glob in `pnpm-workspace.yaml`. That
is what keeps it out of the root install: `pnpm install` from `code/` never
looks in here, never resolves `@inditex:registry`, and never needs an
Artifactory credential. CI runs a plain `pnpm install --frozen-lockfile`
against npmjs only.

## What it's for

Two things, and only these two:

1. **Reference code.** When building or extending a UI bundle component, the
   real IOP Design System (IDS) source — the actual CSS, the actual class
   names, the actual PostCSS plugins — is what you want to read, not a
   half-remembered description of it. Install this sidecar and point at
   `tools/ids/node_modules/@inditex/...`. See the `iop-ds-foundations` and
   `iop-ds-components` skills for the token/class vocabulary and where to look.

2. **Regenerating the committed derivatives.** `packages/ui-bundle/src/css/`
   contains a small number of files generated _from_ this sidecar and checked
   into git:

   | generated file                        | source                                                                        |
   | ------------------------------------- | ----------------------------------------------------------------------------- |
   | `ids-tokens.css`                      | the subset of `--ids-*` custom properties actually referenced in `src/css/**` |
   | `ids-breakpoints.css`                 | the `@custom-media` breakpoint declarations actually referenced               |
   | `icons.css`'s `.ids-icon` sizing rule | `@inditex/sewingiopdsweb-react-components/icon/icon.css`                      |

   The build (`gulp bundle`) reads only the generated files. It never touches
   this sidecar and never requires `@inditex/*` — that dependency was removed
   from `packages/ui-bundle/package.json` entirely. `sync.mjs` is what keeps
   the generated files honest against the real thing.

## Why not just install it in `packages/ui-bundle`?

That's what this repository did before. It meant every clone, every CI run,
and every fork needed a `~/.npmrc` Artifactory credential just to run
`pnpm install` — for ~80 KB of CSS out of an 18 MB dependency tree. Moving the
DS itself out of the installable graph and generating a small derivative in
its place removes the credential requirement for everyone except the person
occasionally re-syncing that derivative.

This mirrors the icon pipeline already in this package: `just icons-fetch`
mirrors the (proprietary) icon catalogue into a gitignored `.icons/` directory
that the build never reads; `just icons-build` cuts the committed sprite from
it. Same shape, applied to DS CSS instead of DS SVGs.

## Usage

```sh
just ids-install   # pnpm install here — needs Artifactory creds in ~/.npmrc, needs VPN
just ids-sync       # regenerate the committed derivatives, update ids.lock.json
just ids-check      # regenerate into memory only, fail if it would differ (drift check)
```

`ids-sync` and `ids-check` both require `ids-install` to have been run first —
they read from `node_modules` here, they do not hit the network themselves.

`ids.lock.json` (in `packages/ui-bundle/src/css/`) records the exact DS
version and a sha256 of every source file the last sync read, so drift is
detectable even without network access: `ids-check` compares against it.

## Updating the design system version

Bump the version in `package.json` here, run `just ids-install` then
`just ids-sync`, review the diff in the generated files, commit.

## Licensing

`@inditex/sewingiopdsweb-*` is `"license": "INDITEX"` — internal, proprietary.
Nothing under this directory (`node_modules/`, the lockfile) is committed;
see `.gitignore`. The generated derivative committed under
`packages/ui-bundle/src/css/` is a small, mechanically-extracted subset
(custom property declarations and breakpoint media queries), the same shape
of derivation this repository already makes for DS icons — not a copy of the
package. If this repository's visibility changes, revisit whether that
derivative needs sign-off, same as the icon sprite.
