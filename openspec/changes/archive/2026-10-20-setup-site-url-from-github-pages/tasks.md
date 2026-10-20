# Tasks

## 1. This repo's own site

- [x] 1.1 Set `site.url: https://inditextech.github.io/docouture` in `docs/antora-playbook.yml` and verify `pnpm`/`docouture build` under `docs/` succeeds and emits `sitemap.xml` and `404.html`

## 2. Template placeholder

- [x] 2.1 Add `siteUrlLine` to `TemplateValues` and a `'__DOCOUTURE_SITE_URL_LINE__\n'` entry in `PLACEHOLDERS` (`copy-template.ts`); verify with a new `copy-template.spec.ts` case for both a set and an empty/commented value
- [x] 2.2 Replace the commented `url:` lines in `templates/starter/antora-playbook.yml` and `antora-playbook.versioned.yml` with the `#`-prefixed token; verify the template files still parse as YAML (prettier/format check passes)

## 3. CLI behaviour

- [x] 3.1 Add `normalizeSiteUrl` helper (trim, `^https?://` check, strip trailing slash); verify unit tests cover valid, trailing slash, empty and invalid inputs
- [x] 3.2 Add the `--site-url` flag parsing, invalid-value error (exit 1) and usage string update in `runNew`; verify `new.spec.ts` flag cases pass
- [x] 3.3 Add the wizard prompt (after title) with the derived default pre-filled, blank = skip, validator via `normalizeSiteUrl`; verify a scripted-stream test for accept, blank and invalid answers
- [x] 3.4 Resolve non-interactive default (`--yes`/no TTY) and build `siteUrlLine` into `TemplateValues`; verify scaffold tests for ssh remote, https remote, no remote, enterprise host, flag override, blank answer, in both standalone and versioned modes
- [x] 3.5 Run `pnpm nx test cli` (from `code/`) and verify all pass

## 4. Docs and changelog

- [x] 4.1 Document the prompt and `--site-url` in `docs/src/modules/main/pages/reference-cli.adoc` and the `site.url` behaviour in `reference-antora-playbook-configuration.adoc`; verify the docs build has no warnings
- [x] 4.2 Add the `- [#PR](URL) [cli] ...` line under `### Added` in `[Unreleased]` of `code/CHANGELOG.md`; verify against the changelog skill format
