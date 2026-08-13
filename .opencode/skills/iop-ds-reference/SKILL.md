---
name: iop-ds-reference
description: "Where the real IOP Design System (IDS) and IDS React Components source lives for reference, how to install it, and how the small generated derivative actually shipped in code/packages/ui-bundle relates to it. USE WHEN you need to read real DS CSS/markup rather than recall it from memory, before adding or extending a DS-based component, when re-syncing the derivative after a DS version bump, or when a build fails because the sidecar or generated files are missing/stale. EXAMPLES: 'where can I see the real banner component CSS', 'install the design system', 'the DS version changed, update the tokens', 'ids-tokens.css looks stale', 'just ids-install failed', 'can I import the DS package directly'."
---

# IOP DS — where the real thing lives

Two facts anchor everything else in this skill:

1. **`code/packages/ui-bundle` has no dependency on the IOP Design System.** Its
   `package.json` does not list `@inditex/sewingiopdsweb-styles` or
   `@inditex/sewingiopdsweb-react-components`, `code/.npmrc` has no
   `@inditex:registry` line, and a plain `pnpm install` at the workspace root
   never contacts Artifactory. This is deliberate — see "Why" below.
2. **The real DS source is one `just` command away, in a sidecar outside the
   pnpm workspace.** `code/tools/ids/` is a standalone pnpm project (its own
   `package.json`, its own `.npmrc`, installed with `--ignore-workspace`) that
   exists for exactly one purpose: giving you — or `tools/ids/sync.mjs` — real
   DS source to read, without that source ever entering the shipped build.

If you take nothing else from this skill: **`just ids-install`, then read
`code/tools/ids/node_modules/@inditex/...` like any other vendored source.**

## Layout

```
code/tools/ids/
  package.json     the two DS packages, pinned exact (1.28.0 today)
  .npmrc           routes @inditex: to Artifactory — the ONLY place in this
                   repo that still knows Artifactory exists
  sync.mjs         generator: extracts what src/css actually uses into the
                   committed derivative (see "What gets shipped" below)
  README.md        the fuller version of this skill, written for whoever
                   maintains the sidecar itself
  node_modules/    gitignored, populated by `just ids-install`
  pnpm-lock.yaml   gitignored (records Artifactory tarball URLs)
```

## Commands

| command | does | needs |
| --- | --- | --- |
| `just ids-install` | `pnpm install` in the sidecar | Artifactory credential in `~/.npmrc` (`_auth`), VPN |
| `just ids-sync` | regenerate the committed derivative from the sidecar | `ids-install` first |
| `just ids-check` | regenerate in memory, fail on drift, write nothing | `ids-install` first |

None of these run in CI. CI never installs the sidecar and never needs to —
the build only reads what's already committed.

## Reading real DS source

```console
$ just ids-install
$ ls code/tools/ids/node_modules/@inditex/sewingiopdsweb-react-components/banner/
$ cat code/tools/ids/node_modules/@inditex/sewingiopdsweb-react-components/banner/banner.css
$ grep -o '\-\-ids-color-alt-[a-z-]*:#[0-9a-f]*' \
    code/tools/ids/node_modules/@inditex/sewingiopdsweb-styles/variables/index.css
```

This is the actual, currently-pinned DS version's CSS — not a description of it,
not what an older skill remembers about it. Prefer it over guessing whenever
you're about to write a token name, a class name, or a selector you haven't
looked at directly. See `iop-ds-foundations` for the token vocabulary and
`iop-ds-components` for the component-selection workflow — both assume you can
reach this source when you need to verify something against it.

## What gets shipped (and what doesn't)

The build never reads the sidecar. It reads three committed files under
`code/packages/ui-bundle/src/css/`, all generated:

| file | generated from | contains |
| --- | --- | --- |
| `ids-tokens.css` | `variables/index.css`, `motion.css`, `zindex.css` | only the `--ids-*` custom properties `src/css/**/*.css` references via `var(...)`, with aliases followed (a value that's itself `var(--ids-other)` pulls `--ids-other` in too), selectors preserved as-is (`:root`, `.ids-theme-dark`, `.ids-scale-large`, resolution `@media` blocks, …) |
| `ids-breakpoints.css` | `variables/breakpoints.css` | only the `@custom-media` declarations referenced via `(--ids-breakpoints-*)` |
| `ids.lock.json` | — | the DS version and a sha256 of every source file the last sync read |

Plus one hand-copied rule: the `.ids-icon` sizing block in `icons.css`, copied
verbatim from `@inditex/sewingiopdsweb-react-components/icon/icon.css` (77
bytes — not worth a generator).

`tools/ids/sync.mjs` is the generator for the first three. Read it before
extending it — it already resolves the one non-trivial case (a kept
declaration whose value embeds further `--ids-*` references, not just a bare
alias) and follows to a fixed point, so a naive re-implementation would very
likely reintroduce a bug it already fixed once.

**Adding a DS component's CSS to the shipped bundle** (see `iop-ds-components`
for the full decision process) means extending this generator, or hand-copying
a small stable rule with a source comment — never a live `@import` of the DS
package. That import path doesn't exist anymore: `postcss-import` in
`gulp.d/tasks/build.js` has nothing to resolve `@inditex/...` against, on
purpose.

## Why this shape

Before this sidecar existed, `ui-bundle` depended on both DS packages directly.
Every clone, every CI run and every fork needed an Artifactory credential to
run `pnpm install` — for roughly 80 KB of actually-used CSS out of an 18 MB
dependency tree (the react-components package alone pulls in `core`,
`resources`, `utils`, and their own dependency trees). Moving the DS itself out
of the install graph and generating a derivative in its place keeps the
credential requirement to the one person occasionally re-syncing it, instead of
everyone who ever runs `pnpm install`.

This mirrors a pattern already in this package for icons: `just icons-fetch`
mirrors the (also proprietary) icon catalogue into a gitignored `.icons/`
directory the build never reads; `just icons-build` cuts the committed sprite
from it. Same shape, applied to DS CSS instead of DS SVGs.

## Updating the DS version

1. Bump the version in `code/tools/ids/package.json` (keep both packages in
   step — they're versioned together upstream).
2. `just ids-install && just ids-sync`.
3. Review the diff in `ids-tokens.css` / `ids-breakpoints.css` / `ids.lock.json`
   — a version bump can rename or drop a token your CSS still references;
   `sync.mjs` fails loudly (`token(s) referenced ... but not found`) rather
   than silently dropping it, but a renamed token can still slip through if
   the old and new names happen to coexist upstream for a release. Check.
4. Commit.

## Licensing

`@inditex/sewingiopdsweb-*` is `"license": "INDITEX"` — proprietary, internal
use only. Nothing under `code/tools/ids/` is committed (`node_modules/`, the
lockfile — see its `.gitignore` entries). What is committed is the small,
mechanically-extracted derivative described above, plus one 77-byte rule —
the same shape of derivation this repository already makes for DS icons, not
a copy of either package. `code/packages/ui-bundle/NOTICE` records exactly
what's derived and from where. If this repository's visibility ever changes,
that derivative — like the icon sprite — needs a legal look before the switch,
not after.
