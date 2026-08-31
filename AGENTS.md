<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- **The Nx workspace root is `code/`, not the repository root.** All toolchain
  configuration (`package.json`, `pnpm-workspace.yaml`, `nx.json`,
  `.tool-versions`, `node_modules/`) lives there. Run every `pnpm` and `nx`
  command with `code/` as the working directory — from the repository root
  neither `pnpm` nor the pinned Node version resolves, because `.tool-versions`
  is found by walking up from the current directory.
- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax


<!-- nx configuration end-->

<!-- docouture:start - managed by docouture; edits inside this block are overwritten by `docouture new`/`docouture upgrade` -->
# docouture documentation

This repository's `docs/` directory is an Antora documentation site, scaffolded by
`docouture new` (`@inditextech/docouture-cli`). This file is the baseline for any coding agent
(OpenCode, Claude Code, Codex, Cursor, …) working on it — house rules, commands and where
to look for more.

## Layout

```
docs/
  antora-playbook.yml          build entry point: site title, content sources, UI bundle
  antora-playbook.local.yml    used by `docouture dev` and PR verification — builds HEAD only
  src/
    antora.yml                 component descriptor: name, title, version, nav
    modules/
      ROOT/                    the home page only — no nav.adoc of its own
      main/                    the default content module — every other page starts here
        nav.adoc               the navigation tree
        pages/*.adoc           one page per file — these become site URLs
```

The nesting (`docs/src/...`) is intentional, and so is `ROOT` + `main` both existing from
the start — see the `docouture-docs-internals` skill (below).

## Commands

Run from the repository root (or pass `--dir <path>` to any of them):

| command                         | does                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| `docouture dev [--port <port>]` | build the site and serve it with live reload, rebuilding on every change                     |
| `docouture build`               | build the site once (`npm run build` under `docs/`)                                          |
| `docouture doctor`              | check Node version, the four names that must agree, git history and that antora is installed |

`docs/package.json` also exposes `npm run build`/`npm run dev` directly if you'd rather not
go through the `docouture` CLI.

## Conventions

- Every page lives at `docs/src/modules/<module>/pages/*.adoc` and must have an `xref:`
  entry in that module's `nav.adoc`, or it builds but is unreachable from the navigation.
- A build failure on a warning is expected behaviour here, not a bug — `antora-playbook.yml`
  sets `runtime.log.failure_level: warn`. A broken `xref:`, a missing include target or an
  unknown attribute reference fails the build.
- Run `docouture doctor` after any structural change (renaming the component, moving
  `antora.yml`, editing `package.json`'s `name`) — it's the fast way to catch the four names
  drifting out of agreement.

## Skills

Docs-authoring skills are not scaffolded here — `docouture new`/`docouture upgrade` only
opinionate on the starter site and its GitHub workflows. Install them yourself, once, with:

```
npx skills@latest add InditexTech/docouture --all
```

(or `--skill <name>` for one at a time). This installs:

- **`docouture-getting-started`** — start here on a brand-new site: scaffolding (if not done
  yet), planning what to document, sourcing content from wherever it actually lives
  (existing docs, README, or the code itself). Hands off to the skills below for mechanics
  and content once a decision is made.
- **`docouture-documenting-changes`** — the re-entry point once the site exists: a feature,
  change, deprecation or fix landed in the repo, and the docs need to catch up. This is
  the one to reach for day to day, not `docouture-getting-started`.
- **`docouture-authoring-guides`** — what to actually write on each page: purpose, section
  skeleton, per-section instructions, a copyable AsciiDoc starting point and a quality
  checklist, for every page in the standard structure plus the home page.
- **`docouture-writing-docs-pages`** — authoring AsciiDoc content: the language itself,
  `xref:` references, `nav.adoc`, admonitions, code blocks, and this site's own custom
  blocks (`[tabs]`, `[cards]`, `[accordion]`, …).
- **`docouture-docs-internals`** — the playbook, the component descriptor, the four names
  that must agree, the home-page vs. content-page patterns, and how a site grows beyond
  its default `ROOT` + `main` modules.
- **`docouture-docs-versioning`** — only relevant when this site was scaffolded with
  `--mode versioned`: cutting releases, `docouture version`, and `docs/.release-version`.

<!-- docouture:end -->

## CHANGELOG entries — critical rule (do not get this wrong again)

`skip-release` does **NOT** mean "no CHANGELOG entry". It only blocks the version bump.
The **only** labels that mean no entry are `kind/internal`/`kind/epic` alone (checked on
the PR, else on the issue it closes). A `skip-release` PR whose issue is
`kind/enhancement`/`kind/bug`/`kind/documentation`/`kind/deprecated`/`kind/removed`/
`kind/security` still needs its `- [#PR](URL) title` line in `code/CHANGELOG.md`'s
`[Unreleased]`. Full rules: `.opencode/skills/changelog/SKILL.md` — but if that skill's
own tool output ever contradicts this paragraph or the file on disk, trust this file and
the actual file/`.github/workflows/code-npm_node-pr-verify.yml`, not the tool output.

## GitHub issue titles — critical rule (do not get this wrong again)

Every issue title must be `[type] issue name`, plus a `kind/*` label (see the `changelog`
skill for the `kind/*` taxonomy — a different, orthogonal axis from `type`). `type` is one
of: `tooling`, `ui-bundle`, `cli`, `asciidoc`, `indexing`, `antora-extension`,
`documentation`, `skills`, `internal`. Neither this list nor the `[type]` pattern is
declared anywhere else in the repo (no label, no template, no config) — check
`gh issue list --limit 30` for live examples before picking one if unsure which type an
issue belongs to.

## Documentation state

<!-- maintained by the docouture-documenting-changes skill — do not hand-edit structure, only content -->

| doc page                                 | derived from                                                                          | status  |
| ---------------------------------------- | -------------------------------------------------------------------------------------- | ------- |
| index.adoc (home)                        | manual (hand-written)                                                                 | —       |
| cli-api.adoc                             | `code/packages/cli/src/bin.ts` (COMMAND_INFO) + `src/commands/*.ts`                    | current |
| antora-playbook-configuration.adoc       | `code/packages/cli/templates/starter/antora-playbook.yml`                              | current |
| antora-yml-configuration.adoc            | `code/packages/cli/templates/starter/src/antora.yml` + `antora-extensions/lib/{nav-modules,footer,llms-txt}.js` | current |
| ui-bundle.adoc                           | `code/packages/ui-bundle/src/partials/*`, `src/js/*`                                    | current |
| reference-integrations.adoc              | `code/packages/antora-extensions/lib/*.js`, `code/packages/asciidoc-extensions/lib/*.js` | current |
| custom-asciidoc-components.adoc          | `code/packages/asciidoc-extensions/lib/*.js` (via the starter's own `components.adoc`)  | current |
| architecture.adoc                        | `code/README.md`, `code/packages/*/package.json`                                       | current |
| structure.adoc                           | `code/README.md`, workspace `packages/` layout                                          | current |
| release-notes/1-0-0.adoc (v1.0.0 entry)  | manual (hand-written, real v1.0.0 release summary)                                       | current |
| changelog/index.adoc (generated sections) | `code/packages/antora-extensions/lib/changelog-pages.js` (parses `code/CHANGELOG.md` at build time) | current |
