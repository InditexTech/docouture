'use strict'

const createPageComposer = require('@antora/page-composer')

/**
 * Gives the generated 404 page a real side menu, version tag and site
 * footer — instead of the bare shell it gets by default.
 *
 * Why: @antora/page-composer's own `create404Page` (site-generator's
 * generate-site.js, only invoked when `site.url` is set) builds a page whose
 * `src` has no `component` at all:
 *
 *     src: { stem: '404' }
 *
 * `buildPageUiModel` special-cases exactly that shape — `src.stem === '404'
 * && !('component' in src)` — and returns immediately with
 * `{ 404: true, attributes, layout: '404', title }`, before it would ever
 * compute `page.navigation`, `page.componentVersion` or `page.versions`. On
 * top of that, `create404Page` calls `composePage(file)` with only ONE
 * argument, so `navigationCatalog` is `undefined` regardless of `src` —
 * `attachNavProperties` is gated on `if (navigationCatalog)` and would never
 * run even for a page with a real component. There is no playbook or
 * descriptor knob that changes any of this: it is what the library's own
 * 404 page composer does, full stop.
 *
 * So this extension composes its OWN 404 page instead, using a `src` that
 * names a real, existing component/version/module, and swaps it in for
 * Antora's own once that one has already been added to the site catalog.
 * Every template partial that reads `page.component`, `page.componentVersion`
 * or `page.navigation` — the side menu, the header's version tag and search
 * trigger, the footer's per-module links — then renders exactly as it would
 * on a real page in that module, because as far as the UI model is
 * concerned, it IS one; only `page-layout: 404` (set on the synthetic file's
 * `asciidoc.attributes`, the same attribute `:page-layout: 404` would set on
 * a real page) tells `main.hbs` to swap in `article-404.hbs` instead of the
 * hero/toc/article trio.
 *
 * Component and module selection, deliberately conservative:
 *
 *   - Only ever runs for a site with EXACTLY ONE component. A multi-component
 *     site (this repo has none) would need its own choice of which
 *     component's chrome a component-less 404 page should borrow, which is a
 *     bigger decision than this extension makes for you — the plain,
 *     unnavigated 404 page ships instead, same as if this extension were
 *     absent, and a warning says why.
 *   - That component's LATEST version — a 404 page isn't itself versioned,
 *     so "the current one" is the only sensible choice.
 *   - The module whose navigation the side menu shows: if the component has
 *     exactly one navigation tree (the common case — see nav-modules.js's
 *     own comment on what a single-nav-file component's `page.navigation`
 *     looks like), that's it, no configuration needed. With more than one —
 *     `example`'s seven modules are exactly this — `not_found_module` in
 *     the component descriptor (`docs/antora.yml`) names which one:
 *
 *         not_found_module: main
 *
 *     Left unset on a multi-module component, the 404 page still gets its
 *     real version tag, search trigger and footer (all keyed off the
 *     component/version alone) — only the side menu's tree stays empty,
 *     which is what nav-menu.hbs already does for a `page.module` that
 *     matches no tree — same "no fallback to first tree, an empty menu is a
 *     missing attribute" rule nav-modules.js's own header argues for the
 *     switcher.
 */
module.exports = function registerNotFoundPage(context) {
  const logger = context.getLogger('pdocs-not-found-page')
  // Keyed the same way nav-modules.js and footer.js key their own copies.
  const notFoundModules = new Map()
  let navigationCatalog

  // Same two-phase shape as nav-modules.js/footer.js: `not_found_module`
  // only survives on the raw aggregate, so it has to be copied out here,
  // before `vars.remove('contentAggregate')` (generate-site.js) drops it.
  context.on('contentAggregated', ({ contentAggregate }) => {
    for (const bucket of contentAggregate) {
      if (!bucket.notFoundModule) continue
      notFoundModules.set(bucket.version + '@' + bucket.name, bucket.notFoundModule)
    }
  })

  // `navigationBuilt` is the last event carrying `navigationCatalog` — see
  // this file's own header on why it's needed and why create404Page never
  // gets it. Captured here, read at `pagesComposed`, once nav-modules.js's
  // own `navigationBuilt` listener (registered before this one, see index.js)
  // has already stamped `tree.module` on every tree.
  context.on('navigationBuilt', ({ navigationCatalog: catalog }) => {
    navigationCatalog = catalog
  })

  context.on('pagesComposed', ({ playbook, contentCatalog, uiCatalog, siteCatalog, siteAsciiDocConfig }) => {
    // Antora only composes a 404 page at all when site.url is set
    // (generate-site.js) — nothing to enhance otherwise.
    if (!playbook.site.url) return
    if (!navigationCatalog) return // defensive; always set by this point when site.url is present

    const components = contentCatalog.getComponents()
    if (components.length !== 1) {
      logger.warn(
        'Not enhancing the generated 404 page: expected exactly one component, found %s. ' +
          'It keeps the plain, unnavigated layout Antora composes by default.',
        components.length
      )
      return
    }

    const component = components[0]
    const componentVersion = component.latest
    const navigation = navigationCatalog.getNavigation(component.name, componentVersion.version) || []

    let module_
    if (navigation.length === 1) {
      // The common case: one nav file, so nothing to pick between — see
      // nav-modules.js's own comment on why `page.navigation` looks like
      // this for a single-nav-file component. `tree.module` is usually
      // unset here too (no nav_modules declared), which nav-menu.hbs treats
      // the same way: `(not ./module)` renders it unconditionally.
      module_ = navigation[0].module
    } else if (navigation.length > 1) {
      const where = `${component.name}@${componentVersion.version || 'default'}`
      const configured = notFoundModules.get(componentVersion.version + '@' + component.name)
      if (!configured) {
        logger.warn(
          '%s has %s navigation modules and no not_found_module configured in its antora.yml: ' +
            "the 404 page's side menu will render empty. Set not_found_module to the module whose " +
            'navigation it should show.',
          where,
          navigation.length
        )
      } else if (!navigation.some((tree) => tree.module === configured)) {
        logger.warn(
          "not_found_module '%s' in %s matches no navigation file; the 404 page's side menu will render empty.",
          configured,
          where
        )
      } else {
        module_ = configured
      }
    }

    const file = {
      mediaType: 'text/html',
      out: { path: '404.html' },
      pub: { url: '/404.html' },
      src: {
        component: component.name,
        version: componentVersion.version,
        module: module_,
        family: 'page',
        relative: 'index.adoc',
      },
      title: siteAsciiDocConfig?.attributes['404-page-title'] || 'Page Not Found',
      // Cloned, not shared: mutating the site-wide asciidoc config in place
      // would leak `page-layout: 404` onto every other page composePage
      // touches from here on.
      asciidoc: Object.assign({}, siteAsciiDocConfig, {
        attributes: Object.assign({}, siteAsciiDocConfig?.attributes, { 'page-layout': '404' }),
      }),
    }

    // A fresh composer, not the pipeline's own (createPageComposer's result
    // isn't threaded through to extensions) — built from the same
    // `uiCatalog`, so it compiles the identical layouts/partials/helpers the
    // rest of the site just rendered with.
    createPageComposer(playbook, contentCatalog, uiCatalog).composePage(file, contentCatalog, navigationCatalog)

    const previous = siteCatalog.getFiles().find((candidate) => candidate.out?.path === '404.html')
    if (previous) siteCatalog.removeFile(previous)
    siteCatalog.addFile(file)
  })
}
