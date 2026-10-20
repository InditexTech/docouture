# Proposal

## Why

Issue #236: published docouture sites have no `site.url`. Antora then emits no sitemap, no canonical links and no `404.html`, and the `siteMapped` event never fires. `docouture new` already derives the GitHub Pages URL (`https://<owner>.github.io/<repo>`) from the `origin` remote, but only prints it in the next-steps output; the scaffolded playbooks keep `url:` commented out. This repo's own `docs/antora-playbook.yml` has the same gap.

## What Changes

- `docs/antora-playbook.yml`: set `site.url` to `https://inditextech.github.io/docouture`.
- `docouture new` asks a new wizard question, "Public site URL (blank to skip)", with the origin-derived GitHub Pages URL as the pre-filled default (shown even when a default exists).
- New `--site-url <url>` flag is the non-interactive twin and skips the prompt. With `--yes` or no TTY, the derived default is used.
- The starter `antora-playbook.yml` and `antora-playbook.versioned.yml` render `url: <value>` when a URL is known, else keep today's commented hint.
- Trailing slash is stripped; value must be empty or `http(s)://...`.
- Docs: `reference-cli.adoc`, `reference-antora-playbook-configuration.adoc`. CHANGELOG entry (`kind/enhancement`).

Non-goals: backfilling existing sites via `docouture upgrade`; touching the `*.local.yml` playbooks (they keep `http://localhost:5000`).

## Capabilities

### New Capabilities
- `cli-new-site-url`: how `docouture new` determines, prompts for, validates and writes `site.url` into the scaffolded playbooks.

### Modified Capabilities

## Impact

- Code: `code/packages/cli/src/commands/new.ts`, `code/packages/cli/src/lib/copy-template.ts` (new whole-line placeholder + `TemplateValues` field), `new.spec.ts`, `copy-template.spec.ts`.
- Templates: `code/packages/cli/templates/starter/antora-playbook.yml`, `antora-playbook.versioned.yml`.
- This repo: `docs/antora-playbook.yml`.
- Docs: two reference pages, `code/CHANGELOG.md`, AGENTS.md documentation-state ledger (status stays current).
- Publish builds now generate sitemap, canonical links and `404.html`; `docouture dev` is unaffected (reads `antora-playbook.local.yml` only).
