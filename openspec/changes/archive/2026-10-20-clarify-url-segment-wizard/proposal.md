# Proposal

## Why

Issue #237: a GitHub Pages project site already publishes under `https://<org>.github.io/<repo>/`, so a named Antora component would repeat that context. `docouture new` already defaults the component to Antora's reserved `ROOT` (no URL segment), but the behaviour is under-explained: the wizard prompt conflates "site name" and "component", never mentions modules, and `--url-segment` is missing from the CLI help, the CLI reference page and the CHANGELOG.

## What Changes

- Rewrite the `docouture new` "extra URL segment" prompt: marked "(recommended: no)", defines site / component / module, and shows the published URL for each answer.
- Document `--url-segment` in the CLI help (`bin.ts`) and `reference-cli.adoc`, including that the default is `ROOT` and why.
- Align the same wording in `quickstart.adoc` and in the comments of the scaffolded `antora.yml` and playbooks, linking the glossary Component and Module entries.
- Add a CHANGELOG entry for #262 and re-verify the `AGENTS.md` ledger row for `reference-cli.adoc`.
- No behaviour change: default stays `ROOT`; no `doctor` warning, no `upgrade` rewrite, no module-split or version-segment change.

## Capabilities

### New Capabilities
- `cli-new-url-segment`: how `docouture new` decides the Antora component name (`ROOT` by default, site slug via `--url-segment`) and how it explains that choice.

### Modified Capabilities

## Impact

- `code/packages/cli/src/commands/new.ts` (prompt text only), `code/packages/cli/src/bin.ts` (help text).
- `code/packages/cli/templates/starter/` comments (`src/antora.yml`, playbooks).
- `docs/src/modules/main/pages/reference-cli.adoc`, `quickstart.adoc`; `code/CHANGELOG.md`; `AGENTS.md` ledger.
