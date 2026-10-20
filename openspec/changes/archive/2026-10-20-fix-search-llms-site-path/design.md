## Context

`search-index.js` and `llms-txt.js` write `page.pub.url` into static files, bypassing the UI's `relativize` helper that keeps footer, nav-switcher and breadcrumbs deploy-path agnostic. Antora's content classifier never reads `site.url`; only `build-ui-model.js:32-43` derives a site path from it. Both extensions already receive `playbook` on `navigationBuilt`.

## Goals / Non-Goals

**Goals:** working search and llms.txt links under any `site.url`; one shared derivation; no config.
**Non-Goals:** changing UI bundle, `relativize`, footer/nav; `/latest/` clone retargeting; envelope version bump.

## Decisions

- **Build-time prefix (option A) over UI-side resolution (B).** B needs `uiRootPath` `../` arithmetic that depends on `ui.output_dir`, a UI change and arguably an envelope bump. A is a one-helper change; the cost (index tied to deploy URL) matches Antora's canonical links and sitemap.
- **New `lib/site-url.js`** exporting `siteUrlParts(siteUrl) -> { pathPrefix, baseUrl }`, mirroring build-ui-model.js's three forms. Pure function, easy to unit test.
- **Search: path-only prefix; llms.txt: absolute.** Search links are consumed in-page; llms.txt is consumed by agents that need fetchable URLs per llmstxt.org.
- **Assumption (open point from exploration):** llms.txt becomes absolute for every site with `site.url`, including root-hosted ones. Flagged as a visible change in CHANGELOG. Alternative: path-only to minimise diff.

## Risks / Trade-offs

- Built output not relocatable to a different host path -> consistent with existing Antora outputs.
- llms.txt consumers parsing old relative links see new values -> documented in CHANGELOG.
- `/latest/` clone search hits point at the real version -> unchanged from today.
