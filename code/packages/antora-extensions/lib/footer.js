// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

const resolveUrl = require('./resolve-url')

/**
 * Reads the site footer's authored link groups out of the component
 * descriptor and attaches them, resolved, to the component version — where
 * the UI bundle's `site-footer` partial finds them as
 * `page.componentVersion.footer`.
 *
 * Why here and not in the playbook: `site.keys` is declared
 * `format: 'primitive-map'` in @antora/playbook-builder's schema, so it takes
 * flat primitives and nothing else — no list of groups, no list of links —
 * and convict rejects any playbook key that isn't in the schema at all. The
 * component descriptor is the one place a site can author a nested structure,
 * which is the same conclusion nav-modules.js reached; see its header for the
 * full list of dead ends, all of which apply here unchanged.
 *
 * Authored shape — lists all the way down, never a map keyed by an author's
 * own string:
 *
 *     footer:
 *       groups:
 *         - title: Resources          # optional — GH-77, an unlabelled group renders no heading
 *           links:
 *             - text: Home
 *               url: ROOT:index.adoc
 *             - text: Repository
 *               url: https://github.com/example/example
 *
 * @antora/content-aggregator runs the descriptor through `camelCaseKeys`,
 * which recurses into nested objects and rewrites their KEYS. Fixed key names
 * (`groups`, `links`, `text`, `url`) survive that intact; a map keyed by, say,
 * a group's title would not. `footer` itself is untouched, and `start_page`
 * inside nav_modules arrives as `startPage`, which is what this file and
 * nav-modules.js read.
 *
 * `url` is either a page ID — the same string you would write inside
 * `xref:...[]`, resolved against this component — or a literal URL. A page ID
 * that resolves to nothing is dropped with a warning, so the footer never
 * renders a dead link; that is the same rule repo-link.hbs and nav-brand.hbs
 * follow for their own optional targets.
 *
 * The UI decides what to DO with the groups (the first fills the links
 * column; the second is used for the modules column only when the component
 * has fewer than two switchable modules). Nothing about that policy lives
 * here: this extension resolves what was authored and stops.
 */
module.exports = function registerFooter(context) {
  const logger = context.getLogger('docouture-footer')
  // Keyed the same way @antora/navigation-builder keys its own accumulator,
  // and the same way nav-modules.js keys its copy of the descriptors.
  const descriptors = new Map()

  // The aggregate is the last point at which the descriptor's unknown keys
  // still exist — see nav-modules.js's own note on why this is a two-phase
  // extension rather than a one-liner.
  context.on('contentAggregated', ({ contentAggregate }) => {
    for (const bucket of contentAggregate) {
      if (!bucket.footer) continue
      descriptors.set(bucket.version + '@' + bucket.name, bucket.footer)
    }
  })

  // Deliberately the same event nav-modules.js uses: the content catalog is
  // complete (so page IDs resolve) and page-composer has not yet built any UI
  // model, so attaching to the componentVersion object is enough to reach
  // every page of it.
  context.on('navigationBuilt', ({ contentCatalog }) => {
    for (const component of contentCatalog.getComponents()) {
      for (const componentVersion of component.versions) {
        const footer = descriptors.get(componentVersion.version + '@' + componentVersion.name)
        if (!footer) continue
        const resolved = resolveFooter(footer, componentVersion, contentCatalog, logger)
        if (resolved) componentVersion.footer = resolved
      }
    }
  })
}

function resolveFooter(footer, componentVersion, contentCatalog, logger) {
  const where = `${componentVersion.name}@${componentVersion.version || 'default'}`

  if (footer.constructor !== Object || !Array.isArray(footer.groups)) {
    logger.warn('Ignoring footer in %s: expected a groups list', where)
    return undefined
  }

  // Page IDs are resolved as if from the component's ROOT module, so a bare
  // `index.adoc` means what an author would expect it to mean and a
  // module-qualified `sdk:index.adoc` works without naming the component.
  const context = { component: componentVersion.name, version: componentVersion.version, module: 'ROOT' }

  const groups = []
  for (const group of footer.groups) {
    if (!group || group.constructor !== Object || !Array.isArray(group.links)) {
      logger.warn('Ignoring footer group in %s: every group needs a links list', where)
      continue
    }
    const links = []
    for (const link of group.links) {
      if (!link || link.constructor !== Object || !link.text || !link.url) {
        logger.warn('Ignoring footer link in %s: every link needs a text and a url', where)
        continue
      }
      const url = resolveUrl(link.url, contentCatalog, context)
      if (!url) {
        logger.warn('Dropping footer link %s in %s: %s resolves to no page', link.text, where, link.url)
        continue
      }
      links.push({ text: link.text, url })
    }
    // An empty group would render as a blank column; drop it instead, the
    // same way the partial itself omits a column it has no data for.
    // `title` is optional (GH-77) — a group with links but no title still
    // renders, just without a heading, same "omit what's unauthored" rule
    // every other bit of this descriptor follows.
    if (links.length) groups.push({ title: group.title, links })
  }

  return groups.length ? { groups } : undefined
}
