# Proposal

## Why

Issue #239: scaffolded sites ship with `runtime.log.failure_level: warn`, so any warning, including informational ones ("only the first image is rendered", fallbacks, best-effort notices), fails the build. First-run users hit noise failures. We want only problems the author must act on to fail the build.

## What Changes

- Starter template playbooks (`antora-playbook.yml`, `.local.yml`, `.versioned.yml`) set `failure_level: error`.
- Same change in this repo's `docs/` playbooks and `code/packages/example` playbooks.
- Extensions classify each log call. Author-must-act problems (unknown variant/type/width/alignment, missing title/label, empty blocks, dangling footer links, redirect or `nav_modules` rules matching nothing) move from `warn` to `error` so they still fail the build. Informational or degraded-but-fine notices stay `warn` and stop gating.
- `asciidoc-extensions` `warn()` helper becomes an error helper; a separate notice helper keeps `warn` for "only the first is rendered"-style cases.
- All text stating "a warning fails the build" is rewritten (AGENTS.md files, reference page, skills and their mirrors, READMEs, JSDoc, workflow comments).
- `code/CHANGELOG.md` entry under Fixed.
- Existing sites are NOT migrated; `docouture upgrade` is unchanged.
- **BREAKING (behavioural)**: third-party and core Antora warnings no longer fail the build in scaffolded sites.

## Capabilities

### New Capabilities
- `starter-build-strictness`: which log severities fail the build in scaffolded sites, and which extension problems are errors versus notices.

### Modified Capabilities

## Impact

- `code/packages/cli/templates/starter/*.yml`, `docs/antora-playbook*.yml`, `code/packages/example/antora-playbook*.yml`
- `code/packages/asciidoc-extensions/lib/*` (warn.js, cards, cta, tabs, accordion, feature-tabs, label-macro, kroki, nowrap-cols, table-width) and specs
- `code/packages/antora-extensions/lib/*` (~10 files) and ~8 spec files
- Docs/skills text: `AGENTS.md`, `templates/agent-support/AGENTS.md`, `reference-antora-playbook-configuration.adoc`, skills in `.opencode/skills`, `.agents/skills`, `skills/`, workflow comments (repo and template), READMEs
- `code/CHANGELOG.md`
