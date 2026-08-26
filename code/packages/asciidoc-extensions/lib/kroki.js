'use strict'

const { escapeHtml } = require('./html')
const warn = require('./warn')
const kroki = require('./kroki-instance')
const {
  SUPPORTED_TYPES,
  PNG_SUPPORTED_TYPES,
  ENABLED_ATTR,
  TYPES_ATTR,
  resolveEnabledTypes,
  resolveFormat,
} = require('./kroki-config')
const { applyDefaultMermaidTheme } = require('./kroki-mermaid-theme')

// GH-44: renders diagram source — Mermaid, PlantUML, GraphViz, … (see
// kroki-config.js's `SUPPORTED_TYPES`) — as an actual diagram, via a
// self-hosted Kroki (https://kroki.io) service, instead of showing the raw
// source as literal text.
//
// SYNTAX
//
//   [mermaid]
//   ....
//   stateDiagram-v2
//   [*] --> Started
//   ....
//
// A LITERAL block (four dots, not four hyphens — a `[mermaid]` block on
// four HYPHENS is a listing block, a different context, and is not
// intercepted here), styled with one of `SUPPORTED_TYPES`. This is exactly
// the shape `tools/fumadocs-migrate/lib/emit.mjs` already emits for every
// migrated `<Mermaid chart={...}>` — this extension is what turns that
// previously-inert shape into a real diagram, nothing upstream of it
// changes.
//
// `[mermaid,format=png]` renders a transparent PNG instead of inline SVG —
// see kroki-config.js's `PNG_SUPPORTED_TYPES` for which of `SUPPORTED_TYPES`
// actually support it (Kroki's own `/{type}/png` rejects the rest with a
// plain 400); anything else falls back to `svg` with a warning, the same
// degrade-not-fail posture as an unsupported `kroki-diagram-types` entry.
//
// OPT IN, PER SITE, DISABLED BY DEFAULT
//
// Every other extension in this package is unconditionally active once the
// package is listed (see README.md's "the whole set"). This one is not: a
// site sets two `asciidoc.attributes` in its playbook —
//
//   asciidoc:
//     attributes:
//       kroki-enabled: true
//       kroki-diagram-types: mermaid,plantuml   # optional; omitted = every SUPPORTED_TYPES entry
//
// — because rendering a diagram means depending on a Kroki service actually
// running at the fixed local URL kroki-config.js hardcodes (see that file's
// own header for why the URL itself is NOT one of these attributes), and a
// site that hasn't set that up should get today's plain, always-worked
// literal-text rendering, not a build that silently produces broken
// diagrams. `kroki-diagram-types` lets a site narrow which of
// `SUPPORTED_TYPES` it actually wants — most sites need only `mermaid`, and
// each additional type may need its own companion container (see the
// sibling @inditextech/docouture-antora-extensions package's
// resources/kroki-compose.yml, which kroki-prewarm.js starts automatically —
// no manual setup required).
//
// WHY THIS BLOCK PROCESSOR NEVER MAKES THE HTTP CALL ITSELF
//
// Rendering via Kroki means an HTTP round trip — inherently asynchronous —
// but `@asciidoctor/core ~2.2`'s Opal conversion loop, which is what
// actually calls this file's `process()` during a real site build, is fully
// synchronous (see async-compat.js's own header: a process function cannot
// simply be `async`, that renders the literal text "[object Promise]").
// Unlike card-grid.js's or accordion.js's own async work — `parseContent`,
// which 4.0 makes Promise-returning but 2.2 keeps synchronous — a network
// call has no synchronous form under EITHER major. So none happens here.
// All of it happens up front, for the whole build, in
// `@inditextech/docouture-antora-extensions`' `kroki-prewarm.js` — an Antora
// PIPELINE extension (`antora.extensions`, not this package's
// `asciidoc.extensions`) that scans the raw content aggregate for these
// blocks and fetches every one from Kroki BEFORE Asciidoctor conversion
// starts. This file only ever reads the result back out of the shared cache
// (`kroki-instance.js`) — the same seam shiki-syntax-highlighter.js uses for
// Shiki, and for the identical reason; see that file's own header.
//
// DEGRADATION
//
// Not enabled, type not requested, or a cache miss (prewarm never ran, or
// its fetch for this exact diagram failed) all degrade to the same output:
// the plain `<div class="literalblock">` markup Asciidoctor's own built-in
// literal-block converter would have produced — i.e. exactly what every one
// of these blocks already rendered as before this extension existed. A
// missing/unreachable Kroki service is therefore never a build failure;
// only a genuine authoring mistake (an unknown entry in
// `kroki-diagram-types`) is, via `warn()`, per this package's own
// "Reporting authoring mistakes" convention.

/** What Asciidoctor's own literal-block HTML5 converter emits — reproduced
 * exactly so a disabled/unavailable Kroki changes nothing an author or a
 * reader would notice. */
function literalFallback(source) {
  return '<div class="literalblock"><div class="content"><pre>' + escapeHtml(source) + '</pre></div></div>'
}

function renderDiagram(parent, type, source, requestedFormat) {
  const document = parent.getDocument()
  const enabledAttr = document.getAttribute(ENABLED_ATTR)
  const typesAttr = document.getAttribute(TYPES_ATTR)
  const enabledTypes = resolveEnabledTypes(enabledAttr, typesAttr, (unknown) =>
    warn(
      parent,
      '[' + TYPES_ATTR + '=' + typesAttr + ']',
      'unknown Kroki diagram type "' + unknown + '"',
      SUPPORTED_TYPES
    )
  )
  if (!enabledTypes.has(type)) return literalFallback(source)

  const format = resolveFormat(type, requestedFormat, (t, requested) =>
    warn(
      parent,
      '[' + t + ',format=' + requested + ']',
      'unsupported format "' + requested + '" for a ' + t + ' diagram — falling back to svg',
      PNG_SUPPORTED_TYPES.has(t) ? ['svg', 'png'] : ['svg']
    )
  )
  // Mermaid gets its own default theme baked in server-side (see that
  // file's own header for why this happens here rather than via ui-bundle
  // CSS) — applied to the LOOKUP key only; `literalFallback` below still
  // shows the author's own original source, untouched, on a cache miss.
  const effectiveSource = type === 'mermaid' ? applyDefaultMermaidTheme(source) : source

  const payload = kroki.get(kroki.keyFor(type, effectiveSource, format))
  if (!payload) {
    warn(
      parent,
      '[' + type + ']',
      'no prewarmed Kroki render for this diagram (service unreachable at build time, or the source changed after prewarm ran); showing raw source instead'
    )
    return literalFallback(source)
  }
  const body = payload.format === 'png' ? '<img src="data:image/png;base64,' + payload.data + '" alt="">' : payload.data
  return '<div class="docouture-diagram" data-diagram-type="' + type + '">' + body + '</div>'
}

function krokiBlock(type) {
  return function () {
    this.named(type)
    this.onContext('literal')
    this.process((parent, reader, attrs) => {
      // See card-grid.js's own comment: Opal (2.2) can hand this a bare JS
      // `null` for a block with no attributes beyond its style.
      attrs = attrs || {}
      const source = reader.getLines().join('\n')
      const html = renderDiagram(parent, type, source, attrs.format)
      return this.createBlock(parent, 'pass', html, attrs)
    })
  }
}

module.exports = function registerKroki(registry) {
  for (const type of SUPPORTED_TYPES) {
    registry.block(krokiBlock(type))
  }
}
module.exports.krokiBlock = krokiBlock
