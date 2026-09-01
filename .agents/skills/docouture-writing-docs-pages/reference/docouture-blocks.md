# This site's custom blocks

Registered by `@inditextech/docouture-asciidoc-extensions`, listed under
`antora-playbook.yml`'s `asciidoc.extensions`. Everything below is authored content with
no plain-AsciiDoc equivalent — the extension only emits markup, all styling comes from
the UI bundle's CSS. Every block here degrades to plain, readable HTML with JavaScript
off (sequential sections for tabs, `<details>` for accordions, real `<a href>`s).

## Tabs

A switcher for equivalent alternatives — package-manager commands, config formats, etc.

```adoc
[tabs]
--
[tab,label="pnpm"]
****
[source,bash]
----
pnpm add some-package
----
****

[tab,label="npm"]
****
[source,bash]
----
npm install some-package
----
****
--
```

`[tabs]` is an open block (`--`); each `[tab,label="…"]` child is its own sidebar block
(`****`), never an example block (`====`) — this lets a tab hold anything, including a
titled source block or another nested block, without a delimiter-nesting trap.

## Cards

A grid of entry-point cards — landing "Get started" rows, or a content page pointing at
related pages.

```adoc
[cards,type=image-square,columns="1 s:2 m:4",width=container]
====
[card,subheader="Category"]
.xref:module:page.adoc[Card title]
--
image::card-image.png["Alt text"]

Card description.
--

[card]
.xref:module:other.adoc[No-image card]
A card with just a title and description — no image, no open block needed.
====
```

- `type`: `no-image` (default), `image-landscape`, `image-square`, `image-portrait`.
- `columns`: base count, then breakpoint-prefixed overrides (`s:`, `m:`, `l:`), e.g.
  `"1 s:2 m:4"` — max 4.
- `width`: `content` (default) or `container`.
- The block title (`.xref:...[Title]`) carries the link — the whole card is that link.
- A card with an image needs the open-block form (`--`/`--`); a text-only card can be a
  plain paragraph under `[card]`.

## Accordion (grouped FAQ)

Groups a run of `[%collapsible]` blocks with proper `role=group` semantics and,
optionally, single-open behaviour — the native `[%collapsible]` on its own (see
`language-basics.md`) still works for one-off collapsibles; group them with `[accordion]`
when several belong together, e.g. an FAQ section.

```adoc
[accordion%single-open,aria-label="Frequently asked questions"]
--
.Question one?
[%collapsible]
====
Answer one.
====

.Question two?
[%collapsible]
====
Answer two.
====
--
```

- `%single-open` (an option, like `%collapsible`'s own) makes opening one item close the
  others; omit it and items are independent (the default).
- Give the group an `aria-label=` (or a block `.Title`) — a `role=group` with no
  accessible name is flagged.
- `[accordion]` is an open block (`--`) so its `[%collapsible]` children stay ordinary
  `====` blocks, unchanged from how they'd read standalone.

## Feature tabs

A media-plus-prose switcher for a handful of top-level capabilities — used on the home
page (see the `docouture-docs-internals` skill's `reference/page-patterns.md`).

```adoc
[feature-tabs]
====
[feature,label="Capability one"]
--
image::feature-one.png[Alt text]

Prose describing this capability.

[.cta]
xref:module:page.adoc[Learn more]
--

[feature,label="Capability two"]
--
image::feature-two.png[Alt text]

Prose describing this capability.
--
====
```

## CTA

A single call-to-action block — prose plus one prominent link.

```adoc
[cta]
====
Prose making the case for the action.

[.primary]
https://example.com/signup[Get started]
====
```

## Diagrams

`[mermaid]`, `[plantuml]`, `[graphviz]`, `[bpmn]`, `[excalidraw]`, `[structurizr]` and
over a dozen more (see `@inditextech/docouture-asciidoc-extensions`'
`lib/kroki-config.js`'s `SUPPORTED_TYPES` for the full, live-verified list) render real
diagrams via a self-hosted Kroki service — opt-in, off by default (`kroki-enabled: true`
in `antora-playbook.yml`; see the `docouture-integrations` reference for the full
attribute set). A literal block (four dots, not a fenced code block), styled with the
diagram language's name:

```adoc
[mermaid]
....
stateDiagram-v2
  [*] --> Idle
  Idle --> Running : start
....
```

- Classic `[type,target,format]` positional shorthand works alongside named
  `format=`/`target=` — `[plantuml,my-diagram,png]` is the same as
  `[plantuml,target=my-diagram,format=png]`. `target` is accepted but unused (this
  extension always inlines, never writes a file to disk).
- Any named attribute beyond the built-in set (`target`, `width`, `height`, `format`,
  `role`, `title`, `caption`, …) is a Kroki diagram-specific option, forwarded as a
  `Kroki-Diagram-Options-<key>` HTTP header — e.g.
  `[structurizr,view-key=SystemContext]`.
- `format=png` (or `jpeg`/`jpg`/`pdf`/`base64` — gated per type against
  `kroki-config.js`'s `FORMAT_SUPPORT`, not a blanket rule) renders a raster `<img>`/
  `<embed>` instead of inline SVG. `format=txt`/`atxt`/`utxt` is different in kind —
  Kroki's own ASCII-art-style text rendering, not an image at all.
- Mermaid gets this project's own theming baked into its source server-side
  (`kroki-mermaid-theme.js`), before Kroki ever sees it — opt out by opening the
  diagram with your own `%%{init...}%%` directive.
- The card framing a diagram follows site theme, like any other card; the diagram's
  own canvas underneath it is always a fixed white, regardless of theme — diagram
  tools don't agree on whether they bake their own background at all, so a fixed
  canvas is what makes every diagram read the same, and means colors never need
  inverting for dark mode.
- Without Docker, or with the feature disabled, a block renders as its own literal
  source text rather than failing the build.

## Inline macros: `label:` and `mono:`

```adoc
label:red[Blocked]        a coloured pill — variants: white, grey, red, orange, green,
                           blue, purple, pink, teal (grey is the default, label:[Text])
mono:[className]          plain monospaced text with no code-chip styling — for a
                           table cell whose entire content is a bare name/token
```

`` `backtick code` `` (see `language-basics.md`) keeps its usual code-chip styling;
`mono:[]` is the deliberate opt-out for a column where every cell is a token and the chip
would just be noise.

## Table and video sizing attributes

```adoc
[table-width=720px,cols="1,1"]        |=== an absolute CSS width, bypassing Asciidoctor's
|===                                   own width= (which is percentage-only, clamped 1-100)

[cols="1,3,2",nowrap-cols="1,2"]      pins white-space: nowrap to specific columns
|===
...
|===

video::demo[youtube,640,360]          sets both dimensions and locks the aspect ratio
                                        at any narrower viewport (no CSS-only fix exists
                                        for an iframe/video the way there is for <img>)
```

These aren't new blocks, just extra attributes Asciidoctor's own table/video macros don't
support natively — safe to ignore if you never need an absolute width or a nowrap column.
