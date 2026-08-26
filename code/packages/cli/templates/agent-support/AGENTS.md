<!-- prettier-ignore -->
# __PDOCS_TITLE__ documentation

This repository's `docs/` directory is an Antora documentation site, scaffolded by
`pdocs new` (`@inditextech/pdocs-cli`). This file is the baseline for any coding agent
(OpenCode, Claude Code, Codex, Cursor, …) working on it — house rules, commands and where
to look for more.

## Layout

```
docs/
  antora-playbook.yml          build entry point: site title, content sources, UI bundle
  antora-playbook.local.yml    used by `pdocs dev` and PR verification — builds HEAD only
  src/
    antora.yml                 component descriptor: name, title, version, nav
    modules/
      ROOT/                    the default module
        nav.adoc               the navigation tree
        pages/*.adoc           one page per file — these become site URLs
```

The nesting (`docs/src/...`) is intentional — see the `docs-internals` skill.

## Commands

Run from the repository root (or pass `--dir <path>` to any of them):

| command                     | does                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `pdocs dev [--port <port>]` | build the site and serve it with live reload, rebuilding on every change                     |
| `pdocs build`               | build the site once (`npm run build` under `docs/`)                                          |
| `pdocs doctor`              | check Node version, the four names that must agree, git history and that antora is installed |

`docs/package.json` also exposes `npm run build`/`npm run dev` directly if you'd rather not
go through the `pdocs` CLI.

## Conventions

- Every page lives at `docs/src/modules/<module>/pages/*.adoc` and must have an `xref:`
  entry in that module's `nav.adoc`, or it builds but is unreachable from the navigation.
- A build failure on a warning is expected behaviour here, not a bug — `antora-playbook.yml`
  sets `runtime.log.failure_level: warn`. A broken `xref:`, a missing include target or an
  unknown attribute reference fails the build.
- Run `pdocs doctor` after any structural change (renaming the component, moving
  `antora.yml`, editing `package.json`'s `name`) — it's the fast way to catch the four names
  drifting out of agreement.

## Skills

- **`documenting-your-repo`** — start here: planning what to document, sourcing content
  from wherever it actually lives (existing docs, README, or the code itself), and the
  long-term loop that keeps docs in sync as the repo grows. Hands off to the two skills
  below for mechanics once a decision is made.
- **`writing-docs-pages`** — authoring AsciiDoc content: the language itself, `xref:`
  references, `nav.adoc`, admonitions, code blocks, and this site's own custom blocks
  (`[tabs]`, `[cards]`, `[accordion]`, …).
- **`docs-internals`** — the playbook, the component descriptor, the four names that must
  agree, the home-page vs. content-page patterns, and mono-module vs. multi-module sites.
- **`docs-versioning`** — only present when this site was scaffolded with
  `--mode versioned`: cutting releases, `pdocs version`, and `docs/.release-version`.

## Documentation state

<!-- maintained by the documenting-your-repo skill — do not hand-edit structure, only content -->

| doc page          | derived from          | status |
| ----------------- | --------------------- | ------ |
| index.adoc (home) | manual (hand-written) | —      |
