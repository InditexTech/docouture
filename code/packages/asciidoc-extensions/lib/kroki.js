// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

const { escapeHtml, attr } = require('./html')
const warn = require('./warn')
const kroki = require('./kroki-instance')
const uniqueId = require('./unique-id')
const namespaceSvgIds = require('./svg-namespace')
const {
  SUPPORTED_TYPES,
  FORMAT_SUPPORT,
  ENABLED_ATTR,
  TYPES_ATTR,
  resolveEnabledTypes,
  resolveFormat,
  resolveDiagramOptions,
  isTextFormat,
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
// see kroki-config.js's `FORMAT_SUPPORT` for the exact, live-server-verified
// set of formats each `SUPPORTED_TYPES` entry accepts (Kroki's own
// `/{type}/{format}` rejects the rest with a plain 400); anything else
// falls back to `svg` with a warning, the same degrade-not-fail posture as
// an unsupported `kroki-diagram-types` entry.
//
// GH-195: THE CLASSIC `[type,target,format]` POSITIONAL FORM
//
// `krokiBlock`'s own `this.positionalAttributes(['target', 'format'])` is
// real Asciidoctor machinery (`AttributeList.rekey`, verified empirically
// against `@asciidoctor/core@2.2.9` — the exact engine Antora site builds
// run) — so `[plantuml,architecture,png,role="no-border, zoom-in"]` (the
// real asciidoctor-kroki/asciidoctor-diagram convention: type, target,
// format) resolves `attrs.format = 'png'` exactly as `[plantuml,
// format=png]` already did. `target` is accepted but otherwise unused —
// this extension always inlines (see DEGRADATION below), never writes a
// named file to disk.
//
// GH-195: DIAGRAM-SPECIFIC OPTIONS
//
// Any named attribute that isn't one of `kroki-config.js`'s
// `BUILTIN_ATTRIBUTES` (`target`, `width`, `height`, `format`, `role`,
// `title`, `caption`, …) is a Kroki diagram-specific option — e.g.
// `[structurizr,view-key=SystemContext]` — forwarded to Kroki as a
// `Kroki-Diagram-Options-view-key` HTTP header, exactly as the real
// asciidoctor-kroki extension forwards them (see its own `kroki-client.js`).
// See `resolveDiagramOptions`.
//
// GH-195: OUTPUT FORMATS BEYOND `svg`/`png`
//
// `jpeg`/`jpg`/`pdf`/`base64` render the same way `png` already did — an
// embedded `<img>` (or, for `pdf`, an `<embed>`, since a PDF isn't
// something an `<img>` can display) built from Kroki's own response.
// `txt`/`atxt`/`utxt` are different in kind, not just encoding: Kroki
// renders these as literal ASCII-art-style TEXT, not an image at all — see
// `isTextFormat` — so the block renders as a literal block (Asciidoctor's
// own plain-text convention this package already reuses for the disabled/
// unavailable case below) containing that rendered text, not an `<img>`.
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
// GH-196: two SVG-format diagrams on the same page can collide on ids —
// Mermaid's root `<svg>` is always `id="container"`, GraphViz starts a
// fresh `node1`/`edge1`/`graph0` sequence every render — so an inline SVG
// payload has every id (and every reference to it) rewritten to a
// page-unique prefix before it's embedded; see `svg-namespace.js`'s own
// header for why this runs here, at render time, rather than once at
// prewarm/cache time.
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
 * reader would notice; also reused (with `extraClass`) for a successful
 * text-family format render (`txt`/`atxt`/`utxt` — see `isTextFormat`),
 * since Kroki's own rendering for those IS a literal block of text, not an
 * image. `id`, when given, is applied here too — a `[plantuml#diagAliceBob]`
 * shorthand ID is exactly as real Asciidoctor's own literal-block converter
 * would have honored it, and `xref:page.adoc#diagAliceBob[]` needs it to
 * exist regardless of whether Kroki itself is reachable. */
function literalMarkup(text, extraClass, id) {
  const classAttr = extraClass ? ' ' + extraClass : ''
  return (
    '<div class="literalblock' +
    classAttr +
    '"' +
    attr('id', id) +
    '><div class="content"><pre>' +
    escapeHtml(text) +
    '</pre></div></div>'
  )
}

function literalFallback(source, id) {
  return literalMarkup(source, undefined, id)
}

// GH-195: MIME type for each non-`svg`/`base64` image format this package
// can now request — `svg` is embedded as raw markup, not an `<img>` (see
// `imageMarkup` below); `base64`'s own Kroki response is already a complete
// `data:image/png;base64,...` string (verified against a live server — see
// kroki-prewarm.js's own `fetchDiagram` header), needing no MIME lookup of
// its own.
const IMAGE_MIME_TYPES = { png: 'image/png', jpeg: 'image/jpeg', pdf: 'application/pdf' }

/**
 * Builds the embedded markup for one successfully-rendered, non-text-format
 * diagram payload — an `<img>` for every raster format, an `<embed>` for
 * `pdf` (a browser cannot display a PDF through `<img>`), or the SVG
 * markup verbatim, unwrapped, for `svg` (already id-namespaced by the time
 * this runs — see `renderDiagram`) — preserved exactly as before GH-195,
 * since a real inline `<svg>` DOM node (as opposed to every other format's
 * opaque `data:` URI) is what lets `kroki-mermaid-theme.js`'s baked-in
 * colors actually apply to it at all.
 *
 * @param {{ format: string, data: string }} payload
 * @returns {string}
 */
function imageMarkup(payload) {
  if (payload.format === 'svg') return payload.data
  if (payload.format === 'base64') return '<img src="' + payload.data + '" alt="">'
  const mime = IMAGE_MIME_TYPES[payload.format]
  const dataUri = 'data:' + mime + ';base64,' + payload.data
  if (payload.format === 'pdf') return '<embed type="' + mime + '" src="' + dataUri + '">'
  return '<img src="' + dataUri + '" alt="">'
}

function renderDiagram(parent, type, source, attrs) {
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
  if (!enabledTypes.has(type)) return literalFallback(source, attrs.id)

  const format = resolveFormat(type, attrs.format, (t, requested) =>
    warn(
      parent,
      '[' + t + ',format=' + requested + ']',
      'unsupported format "' + requested + '" for a ' + t + ' diagram — falling back to svg',
      FORMAT_SUPPORT[t] || ['svg']
    )
  )
  const options = resolveDiagramOptions(attrs)
  // Mermaid gets its own default theme baked in server-side (see that
  // file's own header for why this happens here rather than via ui-bundle
  // CSS) — applied to the LOOKUP key only; `literalFallback` below still
  // shows the author's own original source, untouched, on a cache miss.
  const effectiveSource = type === 'mermaid' ? applyDefaultMermaidTheme(source) : source

  const payload = kroki.get(kroki.keyFor(type, effectiveSource, format, options))
  if (!payload) {
    warn(
      parent,
      '[' + type + ']',
      'no prewarmed Kroki render for this diagram (service unreachable at build time, or the source changed after prewarm ran); showing raw source instead'
    )
    return literalFallback(source, attrs.id)
  }
  // GH-196: namespace this SVG's own ids to THIS occurrence, on THIS page,
  // before embedding — see svg-namespace.js's own header for why this has
  // to happen here (render time, per-block-occurrence) rather than once
  // when the payload was cached.
  const effectivePayload =
    payload.format === 'svg'
      ? { format: payload.format, data: namespaceSvgIds(payload.data, uniqueId(parent, 'docouture-diagram')) }
      : payload
  const body = isTextFormat(effectivePayload.format)
    ? literalMarkup(effectivePayload.data)
    : imageMarkup(effectivePayload)
  // GH-197: `role` is forwarded onto the OUTER div's class list — same as
  // Asciidoctor's own built-in image converter already does for a plain
  // `image::` block (`classes.push(node.role())`, verified against
  // `@asciidoctor/core`'s bundled HTML5 converter) — so `[mermaid,role=
  // zoom-in]` gets the same click-to-zoom affordance (ui-bundle's
  // image-zoom.css/14-image-zoom.ts) an `image::foo.png[role=zoom-in]`
  // already did. `attrs.role` is a BLOCK attribute, so it goes through
  // `attr()`'s escaping like `attrs.id` on the same line — this file's own
  // header states that rule.
  //
  // GH-199: Asciidoctor's own convention for multiple roles is space-
  // separated (`role="a b"`), which is why core's `classes.push(node.role())`
  // gets away with no split of its own — but authors reach for a comma
  // (`role="no-border, zoom-in"`) often enough that leaving it unsplit
  // silently corrupts the `class` attribute (`no-border,` stays one dirty
  // token, its own rule dead, `zoom-in` only works by being last and
  // comma-free). Splitting on comma-OR-whitespace and rejoining with a
  // single space accepts both without needing to pick one as "the" syntax.
  //
  // The OUTER div (`docouture-diagram`, sized/positioned, bleeds up to
  // 125% of the text measure — see diagram.css's own header) is now
  // deliberately separate from an INNER `docouture-diagram__content` div
  // (the actual padded/bordered/backgrounded card) — mirrors ui-bundle's
  // `.imageblock`/`.content` split (doc.css) exactly, for the same reason:
  // an outer box with a literal, possibly-bled `width` needs an unstretched
  // flex-item child to shrink-wrap the frame back down to the diagram's own
  // real size, or a small diagram would render with a large, mostly-empty
  // grey/bordered box around it.
  const roleClasses = attrs.role ? attrs.role.split(/[\s,]+/).filter(Boolean).join(' ') : ''
  const classAttr = roleClasses ? 'docouture-diagram ' + roleClasses : 'docouture-diagram'
  return (
    '<div' +
    attr('class', classAttr) +
    attr('id', attrs.id) +
    ' data-diagram-type="' +
    type +
    '"><div class="docouture-diagram__content">' +
    body +
    '</div></div>'
  )
}

function krokiBlock(type) {
  return function () {
    this.named(type)
    this.onContext('literal')
    // GH-195: the classic `[type,target,format]` positional shorthand —
    // see this file's own header. `target` is accepted into `attrs` but
    // otherwise unused.
    this.positionalAttributes(['target', 'format'])
    this.process((parent, reader, attrs) => {
      // See card-grid.js's own comment: Opal (2.2) can hand this a bare JS
      // `null` for a block with no attributes beyond its style.
      attrs = attrs || {}
      const source = reader.getLines().join('\n')
      const html = renderDiagram(parent, type, source, attrs)
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
