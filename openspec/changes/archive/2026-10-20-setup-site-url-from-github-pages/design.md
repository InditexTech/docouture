# Design

## Context

See proposal.md. `githubPagesUrl()` (`new.ts`) already derives `https://<owner>.github.io/<repo>/` with a trailing slash, used only for `printNextSteps`. `copy-template.ts` `substitute()` is plain token replacement over `PLACEHOLDERS`; whole-line tokens (e.g. `__DOCOUTURE_PNPM_TOOL_VERSIONS_LINE__\n`) already let a value carry its own newline or vanish. `docouture dev` reads only `antora-playbook.local.yml` (`dev-server.ts` `readBasePath`), so a real `site.url` in the main playbook does not affect it.

## Goals / Non-Goals

**Goals:**
- Reuse the existing derivation and placeholder mechanism; no new substitution concept.
- Same prompt/flag/default pattern as `--title` and `--url-segment`.

**Non-Goals:**
- `docouture upgrade` backfill.
- Supporting non-GitHub hosts' URL derivation.

## Decisions

1. **Whole-line placeholder** `__DOCOUTURE_SITE_URL_LINE__\n` -> `TemplateValues.siteUrlLine`. In the template it sits behind a `#` (valid YAML for prettier, like `PM_SETUP_STEP`). Value is `  url: <url>\n` or the existing commented hint line. Alternative: value-only token can't switch commented/active; rejected.
2. **Normalization in one helper** (`normalizeSiteUrl`): trim, validate `^https?://`, strip trailing `/`. Used by the prompt validator, the flag parser and the derived default. `githubPagesUrl()` output passes through it, so `printNextSteps` keeps its trailing-slash display or uses the normalized value consistently.
3. **Resolution order**: `--site-url` > prompt answer > (non-interactive) derived default > none. Prompt default is the derived URL; `-` returns undefined (skip). Rationale: @inquirer/prompts `input` returns `value || default`, so a blank submit can never mean skip while a default is pre-filled.
4. **Prompt position**: after title, before URL-segment question.
5. **Both starter playbooks** (`antora-playbook.yml`, `.versioned.yml`) get the token; the `.local.yml` stays untouched.
6. **Own docs site**: plain edit of `docs/antora-playbook.yml`, no placeholder.

## Risks / Trade-offs

- Wrong derived default (renamed repo, custom domain) -> mitigated by showing the prompt with the value pre-filled; `--site-url` overrides.
- Real `site.url` makes the real-playbook build emit sitemap/404; a wrong URL gives broken absolute links -> only in publish builds, user-visible and editable in the playbook.
- Org with enterprise or custom Pages host gets no default -> blank leaves the commented hint, same as today.
