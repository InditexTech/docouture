# Asciidoctor.js extensions

Upstream: `https://docs.asciidoctor.org/asciidoctor.js/latest/extend/extensions/`

**Read the version note first.** The upstream `latest` is Asciidoctor.js **4.0**. The sites
in this repository run **2.2**. Copying 4.0 examples verbatim into an Antora extension
produces code that does not run.

## Which Asciidoctor am I writing for?

| context | Asciidoctor | how the module is loaded | docs to use |
| --- | --- | --- | --- |
| `example` / `starter` site builds | `@asciidoctor/core ~2.2`, via `antora@3.1.15` → `@antora/asciidoc-loader` | `asciidoc.extensions` in `antora-playbook.yml` | `asciidoctor.js/2.2/extend/extensions/` |
| `ui-bundle` preview harness | `@asciidoctor/core ~4.0.8` | `asciidoc.extensions` in `preview-src/ui-model.yml`, registered globally by `gulp.d/tasks/build-preview-pages.js` | `asciidoctor.js/latest/extend/extensions/` |

The extension **DSL** (`this.named`, `this.process`, `createBlock`, …) is essentially the
same across both. What differs is the module surface around it:

```js
// 2.2 — factory export
const asciidoctor = require('@asciidoctor/core')()
const { Extensions } = asciidoctor
asciidoctor.convert(text)                       // synchronous

// 4.0 — the module object itself carries the API
const Asciidoctor = require('@asciidoctor/core')
const { Extensions } = Asciidoctor
await Asciidoctor.convert(text)                 // async; load() too, and it needs a string
```

An extension written as `module.exports.register = function (registry) { … }` and touching
only `registry`/`this` is portable between the two. Anything that reaches for the module
object is not.

## Extension points

Every one is registered by calling the matching method on the registry.

| point | registry method | receives | returns | fires |
| --- | --- | --- | --- | --- |
| Preprocessor | `registry.preprocessor(fn)` | `(document, reader)` | the reader | before parsing, on raw source lines |
| Include processor | `registry.includeProcessor(fn)` | `(document, reader, target, attributes)` | — pushes onto the reader | on `include::[]` |
| Tree processor | `registry.treeProcessor(fn)` | `(document)` | the document | after parsing, on the AST |
| Block processor | `registry.block(fn)` | `(parent, reader, attributes)` | a block | on a block with the named style |
| Block macro processor | `registry.blockMacro(fn)` | `(parent, target, attributes)` | a block | on `name::target[]` |
| Inline macro processor | `registry.inlineMacro(fn)` | `(parent, target, attributes)` | an inline node | on `name:target[]` |
| Docinfo processor | `registry.docinfoProcessor(fn)` | `(document)` | a string | when head/footer docinfo is collected |
| Postprocessor | `registry.postprocessor(fn)` | `(document, output)` | the output string | after conversion, before writing |

You can register many processors of each kind, but **only one per block style or macro
name** — a second registration for the same name silently replaces the first.

Upstream page per point: `preprocessor/`, `include-processor/`, `tree-processor/`,
`block-processor/`, `block-macro-processor/`, `inline-macro-processor/`,
`docinfo-processor/`, `postprocessor/`.

## The DSL

Inside the function passed to a registry method, `this` is the processor being configured.

```js
registry.block(function () {
  const self = this
  self.named('callout')                    // the block style: [callout]
  self.onContext('paragraph')              // or onContexts('paragraph', 'open')
  self.positionalAttributes('type')        // [callout,warning] → attributes.type
  self.defaultAttributes({ type: 'note' })
  self.parseContentAs('simple')            // 'simple' | 'compound' | 'verbatim' | 'raw' | 'literal'
  self.process(function (parent, reader, attrs) {
    const lines = reader.getLines()
    return self.createBlock(parent, 'paragraph', lines, { role: `callout-${attrs.type}` })
  })
})
```

Creation helpers available on the processor:

| helper | makes |
| --- | --- |
| `createBlock(parent, context, source, attrs)` | a block of the given context (`paragraph`, `pass`, `listing`, `admonition`, …) |
| `createBlockFromString(parent, source, attrs)` | a block by parsing AsciiDoc source |
| `createList(parent, context)` / `createListItem(list, text)` | a list |
| `createInline(parent, context, text, opts)` | an inline node (`quoted`, `anchor`, `image`) |
| `createImageBlock(parent, attrs)` | a block image |
| `parseContent(parent, lines)` | parse lines as AsciiDoc into the parent |

Returning `createBlock(parent, 'pass', html)` emits raw HTML — the usual way to produce
markup the design system styles. That markup must carry the classes
`docouture-components` expects, or it renders unstyled.

## Registration — what Antora requires

Antora resolves `asciidoc.extensions` entries with `@antora/user-require-helper`
(relative to the playbook's directory, then to Antora's own), then inspects the export.
It branches on the shape:

```js
// SCOPED — Antora calls this once per page, with a fresh registry
module.exports.register = function (registry, context) {
  // context = { file, contentCatalog, config }
  registry.block(/* … */)
}

// GLOBAL — no `register` export; the module object is handed to Extensions.register()
module.exports = function () {
  this.block(/* … */)
}
```

Three rules, all enforced by `resolve-asciidoc-config.js`, all silent when broken:

- **The first parameter must be literally named `registry`.** Antora matches
  `register.toString()` against `/^(?:(?:function(?:\s+\w+)?\s*)?\(\s*registry\s*[,)])/`.
  Name it `reg`, or ship a minified/bundled build that renames it, and Antora decides the
  module is an *Antora* extension mistakenly listed under `asciidoc.extensions`, logs
  `Skipping possible Antora extension registered as an Asciidoctor extension`, and moves
  on. Nothing else happens. This also rules out arrow functions with destructured or
  renamed parameters.
- **`register` must declare at least one parameter.** A zero-arity `register()` fails the
  same check.
- **`asciidoc.extensions` and `antora.extensions` are different systems.** The former
  takes Asciidoctor extensions (this document); the latter takes Antora pipeline
  extensions, which hook the generator's lifecycle events and never see AsciiDoc syntax.

Prefer the scoped form. It gets `context.file` (the current page) and
`context.contentCatalog` (everything Antora knows about the site), which is the only way
an extension can resolve a resource ID or link to another page.

Antora pre-populates each per-page registry with **its own include processor**. Registering
another include processor overrides resource-family resolution and breaks every
`include::partial$…[]` in the site.

## Wiring one in

```yaml
# antora-playbook.yml
asciidoc:
  attributes:
    experimental: ''
  extensions:
    - ./lib/callout-block.js        # path relative to the playbook directory
    - '@inditextech/docouture-asciidoc-extensions'   # or a package name
```

If a package is used, it must be a dependency of the site package so pnpm links it into
`code/packages/<site>/node_modules`.

There is **no extensions package in this repository yet**. When one is added it belongs at
`code/packages/<name>` as a workspace package, listed in both site packages' dependencies
and in both playbooks — same shape as `@inditextech/docouture-ui-bundle`.

The `--extension` and `-r` CLI flags described upstream are Asciidoctor CLI options.
Antora does not read them; the playbook is the only wiring point for site builds.

## Preview harness

`code/packages/ui-bundle/gulp.d/tasks/build-preview-pages.js` reads an `asciidoc.extensions`
list from `preview-src/ui-model.yml`, requires each entry and calls
`extension.register.call(Asciidoctor.Extensions)` — **global** registration, not scoped,
and against Asciidoctor 4.0. It also sets a `<name>-loaded` attribute per extension so
templates can branch on presence.

The list is empty today. The harness has no content catalog, so a scoped extension that
uses `context.contentCatalog` cannot be exercised there. Use `just dev example` to test
anything that touches Antora's model.

## Debugging

- An extension that appears to do nothing: check the parameter name first, then look for
  `Skipping possible Antora extension` in the build log.
- A block extension that never fires: `onContext` must match the context the parser
  assigned (a delimited `--` block is `open`, an indented block is `literal`, a plain
  paragraph is `paragraph`).
- `runtime.log.failure_level: warn` means an extension that logs a warning fails the
  build. Use the document's logger deliberately.
- Extensions run against content Antora has already resolved, so a preprocessor sees
  include-expanded source, not the `include::` lines.

## URL index

| topic | page (under `asciidoctor.js/latest/`) |
| --- | --- |
| Register extensions | `extend/extensions/register/` |
| Extension points, one page each | `extend/extensions/{preprocessor,tree-processor,postprocessor,docinfo-processor,block-processor,block-macro-processor,inline-macro-processor,include-processor}/` |
| Published extensions | `extend/extensions/ecosystem/` |
| Custom converter | `extend/converter/custom-converter/` |
| Template converter | `extend/converter/template-converter/` |
| Custom syntax highlighter | `extend/syntax-highlighter/custom-syntax-highlighter/` |
| Document/AST API | `processor/extract-api/`, `processor/manipulate-api/` |
| Logging API | `processor/logging-api/` |
| 2.2 equivalents (what the sites run) | swap `latest` for `2.2` in any of the above |
| Antora playbook key for these | `https://docs.antora.org/antora/latest/playbook/asciidoc-extensions/` |
| Antora pipeline extensions (the *other* system) | `https://docs.antora.org/antora/latest/extend/extensions/` |
