---
name: asciidoc
description: "How AsciiDoc is authored and extended in docouture — the content tree Antora expects, resource IDs and xrefs, the attributes the playbooks set, and the Asciidoctor.js extension API as Antora actually loads it. USE WHEN writing or editing an .adoc page, adding a page to the nav, fixing a broken xref or include, writing a custom block/macro/preprocessor, or wiring an extension into a playbook. EXAMPLES: 'add a page', 'my xref doesn't resolve', 'the build fails on a warning', 'add a custom admonition', 'register a block macro', 'my extension is being skipped', 'why is {attr} not substituted'."
metadata:
  internal: true
---

# AsciiDoc in docouture

Every page of every site here is AsciiDoc, parsed by **Asciidoctor** and orchestrated by
**Antora**. Both facts matter: Antora restricts and reinterprets parts of the language
(includes, xrefs, image paths) and the upstream Asciidoctor documentation describes the
unrestricted form. Where the two differ, this skill states the Antora rule — that is the
one this repository obeys.

- `reference/syntax.md` — the language: blocks, attributes, macros, lists, tables,
  includes, conditionals, substitutions, plus a URL index into the upstream language docs.
- `reference/extensions.md` — the Asciidoctor.js extension points, the registration
  contract Antora enforces, and how to wire an extension into a playbook.

For **what the rendered HTML looks like** read `ui-bundle-anatomy` (templates) and
`docouture-components` (markup and classes the styling expects).

## Where content lives

A documentation site is an Antora **component**: a directory containing `antora.yml` and a
`modules/` tree. Both sites follow the same shape.

```
code/packages/<site>/
  antora-playbook.yml           build entry point — site title, content sources, UI, attributes
  docs/
    antora.yml                  component descriptor: name, title, version, nav
    modules/
      ROOT/                     the default module; its name is omitted from resource IDs
        nav.adoc                the navigation tree for this module
        pages/*.adoc            one page per file — these become site URLs
```

Only `pages/` exists today. The other family directories are created when first needed,
with these exact names — Antora keys off them and ignores anything else:

| directory | family | referenced as |
| --- | --- | --- |
| `pages/` | `page$` | `xref:name.adoc[]` |
| `partials/` | `partial$` | `include::partial$name.adoc[]` |
| `examples/` | `example$` | `include::example$name.json[]` |
| `images/` | `image$` | `image::name.png[]` |
| `attachments/` | `attachment$` | `xref:attachment$file.pdf[]` |

Both components declare `version: ~` — they are **versionless**, so no resource ID ever
carries a version segment.

## Resource IDs

Antora addresses content by resource ID, not by relative path:

```
version@component:module:family$relative/path.adoc#fragment
```

Everything left of the filename is optional and defaults to the current page's context.
In practice, inside `ROOT` of a versionless component:

| reference | means |
| --- | --- |
| `xref:index.adoc[Home]` | a page in the same module |
| `xref:guide/setup.adoc[]` | a page in a subdirectory of `pages/` — empty text uses the target's title |
| `xref:example:index.adoc[]` | a page in the **example** component |
| `xref:index.adoc#install[]` | a fragment on another page |
| `include::partial$intro.adoc[]` | a partial from the same module |

`../` path traversal between pages is not how this works. A page one directory deep still
addresses its sibling as `xref:guide/other.adoc[]` — the ID is module-relative, never
file-relative.

## Attributes in force

Antora sets these before the playbook is read (`@antora/asciidoc-loader`):

```
env=site  env-site  site-gen=antora  site-gen-antora
attribute-missing=warn  icons=font  sectanchors  source-highlighter=highlight.js
```

Both playbooks then add, under `asciidoc.attributes`:

| attribute | effect |
| --- | --- |
| `experimental` | enables `kbd:[]`, `btn:[]` and `menu:[]` |
| `idprefix: ''` | section IDs lose the leading `_` |
| `idseparator: '-'` | word separator in generated IDs is `-`, not `_` |
| `icons: font`, `sectanchors` | redundant — Antora already defaults both. Harmless, but do not treat their presence as the reason they work |

So a section `== Getting Started` gets the ID `getting-started`, and a hand-written
`xref:page.adoc#getting-started[]` matches. Under stock Asciidoctor the same heading would
be `_getting_started` — upstream examples show that form.

`attribute-missing=warn` plus the failure level below means **a reference to an undefined
attribute fails the build**.

## Where a change goes

| you want to | do |
| --- | --- |
| add a page | create `docs/modules/ROOT/pages/name.adoc` **and** add an `xref:` to `nav.adoc` |
| add a section to the nav | edit `nav.adoc` — nesting is list depth (`*`, `**`, `***`) |
| reuse a chunk of prose | `docs/modules/ROOT/partials/name.adoc`, included as `partial$name.adoc` |
| add an image | `docs/modules/ROOT/images/name.png`, referenced as `image::name.png[Alt]` |
| set a site-wide attribute | `asciidoc.attributes` in `antora-playbook.yml` |
| set a component-wide attribute | `asciidoc.attributes` in `docs/antora.yml` |
| set a page-scoped attribute | an attribute entry in the page header, above the first blank line |
| add custom syntax | an Asciidoctor extension — see `reference/extensions.md` |

## Page attributes the UI reads

The UI bundle's `default` layout reads specific `page-*` attributes (and `description`)
straight off the page header — see `hero.hbs`'s own comment for the authoritative version:

| attribute | effect |
| --- | --- |
| `description` | hero excerpt (below the title) AND `<meta name="description">` |
| `page-tags` | comma-separated; one label pill each in the hero |
| `page-action` / `page-action-url` | primary hero button — renders only when BOTH are set |
| `page-action-secondary` / `page-action-secondary-url` | secondary hero button, same rule |
| `page-role: -hero` | suppresses the hero entirely; the title falls back to an in-article `<h1>` |
| `page-role: -toc` | suppresses the right-hand table of contents |
| `page-pagination` | enables the previous/next footer links |

`page-role` accepts several space-separated tokens (`-hero -toc`) — it becomes a literal
class on `<body>`, so CSS/JS keying off one of them (`body.-toc`) is unaffected by the
others being present. A `*-url` attribute accepts either an Antora page reference
(`getting-started.adoc`) or a literal URL; `resolvePageURL` returns `undefined` rather than
throwing when it isn't a page reference, so the literal is used as a fallback with no
extra syntax on the author's side.

## Constraints that fail silently

Each of these produces a wrong result or a hard build failure without an obvious cause.

- **A warning is a build failure.** Both playbooks set `runtime.log.failure_level: warn`.
  A broken xref, a missing include target, an undefined attribute reference or a bad
  image path exits non-zero. There is no "it built with warnings" state here.
- **A page missing from `nav.adoc` still builds.** It publishes at its URL, renders with
  an empty navigation context and is reachable only by direct link. Nothing warns.
- **`include::` cannot read arbitrary paths.** Antora installs its own include processor
  that resolves targets against the content catalog, so only the family forms
  (`partial$`, `example$`, and page IDs) work. A filesystem path fails, and it fails at
  build time, not at review time.
- **Attribute references are not substituted inside verbatim blocks.** `{version}` inside
  `----` or `....` renders literally unless the block carries `subs=attributes+`.
- **Unconstrained formatting needs doubled marks.** `**bold**` mid-word, `__italic__`
  mid-word, `##highlight##`. The single-mark form adjacent to a word character is not
  formatting at all and renders as literal punctuation.
- **A list is broken by a bare blank line plus non-list content.** Attaching a paragraph,
  block or nested content to a list item requires a `+` continuation line.
- **`example` and `starter` are separate components sharing one UI.** A cross-component
  xref must name the component (`xref:starter:index.adoc[]`) and only resolves when both
  are in the same playbook — today they are not, so cross-component xrefs fail.
- **The UI preview renders AsciiDoc through a different Asciidoctor than the sites do.**
  `code/packages/ui-bundle/preview-src/*.adoc` is converted by `@asciidoctor/core` 4.0.8
  with its own attribute set, which omits `idprefix`/`idseparator`. Section IDs there are
  `_getting_started`. Do not use the preview to verify anything about IDs, xrefs or
  includes — it has no content catalog at all.
- **Two Asciidoctor majors are installed.** Antora 3.1.15 pins `@asciidoctor/core ~2.2`;
  the UI bundle uses `~4.0.8`. `docs.asciidoctor.org/asciidoctor.js/latest` documents 4.0,
  whose API differs from the 2.2 the sites actually run. See `reference/extensions.md`
  before copying any upstream JavaScript.

## Commands

`just` sets its working directory to `code/`, so run it from the repository root. Raw
`pnpm`/`nx` must be run from `code/`.

| command | does |
| --- | --- |
| `just build-site example` | build one site (`example` or `starter`) |
| `just build` | build every package |
| `just dev example` | build, then serve on `:5000` and rebuild on edit |
| `just preview-ui` | UI bundle preview on `:5252` — templates only, not real content |
| `pnpm nx run @inditextech/docouture-example:build` | the underlying target (`antora --fetch antora-playbook.yml`) |

Build output is `code/packages/<site>/build/site`.
