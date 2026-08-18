'use strict'

// `modules/<module>/nav.adoc` — the shape of every entry in a component
// descriptor's own `nav` list. Anything else (a nav file outside modules/,
// which Antora does allow) simply has no module to attach metadata to.
const MODULE_NAV_PATH_RX = /^modules\/([^/]+)\//

/**
 * Attaches per-module metadata to Antora's navigation trees, so the UI can
 * show ONE module's navigation at a time with a switcher between them.
 *
 * Background: @antora/navigation-builder already produces one root tree per
 * unordered list per nav file, in the order the descriptor's `nav` key lists
 * them (build-navigation.js: `tree.order = navFile.nav.index`). A component
 * with seven nav files therefore already has seven root trees in
 * `page.navigation` — Antora's own equivalent of a Fumadocs `root: true`
 * folder. What it has no notion of is which MODULE a tree belongs to, or what
 * that module should be called in a switcher.
 *
 * There is no built-in place to put that, which is why this extension exists.
 * Every alternative was checked and is a dead end:
 *
 *   - custom keys in antora.yml are dropped: ContentCatalog#registerComponentVersion
 *     destructures only asciidoc/displayVersion/prerelease/startPage/title
 *   - playbook `site.keys` is declared `format: 'primitive-map'`, so flat
 *     primitives only — no nested map, no list
 *   - a nav file's own AsciiDoc attributes are unreachable: buildNavigation
 *     hardcodes `extensions: []` and keeps only the ulists
 *   - a list TITLE on the nav file would give a title and nothing else, and
 *     it would also push a module entry into every page's `page.breadcrumbs`
 *     (page-composer's attachNavProperties collects ancestors that have
 *     `content`), which is a visible change to every page in the site
 *
 * So the metadata is authored in antora.yml under `nav_modules` and read HERE,
 * from the raw aggregate, before classification throws the unknown key away.
 *
 * Authored shape — a LIST, not a map keyed by module:
 *
 *     nav_modules:
 *       - module: main
 *         title: Framework
 *         description: The visual collaborative apps framework
 *         icon: design/menu-tab-outlined
 *
 * The list is load-bearing. @antora/content-aggregator runs the whole
 * descriptor through `camelCaseKeys`, which recurses into nested objects and
 * rewrites their KEYS (only `asciidoc` is exempted). A map keyed by module
 * would silently rename every kebab-case module — `store-azure-web-pubsub`
 * would arrive here as `storeAzureWebPubsub` and match nothing. Values are
 * left alone, so carrying the slug as a value rather than a key is what makes
 * it survive. `nav_modules` itself still camelCases to `navModules`, which is
 * why that is what this file reads.
 *
 * Result: each tree in `page.navigation` gains `module`, `title`, and
 * optionally `description` and `icon`. Sites that don't declare `nav_modules`
 * are untouched, and the UI falls back to rendering every tree — which is the
 * behaviour every single-nav-file site already had.
 */
module.exports = function registerNavModules(context) {
  const logger = context.getLogger('pdocs-nav-modules')
  // Keyed the same way @antora/navigation-builder keys its own accumulator.
  const descriptors = new Map()

  // The aggregate is the LAST point at which the descriptor's unknown keys
  // still exist: generate-site.js calls `vars.remove('contentAggregate')` in
  // the very next step, and classifyContent would have dropped `navModules`
  // anyway. Copy out what's needed now; annotate later.
  context.on('contentAggregated', ({ contentAggregate }) => {
    for (const bucket of contentAggregate) {
      if (!bucket.navModules) continue
      descriptors.set(bucket.version + '@' + bucket.name, {
        nav: bucket.nav || [],
        navModules: bucket.navModules,
      })
    }
  })

  // navigationBuilt fires after buildNavigation has assigned the trees to
  // `componentVersion.navigation` and before pagesComposed, which is when
  // page-composer hands that same array to the UI model as `page.navigation`.
  // These are the same objects throughout, so annotating in place is enough —
  // nothing needs to be threaded through the page composer.
  context.on('navigationBuilt', ({ contentCatalog }) => {
    for (const component of contentCatalog.getComponents()) {
      for (const componentVersion of component.versions) {
        const descriptor = descriptors.get(componentVersion.version + '@' + componentVersion.name)
        if (descriptor) annotate(componentVersion, descriptor, logger)
      }
    }
  })
}

function stampItems(items, module_) {
  for (const item of items || []) {
    item.module = module_
    stampItems(item.items, module_)
  }
}

// Depth first, because a module's first entry is often an unlinked category
// heading (Fumadocs' `"---Overview---"` separators survived the migration as
// nav entries with `content` and neither `url` nor children) and the first
// real page hangs off a later sibling.
function findFirstInternalUrl(items) {
  for (const item of items || []) {
    if (item.urlType === 'internal' && item.url) return item.url
    const nested = findFirstInternalUrl(item.items)
    if (nested) return nested
  }
}

function annotate(componentVersion, { nav, navModules }, logger) {
  const where = `${componentVersion.name}@${componentVersion.version || 'default'}`

  if (!Array.isArray(navModules)) {
    logger.warn('Ignoring nav_modules in %s: expected a list of entries, got %s', where, typeof navModules)
    return
  }

  const declared = new Map()
  for (const entry of navModules) {
    if (!entry || entry.constructor !== Object || !entry.module) {
      logger.warn('Ignoring nav_modules entry in %s: every entry needs a module key', where)
      continue
    }
    if (declared.has(entry.module)) {
      logger.warn('Ignoring duplicate nav_modules entry for module %s in %s', entry.module, where)
      continue
    }
    declared.set(entry.module, entry)
  }

  const matched = new Set()
  for (const tree of componentVersion.navigation || []) {
    // `tree.order` is the index of the nav file in the descriptor's own `nav`
    // list — an integer, except when one nav file holds more than one list, in
    // which case the extra lists get a fraction on top of that same index
    // (build-navigation.js). Flooring therefore gets back to the file either
    // way, and every list in a file belongs to that file's module.
    const navPath = nav[Math.floor(tree.order)]
    const module_ = navPath && MODULE_NAV_PATH_RX.exec(navPath)?.[1]
    if (!module_) continue

    tree.module = module_
    // Stamped all the way down, not just on the root. `page.previous` and
    // `page.next` are these very item objects (page-composer's findNavItem
    // returns matches out of this same tree), so carrying the module on each
    // one is what lets the footer pagination tell "the next page" from "the
    // next page IN THIS MODULE" without re-deriving anything from URLs.
    stampItems(tree.items, module_)

    const meta = declared.get(module_)
    if (!meta) {
      // Not fatal: the tree still renders, and the UI keys segmentation off
      // `tree.module`, which is set. Only the switcher entry is missing.
      logger.warn('No nav_modules entry for module %s in %s', module_, where)
      continue
    }
    matched.add(module_)

    // Fall back to the slug rather than leaving the switcher entry blank.
    tree.title = meta.title || module_
    if (meta.description) tree.description = meta.description
    if (meta.icon) tree.icon = meta.icon

    // Where the switcher should send someone who picks this module. Computed
    // here rather than in the template because finding it means a depth-first
    // walk, which Handlebars has no way to express. Named `startUrl`, not
    // `url`, on purpose: a nav node WITH a `url` is a link as far as
    // nav-tree.hbs is concerned, and a root menu is not one.
    const startUrl = findFirstInternalUrl(tree.items)
    if (startUrl) {
      tree.startUrl = startUrl
    } else {
      logger.warn('Module %s in %s has no internal page to link to from the navigation switcher', module_, where)
    }
  }

  for (const module_ of declared.keys()) {
    if (matched.has(module_)) continue
    // Almost always a typo in the slug, or a module whose nav file is missing
    // from the descriptor's `nav` list — both of which silently produce a
    // module the switcher can never reach.
    logger.warn('nav_modules entry for module %s in %s matches no navigation file', module_, where)
  }
}
