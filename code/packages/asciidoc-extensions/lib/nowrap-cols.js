// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// `[cols="1,3,2",nowrap-cols="1,2"]` — an author-facing way to pin
// `white-space: nowrap` to specific columns (e.g. a mono-token column that
// should never break mid-value), without a new inline macro: `m|`/`mono:`
// already exist for "this cell is code" and neither carries a per-COLUMN
// concept, and the html5 converter hardcodes cell class to
// `tableblock halign-* valign-*` (see doc.css's own `td.tableblock`
// comment) — no room there either. A tree processor turning the attribute
// into roles is the only hook that reaches the table node itself before it
// converts to `<table class="tableblock …">`.
//
// `nowrap-cols="*"` (or any non-numeric token) is rejected per-token with a
// warning rather than silently doing nothing — a typo'd column index should
// fail loudly. Valid range is 1-12: doc.css only ever ships nth-child rules
// up to that ceiling (comfortably past any real `cols=` in this codebase),
// and a document needing more is almost certainly better served by
// `[cols=]`'s own per-column `.nowrap` role below instead (every column).
const MAX_COLS = 12
const NOWRAP_ALL_ATTR = 'nowrap' // `[cols=...,%nowrap]` shorthand — every column

function parseColumnIndexes(raw, doc, table) {
  const logger = doc.getLogger()
  const indexes = []
  raw
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .forEach((token) => {
      const n = Number(token)
      if (!Number.isInteger(n) || n < 1 || n > MAX_COLS) {
        logger.warn(
          'nowrap-cols="' +
            raw +
            '" on table "' +
            (table.getTitle() || '(untitled)') +
            '" — ignoring invalid column "' +
            token +
            '"; expected an integer between 1 and ' +
            MAX_COLS
        )
        return
      }
      indexes.push(n)
    })
  return indexes
}

module.exports = function registerNowrapCols(registry) {
  registry.treeProcessor(function () {
    this.process(function (doc) {
      doc.findBy({ context: 'table' }).forEach((table) => {
        if (table.hasAttribute(NOWRAP_ALL_ATTR)) table.addRole('nowrap')
        const raw = table.getAttribute('nowrap-cols')
        if (!raw) return
        parseColumnIndexes(String(raw), doc, table).forEach((n) => table.addRole('nowrap-' + n))
      })
      return doc
    })
  })
}
