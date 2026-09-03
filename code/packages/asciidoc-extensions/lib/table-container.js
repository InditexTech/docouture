// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// GH-14 table-sizing follow-up: `display: block` on `table.tableblock` (the
// old doc.css mechanism) never actually sized the table — it sizes the
// BLOCK BOX, and a native table lays out its own anonymous table box inside
// that with `width: auto` (shrink-to-fit), completely ignoring the parent's
// width. There is no CSS-only fix: the anonymous box isn't selectable, so a
// real wrapper element is required. This postprocessor is that wrapper.
//
// A postprocessor, not a converter override: Antora hard-sets its own HTML5
// converter (@antora/asciidoc-loader/lib/load-asciidoc.js), so a custom
// converter would only ever run in the ui-bundle preview harness, not real
// site builds. A registry-scoped postprocessor runs identically in both
// (verified against @asciidoctor/core 4.0.8, embedded/standalone: false).
//
// Markup emitted, for every `<table class="tableblock …">…</table>`:
//
//   <div class="tableblock-wrap">
//     <div class="title">…</div>                 <!-- hoisted, if present -->
//     <div class="tablecontainer"><table class="tableblock …">…</table></div>
//   </div>
//
// Two wrapping divs, not one: `.tableblock-wrap` carries the width budget
// (and the title), `.tablecontainer` is the horizontal-scroll port — kept
// separate so the title does not scroll away with the table body.
//
// The `<caption class="title">` Asciidoctor emits for a `.Table title` is
// removed and its content re-emitted as a plain `.title` div OUTSIDE the
// table, at the wrapper's own (budget) width, rather than the table's own
// (possibly much narrower — `[width=]`/`%autowidth`) width: a caption is
// laid out as part of the table box it belongs to, so leaving it in place
// would have it wrap at the table's width instead of the wrapper's.
//
// Table/caption detection is a plain regex scan rather than parsing the
// converted HTML into a DOM: the postprocessor only ever sees Asciidoctor's
// own machine-generated output, whose `<table class="tableblock …">` /
// `</table>` shape is fixed, so a depth counter is sufficient and avoids an
// HTML-parser dependency for a single, narrow substitution.
const TABLE_OPEN_RX = /<table class="tableblock\b[^"]*"[^>]*>/g
const TABLE_TAG_RX = /<(\/?)table\b/g
const CAPTION_RX = /^\n?<caption class="title">([\s\S]*?)<\/caption>\n?/
// Idempotency guard: if this table is already the direct child of a
// `.tablecontainer` this same function placed it in, re-running (verified
// to happen in practice — `gulp preview`'s watch server re-registers this
// extension globally on every rebuild without restarting the node process,
// see index.js's own comment) must leave it alone rather than nesting a
// second `.tableblock-wrap` around the first, each one re-applying (and
// compounding) the same width cap.
const ALREADY_WRAPPED_MARKER = '<div class="tablecontainer">'
// `table-width.js`'s own stash key (doc.findBy-order array of per-table
// literal CSS widths, `null` where the author didn't set one) — read here
// by the SAME index, since both this scan and that tree processor's
// `doc.findBy({context:'table'})` walk the document in the same order
// (verified empirically).
const { STASH_KEY: WIDTHS_STASH_KEY } = require('./table-width')

// Depth-counts `<table` / `</table>` tags from just past `openTagEnd` to
// find THIS table's own matching close tag, tolerating any table nested
// inside a cell (a legitimate, if rare, authoring case). Returns the index
// just past the matching `</table>`'s own `>`, or a falsy value (-1 or 0)
// on malformed input.
function findTableCloseEnd(html, openTagEnd) {
  TABLE_TAG_RX.lastIndex = openTagEnd
  let depth = 1
  let tagMatch
  while ((tagMatch = TABLE_TAG_RX.exec(html))) {
    depth += tagMatch[1] ? -1 : 1
    if (depth === 0) return html.indexOf('>', TABLE_TAG_RX.lastIndex) + 1
  }
  return -1
}

// `table-width.js`'s literal CSS width (e.g. `2000px`) — set as an inline
// `style`, which wins over `.stretch`/`.fit-content` (external stylesheet
// rules) unconditionally, regardless of specificity, no `!important`
// needed. Spliced into the OPEN TAG specifically (not the whole `inner`,
// which also contains the table body) so a `style="…"` the author's own
// raw HTML passthrough might already carry is extended rather than
// clobbered. Returns the (possibly unchanged) `inner`/`bodyStart` pair —
// `bodyStart` moves when a `style` attribute is spliced in, since that
// makes the open tag longer than its pre-splice coordinates.
function applyTableWidth(inner, bodyStart, width) {
  if (!width) return { inner, bodyStart }
  const openTag = inner.slice(0, bodyStart)
  const styledOpenTag = /\sstyle="/.test(openTag)
    ? openTag.replace(/\sstyle="/, ' style="width:' + width + ';')
    : openTag.replace(/>$/, ' style="width:' + width + '">')
  return { inner: styledOpenTag + inner.slice(bodyStart), bodyStart: styledOpenTag.length }
}

// Removes the `<caption class="title">` Asciidoctor emits for a `.Table
// title`, if present, returning its content separately so the caller can
// re-emit it as a plain `.title` div OUTSIDE the table — see this file's
// own header for why.
function hoistCaptionTitle(inner, bodyStart) {
  const afterOpenTag = inner.slice(bodyStart)
  const captionMatch = afterOpenTag.match(CAPTION_RX)
  if (!captionMatch) return { inner, title: null }
  return {
    inner: inner.slice(0, bodyStart) + afterOpenTag.slice(captionMatch[0].length),
    title: captionMatch[1],
  }
}

function wrapTables(html, widths = []) {
  let result = ''
  let cursor = 0
  let match
  let tableIndex = -1
  while ((match = TABLE_OPEN_RX.exec(html))) {
    tableIndex += 1
    if (html.slice(0, match.index).endsWith(ALREADY_WRAPPED_MARKER)) continue

    const openTagEnd = match.index + match[0].length
    const closeEnd = findTableCloseEnd(html, openTagEnd)
    if (closeEnd === -1 || closeEnd === 0) break // malformed input; leave the rest untouched

    result += html.slice(cursor, match.index)
    let inner = html.slice(match.index, closeEnd)

    // `bodyStart` (where the caption search below begins) has to be
    // recomputed from the SPLICED open tag's own new length whenever
    // applyTableWidth actually spliced one in — that offset is otherwise
    // in the pre-splice string's coordinates, and injecting a `style="…"`
    // attribute makes the tag longer, so re-using it pointed a few
    // characters short of the real body and silently broke caption
    // hoisting (verified: the caption regex, anchored at the very start of
    // what it thinks is the body, stopped matching entirely once a table
    // also had a `table-width`).
    let bodyStart = openTagEnd - match.index
    ;({ inner, bodyStart } = applyTableWidth(inner, bodyStart, widths[tableIndex]))

    const hoisted = hoistCaptionTitle(inner, bodyStart)
    inner = hoisted.inner
    const title = hoisted.title

    result +=
      '<div class="tableblock-wrap">' +
      (title !== null ? '<div class="title">' + title + '</div>' : '') +
      '<div class="tablecontainer">' +
      inner +
      '</div></div>'

    cursor = closeEnd
    TABLE_OPEN_RX.lastIndex = cursor
  }
  result += html.slice(cursor)
  return result
}

module.exports = function registerTableContainer(registry) {
  registry.postprocessor(function () {
    this.process(function (doc, output) {
      return wrapTables(output, doc[WIDTHS_STASH_KEY])
    })
  })
}

module.exports.wrapTables = wrapTables
