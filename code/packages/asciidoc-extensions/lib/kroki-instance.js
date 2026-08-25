'use strict'

const { createHash } = require('node:crypto')

// Shared cache of prewarmed Kroki SVGs for an entire Antora build — one
// entry per distinct (diagram type, source) pair, keyed by a hash of both.
//
// Same split as shiki-instance.js, for the same reason: rendering a diagram
// means an HTTP round trip to the Kroki service (see kroki-config.js's own
// header for why that's a fixed loopback URL), which is asynchronous, but
// `@asciidoctor/core ~2.2`'s Opal conversion loop that actually calls this
// package's block processor (kroki.js) is fully synchronous and cannot
// itself await anything. So all the fetching happens up front, for every
// `[mermaid]`/`[plantuml]`/etc. block the raw content aggregate contains,
// in `@inditextech/pdocs-antora-extensions`' `kroki-prewarm.js` — an Antora
// PIPELINE extension hooking `contentAggregated`, well before
// `documentsConverted` ever reaches Asciidoctor. This file is the seam
// between that async producer and kroki.js's synchronous consumer, exactly
// as shiki-instance.js is for Shiki — see that file's own header for why a
// plain module-level variable (a Map, here, since there are many diagrams
// rather than one highlighter) is enough: one build per process, both
// packages `require()` the same file, node's module cache doing the rest.
const cache = new Map()

/**
 * The cache key for one diagram: its block style (`mermaid`, `plantuml`, …)
 * plus its exact source, hashed together. The type has to be part of the
 * key — the same source string means something different to `mermaid` and
 * to `plantuml` — and the source is trimmed first so a trailing blank line
 * an author left in (or Asciidoctor's own line handling adds) doesn't
 * produce a cache miss for what is, semantically, the same diagram.
 *
 * Both halves of this feature call this with identical inputs: kroki.js
 * with the block's own style and its reader's joined source, kroki-
 * prewarm.js with the type and source its own raw-file regex extracted.
 * They have to derive the same key from the same diagram, or a prewarmed
 * entry is unreachable from the synchronous side.
 *
 * @param {string} type - a `SUPPORTED_TYPES` entry (kroki-config.js).
 * @param {string} source - the raw diagram source, untrimmed is fine.
 * @returns {string} a hex digest, opaque beyond being a stable cache key.
 */
function keyFor(type, source) {
  return createHash('sha256')
    .update(type + '\u0000' + String(source).trim())
    .digest('hex')
}

module.exports = {
  keyFor,
  /**
   * Called once per distinct diagram by kroki-prewarm.js, after its fetch to
   * Kroki resolves.
   *
   * @param {string} key - see `keyFor` below; the same function, called with
   *   the same two inputs, is how kroki.js looks this back up.
   * @param {string} svg - the rendered `<svg>...</svg>` markup Kroki returned.
   * @returns {void}
   */
  set(key, svg) {
    cache.set(key, svg)
  },

  /**
   * @param {string} key
   * @returns {string | undefined} the cached SVG, or `undefined` when this
   *   diagram was never prewarmed — the ui-bundle preview harness (no Antora
   *   pipeline at all, so kroki-prewarm.js never runs), a build where
   *   `kroki-enabled` was off at prewarm time, or a Kroki fetch that failed.
   *   kroki.js degrades to the plain literal-block fallback in every one of
   *   these cases.
   */
  get(key) {
    return cache.get(key)
  },
}
