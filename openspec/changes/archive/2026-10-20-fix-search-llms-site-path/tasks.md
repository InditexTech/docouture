## 1. Helper

- [x] 1.1 Add `code/packages/antora-extensions/lib/site-url.js` with `siteUrlParts` (full URL, leading `/`, `/`, empty/absent)
- [x] 1.2 Add `site-url.spec.js` covering each form and trailing slashes

## 2. Search index

- [x] 2.1 Prefix every record `url` (page and `#fragment` records, fallback record) in `search-index.js`
- [x] 2.2 Extend `search-index.spec.js`: path site.url, root site.url, no site.url

## 3. llms.txt

- [x] 3.1 Use base URL + `pub.url` for `llms.txt` links and `llms-full.txt` `Source:` in `llms-txt.js`
- [x] 3.2 Extend the llms-txt spec for the same three cases

## 4. Docs and release

- [x] 4.1 Add `[Unreleased]` Fixed entry to `code/CHANGELOG.md` (kind/bug, link to #245), noting llms.txt links are now absolute
- [x] 4.2 Note URL resolution against `site.url` in `docs/src/modules/main/pages/reference-integrations.adoc`; keep AGENTS.md ledger row current

## 5. Verify

- [x] 5.1 Run antora-extensions tests via `pnpm nx test` from `code/`
- [x] 5.2 Build docs with the real playbook and check `_/search/*.json` and `llms.txt` URLs carry `/docouture`
