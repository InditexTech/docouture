# Tasks

## 1. Verify core Antora behaviour

- [x] 1.1 Run a throwaway build with a broken xref, a missing include and an undefined attribute under `failure_level: error`; record which still fail (outcome noted in design.md Risks)

## 2. asciidoc-extensions

- [x] 2.1 In `lib/warn.js` add `error()` (logger.error) and `notice()` (logger.warn); update its header comment; verify `warn.spec.js` covers both levels
- [x] 2.2 Classify and update cards, cta, tabs, accordion, feature-tabs, label-macro, kroki call sites; verify their specs assert error vs warn per the rule
- [x] 2.3 Classify `nowrap-cols.js` and `table-width.js` direct `logger.warn`; verify specs pass
- [x] 2.4 Update the asciidoc-extensions README and `shiki-syntax-highlighter.js` comment; run `pnpm nx test asciidoc-extensions` from `code/`

## 3. antora-extensions

- [x] 3.1 Classify and update nav-modules, footer, llms-txt, redirects, not-found-page; update their specs; verify tests pass
- [x] 3.2 Classify and update changelog-pages, duplicate-latest-version, search-index, kroki-prewarm, kroki-docker; update specs; verify tests pass
- [x] 3.3 Update JSDoc in `redirects.js` and `nav-modules.js`; run `pnpm nx test antora-extensions`

## 4. Playbooks

- [x] 4.1 Set `failure_level: error` (and fix adjacent comments) in the three starter playbooks; verify a scaffolded site builds via `docouture new` + `docouture build`
- [x] 4.2 Same in `docs/antora-playbook*.yml` and `code/packages/example/antora-playbook*.yml`; verify both sites build

## 5. Documentation and text

- [x] 5.1 Rewrite "warning fails the build" in `AGENTS.md`, `templates/agent-support/AGENTS.md` and `reference-antora-playbook-configuration.adoc`; verify `docouture build` passes
- [x] 5.2 Update skills (`docouture-writing-docs-pages`, `asciidoc`, `docs-site-package`) and mirrors in `skills/` and `.agents/skills/` per `skills-authoring`; verify grep finds no stale statement
- [x] 5.3 Update workflow comments in `docouture-pr-verify.yml` and `docouture-release.yml` (repo and template copies); verify grep for "failure_level: warn" returns nothing
- [x] 5.4 Add the Fixed entry to `code/CHANGELOG.md` `[Unreleased]` in the `- [#PR](URL) title` format; verify format against the changelog skill

## 6. Integration

- [x] 6.1 Run full `pnpm nx run-many -t test,lint,build` from `code/`; verify green
