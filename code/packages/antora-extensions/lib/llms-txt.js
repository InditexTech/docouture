// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

const htmlToMarkdown = require('./html-to-markdown')
const resolveUrl = require('./resolve-url')

// Mirrors search-index.js's own constants and reasoning for both: a page
// opts out of `:page-layout: home` because the landing is marketing surface
// assembled from block extensions, not documentation prose, and everything
// else defaults to Antora/page-composer's own 'default' layout.
const DEFAULT_LAYOUT_NAME = 'default'
const HOME_LAYOUT_NAME = 'home'

/**
 * Generates `llms.txt` and `llms-full.txt` at Antora build time (GH-95) and
 * publishes both at the site root, alongside `sitemap.xml` — a Markdown
 * index and a full aggregated Markdown dump of the site, meant for LLM
 * ingestion (https://llmstxt.org) without scraping rendered HTML chrome.
 *
 * Site-wide, not per-component: unlike search-index.js, which publishes one
 * JSON file per component version, both files here are a SINGLE aggregate
 * across every component/version the aggregate has, because the issue asks
 * for files "alongside index.html and sitemap.xml" at the output root, and
 * llmstxt.org's own convention is one pair of files per site. A component's
 * pages are grouped under a heading named after their nav module (the title
 * nav-modules.js stamps onto `componentVersion.navigation`), falling back to
 * the component's own title for a site with no `nav_modules`; the component
 * title is prefixed too, but ONLY when the aggregate has more than one
 * component, so the common single-component site doesn't get a redundant
 * "Weave.js — Framework" when "Framework" alone is unambiguous.
 *
 * ORDERING DEPENDENCY, same one search-index.js documents at length: this
 * reads `tree.module` / `tree.title` off `componentVersion.navigation`,
 * stamped by nav-modules.js on the SAME `navigationBuilt` event, so index.js
 * must register nav-modules before this module or every section silently
 * falls back to the component title.
 *
 * Configuration is authored per component, under a new `llms` key in
 * `docs/antora.yml` — the same place `nav_modules` and `footer` live, and for
 * the same reason: `site.keys` in the playbook is a flat primitive map and
 * cannot hold a list. See nav-modules.js's own header for the full argument.
 *
 *     llms:
 *       summary: The visual collaborative apps framework, headless and store-agnostic.
 *       exclude:
 *         - main:some-internal-page.adoc
 *
 * `summary` becomes the blockquote under the site title in `llms.txt`; the
 * first component to declare one wins when several do (there is only one
 * site-wide summary line, not one per component). `exclude` is a list of
 * page IDs — the same strings `xref:...[]` accepts — resolved against the
 * component the way footer.js resolves its own link targets; a page ID that
 * resolves to nothing is dropped with a warning rather than silently
 * matching everything or nothing.
 */
module.exports = function registerLlmsTxt(context) {
  const logger = context.getLogger('docouture-llms-txt')
  // Keyed the same way nav-modules.js and footer.js key their own copies of
  // the descriptor — see nav-modules.js's header for why this has to be a
  // two-phase (contentAggregated, then navigationBuilt) extension at all.
  const descriptors = new Map()

  context.on('contentAggregated', ({ contentAggregate }) => {
    for (const bucket of contentAggregate) {
      if (!bucket.llms) continue
      descriptors.set(bucket.version + '@' + bucket.name, bucket.llms)
    }
  })

  context.on('navigationBuilt', ({ contentCatalog, siteCatalog, playbook }) => {
    const defaultLayout = playbook.ui?.defaultLayout || DEFAULT_LAYOUT_NAME
    const components = contentCatalog.getComponents()
    const multiComponent = components.length > 1

    const sectionsByHeading = new Map()
    const fullParts = []
    let summary

    const ctx = { descriptors, contentCatalog, defaultLayout, multiComponent, logger, sectionsByHeading, fullParts }
    for (const component of components) {
      for (const componentVersion of component.versions) {
        const componentSummary = collectComponentVersionLlms(componentVersion, ctx)
        if (componentSummary && !summary) summary = componentSummary
      }
    }

    const llmsTxt = buildLlmsTxt(playbook.site?.title, summary, sectionsByHeading)
    const llmsFullTxt = fullParts.join('\n\n---\n\n') + '\n'

    siteCatalog.addFile({
      contents: Buffer.from(llmsTxt),
      out: { path: 'llms.txt' },
      pub: { url: '/llms.txt' },
    })
    siteCatalog.addFile({
      contents: Buffer.from(llmsFullTxt),
      out: { path: 'llms-full.txt' },
      pub: { url: '/llms-full.txt' },
    })
  })
}

// Mirrors @antora/page-composer's own resolution (see search-index.js's own
// note on why this reads `file.asciidoc.attributes` rather than the UI
// model's `page.layout`, which does not exist yet at `navigationBuilt`).
function resolveLayout(page, defaultLayout) {
  return page.asciidoc?.attributes?.['page-layout'] || defaultLayout
}

// `tree.module` -> `tree.title` for every module nav-modules.js stamped
// annotations onto — see this file's own header on the ordering dependency
// that makes those stamps already present by `navigationBuilt`.
function collectModuleTitles(componentVersion) {
  const moduleTitleByModule = new Map()
  for (const tree of componentVersion.navigation || []) {
    if (tree.module) moduleTitleByModule.set(tree.module, tree.title || tree.module)
  }
  return moduleTitleByModule
}

function getEligiblePages(componentVersion, contentCatalog, defaultLayout, excluded) {
  return contentCatalog.getPages(
    (page) =>
      page.out &&
      page.src.component === componentVersion.name &&
      page.src.version === componentVersion.version &&
      resolveLayout(page, defaultLayout) !== HOME_LAYOUT_NAME &&
      !excluded.has(page.pub.url)
  )
}

// One page's worth of llms.txt output: the summary-list entry (grouped by
// heading) and the full Markdown dump entry — pushed straight onto the
// caller's shared accumulators, since both output files are built from the
// same single pass over every component/page.
function addPageEntry(page, heading, sectionsByHeading, fullParts) {
  const title = page.asciidoc?.doctitle
  if (!title) return // no AsciiDoc header at all — nothing to list or dump, same rule search-index.js applies

  if (!sectionsByHeading.has(heading)) sectionsByHeading.set(heading, [])
  sectionsByHeading.get(heading).push({
    title,
    url: page.pub.url,
    description: page.asciidoc?.attributes?.description || '',
  })

  fullParts.push(buildFullEntry(title, page))
}

// Everything one component version contributes: every eligible page's entry
// in both output files — grouped under a heading named after the page's own
// nav module (see this file's own header), qualified with the component
// title only when the aggregate has more than one component — and its own
// declared `llms.summary`, handed back for the caller to keep only if it's
// the first one seen (there is only one site-wide summary line, not one per
// component).
function collectComponentVersionLlms(componentVersion, ctx) {
  const { descriptors, contentCatalog, defaultLayout, multiComponent, logger, sectionsByHeading, fullParts } = ctx
  const where = `${componentVersion.name}@${componentVersion.version || 'default'}`
  const descriptor = descriptors.get(componentVersion.version + '@' + componentVersion.name) || {}

  const excluded = buildExcludedSet(descriptor.exclude, contentCatalog, componentVersion, logger, where)
  const moduleTitleByModule = collectModuleTitles(componentVersion)
  const pages = getEligiblePages(componentVersion, contentCatalog, defaultLayout, excluded)

  for (const page of pages) {
    const moduleTitle = moduleTitleByModule.get(page.src.module) || componentVersion.title
    const heading = multiComponent ? `${componentVersion.title} — ${moduleTitle}` : moduleTitle
    addPageEntry(page, heading, sectionsByHeading, fullParts)
  }

  return descriptor.summary
}

function buildExcludedSet(exclude, contentCatalog, componentVersion, logger, where) {
  const excluded = new Set()
  if (exclude === undefined) return excluded
  if (!Array.isArray(exclude)) {
    logger.warn('Ignoring llms.exclude in %s: expected a list of page IDs, got %s', where, typeof exclude)
    return excluded
  }

  // Page IDs are resolved as if from the component's ROOT module, the same
  // default context footer.js uses for its own link targets, so a bare
  // `index.adoc` means what an author would expect and a module-qualified
  // `sdk:index.adoc` works without naming the component.
  const resolveContext = { component: componentVersion.name, version: componentVersion.version, module: 'ROOT' }
  for (const spec of exclude) {
    const url = resolveUrl(spec, contentCatalog, resolveContext)
    if (url) {
      excluded.add(url)
    } else {
      logger.warn('llms.exclude entry %s in %s resolves to no page', spec, where)
    }
  }
  return excluded
}

function buildFullEntry(title, page) {
  const markdown = htmlToMarkdown(page.contents.toString())
  return `# ${title}\n\nSource: ${page.pub.url}\n\n${markdown}`
}

function buildLlmsTxt(siteTitle, summary, sectionsByHeading) {
  let out = `# ${siteTitle || 'Documentation'}\n`
  if (summary) out += `\n> ${summary}\n`

  for (const [heading, entries] of sectionsByHeading) {
    if (!entries.length) continue
    out += `\n## ${heading}\n\n`
    for (const entry of entries) {
      const description = entry.description ? `: ${entry.description}` : ''
      out += `- [${entry.title}](${entry.url})${description}\n`
    }
  }

  return out.trim() + '\n'
}
