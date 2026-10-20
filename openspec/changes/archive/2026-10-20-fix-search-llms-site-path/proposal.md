## Why

Search result links and `llms.txt`/`llms-full.txt` links are written from Antora's raw `page.pub.url`, which is relative to the site root and ignores the path in `site.url`. On GitHub Pages (`https://<org>.github.io/<repo>/`, the default since #261/#262) every search hit and every llms.txt link 404s because the `/<repo>` prefix is missing. All other navigation goes through the UI's `relativize` helper and is unaffected. Reported in #245.

## What Changes

- Add a shared helper that derives the site path prefix and full base URL from `playbook.site.url` (handles a full URL, a leading-`/` path, `/`, and absent).
- `search-index.js`: record `url` values are prefixed with the site path.
- `llms-txt.js`: `llms.txt` links and `llms-full.txt` `Source:` lines become absolute URLs (`site.url` + pub.url). Sites without `site.url` keep root-relative links.
- Tests for each `site.url` form; CHANGELOG `Fixed` entry; note in `reference-integrations.adoc`.
- No UI bundle change and no search envelope version bump (field set unchanged, only URL values).

## Capabilities

### New Capabilities
- `site-published-urls`: how URLs written into static build outputs (search index, llms.txt) are derived from `site.url`.

### Modified Capabilities

## Impact

- `code/packages/antora-extensions/lib/search-index.js`, `llms-txt.js`, new `lib/site-url.js`, and their specs.
- `code/CHANGELOG.md`, `docs/src/modules/main/pages/reference-integrations.adoc`.
- Visible behavior change: `llms.txt` links become absolute for every site that sets `site.url`.
- Out of scope: footer/nav-switcher (already `relativize`d), `/latest/` clone link targets.
