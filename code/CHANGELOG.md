# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- [#138](https://github.com/InditexTech/test-antoradocs/pull/138) CLI starter template: fix `pdocs-publish-prerelease.yml` — add a checkout step before its `dorny/paths-filter` call (on a `push` trigger the action diffs `github.event.before` against `github.sha` via local git history, which fails with `git` exit 128 without an actual checkout in that job first), and grant `contents: write` on its `publish` job specifically rather than the workflow's top-level read-only permissions (without it, GitHub rejects the call into `pdocs-publish.yml`'s reusable `publish` job outright as a permissions escalation, since that job requests `contents: write` for `@inditextech/pdocs-publish-gh-pages`'s push to `gh-pages`)

### Added

- [#44](https://github.com/InditexTech/test-antoradocs/issues/44) Migration: render `[mermaid]`/`[plantuml]`/etc. diagrams via a self-hosted Kroki service instead of literal diagram source — opt-in per site (`kroki-enabled`/`kroki-diagram-types`), disabled by default, auto-started on demand (no manual `docker compose` step, no CI service container), customizable via `pdocs eject kroki`, stoppable via `pdocs teardown kroki` (`just kroki-down` in this monorepo); Kroki's own auto-start/render lifecycle, and every other pdocs Antora extension's own observability (search-index, llms-txt, footer, nav-modules, version-report, not-found-page), now logs at `info` under a `pdocs-*` name and is surfaced by default from `just dev`/`just build-site` and `pdocs dev`/`pdocs build`; a new always-on `lifecycle-log` extension traces Antora's own generator pipeline (`contextStarted` through `contextClosed`) the same way, since Antora itself never logs when it enters a phase at any log level
- [#120](https://github.com/InditexTech/test-antoradocs/pull/120) Polish CLI starter template: align with example, add placeholder module, wire extensions, add default logo/favicon
- [#119](https://github.com/InditexTech/test-antoradocs/pull/119) Docs publish: Create reusable GitHub Actions workflow for Antora to GitHub Pages
- [#118](https://github.com/InditexTech/test-antoradocs/pull/118) [Epic] Version selector: visibility, modes & responsive styling
- [#117](https://github.com/InditexTech/test-antoradocs/pull/117) [Bug] Version tag is missing at xs breakpoint in side-menu drawer
- [#116](https://github.com/InditexTech/test-antoradocs/pull/116) [Task] Render version indicator explicitly when only one version exists
- [#115](https://github.com/InditexTech/test-antoradocs/pull/115) CLI: Scaffold AGENTS.md and agent skills (OpenCode & Claude) in pdocs new
- [#113](https://github.com/InditexTech/test-antoradocs/pull/113) Antora extension: Generate llms.txt and llms-full.txt at build time for AI indexing
- [#112](https://github.com/InditexTech/test-antoradocs/pull/112) pdocs CLI: fix snapshot version pinning, implement Mode 1 versioning, add inquirer wizard + colored banner
- [#110](https://github.com/InditexTech/test-antoradocs/pull/110) CLI: Implement pdocs dev, pdocs build, pdocs doctor commands and CLI test suite
- [#109](https://github.com/InditexTech/test-antoradocs/pull/109) CLI: Add interactive scaffolding wizard to pdocs new (name, title, versioning mode)
- [#108](https://github.com/InditexTech/test-antoradocs/pull/108) Release: Add local Verdaccio snapshot publishing recipe and expand npm publish scope
- [#107](https://github.com/InditexTech/test-antoradocs/pull/107) Docs release: Evaluate and implement CLI orchestration for docs release workflow
- [#106](https://github.com/InditexTech/test-antoradocs/pull/106) Docs release: Implement and verify Mode 1 (Versioned Tags) on example site
- [#100](https://github.com/InditexTech/test-antoradocs/pull/100) Docs release: Implement and verify Mode 2 (Stable + Prerelease) on example site
- [#99](https://github.com/InditexTech/test-antoradocs/pull/99) Docs release: Document the two Antora versioning modes (Mode 1 & Mode 2)
- [#98](https://github.com/InditexTech/test-antoradocs/pull/98) Evaluate replacing highlight.js (client-side) with Shiki (build-time) for code highlighting
- [#97](https://github.com/InditexTech/test-antoradocs/pull/97) Review page <title> format: add module segment on multi-module sites and update separator
- [#90](https://github.com/InditexTech/test-antoradocs/pull/90) Navbar height (--navbar-height) diverges from IDS Header component height (~41px vs 56px)
- [#76](https://github.com/InditexTech/test-antoradocs/pull/76) S5 - Module filter, recent searches, a11y polish
- [#75](https://github.com/InditexTech/test-antoradocs/pull/75) S4 - Responsive: S/XS full-screen dialog and floating trigger
- [#74](https://github.com/InditexTech/test-antoradocs/pull/74) S3 - Runtime search
- [#73](https://github.com/InditexTech/test-antoradocs/pull/73) S2 - DS components and static search UI
- [#72](https://github.com/InditexTech/test-antoradocs/pull/72) S1 - Search index built by Antora
- [#71](https://github.com/InditexTech/test-antoradocs/pull/71) Fix overflow items length when nested
- [#63](https://github.com/InditexTech/test-antoradocs/pull/63) Migration: real tabs for main/quickstart's package-manager code blocks
- [#62](https://github.com/InditexTech/test-antoradocs/pull/62) B7 - accordion: restyle collapsibles as DS accordion items, add an [accordion] grouping extension
- [#60](https://github.com/InditexTech/test-antoradocs/pull/60) B6 - cta extension composed from IOP DS primitives
- [#59](https://github.com/InditexTech/test-antoradocs/pull/59) B5 - feature-tabs extension for the Key features switcher
- [#54](https://github.com/InditexTech/test-antoradocs/pull/54) B3 - cards extension for the Quicklinks block
- [#52](https://github.com/InditexTech/test-antoradocs/pull/52) B2 - Landing hero block
- [#51](https://github.com/InditexTech/test-antoradocs/pull/51) B1 - home.hbs layout and page-layout plumbing
- [#50](https://github.com/InditexTech/test-antoradocs/pull/50) B0 - Scaffold the asciidoc-extensions package
- [#49](https://github.com/InditexTech/test-antoradocs/pull/49) Side menu: per-module navigation with a module switcher
- [#47](https://github.com/InditexTech/test-antoradocs/pull/47) Migrate Weave.js content to example package
- [#43](https://github.com/InditexTech/test-antoradocs/pull/43) A9 - Example blocks, images with captions, lists and quotes
- [#42](https://github.com/InditexTech/test-antoradocs/pull/42) A8 - Tables: content tables and property tables
- [#41](https://github.com/InditexTech/test-antoradocs/pull/41) A7 - Admonitions map to IDS Notification
- [#40](https://github.com/InditexTech/test-antoradocs/pull/40) A6 - Code blocks: IDS Code Block, action bar and copy
- [#39](https://github.com/InditexTech/test-antoradocs/pull/39) A5 - Prose typography: heading scale, section rules and copy-link anchors
- [#38](https://github.com/InditexTech/test-antoradocs/pull/38) A10 - Page footer: previous/next navigation and feedback block
- [#37](https://github.com/InditexTech/test-antoradocs/pull/37) A4 - On this page: ToC as a sidebar toggled from the hero
- [#36](https://github.com/InditexTech/test-antoradocs/pull/36) A3 - Page hero: breadcrumbs, title, lead and labels
- [#35](https://github.com/InditexTech/test-antoradocs/pull/35) A2 - Side menu: logo, title and IDS list navigation tree
- [#34](https://github.com/InditexTech/test-antoradocs/pull/34) A1 - Header toolbar replaces the placeholder navbar
- [#33](https://github.com/InditexTech/test-antoradocs/pull/33) F4 - Correct the iop-ds-components skill against the shipped package
- [#32](https://github.com/InditexTech/test-antoradocs/pull/32) F3 - Preview harness: two views, page-layout support, realistic UI model, live reload
- [#31](https://github.com/InditexTech/test-antoradocs/pull/31) F2 - Wire IOP DS component stylesheets into site.css and shrink bridge.css
- [#30](https://github.com/InditexTech/test-antoradocs/pull/30) F1 - Icon pipeline: export IOP DS icons from Figma into a local sprite
