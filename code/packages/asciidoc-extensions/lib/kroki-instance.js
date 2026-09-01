// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

const { createHash } = require('node:crypto')

// Shared cache of prewarmed Kroki renders for an entire Antora build — one
// entry per distinct (diagram type, source, output format) triple, keyed by
// a hash of all three.
//
// Same split as shiki-instance.js, for the same reason: rendering a diagram
// means an HTTP round trip to the Kroki service (see kroki-config.js's own
// header for why that's a fixed loopback URL), which is asynchronous, but
// `@asciidoctor/core ~2.2`'s Opal conversion loop that actually calls this
// package's block processor (kroki.js) is fully synchronous and cannot
// itself await anything. So all the fetching happens up front, for every
// `[mermaid]`/`[plantuml]`/etc. block the raw content aggregate contains,
// in `@inditextech/docouture-antora-extensions`' `kroki-prewarm.js` — an Antora
// PIPELINE extension hooking `contentAggregated`, well before
// `documentsConverted` ever reaches Asciidoctor. This file is the seam
// between that async producer and kroki.js's synchronous consumer, exactly
// as shiki-instance.js is for Shiki — see that file's own header for why a
// plain module-level variable (a Map, here, since there are many diagrams
// rather than one highlighter) is enough: one build per process, both
// packages `require()` the same file, node's module cache doing the rest.
const cache = new Map()

/**
 * The cache key for one diagram: its block style (`mermaid`, `plantuml`, …),
 * its exact source, its output format, and any diagram-specific options
 * (`view-key=`, `theme=`, … — see kroki-config.js's `resolveDiagramOptions`),
 * hashed together. Format has to be part of the key alongside type and
 * source — `[mermaid]` and `[mermaid,format=png]` over the same source are
 * two different Kroki fetches (`/mermaid/svg` vs `/mermaid/png`) and two
 * different cached payloads (see `set`'s own doc), not one — and so do the
 * options: `[structurizr,view-key=SystemContext]` and
 * `[structurizr,view-key=Containers]` over the same source are two
 * different Kroki requests (different `Kroki-Diagram-Options-view-key`
 * headers — see kroki-prewarm.js's own `fetchDiagram`) with two different
 * results. The source is trimmed first so a trailing blank line an author
 * left in (or Asciidoctor's own line handling adds) doesn't produce a
 * cache miss for what is, semantically, the same diagram.
 *
 * Both halves of this feature call this with identical inputs: kroki.js
 * with the block's own style, its reader's joined source (after
 * kroki-mermaid-theme.js's own transform, for `mermaid`), its resolved
 * format, and its resolved diagram options; kroki-prewarm.js with the same
 * four, its own raw-file regex extracted. They have to derive the same key
 * from the same diagram, or a prewarmed entry is unreachable from the
 * synchronous side.
 *
 * @param {string} type - a `SUPPORTED_TYPES` entry (kroki-config.js).
 * @param {string} source - the raw diagram source, untrimmed is fine.
 * @param {string} [format] - `resolveFormat`'s return value; defaults to
 *   `'svg'` so every call site written before `format` existed still keys
 *   the same way it always did.
 * @param {Record<string, string>} [options] - `resolveDiagramOptions`'s
 *   return value; defaults to an empty object so every call site written
 *   before options existed still keys the same way it always did. Order
 *   doesn't matter — keys are sorted before hashing, since kroki.js's real
 *   Asciidoctor `attrs` object and kroki-prewarm.js's own raw-attrlist
 *   parser have no reason to enumerate the same diagram's attributes in
 *   the same order.
 * @returns {string} a hex digest, opaque beyond being a stable cache key.
 */
function keyFor(type, source, format, options) {
  const opts = options || {}
  const sortedOptions = Object.keys(opts)
    .sort()
    .map((key) => key + '=' + opts[key])
    .join('\u0001')
  return createHash('sha256')
    .update(type + '\u0000' + String(source).trim() + '\u0000' + (format || 'svg') + '\u0000' + sortedOptions)
    .digest('hex')
}

module.exports = {
  keyFor,
  /**
   * Called once per distinct diagram by kroki-prewarm.js, after its fetch to
   * Kroki resolves.
   *
   * @param {string} key - see `keyFor` below; the same function, called with
   *   the same inputs, is how kroki.js looks this back up.
   * @param {{ format: string, data: string }} payload - `format` is
   *   `resolveFormat`'s return value for this diagram (`kroki-config.js`'s
   *   `FORMAT_SUPPORT`, e.g. `'svg'`/`'png'`/`'jpeg'`/`'pdf'`/`'txt'`); `data`
   *   is Kroki's own response body — the `<svg>...</svg>` markup verbatim
   *   for `svg`, a plain-text rendering for a text-family format (`txt`/
   *   `atxt`/`utxt` — see `kroki-config.js`'s `isTextFormat`), Kroki's own
   *   ready-to-use `data:image/png;base64,...` URI verbatim for `base64`, or
   *   a base64-encoded binary payload for every other (raster) format
   *   (kroki.js embeds it as a `data:` URI — see that file's own header for
   *   why a data URI rather than a written-to-disk image file).
   * @returns {void}
   */
  set(key, payload) {
    cache.set(key, payload)
  },

  /**
   * @param {string} key
   * @returns {{ format: string, data: string } | undefined} the
   *   cached payload, or `undefined` when this diagram was never prewarmed
   *   — the ui-bundle preview harness (no Antora pipeline at all, so
   *   kroki-prewarm.js never runs), a build where `kroki-enabled` was off at
   *   prewarm time, or a Kroki fetch that failed. kroki.js degrades to the
   *   plain literal-block fallback in every one of these cases.
   */
  get(key) {
    return cache.get(key)
  },
}
