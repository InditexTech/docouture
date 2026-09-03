# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each entry is `- [#PR_ID](PR_URL) PR_NAME`, where `PR_NAME` matches the title of the
GitHub issue that tracks the change (see the `changelog` skill for the full convention:
which GitHub label maps to which section below, and why some merged PRs carry no entry
at all).

## [Unreleased]

### Fixed

- [#222](https://github.com/InditexTech/docouture/pull/222) \[tooling] docouture-release.yml: release-type/* guard never matches, so docs/release fires immediately even when a code release is also pending

## [1.1.0] - 2026-09-03

### Added

- [#220](https://github.com/InditexTech/docouture/pull/220) \[tooling] Improve execution of docouture-\* workflows
- [#215](https://github.com/InditexTech/docouture/pull/215) \[cli] check-links starter template: no timeout / no per-host limiting, so a single repeated link (e.g. repo link on every page) dominates crawl time

## [1.0.0] - 2026-09-02

### Added

- [#206](https://github.com/InditexTech/docouture/pull/206) \[cli] pin toolchain in the scaffolded starter (.tool-versions) + doctor package-manager check
- [#202](https://github.com/InditexTech/docouture/pull/202) \[cli] docouture dev / just dev: fall back to a random free port when the default 5000 is busy
- [#198](https://github.com/InditexTech/docouture/pull/198) \[ui-bundle] Click-to-zoom fullscreen overlay for images and diagrams
- [#176](https://github.com/InditexTech/docouture/pull/176) \[cli] Support git-flow branching alongside trunk-based in docouture scaffolding
- [#173](https://github.com/InditexTech/docouture/pull/173) \[tooling] Docs release: stop creating a GitHub Release for versioned-mode tags, tag only
- [#168](https://github.com/InditexTech/docouture/pull/168) \[tooling] Prefix versioned and standalone modes git tags with docs/ to avoid collision with code release tags
- [#164](https://github.com/InditexTech/docouture/pull/164) \[ui-bundle] Add opt-in bordered style for home hero image
- [#147](https://github.com/InditexTech/docouture/pull/147) \[ui-bundle] Alternative home page template version
- [#141](https://github.com/InditexTech/docouture/pull/141) \[cli] Polish the docouture CLI
- [#138](https://github.com/InditexTech/docouture/pull/138) \[tooling] Standalone/versioned docs: /stable (or latest release tag) becomes a redirect stub instead of real content
- [#135](https://github.com/InditexTech/docouture/pull/135) \[asciidoc] render Mermaid diagrams instead of a literal \[mermaid] block
- [#120](https://github.com/InditexTech/docouture/pull/120) \[cli] Polish starter template: align with example, add placeholder module, wire extensions, add default logo/favicon
- [#119](https://github.com/InditexTech/docouture/pull/119) \[tooling] Docs publish: Create reusable GitHub Actions workflow for Antora to GitHub Pages
- [#118](https://github.com/InditexTech/docouture/pull/118) \[ui-bundle] Style Stable vs Prerelease visual states for version selector and tags
- [#116](https://github.com/InditexTech/docouture/pull/116) \[ui-bundle] Render version indicator explicitly when only one version exists
- [#113](https://github.com/InditexTech/docouture/pull/113) \[indexing] Generate llms.txt and llms-full.txt at build time for AI indexing
- [#110](https://github.com/InditexTech/docouture/pull/110) \[cli] Implement docouture dev, docouture build, docouture doctor commands and CLI test suite
- [#109](https://github.com/InditexTech/docouture/pull/109) \[cli] CLI: Add interactive scaffolding wizard to docouture new (name, title, versioning mode)
- [#108](https://github.com/InditexTech/docouture/pull/108) \[tooling] Add local Verdaccio snapshot publishing recipe and expand npm publish scope
- [#107](https://github.com/InditexTech/docouture/pull/107) \[tooling] Docs release: Evaluate and implement CLI orchestration for docs release workflow
- [#106](https://github.com/InditexTech/docouture/pull/106) \[tooling] Docs release: Implement and verify Mode 1 (Versioned Tags) on example site
- [#100](https://github.com/InditexTech/docouture/pull/100) \[tooling] Docs release: Implement and verify Mode 2 (Stable + Prerelease) on example site
- [#98](https://github.com/InditexTech/docouture/pull/98) \[ui-bundle] Replace highlight.js (client-side) with Shiki (build-time) for code highlighting
- [#97](https://github.com/InditexTech/docouture/pull/97) \[ui-bundle] Review page <title> format: add module segment on multi-module sites and update separator
- [#76](https://github.com/InditexTech/docouture/pull/76) \[ui-bundle] Searcher module filter, recent searches, a11y polish
- [#75](https://github.com/InditexTech/docouture/pull/75) \[ui-bundle] Searcher responsive: S/XS full-screen dialog and floating trigger
- [#74](https://github.com/InditexTech/docouture/pull/74) \[antora-extension] Runtime search
- [#73](https://github.com/InditexTech/docouture/pull/73) \[ui-bundle] DS components and static search UI
- [#72](https://github.com/InditexTech/docouture/pull/72) \[antora-extension] Search index built by Antora
- [#63](https://github.com/InditexTech/docouture/pull/63) \[asciidoc] real tabs for main/quickstart's package-manager code blocks
- [#62](https://github.com/InditexTech/docouture/pull/62) \[ui-bundle] Landing: accordion restyle collapsibles as DS accordion items, add an \[accordion] grouping extension
- [#60](https://github.com/InditexTech/docouture/pull/60) \[ui-bundle] Landing: cta extension composed from IOP DS primitives
- [#59](https://github.com/InditexTech/docouture/pull/59) \[ui-bundle] Landing: feature-tabs extension for the Key features switcher
- [#54](https://github.com/InditexTech/docouture/pull/54) \[ui-bundle] Landing: cards extension for the Quicklinks block
- [#52](https://github.com/InditexTech/docouture/pull/52) \[ui-bundle] Landing: Hero block
- [#50](https://github.com/InditexTech/docouture/pull/50) \[ui-bundle] Landing: Establish the asciidoc-extensions contract
- [#49](https://github.com/InditexTech/docouture/pull/49) \[ui-bundle] side menu: per-module navigation with a module switcher
- [#43](https://github.com/InditexTech/docouture/pull/43) \[ui-bundle] Example blocks, images with captions, lists and quotes
- [#42](https://github.com/InditexTech/docouture/pull/42) \[ui-bundle] Tables: content tables and property tables
- [#41](https://github.com/InditexTech/docouture/pull/41) \[ui-bundle] Admonitions map to IDS Notification
- [#40](https://github.com/InditexTech/docouture/pull/40) \[ui-bundle] Code blocks: IDS Code Block, action bar and copy
- [#39](https://github.com/InditexTech/docouture/pull/39) \[ui-bundle] Prose typography: heading scale, section rules and copy-link anchors
- [#38](https://github.com/InditexTech/docouture/pull/38) \[ui-bundle] Page footer: previous/next navigation and feedback block
- [#37](https://github.com/InditexTech/docouture/pull/37) \[ui-bundle] ToC as a sidebar toggled from the hero
- [#36](https://github.com/InditexTech/docouture/pull/36) \[ui-bundle] Page hero: breadcrumbs, title, lead and labels
- [#35](https://github.com/InditexTech/docouture/pull/35) \[ui-bundle] Side menu: logo, title and IDS list navigation tree
- [#34](https://github.com/InditexTech/docouture/pull/34) \[ui-bundle] Header toolbar
- [#32](https://github.com/InditexTech/docouture/pull/32) \[ui-bundle] Preview harness: two views, page-layout support, realistic UI model, live reload
- [#31](https://github.com/InditexTech/docouture/pull/31) \[ui-bundle] Wire IOP DS component stylesheets into site.css and shrink bridge.css

### Fixed

- [#200](https://github.com/InditexTech/docouture/pull/200) \[ui-bundle/asciidoc] Diagram bleed silently lost outside a section, and role="a, b" leaves a comma stuck in the class attribute
- [#194](https://github.com/InditexTech/docouture/pull/194) \[cli] docouture-release-preview.yml's check-changes-in-paths job missing contents/pull-requests read permissions
- [#192](https://github.com/InditexTech/docouture/pull/192) \[asciidoc] kroki-prewarm doesn't resolve include:: before extracting diagram source — permanent cache miss for diagrams built from shared partials
- [#186](https://github.com/InditexTech/docouture/pull/186) \[skills] --all leaks contributor-only skills from .opencode/skills into public installs
- [#184](https://github.com/InditexTech/docouture/pull/184) \[skills] --all leaks contributor-only skills from .agents/skills into public installs
- [#182](https://github.com/InditexTech/docouture/pull/182) \[tooling] Fix open CodeQL cache-poisoning alerts in publish-release workflow
- [#181](https://github.com/InditexTech/docouture/pull/181) \[tooling] Upgrade Antora to 3.2.0 to resolve open js-yaml Dependabot alerts
- [#167](https://github.com/InditexTech/docouture/pull/167) \[tooling] Published v1.0.0 docs show "No tagged release yet" on the Changelog page
- [#163](https://github.com/InditexTech/docouture/pull/163) \[ui-bundle] Content page titles rendered uppercase via hero.hbs, ignoring source case
- [#158](https://github.com/InditexTech/docouture/pull/158) \[tooling] Fix commit to main from docuture-\* workflows that need it
- [#117](https://github.com/InditexTech/docouture/pull/117) \[ui-bundle] Version tag is missing at xs breakpoint in side-menu drawer
- [#112](https://github.com/InditexTech/docouture/pull/112) \[cli] Fix snapshot version pinning, implement Mode 1 versioning, add inquirer wizard + colored banner
- [#90](https://github.com/InditexTech/docouture/pull/90) \[ui-bundle] Navbar height (--navbar-height) diverges from IDS Header component height (~41px vs 56px)
- [#71](https://github.com/InditexTech/docouture/pull/71) \[ui-bundle] fix overflow items length when nested

### Documentation

- [#204](https://github.com/InditexTech/docouture/pull/204) \[documentation] docs site footer: swap Home for Repository link, add Guides and INDITEXTECH columns
- [#191](https://github.com/InditexTech/docouture/pull/191) \[skills] nav.adoc guidance doesn't warn against nesting a section's topics under its own Overview page
- [#174](https://github.com/InditexTech/docouture/pull/174) \[skills] Internalize authoring-guides content into the docouture-\* skills as AsciiDoc
- [#150](https://github.com/InditexTech/docouture/pull/150) \[documentation] Document docouture using docouture (dogfood the platform for its own docs)
- [#149](https://github.com/InditexTech/docouture/pull/149) \[skills] Externalize docs-authoring skills into standalone skill packages
- [#115](https://github.com/InditexTech/docouture/pull/115) \[cli] Scaffold AGENTS.md and agent skills (OpenCode & Claude) in docouture new
- [#99](https://github.com/InditexTech/docouture/pull/99) \[tooling] Document the two Antora versioning modes (Mode 1 & Mode 2)
- [#47](https://github.com/InditexTech/docouture/pull/47) \[internal] migrate Weave.js content to example package
- [#33](https://github.com/InditexTech/docouture/pull/33) \[skills] Correct the iop-ds-components skill against the shipped package

[Unreleased]: https://github.com/InditexTech/docouture/compare/1.1.0...HEAD

[1.1.0]: https://github.com/InditexTech/docouture/compare/1.0.0...1.1.0

[1.0.0]: https://github.com/InditexTech/docouture/releases/tag/1.0.0
