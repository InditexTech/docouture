# Page patterns

Two recurring shapes: a home page, and a handful of content-page structures. Both are
patterns to copy, not a fixed schema Antora enforces — deviate when the content actually
calls for it.

## Home page

The `ROOT` module's `index.adoc`, rendered through the UI bundle's `home` layout
(`:page-layout: home`). Fixed section order — each block is optional, but when present
they appear in this order:

```adoc
= Home
:page-layout: home
:page-nav-module: <module>                      which module's nav the side menu shows,
                                                  since ROOT itself has none in a
                                                  multi-module site — see below
:description: One-line product description.
:page-tags: tag-one, tag-two
:page-action: Primary action
:page-action-url: module:page.adoc
:page-action-secondary: Secondary action
:page-action-secondary-url: module:other.adoc
:page-hero-image: /component/_images/hero.png
:page-hero-image-alt: Alt text for the hero image.

Intro paragraph, then a short bullet list of core capabilities.

== Get started

[cards,type=image-square,columns="1 s:2 m:4",width=container]
====
[card,subheader="Category"]
.xref:module:page.adoc[Entry point]
--
image::card-image.png["Alt text"]

Short description.
--
====

== Key capabilities

[feature-tabs]
====
[feature,label="Capability one"]
--
image::feature-one.png[Alt text]

Prose.

[.cta]
xref:module:page.adoc[Learn more]
--
====

== CTA

[cta]
====
Prose making the case for the action.

[.primary]
https://example.com[Primary link]
====

== FAQ

[accordion,aria-label="Frequently asked questions"]
--
.Question?
[%collapsible]
====
Answer.
====
--
```

Block syntax for `[cards]`, `[feature-tabs]`, `[cta]` and `[accordion]` is in the
`writing-docs-pages` skill's `reference/pdocs-blocks.md`; this file is the section-order
pattern, not the block reference.

## Content pages

Three shapes cover most content. Pick whichever fits, don't force every page into one.

**Overview page** — orients a reader before they dig into a module:

```adoc
= Module Name
:description: One-line description.

Intro paragraph.

[NOTE]
====
A callout worth surfacing immediately — a prerequisite, a link to a deeper page.
====

== Key features

* *Capability one* — with an xref to where it's covered in depth
* *Capability two*

== FAQ

.Question?
[%collapsible]
====
Answer.
====
```

Note: an overview page's FAQ is usually a run of _ungrouped_ `[%collapsible]` blocks —
reach for `[accordion]` grouping (see `writing-docs-pages`) when the questions genuinely
belong together as one unit, the way the home page's FAQ does.

**Tutorial page** — a linear walkthrough:

```adoc
= Quickstart
:description: Get to a working example in minutes.

Intro paragraph.

== Prerequisites

Before you begin, ensure you meet the xref:module:requirements.adoc[requirements].

== Step by step

=== 1. First step

Prose. Alternative commands (package managers, etc.) go in a [tabs] block:

[tabs]
--
[tab,label="pnpm"]
****
[source,bash]
----
pnpm install
----
****

[tab,label="npm"]
****
[source,bash]
----
npm install
----
****
--

=== 2. Second step

. Ordered step
. Another ordered step
+
Attached content needs a `+` continuation.
```

Steps are plain nested `=== N. ...` subsections — there is no custom "steps" block here,
just section nesting.

**Reference/leaf page** — documents one thing (an API, a config option, a component):

```adoc
= Thing Name
:description: One-line description.

image::thing.png[Alt text]

Prose describing what it is and when to use it.

== Usage

=== Import it

[source,ts]
----
import { Thing } from "package"
----

=== Register it

[source,ts]
----
const instance = new Thing() // <1>
----
<1> Explanation of this step.
```

## Mono-module vs. multi-module

`pdocs new` scaffolds a **mono-module** site by default: a single `modules/ROOT/` holding
both the landing page and all content, no `nav_modules:` in `docs/src/antora.yml`. This
is the right shape for a small site with one coherent topic.

A **multi-module** site splits content into several modules, each with its own
`nav.adoc`/`pages/`, switchable from the UI's module selector. Growing into this shape:

1. Create `docs/src/modules/<name>/{nav.adoc,pages/}` for each module.
2. List every module's `nav.adoc` under `docs/src/antora.yml`'s top-level `nav:` — but
   **not** `ROOT`'s: in a multi-module site, `ROOT` holds only the landing page and is
   deliberately absent from `nav:` (it has nothing to navigate; it borrows a module's own
   nav via `:page-nav-module:` on its `index.adoc`, as shown above).
3. Describe each module under `nav_modules:` (a **list**, not a map — see
   `reference/antora-extensions.md` for why) so the UI's switcher can show one module's
   nav at a time with a title, description and icon:

```yaml
nav:
  - modules/framework/nav.adoc
  - modules/sdk/nav.adoc

nav_modules:
  - module: framework
    title: Framework
    description: One-line description of this module.
    icon: design/grid-outlined
  - module: sdk
    title: SDK
    description: One-line description of this module.
    icon: actions/code-block-outlined
```

A module's own `nav.adoc` can use a bare, unlinked list item purely to group xrefs under
a heading with no page of its own:

```adoc
* Getting started
* xref:module:requirements.adoc[Requirements]
* xref:module:quickstart.adoc[Quickstart]
* Reference
* xref:module:api/index.adoc[API]
```
