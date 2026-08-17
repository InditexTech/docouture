'use strict'

// `[table-width=2000px,cols="1,1"]` — an explicit, literal CSS width for a
// table, bypassing Asciidoctor's own `width=` attribute entirely: that
// attribute is percentage-only and HARD-CLAMPED to 1-100 (verified against
// `@asciidoctor/core`'s own `table.js` — `width=2000px` parses to the
// numeric prefix 2000, sees it's `> 100`, and silently resets it to 100,
// i.e. exactly the unmarked default, `.stretch`). There is no core AsciiDoc
// syntax for an absolute width on a table; this is a separate, custom
// attribute for it.
//
// A tree processor is the only hook that can read the RAW attribute value
// before Asciidoctor's own Table constructor has already computed (and
// clamped) `tablepcwidth` from it — but the built-in html5 converter only
// ever emits `id`/`class`/the derived `width="N%"` for a `<table>` tag (see
// its own table-tag-building code), no generic passthrough for an arbitrary
// attribute to an inline `style`. So this doesn't touch Asciidoctor's own
// `width` attribute at all (an author can still combine `width=50%` — a
// PERCENTAGE OF THE inline style set here — with `table-width`, though
// that's an unusual thing to want) and instead hands the value to
// table-container.js's postprocessor, the other half of this mechanism,
// via a plain array stashed on the `doc` object itself: `doc.findBy` (here)
// and the postprocessor's own table-order HTML scan (table-container.js)
// walk the document in the same order (verified empirically), so entry `i`
// in the array is table `i`'s width, `null` where the attribute is absent.
//
// Verified in the CSS as already correct for a literal width with no
// further changes: `table.tableblock` carries no width rule of its own
// (only `.stretch`/`.fit-content`, both irrelevant once an inline `style`
// wins over them unconditionally), and `.tablecontainer`'s `overflow-x:
// auto` scrolls a table wider than `.tableblock-wrap`'s own 150%-capped
// budget rather than blowing out the page — exactly the "respect the
// explicit width, but the SURROUNDING box stays capped" behaviour the
// percentage form already has.
const ATTR_NAME = 'table-width'
const VALID_RX = /^\d+(?:\.\d+)?(?:px|rem|em|ch|vw|vh|%)?$/
const STASH_KEY = '$pdocsTableWidths'

function parseWidth(raw, doc, table) {
  const trimmed = String(raw).trim()
  if (!VALID_RX.test(trimmed)) {
    doc
      .getLogger()
      .warn(
        ATTR_NAME +
          '="' +
          raw +
          '" on table "' +
          (table.getTitle() || '(untitled)') +
          '" — ignoring invalid length; expected a plain number (px assumed) or a number with one of px/rem/em/ch/vw/vh/%'
      )
    return null
  }
  return /\d$/.test(trimmed) ? trimmed + 'px' : trimmed
}

module.exports = function registerTableWidth(registry) {
  registry.treeProcessor(function () {
    this.process(function (doc) {
      const widths = (doc[STASH_KEY] = [])
      doc.findBy({ context: 'table' }).forEach((table) => {
        const raw = table.getAttribute(ATTR_NAME)
        widths.push(raw ? parseWidth(raw, doc, table) : null)
      })
      return doc
    })
  })
}

module.exports.STASH_KEY = STASH_KEY
