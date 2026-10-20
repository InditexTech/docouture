# Tasks

## 1. Wizard and help wording

- [x] 1.1 Rewrite the URL segment prompt in `code/packages/cli/src/commands/new.ts` per design.md; verify `pnpm nx test cli` (run from `code/`) still passes
- [x] 1.2 Add `--url-segment` to the `new` usage/options in `code/packages/cli/src/bin.ts` (and `completion.ts` if it lists flags); verify `docouture --help` shows it with default and reason

## 2. Docs, templates, changelog

- [x] 2.1 Document `--url-segment` in `docs/src/modules/main/pages/reference-cli.adoc` and align `quickstart.adoc`, linking glossary Component/Module; verify `docouture build` in `docs/` passes with no warnings
- [x] 2.2 Align wording in comments of `code/packages/cli/templates/starter/src/antora.yml` and the starter playbooks; verify `pnpm nx test cli` still passes
- [x] 2.3 Add the `[Unreleased]` entry `- [#262](https://github.com/InditexTech/docouture/pull/262) \[cli] ...` to `code/CHANGELOG.md` and re-check the `AGENTS.md` ledger row for `reference-cli.adoc`; verify the entry renders in the docs build
