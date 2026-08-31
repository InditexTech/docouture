// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// Document-scoped id generation, for blocks that have to wire one element to
// another through an id — ARIA relationships (`aria-controls`,
// `aria-labelledby`, `aria-describedby`), `<label for>`, and in-page anchors.
//
// Why this cannot be a plain module-level counter: extensions are registered
// ONCE per process in the ui-bundle preview harness (see index.js's own
// header comment on the global registration path), and that harness converts
// every preview page in the same process. A module-level counter would keep
// climbing across pages, so the same block would get different ids depending
// on which page happened to be converted first — output that changes with
// build order rather than with content. Antora's own per-page registry does
// not have that problem, but the harness does, and the same extension code
// runs under both.
//
// Counting per DOCUMENT instead makes the ids a function of the page's own
// content and nothing else: page A always produces the same ids whether it is
// converted first or last. The counter is stashed on the document object,
// which Asciidoctor discards along with the page.
//
// The ids are NOT globally unique across a site, and do not need to be — an
// id only has to be unique within the page it appears on.

/**
 * Property name for the per-document counter map. A `$`-prefixed, package-
 * scoped name, matching the convention index.js already uses for its own
 * registration guard, so it cannot collide with anything Asciidoctor or Antora
 * puts on the same object.
 */
const COUNTER_KEY = '$docoutureUniqueIdCounters'

/**
 * Anything with a document behind it: the `parent` handed to a block
 * processor, or a Document itself.
 *
 * @typedef {{ getDocument?: () => object }} DocumentLike
 */

/**
 * Resolves the object the counter is stashed on. A block processor receives
 * `parent`, which is a block, not the document — but two blocks on one page
 * must share a counter, so the document is what the count has to hang off.
 *
 * @param {DocumentLike} node - a block, or a document.
 * @returns {object} the document, or `node` itself if it has none (a detached
 *   node, only reachable in tests).
 */
function documentOf(node) {
  return (typeof node.getDocument === 'function' && node.getDocument()) || node
}

/**
 * Returns the next id for `prefix` on this node's document.
 *
 * ```js
 * const panelId = uniqueId(parent, 'feature-tabs-panel')   // feature-tabs-panel-1
 * const labelId = uniqueId(parent, 'feature-tabs-label')   // feature-tabs-label-1
 * ```
 *
 * Each prefix counts independently, so related elements can be paired by
 * generating both from the same iteration rather than by parsing an id apart.
 *
 * @param {DocumentLike} node - the block processor's `parent`, or a document.
 * @param {string} prefix - a stable, extension-specific prefix. Include the
 *   block's own name so two extensions on one page cannot collide.
 * @returns {string} `${prefix}-${n}`, with `n` starting at 1.
 */
function uniqueId(node, prefix) {
  const doc = /** @type {Record<string, Record<string, number>>} */ (documentOf(node))
  const counters = doc[COUNTER_KEY] || (doc[COUNTER_KEY] = {})
  const next = (counters[prefix] || 0) + 1
  counters[prefix] = next
  return prefix + '-' + next
}

module.exports = uniqueId
module.exports.COUNTER_KEY = COUNTER_KEY
