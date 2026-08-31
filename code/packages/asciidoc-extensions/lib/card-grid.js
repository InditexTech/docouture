'use strict'

const { chain, chainAll, precomputeSubtree } = require('./async-compat')
const { escapeHtml } = require('./html')
const warn = require('./warn')

// Card grid — the ATD Card (Figma component set 2669:33855, states and types
// at 2610:29000 for light and 2669:42541 for dark), rendered as IDS Card
// (card/card.css) in a CSS grid. It is the block behind the landing's
// Quicklinks row (GH-20) AND the section-landing card grids the Weave.js
// migration brought over (Fumadocs' `<Cards>`/`<Card>`, 210 uses across 11
// files) — one component, one look, doc pages and landings alike.
//
// The design's card is a slot of three optional groups over an optional
// image:
//
//   Header info   a 20x20 icon and a `label/m` subheader
//   Main info     the title (`title/s`) and description (`body/l`)
//   Meta          `.dt-label--grey` chips
//
// The frames' date field is deliberately not modelled, and neither is
// `Selected`: a documentation card has nothing to select. Nor is there a
// call to action — the ATD Card catalogue has no button in any of its four
// types, and the whole card is already the link, so a "Know more" would be a
// second affordance for the one thing clicking anywhere on the card does.
// (An earlier Quicklinks frame, 2696:54698, drew a ghost button; the
// catalogue supersedes it.)
//
// Every colour in both theme frames resolves to a semantic IDS token that
// dt-tokens.css already swaps under `.dt-theme-dark`, so dark theme costs
// this extension and card-grid.css nothing — see that file's own header.
//
// SYNTAX
//
// A `[cards]` example block holding one `[card]` per card. A card is either
// a paragraph — title plus description, which is what the migrated corpus
// needs — or an open block, when it also carries an image:
//
//   [cards,type=image-portrait,columns="1 s:2 m:3",width=container]
//   ====
//   [card,icon="file",subheader="Getting started",labels="java, spring"]
//   .xref:quickstart.adoc[Quickstart]
//   --
//   image::quickstart.svg[Woven cloth, folded]
//
//   Create your first application with AMIGA Framework Java.
//   --
//
//   [card]
//   .xref:sdk:index.adoc[SDK]
//   The headless library the canvas is built on.
//   ====
//
// The block title carries the link, exactly as the dlist term did in this
// block's first form: Asciidoctor runs inline substitutions over a title, so
// an `xref:` arrives here already converted to an `<a>`, and Antora's own
// page resolution is used rather than reimplemented. The image is a real
// `image::` macro for the same reason — the resource ID resolves through
// Antora, and alt text is native AsciiDoc rather than a second attribute.
//
// Why the open block is required for the image form: `[card]` on an
// `image::` line is consumed as the BLOCK MACRO's own style and never
// reaches `getStyle()` (measured: the block reports `style: null` and its
// first positional attribute is the image's alt text), so an image can never
// itself be the card marker. An open block keeps the style, keeps the title,
// and delimits the card explicitly instead of relying on a "blocks until the
// next marker" heuristic.

const TYPES = ['no-image', 'image-landscape', 'image-square', 'image-portrait']
const DEFAULT_TYPE = 'no-image'

const WIDTHS = ['content', 'container']
const DEFAULT_WIDTH = 'content'

// `xs` is the base, unprefixed, so it has no name here — a bare `3` sets the
// base count. The rest are the PROJECT's breakpoints (dt-breakpoints.css:
// s 513, m 1240, l 1680), not the design system package's own, and the
// classes they map to are mobile-first and non-exclusive, like the DS grid's
// `--span-*` utilities.
const BREAKPOINTS = ['s', 'm', 'l']
const DEFAULT_COLUMNS = '1 s:2 m:3'
const MAX_COLUMNS = 4

const COLUMN_RX = /^(?:([a-z]+):)?([0-9]+)$/
// A bare Lucide icon name (lucide.dev/icons/<name>), lowercase and
// hyphen-separated — the shape `icons.yml` uses. Whether that icon is
// actually MASKED is checked by ui-bundle's own `just icons-build`
// (scripts/build-sprite.mjs), which owns the manifest; duplicating the list
// here would be a second source of truth that drifts. An icon that passes
// the shape check but has no mask falls back to a visible marker in
// card-grid.css rather than rendering nothing.
const ICON_RX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// The first `href` of the converted title, which is the card's own link.
const HREF_RX = /<a\b[^>]*\bhref="([^"]*)"/i
// Lifted whole from the converted image block rather than rebuilt from the
// target: the host converter is what resolves an image URL (Antora's
// `imagesdir` per page, its own resource resolution), and `getImageUri` does
// not apply `imagesdir` unless handed the asset key explicitly. Taking the
// converter's own `<img>` also keeps the alt, width and height it derived.
const IMG_RX = /<img\b[^>]*>/i

/** `image-portrait` -> `portrait`; `no-image` has no modifier of its own. */
const typeModifier = (type) => (type === 'no-image' ? '' : ' docouture-card--' + type.slice('image-'.length))

/**
 * Parse the `columns` spec into grid classes.
 *
 * `"1 s:2 m:3"` -> base 1, from `s` 2, from `m` 3. Anything malformed, out of
 * range, or naming a breakpoint that does not exist is an authoring error and
 * fails the build.
 */
function parseColumns(spec, parent) {
  const classes = []
  for (const token of String(spec).trim().split(/\s+/)) {
    if (!token) continue
    const match = COLUMN_RX.exec(token)
    if (!match) {
      warn(parent, '[cards,columns="' + spec + '"]', 'cannot read the column "' + token + '"; expected `3` or `m:3`')
      continue
    }
    const [, breakpoint, count] = match
    if (breakpoint && !BREAKPOINTS.includes(breakpoint)) {
      warn(parent, '[cards,columns="' + spec + '"]', 'unknown breakpoint "' + breakpoint + '"', BREAKPOINTS)
      continue
    }
    const columns = Number(count)
    if (columns < 1 || columns > MAX_COLUMNS) {
      warn(
        parent,
        '[cards,columns="' + spec + '"]',
        columns + ' columns is outside the supported range 1-' + MAX_COLUMNS
      )
      continue
    }
    classes.push('docouture-card-grid--cols-' + (breakpoint ? breakpoint + '-' : '') + columns)
  }
  return classes
}

/** The image blocks and the body blocks of one card, whichever form it took. */
function cardParts(block) {
  if (block.getContext() !== 'open') return { images: [], bodies: [block] }
  const images = []
  const bodies = []
  for (const child of block.getBlocks()) {
    if (child.getContext() === 'image') images.push(child)
    else bodies.push(child)
  }
  return { images, bodies }
}

function renderHeader(icon, subheader, parent) {
  if (!icon && !subheader) return ''
  let iconHtml = ''
  if (icon) {
    if (ICON_RX.test(icon)) {
      iconHtml = '<span class="docouture-card__icon dt-icon-mask--' + escapeHtml(icon) + '" aria-hidden="true"></span>'
    } else {
      warn(
        parent,
        '[card,icon="' + icon + '"]',
        'not an icon reference; expected a bare Lucide icon name, e.g. `store`'
      )
    }
  }
  const subheaderHtml = subheader ? '<span class="docouture-card__subheader">' + escapeHtml(subheader) + '</span>' : ''
  return '<div class="docouture-card__header">' + iconHtml + subheaderHtml + '</div>'
}

function renderMeta(labels) {
  const chips = String(labels || '')
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean)
  if (!chips.length) return ''
  return (
    '<div class="docouture-card__meta">' +
    chips
      .map(
        (label) =>
          '<span class="dt-label dt-label--grey"><span class="dt-label__content">' +
          escapeHtml(label) +
          '</span></span>'
      )
      .join('') +
    '</div>'
  )
}

function buildCardHtml({ type, imageHtml, header, title, description, meta }) {
  return (
    '<div class="dt-card dt-card--vertical docouture-card' +
    typeModifier(type) +
    '">' +
    imageHtml +
    '<div class="dt-card__content">' +
    header +
    '<div class="docouture-card__main">' +
    '<div class="docouture-card__title">' +
    title +
    '</div>' +
    description +
    '</div>' +
    meta +
    '</div>' +
    '</div>'
  )
}

function renderCard(block, type, parent) {
  // NOT escaped, deliberately — `getTitle()` returns CONVERTED HTML, not
  // text. The `xref:` this block is built around arrives as
  // `<a href="...">Label</a>`, so escaping it would render the anchor as
  // visible source and break every card link. See lib/html.js's header for
  // which strings do need escaping (raw block attributes) and which are
  // already safe.
  const title = block.getTitle()
  if (!title) {
    warn(parent, '[card]', 'a card has no title; give it a `.Title` line carrying the link')
    return ''
  }

  const href = (HREF_RX.exec(title) || [])[1]
  if (!href) {
    warn(
      parent,
      '[card] ' + block.getAttribute('title'),
      'a card title carries no link; make it an `xref:` or a `link:`'
    )
  }

  const { images, bodies } = cardParts(block)
  if (type === 'no-image' && images.length) {
    warn(parent, '[card]', 'this card has an image but the block is `type=' + type + '`', TYPES.slice(1))
  }
  if (type !== 'no-image' && !images.length) {
    warn(parent, '[card]', 'a `type=' + type + '` card needs an `image::` of its own')
  }
  if (images.length > 1) {
    warn(parent, '[card]', 'a card has ' + images.length + ' images; only the first is rendered')
  }
  for (const body of bodies) {
    if (body.getContext() !== 'paragraph') {
      warn(parent, '[card]', 'a card body holds a ' + body.getContext() + ' block; only paragraphs are supported')
    }
  }

  const parts = []
  parts.push(images.length ? images[0].convert() : '')
  bodies.forEach((body) => parts.push(body.getContent()))

  return chainAll(parts, ([converted, ...texts]) => {
    const image = converted ? (IMG_RX.exec(converted) || [])[0] : ''
    const imageHtml = image ? '<div class="dt-card__image docouture-card__image">' + image + '</div>' : ''
    const description = texts
      .filter(Boolean)
      .map((text) => '<p>' + text + '</p>')
      .join('')
    return buildCardHtml({
      type,
      imageHtml,
      header: renderHeader(block.getAttribute('icon'), block.getAttribute('subheader'), parent),
      title,
      description,
      meta: renderMeta(block.getAttribute('labels')),
    })
  })
}

function finish(parent, wrapper, attrs, self) {
  const type = attrs.type || DEFAULT_TYPE
  if (!TYPES.includes(type)) {
    warn(parent, '[cards,type=' + attrs.type + ']', 'unknown card type "' + attrs.type + '"', TYPES)
  }

  const width = attrs.width || DEFAULT_WIDTH
  if (!WIDTHS.includes(width)) {
    warn(parent, '[cards,width=' + attrs.width + ']', 'unknown width "' + attrs.width + '"', WIDTHS)
  }

  const cards = wrapper.getBlocks().filter((block) => block.getStyle() === 'card')
  if (!cards.length) {
    warn(parent, '[cards]', 'a cards block with no `[card]` in it')
  }

  const cardHtmls = cards.map((card) => renderCard(card, TYPES.includes(type) ? type : DEFAULT_TYPE, parent))

  return chainAll(cardHtmls, (rendered) => {
    const classes = ['docouture-card-grid']
      .concat(parseColumns(attrs.columns || DEFAULT_COLUMNS, parent))
      .concat('docouture-card-grid--width-' + (WIDTHS.includes(width) ? width : DEFAULT_WIDTH))
    const html = '<div class="' + classes.join(' ') + '">' + rendered.join('') + '</div>'
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
