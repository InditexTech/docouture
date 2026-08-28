# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each entry is `- [#PR_ID](PR_URL) PR_NAME`, where `PR_NAME` matches the title of the
GitHub issue that tracks the change (see the `changelog` skill for the full convention:
which GitHub label maps to which section below, and why some merged PRs carry no entry
at all).

## [Unreleased]

### Added

- [#147](https://github.com/InditexTech/test-antoradocs/pull/147) [ui-bundle] Alternative home page template version
- [#141](https://github.com/InditexTech/test-antoradocs/pull/141) [cli] Polish the docouture CLI
- [#138](https://github.com/InditexTech/test-antoradocs/pull/138) [tooling] Standalone/versioned docs: /stable (or latest release tag) becomes a redirect stub instead of real content
- [#135](https://github.com/InditexTech/test-antoradocs/pull/135) [asciidoc] render Mermaid diagrams instead of a literal [mermaid] block
- [#120](https://github.com/InditexTech/test-antoradocs/pull/120) [cli] Polish starter template: align with example, add placeholder module, wire extensions, add default logo/favicon
- [#119](https://github.com/InditexTech/test-antoradocs/pull/119) [tooling] Docs publish: Create reusable GitHub Actions workflow for Antora to GitHub Pages
- [#118](https://github.com/InditexTech/test-antoradocs/pull/118) [ui-bundle] Style Stable vs Prerelease visual states for version selector and tags
- [#116](https://github.com/InditexTech/test-antoradocs/pull/116) [ui-bundle] Render version indicator explicitly when only one version exists
- [#113](https://github.com/InditexTech/test-antoradocs/pull/113) [indexing] Generate llms.txt and llms-full.txt at build time for AI indexing
- [#110](https://github.com/InditexTech/test-antoradocs/pull/110) [cli] Implement docouture dev, docouture build, docouture doctor commands and CLI test suite
- [#109](https://github.com/InditexTech/test-antoradocs/pull/109) [cli] CLI: Add interactive scaffolding wizard to docouture new (name, title, versioning mode)
- [#108](https://github.com/InditexTech/test-antoradocs/pull/108) [tooling] Add local Verdaccio snapshot publishing recipe and expand npm publish scope
- [#107](https://github.com/InditexTech/test-antoradocs/pull/107) [tooling] Docs release: Evaluate and implement CLI orchestration for docs release workflow
- [#106](https://github.com/InditexTech/test-antoradocs/pull/106) [tooling] Docs release: Implement and verify Mode 1 (Versioned Tags) on example site
- [#100](https://github.com/InditexTech/test-antoradocs/pull/100) [tooling] Docs release: Implement and verify Mode 2 (Stable + Prerelease) on example site
- [#98](https://github.com/InditexTech/test-antoradocs/pull/98) [ui-bundle] Replace highlight.js (client-side) with Shiki (build-time) for code highlighting
- [#97](https://github.com/InditexTech/test-antoradocs/pull/97) [ui-bundle] Review page <title> format: add module segment on multi-module sites and update separator
- [#76](https://github.com/InditexTech/test-antoradocs/pull/76) [ui-bundle] Searcher module filter, recent searches, a11y polish
- [#75](https://github.com/InditexTech/test-antoradocs/pull/75) [ui-bundle] Searcher responsive: S/XS full-screen dialog and floating trigger
- [#74](https://github.com/InditexTech/test-antoradocs/pull/74) [antora-extension] Runtime search
- [#73](https://github.com/InditexTech/test-antoradocs/pull/73) [ui-bundle] DS components and static search UI
- [#72](https://github.com/InditexTech/test-antoradocs/pull/72) [antora-extension] Search index built by Antora
- [#63](https://github.com/InditexTech/test-antoradocs/pull/63) [asciidoc] real tabs for main/quickstart's package-manager code blocks
- [#62](https://github.com/InditexTech/test-antoradocs/pull/62) [ui-bundle] Landing: accordion restyle collapsibles as DS accordion items, add an [accordion] grouping extension
- [#60](https://github.com/InditexTech/test-antoradocs/pull/60) [ui-bundle] Landing: cta extension composed from IOP DS primitives
- [#59](https://github.com/InditexTech/test-antoradocs/pull/59) [ui-bundle] Landing: feature-tabs extension for the Key features switcher
- [#54](https://github.com/InditexTech/test-antoradocs/pull/54) [ui-bundle] Landing: cards extension for the Quicklinks block
- [#52](https://github.com/InditexTech/test-antoradocs/pull/52) [ui-bundle] Landing: Hero block
- [#50](https://github.com/InditexTech/test-antoradocs/pull/50) [ui-bundle] Landing: Establish the asciidoc-extensions contract
- [#49](https://github.com/InditexTech/test-antoradocs/pull/49) [ui-bundle] side menu: per-module navigation with a module switcher
- [#43](https://github.com/InditexTech/test-antoradocs/pull/43) [ui-bundle] Example blocks, images with captions, lists and quotes
- [#42](https://github.com/InditexTech/test-antoradocs/pull/42) [ui-bundle] Tables: content tables and property tables
- [#41](https://github.com/InditexTech/test-antoradocs/pull/41) [ui-bundle] Admonitions map to IDS Notification
- [#40](https://github.com/InditexTech/test-antoradocs/pull/40) [ui-bundle] Code blocks: IDS Code Block, action bar and copy
- [#39](https://github.com/InditexTech/test-antoradocs/pull/39) [ui-bundle] Prose typography: heading scale, section rules and copy-link anchors
- [#38](https://github.com/InditexTech/test-antoradocs/pull/38) [ui-bundle] Page footer: previous/next navigation and feedback block
- [#37](https://github.com/InditexTech/test-antoradocs/pull/37) [ui-bundle] ToC as a sidebar toggled from the hero
- [#36](https://github.com/InditexTech/test-antoradocs/pull/36) [ui-bundle] Page hero: breadcrumbs, title, lead and labels
- [#35](https://github.com/InditexTech/test-antoradocs/pull/35) [ui-bundle] Side menu: logo, title and IDS list navigation tree
- [#34](https://github.com/InditexTech/test-antoradocs/pull/34) [ui-bundle] Header toolbar
- [#32](https://github.com/InditexTech/test-antoradocs/pull/32) [iop-ds] Preview harness: two views, page-layout support, realistic UI model, live reload
- [#31](https://github.com/InditexTech/test-antoradocs/pull/31) [iop-ds] Wire IOP DS component stylesheets into site.css and shrink bridge.css

### Fixed

- [#163](https://github.com/InditexTech/docouture/pull/163) [ui-bundle] Content page titles rendered uppercase via hero.hbs, ignoring source case
- [#158](https://github.com/InditexTech/docouture/pull/158) [tooling] Fix commit to main from docuture-* workflows that need it
- [#117](https://github.com/InditexTech/test-antoradocs/pull/117) [ui-bundle] Version tag is missing at xs breakpoint in side-menu drawer
- [#112](https://github.com/InditexTech/test-antoradocs/pull/112) [cli] Fix snapshot version pinning, implement Mode 1 versioning, add inquirer wizard + colored banner
- [#90](https://github.com/InditexTech/test-antoradocs/pull/90) [ui-bundle] Navbar height (--navbar-height) diverges from IDS Header component height (~41px vs 56px)
- [#71](https://github.com/InditexTech/test-antoradocs/pull/71) [ui-bundle] fix overflow items length when nested

### Documentation

- [#150](https://github.com/InditexTech/docouture/pull/150) [documentation] Document docouture using docouture (dogfood the platform for its own docs)
- [#149](https://github.com/InditexTech/docouture/pull/149) [skills] Externalize docs-authoring skills into standalone skill packages
- [#115](https://github.com/InditexTech/test-antoradocs/pull/115) [cli] Scaffold AGENTS.md and agent skills (OpenCode & Claude) in docouture new
- [#99](https://github.com/InditexTech/test-antoradocs/pull/99) [tooling] Document the two Antora versioning modes (Mode 1 & Mode 2)
- [#47](https://github.com/InditexTech/test-antoradocs/pull/47) [internal] migrate Weave.js content to example package
- [#33](https://github.com/InditexTech/test-antoradocs/pull/33) [iop-ds] Correct the iop-ds-components skill against the shipped package
