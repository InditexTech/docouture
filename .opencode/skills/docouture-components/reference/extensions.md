# Asciidoctor extensions in docouture

Use an extension when the content component has no AsciiDoc equivalent — tabs, cards,
steps, KPI. If Asciidoctor already emits usable HTML (admonitions, tables, code blocks,
images), map CSS onto that output instead. An extension you did not need is a
maintenance cost and a portability trap: the `.adoc` source stops being readable
anywhere else.

## Where they live

```
code/packages/asciidoc-extensions/
  package.json          name: @inditextech/docouture-asciidoc-extensions
  lib/
    index.js            registers every extension
    tabs.js
    card-grid.js
    …
```

One file per extension, each exporting `register`. `lib/index.js` composes them so a
playbook needs a single entry.

## Registering

**In a site playbook** — `code/packages/{starter,example}/antora-playbook.yml`, under the
existing `asciidoc:` key, as a sibling of `attributes:`:

```yaml
asciidoc:
  extensions:
    - '@inditextech/docouture-asciidoc-extensions'
  attributes:
    experimental: ''
    icons: font
```

**In the UI preview** — `code/packages/ui-bundle/preview-src/ui-model.yml`. The file
currently has no `asciidoc` key; add one at the top level:

```yaml
asciidoc:
  extensions:
    - '@inditextech/docouture-asciidoc-extensions'
```

`gulp.d/tasks/build-preview-pages.js:43` reads it, `require`s each request, calls
`register`, and sets a `<request>-loaded` AsciiDoc attribute (slashes and the `@`
stripped, `.js` removed). Iterate with `just preview` — it renders in about a second,
where a full site build does not.

## Writing one

A block macro, emitting component markup:

```js
// lib/card-grid.js
'use strict'

function cardGridBlock () {
  this.named('cards')
  this.onContext('open')
  this.process((parent, reader, attrs) => {
    // build the component's markup, then:
    return this.createBlock(parent, 'pass', html, attrs)
  })
}

function register (registry) {
  registry.block(cardGridBlock)
}

module.exports = { register, cardGridBlock }
module.exports.register = register
```

Both the named export and `module.exports.register` are needed: Antora calls
`require(request).register(...)`, and the preview task calls
`extension.register.call(Asciidoctor.Extensions)`.

Rules:

- Emit the existing component's BEM classes exactly (see `catalogue.md`). No new class names.
- The component's CSS already lives in `dt-components.css`; the extension ships **no CSS** of its own.
- Escape or convert user content properly — build children with `createBlock` /
  `parseContent` rather than concatenating strings, so nested AsciiDoc still works.
- Degrade without JavaScript. Tabs render as sequential sections, accordions as
  `<details>`. A docs page must be readable and printable with JS off.
- Set ARIA (`role="tablist"`, `aria-selected`, `aria-controls`, `aria-expanded`) —
  component stylesheets key their state off these attributes, not off classes.
- Never emit inline `style` attributes. Every value is a token.

## Behaviour

Interactive extensions need a controller in `src/js/`, following the existing numeric
convention (`01-…` … `07-…`, imported by `src/js/index.ts`). It attaches to
server-rendered markup and toggles ARIA attributes; it never generates markup.

## Testing

1. Add a fixture to `code/packages/ui-bundle/preview-src/index.adoc` — that page is the
   kitchen sink, and anything not in it is untested.
2. `just preview` → <http://localhost:5252>.
3. Check both themes, JS disabled, and print preview.
4. Then `just build-site starter && just serve` for the real Antora path, which is the
   only place playbook registration is actually exercised.

## Do not

- Do not add extensions to `ui-bundle`. It is a UI bundle; it has no Node runtime in
  the Antora pipeline.
- Do not use an Antora *pipeline* extension (`antora.extensions`) for content
  transformation. Those hook the build lifecycle; block macros and blocks are
  Asciidoctor extensions (`asciidoc.extensions`).
- Do not reach for an extension before checking whether an AsciiDoc role plus CSS does
  the job. `[.lead]`, `[cols=…]` and admonitions already cover a lot.
