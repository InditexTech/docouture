// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

const { parse, NodeType } = require('node-html-parser')

// h1-h4 are destinations worth their own record. h5/h6 are a label inside a
// section rather than a destination — see this file's header — so they are
// deliberately absent here and fall through to the generic recursion branch,
// which folds their text into whatever chunk is currently open.
const SECTION_HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4'])

// Elements whose entire subtree is dropped before any text is collected —
// see the module doc comment for why each one is here.
const STRIPPED_TAGS = new Set(['pre', 'svg'])
const STRIPPED_CLASSES = new Set(['toc', 'icon'])

const ENVELOPE_VERSION = 1
// Multilingual search is out of scope for this epic (see #64); every record
// is authored English prose today, so this is a constant, not a lookup.
const LANGUAGE = 'english'

// @antora/page-composer's own default when neither a page nor the playbook
// names one — see build-ui-model.js's buildPageUiModel and constants.js.
const DEFAULT_LAYOUT_NAME = 'default'
// The layout a landing page opts into with `:page-layout: home`
// (ui-bundle/src/layouts/home.hbs). It is a shell of card grids, feature
// tables and a CTA — marketing surface assembled from block extensions, not
// documentation prose — so it is excluded rather than indexed as if it were
// a regular doc page.
const HOME_LAYOUT_NAME = 'home'

/**
 * Builds the site's full-text search index at Antora build time and
 * publishes it as one static JSON asset per component version — no UI reads
 * it yet (that starts at #66/#67, S2/S3 of the search epic, #64).
 *
 * Why the HTML and not the AsciiDoc source, why `navigationBuilt`
 * specifically, the record shape, the section-splitting rule and the
 * empty-page fallback are all argued at length in #65 — repeating that
 * reasoning inline would drift out of sync with the issue, so only the
 * mechanics are documented here.
 *
 * ORDERING DEPENDENCY: this module reads `tree.module` / `tree.title` off
 * `componentVersion.navigation`, which `nav-modules.js` stamps on the SAME
 * `navigationBuilt` event. `GeneratorContext#notify` awaits listeners in
 * registration order (see nav-modules.js's own header for the citation), so
 * this only produces correct categories because `index.js` registers
 * nav-modules BEFORE this module. Reorder those calls and every category
 * silently falls back to the component title — no error, just wrong
 * grouping.
 */
module.exports = function registerSearchIndex(context) {
  const logger = context.getLogger('docouture-search-index')

  context.on('navigationBuilt', ({ contentCatalog, siteCatalog, playbook }) => {
    const outputDir = playbook.ui?.outputDir ?? '_'
    const defaultLayout = playbook.ui?.defaultLayout || DEFAULT_LAYOUT_NAME

    // Site-wide feedback (GH-103-adjacent): a component version producing
    // no search records used to fail silently — the index file for it
    // simply never got written, with nothing in the log to explain why.
    // These totals, plus the per-component-version summary below, make what
    // actually got indexed (or didn't) visible on every build without
    // reading the produced JSON files.
    let totalPages = 0
    let totalRecords = 0
    let totalFiles = 0

    for (const component of contentCatalog.getComponents()) {
      for (const componentVersion of component.versions) {
        const where = `${componentVersion.name}@${componentVersion.version || 'default'}`
        const pages = contentCatalog.getPages(
          (page) =>
            page.out &&
            page.src.component === componentVersion.name &&
            page.src.version === componentVersion.version &&
            resolveLayout(page, defaultLayout) !== HOME_LAYOUT_NAME
        )
        const records = buildComponentVersionRecords(componentVersion, contentCatalog, defaultLayout, logger)

        if (!records.length) {
          logger.warn('%s produced no search records; no search index written', where)
          continue
        }

        const basename = componentVersion.version
          ? `${componentVersion.name}-${componentVersion.version}.json`
          : `${componentVersion.name}.json`
        const outPath = `${outputDir}/search/${basename}`

        const envelope = {
          version: ENVELOPE_VERSION,
          language: LANGUAGE,
          component: componentVersion.name,
          componentVersion: componentVersion.version || '',
          records,
        }

        siteCatalog.addFile({
          contents: Buffer.from(JSON.stringify(envelope)),
          out: { path: outPath },
          pub: { url: '/' + outPath },
        })

        // Basename only — see footer.js's own note on componentVersion.footer
        // for why the UI resolves this against uiRootPath rather than being
        // handed an absolute URL.
        componentVersion.searchIndex = basename

        logger.info('%s: %s pages, %s search records -> %s', where, pages.length, records.length, outPath)

        totalPages += pages.length
        totalRecords += records.length
        totalFiles += 1
      }
    }

    logger.info(
      'search index totals: %s pages, %s records, %s index file(s) written',
      totalPages,
      totalRecords,
      totalFiles
    )
  })
}

function buildComponentVersionRecords(componentVersion, contentCatalog, defaultLayout, logger) {
  // Module -> category title. Empty when the component declares no
  // nav_modules at all, which is what makes a single-module site fall back
  // to one category (its own title) for every page.
  const categoryByModule = new Map()
  for (const tree of componentVersion.navigation || []) {
    if (tree.module) categoryByModule.set(tree.module, tree.title || tree.module)
  }

  const pages = contentCatalog.getPages(
    (page) =>
      page.out &&
      page.src.component === componentVersion.name &&
      page.src.version === componentVersion.version &&
      resolveLayout(page, defaultLayout) !== HOME_LAYOUT_NAME
  )

  const records = []
  for (const page of pages) {
    const category = categoryByModule.get(page.src.module) || componentVersion.title
    records.push(...buildPageRecords(page, componentVersion.title, category, logger))
  }
  return records
}

function buildPageRecords(page, componentTitle, category, logger) {
  const title = page.asciidoc?.doctitle
  if (!title) {
    // No AsciiDoc header at all (rare, but a page-partial fragment or the
    // synthetic 404 page are both real cases) — nothing to title a record
    // with, so there is nothing useful to index.
    return []
  }

  const url = page.pub.url
  const baseHierarchy = dedupeAdjacent([componentTitle, category])

  // Pass 1: flatten the article into chunks in document order — one for the
  // prose before the first heading (level 0, no heading text), then one per
  // h1-h4 that carries an id. Deliberately not a walk of Asciidoctor's own
  // `.sect1 > h2 + .sectionbody` nesting; see #65 for why that shape is the
  // wrong one to reproduce.
  const root = parse(page.contents.toString())
  const chunks = [{ level: 0, headingText: undefined, id: undefined, textParts: [] }]
  walk(root, chunks)

  // Pass 2: turn chunks into records, tracking an explicit stack of open
  // ancestor headings by level (headings are siblings in the flattened HTML,
  // not DOM ancestors of the sections they open, so this can't be read off
  // the tree itself).
  const stack = []
  const records = []
  for (const chunk of chunks) {
    const content = collapseWhitespace(chunk.textParts.join(''))
    if (chunk.level === 0) {
      if (content) {
        records.push({ title, hierarchy: baseHierarchy, content, url, category })
      }
      continue
    }

    // Ancestors are whatever is still open at a shallower level than this
    // heading; this heading's own text is not one of its own ancestors.
    const ancestors = stack.slice(0, chunk.level - 1).filter(Boolean)
    records.push({
      title,
      section: chunk.headingText,
      hierarchy: [...baseHierarchy, ...ancestors],
      content,
      url: `${url}#${chunk.id}`,
      category,
    })

    stack[chunk.level - 1] = chunk.headingText
    stack.length = chunk.level
  }

  if (records.some((record) => record.content)) return records

  // The empty-page case (#65): a page whose entire body was `pre` blocks
  // produces only content-less chunks above (no prose at all, whether or
  // not a heading happened to wrap the code) and would otherwise be
  // unfindable by its own title. One fallback record carries what
  // survives: title, hierarchy, and the page's own :description: attribute
  // where it has one.
  logger.info('Page %s produced no search content; emitting a fallback record', url)
  return [
    {
      title,
      hierarchy: baseHierarchy,
      content: page.asciidoc?.attributes?.description || '',
      url,
      category,
    },
  ]
}

// Depth-first, document-order walk. Pushes a new chunk onto `chunks`
// whenever a heading with an id is found; every other text node is appended
// to whichever chunk is currently last.
function walk(node, chunks) {
  for (const child of node.childNodes) {
    if (child.nodeType === NodeType.TEXT_NODE) {
      chunks[chunks.length - 1].textParts.push(child.text)
      continue
    }
    if (child.nodeType !== NodeType.ELEMENT_NODE) continue

    const tag = child.rawTagName?.toLowerCase()
    if (STRIPPED_TAGS.has(tag)) continue
    if ((child.classList?.value || []).some((cls) => STRIPPED_CLASSES.has(cls))) continue

    const id = child.getAttribute('id')
    if (SECTION_HEADING_TAGS.has(tag) && id) {
      chunks.push({
        level: Number(tag[1]),
        headingText: collapseWhitespace(child.text),
        id,
        textParts: [],
      })
      continue
    }

    // A wrapper containing a heading — this project's own block extensions
    // (cards, steps, feature tabs, accordion) among them — has to be opened
    // up, or its prose gets filed under whichever chunk was current when the
    // wrapper opened. Recursing here is what "opens it up". Inline `<code>`
    // falls through this same branch and its text lands in the current
    // chunk, which is why it needs no special case to be kept.
    walk(child, chunks)
  }
}

function collapseWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim()
}

// Mirrors @antora/page-composer's own resolution (build-ui-model.js:86):
// a page's `:page-layout:` attribute, else the playbook's ui.default_layout,
// else Antora's own 'default'. Read directly off `file.asciidoc.attributes`
// rather than `page.attributes`/`page.layout` because neither of those UI
// model fields exists yet at `navigationBuilt` — page-composer builds them
// at the next step, `pagesComposed`.
function resolveLayout(page, defaultLayout) {
  return page.asciidoc?.attributes?.['page-layout'] || defaultLayout
}

function dedupeAdjacent(parts) {
  const out = []
  for (const part of parts) {
    if (part && part !== out.at(-1)) out.push(part)
  }
  return out
}
