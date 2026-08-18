'use strict'

// A page ID always names an AsciiDoc source file, so that extension is what
// tells the two forms apart — not the presence of a colon, which both use:
//
//   ROOT:index.adoc        page ID (module-qualified)
//   weavejs:sdk:index.adoc page ID (component-qualified)
//   https://example.com    URL
//   mailto:docs@example    URL
//   /weavejs/index.html    URL (root-relative)
//
// Matching on "looks like a URI scheme" instead is what a first cut of this
// did, and it is wrong: `ROOT:` is a perfectly good scheme as far as a
// case-insensitive pattern is concerned, so every module-qualified page ID
// written in the conventional uppercase ROOT sailed through unresolved and
// rendered as a literal href.
const PAGE_ID_RX = /\.adoc$/

/**
 * Resolve an authored link target to a URL.
 *
 * Page IDs are resolved against `context` — a component/version/module triple
 * — so a bare `index.adoc` or a module-qualified `sdk:index.adoc` both work
 * from a component descriptor, the same way they would from a page in that
 * component's ROOT module. A trailing `#fragment` is kept and re-attached to
 * the resolved URL; Antora's own resolvePage does not take one.
 *
 * Returns undefined for a page ID that resolves to nothing, so the caller can
 * drop the link rather than render one that goes nowhere. Anything that is
 * not a page ID is returned unchanged.
 *
 * @param {String} spec - a page ID or a literal URL
 * @param {Object} contentCatalog - Antora's content catalog
 * @param {Object} context - { component, version, module } to resolve against
 * @returns {String|undefined}
 */
module.exports = function resolveUrl(spec, contentCatalog, context) {
  if (typeof spec !== 'string' || !spec) return undefined
  const hashIdx = spec.indexOf('#')
  const target = hashIdx === -1 ? spec : spec.slice(0, hashIdx)
  const hash = hashIdx === -1 ? '' : spec.slice(hashIdx)
  if (!PAGE_ID_RX.test(target)) return spec
  const url = contentCatalog.resolvePage(target, context)?.pub?.url
  return url ? url + hash : undefined
}
