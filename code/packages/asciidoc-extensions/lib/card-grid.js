'use strict'

const { chain, chainAll, precomputeSubtree } = require('./async-compat')

// Card grid — Fumadocs' `<Cards>`/`<Card>` (see the Weave.js migration's
// Phase 2 plan: 210 uses across 11 files, all section-landing pages,
// degraded during Phase 1 to a plain definition list).
//
// Renders IDS Card (card/card.css) inside IDS Grid Layout
// (grid-layout/grid-layout.css — already vendored, it backs the
// header/toolbar/toc; see ids-components.yml). Card ships almost no text
// styling of its own — it expects a consumer to style its content, normally
// via the DS's `.ids-text` utilities, which are off limits inside `.doc`
// prose (see ids-components.yml's own note on text.css: "chrome copy only,
// not doc prose"). card-grid.css supplies the minimum title/body typography
// directly instead, the same way the vendored Timeline/Progress-Step
// components style their own label/detail text in their own stylesheets.
//
// Syntax — reuses a plain AsciiDoc definition list, parsed exactly as
// normal (no custom nested syntax to maintain): each `term:: description`
// pair becomes one card. The term's own inline markup (typically an
// `xref:`) becomes the card's whole clickable surface via a stretched-link
// overlay (card-grid.css's `::after`), not a wrapping `<a>` — nesting an
// anchor around the card would make the xref's own `<a>` invalid HTML.
//
//   [cards]
//   ====
//   xref:sdk:api-reference/actions/action.adoc[WeaveAction]:: The abstract
//   class that defines the blueprint of an action.
//
//   xref:sdk:api-reference/actions/comment-tool.adoc[WeaveCommentToolAction]::
//   Enables users to comment on the stage.
//   ====
function buildCardHtml(title, body) {
  return (
    // Mobile-first, non-exclusive breakpoint classes (grid-layout.css):
    // `--span-s-6` applies from the `s` breakpoint (513px) UPWARD, forever,
    // unless a wider breakpoint's own class overrides it — `--span-m-4`
    // (1024px+) is that override, and covers `l` (1680px+) too since
    // nothing there redefines it again. Omitting `--span-m-4` was a real
    // bug caught in the preview: without it, 3 cards rendered as 2-per-row
    // (span-6) all the way from 513px to infinity, `--span-4` never once
    // taking effect despite being the base class.
    '<div class="ids-grid-layout__item ids-grid-layout__item--span-4 ids-grid-layout__item--span-s-6 ids-grid-layout__item--span-m-4 ids-grid-layout__item--span-xs-full">' +
    '<div class="ids-card ids-card--vertical pdocs-card">' +
    '<div class="ids-card__content">' +
    '<div class="pdocs-card__title">' +
    title +
    '</div>' +
    body +
    '</div>' +
    '</div>' +
    '</div>'
  )
}

function renderCard(term, description) {
  const title = term.map((t) => t.getText()).join(', ')
  if (!description) return buildCardHtml(title, '')

  const paragraph = description.hasText() ? '<p>' + description.getText() + '</p>' : ''
  if (!description.hasBlocks()) return buildCardHtml(title, paragraph)

  const blockHtmls = description.getBlocks().map((block) => block.convert())
  return chainAll(blockHtmls, (bodies) => buildCardHtml(title, paragraph + bodies.join('\n')))
}

function finish(parent, wrapper, attrs, self) {
  const dlist = wrapper.getBlocks().find((block) => block.getContext() === 'dlist')
  const cardHtmls = dlist ? dlist.getItems().map(([term, description]) => renderCard(term, description)) : []
  return chainAll(cardHtmls, (cards) => {
    const html = '<div class="ids-grid-layout ids-grid-layout--gap-m pdocs-card-grid">' + cards.join('') + '</div>'
    return self.createBlock(parent, 'pass', html, attrs)
  })
}

function cardsBlock() {
  this.named('cards')
  this.onContext('example')
  this.process((parent, reader, attrs) => {
    // See steps.js's own comment: Opal (2.2) can hand this a bare JS `null`
    // for a block with no attributes beyond its style, and `createBlock`
    // crashes on that.
    attrs = attrs || {}
    // See steps.js's own comment: a literal JS `null` "source" crashes Opal
    // (2.2) inside `Block#initialize`'s `.nil_or_empty?()` check.
    const wrapper = this.createBlock(parent, 'open', '', attrs)
    // See label-macro.js's own comment on this same pattern.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    // See async-compat.js's own header comment: parseContent is sync under
    // 2.2 (Opal, real Antora builds) and Promise-returning under 4.0 (the
    // ui-bundle preview harness) — chain() handles either without making
    // this function `async` unconditionally.
    return chain(this.parseContent(wrapper, reader.getLines()), () =>
      chain(precomputeSubtree(wrapper), () => finish(parent, wrapper, attrs, self))
    )
  })
}

module.exports = function registerCardGrid(registry) {
  registry.block(cardsBlock)
}
module.exports.cardsBlock = cardsBlock
