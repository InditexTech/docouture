# Structure planning

Decide what the site's shape should be before drafting any content. This builds on
`docs-internals`'s mechanics — read that skill for how `nav.adoc`/`antora.yml` actually
work; this file is about which structure to choose in the first place.

## The target nav structure

This is the default shape to aim for — six ordered sections, each page tagged with how
essential it is. Not every repo needs every page in one pass; the tags say which ones to
skip without asking and which ones to check for before skipping:

- 🔴 required — every documented repo should end up with this page.
- 🟠 recommended — include unless there's a specific reason not to.
- 🔵 conditional — include only if the repo actually has the surface it covers; skip
  cleanly (no stub) if it doesn't.
- ⚪ optional — nice to have, include when it adds value, otherwise leave out.

```
docs
├── 1. Overview
│   ├── about                              🔴
│   ├── architecture                       🔴
│   └── glossary (or basic terms)          ⚪
├── 2. Getting started
│   ├── prerequisites                      🔴
│   └── quickstart                         🔴
├── 3. Guides                              
│   ├── overview                           🔴 
│   ├── <task-name> / <feature>            🔴 (≥1, repeatable pattern, i.e. "How to setup [feature]", "How to use [feature]", etc.)
│   └── development                        🟠
├── 4. Reference                           
│   ├── overview                           🔴
│   ├── configuration                      🔵 (repo has a configuration surface)
│   └── api / sdk / cli                    🔵 (repo has an API/SDK/CLI surface, it can be ≥1)
├── 5. Additional information
│   ├── overview                           🔴
│   ├── changelog                          🔴 
│   │   ├── overview                       🔴 (menu to each changelog, grouped by major if possible if standalone version, by date of publishing)
│   │   └── vX.Y.Z / stable / prerelease   🔴 (the changelog notes of the version)
│   ├── release-notes                      🔴 
│   │   ├── overview                       🔴 (menu to each release, grouped by major if possible if standalone version, by date of publishing)
│   │   └── vX.Y.Z / stable / prerelease   🔴 (the real release notes of a version)
│   ├── faq                                🟠
│   ├── security                           🟠
│   └── eol / migration-guides             🔵 (repo has deprecations/major-version history)
└── 6. Contributing
    └── overview                           🔴
```

## Mapping the tree onto modules

`pdocs new` scaffolds mono-module by default (single `ROOT`, one `nav.adoc`). For a small
or early-stage repo, keep the whole tree above inside `ROOT`: each numbered section becomes
a bare, unlinked list item in `nav.adoc` grouping its pages under a heading with no page of
its own (see `docs-internals/reference/page-patterns.md`'s grouping example) — sections 1,
2, 5 and 6 stay this way even in a mature, fully multi-module site, since none of them ever
needed a "home" of their own.

**Guides** and **Reference** are the pair worth promoting to real modules once the site
outgrows `ROOT`, because they're the two sections that need a landing page a reader can
land on directly (via the module switcher) rather than always arriving through `ROOT`'s
own home page. Promote them independently and only when it earns its keep — a repo with
five guide pages and one reference page doesn't need Reference split out yet.

When in doubt, start mono-module — it's cheap to split later, see `docs-internals/
reference/page-patterns.md`'s own mono→multi migration steps. Splitting too early just
adds a module switcher nobody needs; splitting too late means a `ROOT` full of unrelated
content with no clean way to navigate it.

## Signals worth checking against the 🔵 conditional pages

Don't assume where these live — check what's actually in the repo, in whatever form it
takes there:

- A `bin` field in `package.json`, or a `cli`/`cmd` directory → an API/CLI surface, wants
  **Reference → api (or commands)**, and likely a **Guides** task page for common usage.
- An OpenAPI/GraphQL schema, or a REST/RPC handler directory → an API surface, wants
  **Reference → api**.
- A config file schema (`.schema.json`, a typed config object, documented env vars in
  code) → wants **Reference → configuration**.
- A changelog file, deprecation notices, major-version breaks, or an existing upgrade
  guide → wants **Additional information → eol / migration-guides**.
- Multiple independently publishable packages in a monorepo → consider one **Reference**
  module per package rather than forcing them into one.
- An existing `docs/`, `README.md`, `CONTRIBUTING.md`, wiki export, or similar → these
  inform which pages already have real content to source from (see
  `content-sourcing.md`), not just which pages to create.

Confirm the proposed set of 🔵/⚪ pages with whoever's driving before committing pages to
it — auto-detected signals can be wrong (a `bin` field for an internal-only dev tool
doesn't need a user-facing CLI guide, for instance).

## The home page: structure now, content later

The home page's *existence and slot* is fixed and non-negotiable, asserted in this phase:
`ROOT`'s `pages/index.adoc`, using the `page-layout: home` pattern (see `docs-internals/
reference/page-patterns.md`). It sits outside the six-section tree above — it's the site's
entry point, not a member of "Overview". Do not skip creating it, and do not spend long
drafting its real copy yet — its content is a *summary* of everything else, so it's better
drafted roughly here (from whatever one-line description already exists) and properly
finished in the content-sourcing phase, once there's something real to summarize.

