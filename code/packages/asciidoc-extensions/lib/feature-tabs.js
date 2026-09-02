// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

const { chain, chainAll, precomputeSubtree } = require('./async-compat')
const { escapeHtml, attr } = require('./html')
const uniqueId = require('./unique-id')
const warn = require('./warn')

// Feature tabs — the landing's "Key features" switcher (GH-22, Figma
// 2696:54801 at l, 2696:92583 at m, 2696:94328 at s, 2696:95691 at xs).
//
// A column of labels beside a panel: selecting a label swaps the panel, and
// the panel is one slide — a media still, the feature's own prose, and an
// optional call to action. It is the only interactive block on the landing.
//
// WHAT THIS EMITS, AND WHAT IT DELIBERATELY DOES NOT
//
// Server-rendered, this is not a tab set at all. Every panel is present and
// visible, each under its own heading, and the label column is a list of
// in-page anchors pointing at them — a plain, complete, readable document
// section. `ui-bundle/src/js/07-feature-tabs.ts` is what turns that into a
// tablist: it sets `role=tablist`/`tab`/`tabpanel`, `aria-controls`,
// `aria-selected` and roving focus, and hides the panels that are not
// selected.
//
// So the ARIA the package contract asks for is real, but it is applied by
// the script that makes it true. Emitting `role=tab` and `aria-selected` here
// would announce a widget that does not exist until (and unless) JavaScript
// runs: with script off, every "tab" would be selected, none of them would do
// anything, and the panels would claim to be controlled by something inert.
// The markup below is honest in both states, which is the point of the
// contract's degradation rule rather than a way around it.
//
// SYNTAX
//
// A `[feature-tabs]` example block holding one `[feature]` open block per
// slide:
//
//   [feature-tabs]
//   ====
//   [feature,label="UI-agnostic"]
//   .Integrates with the UI framework of your choice
//   --
//   image::feature-1.png[A canvas rendered through three UI frameworks]
//   image::feature-1-dark.png[role=dark]
//
//   Change the UI using our included primitives or build a new one.
//
//   [.cta]
//   xref:main:architecture.adoc[Learn more]
//   --
//   ====
//
// `.Title` is the slide's heading and `label=` is the text in the label
// column. Both are optional, but not at the same time — a slide needs at least
// one of them, because the label column has to say something:
//
//   title only    the heading IS the label; the enhanced state hides the
//                 heading rather than printing the same words twice. This is
//                 the design's own copy (Figma 2696:54807 and its panel, which
//                 carries no heading of its own).
//   label only    a slide with no heading at all — again what the frames draw,
//                 for content whose label already says everything.
//   both          a short label beside a longer heading. This is what migrated
//                 content commonly needs.
//
// The call to action is an ordinary paragraph carrying the `cta` role, NOT a
// pair of `action=`/`url=` attributes. That is the same decision card-grid.js
// made for a card's link and for the same reason: only Asciidoctor resolves
// an `xref:`, so a target handed to this extension as a raw attribute string
// could never be turned into a working link to a page in this site. Written
// as a real inline macro it arrives here already converted, with Antora's own
// page resolution applied, and `link:`/`https://…` work identically.
//
// The dark media still is a second `image::` with `role=dark`. It has to be a
// separate image rather than one that adapts: an `<img>` does not inherit CSS
// from the page embedding it, which is why the hero's product mark takes the
// same two-asset shape (home-hero.hbs). Sites whose media reads correctly on
// both surfaces simply omit it.
//
// The slide's parts are emitted in the design's order — media, prose, call to
// action — regardless of the order they were authored in. A slide is a fixed
// composition, not a flow of blocks, and an author reordering them by accident
// should not produce a layout the frames never draw.

/** The role marking a slide's call-to-action paragraph. */
const CTA_ROLE = 'cta'
/** The role marking a slide's dark-theme media still. */
const DARK_ROLE = 'dark'

/**
 * The converter's own `<img>`, lifted whole from a converted image block.
 *
 * Rebuilt from the target it would not be: the host converter is what resolves
 * an image URL (Antora's per-page `imagesdir`, its own resource resolution),
 * and taking its output keeps the alt, width and height it derived. Same
 * reasoning, same regex, as card-grid.js.
 */
const IMG_RX = /<img\b[^>]*>/i

/** The first anchor of a converted call-to-action paragraph: its href and its label. */
const CTA_RX = /<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i

/**
 * A target that leaves the site: any absolute URL, or a protocol-relative one.
 *
 * This is the icon rule, derived rather than authored — an author cannot
 * forget the external-link icon and cannot put it on a link that stays here.
 * It is the same rule home-hero.hbs applies, reached differently: that partial
 * asks Antora's `resolvePageURL` whether the target names a page, which an
 * extension has no access to. By the time a target reaches this file it is
 * already a resolved href, so "does it point at another origin" is the
 * question that can actually be answered.
 */
const EXTERNAL_RX = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i

/**
 * An Asciidoctor block, in whichever major is running — the 4.0 types are used
 * for the shape only; every call below exists in 2.2 as well.
 *
 * @typedef {import('@asciidoctor/core').AbstractBlock} Block
 */

/**
 * One slide's blocks, sorted into the three roles a slide has.
 *
 * A `[feature]` is normally an open block, which is what an author needs for a
 * slide with an image in it: `[feature]` on an `image::` line is consumed as
 * the BLOCK MACRO's own style and never reaches `getStyle()` (measured in
 * card-grid.js's case, and the same here), so an image can never itself be the
 * slide marker. A bare paragraph is still accepted, for a slide that is prose
 * alone.
 *
 * @param {Block} block - the `[feature]` block.
 * @returns {{ images: Block[], ctas: Block[], bodies: Block[] }} its parts.
 */
function featureParts(block) {
  if (block.getContext() !== 'open') return { images: [], ctas: [], bodies: [block] }
  /** @type {Block[]} */
  const images = []
  /** @type {Block[]} */
  const ctas = []
  /** @type {Block[]} */
  const bodies = []
  for (const child of block.getBlocks()) {
    if (child.getContext() === 'image') images.push(child)
    else if (child.hasRole(CTA_ROLE)) ctas.push(child)
    else bodies.push(child)
  }
  return { images, ctas, bodies }
}

/**
 * Splits the images into the light still and its optional dark counterpart.
 *
 * Order does not decide which is which — the role does — so an author who
 * writes the dark one first gets the same output rather than an inverted page.
 *
 * @param {Block[]} images - every `image::` in the slide.
 * @param {Block} parent - the enclosing block, for warnings.
 * @returns {{ light: Block | undefined, dark: Block | undefined }}
 */
function splitImages(images, parent) {
  const dark = images.filter((image) => image.hasRole(DARK_ROLE))
  const light = images.filter((image) => !image.hasRole(DARK_ROLE))
  if (light.length > 1) {
    warn(parent, '[feature]', 'a slide has ' + light.length + ' images; only the first is rendered')
  }
  if (dark.length > 1) {
    warn(parent, '[feature]', 'a slide has ' + dark.length + ' `role=dark` images; only the first is rendered')
  }
  if (dark.length && !light.length) {
    warn(parent, '[feature]', 'a slide has a `role=dark` image but no image for the light theme')
  }
  return { light: light[0], dark: dark[0] }
}

/**
 * The media panel: the light still, and the dark one when there is one.
 *
 * Both are emitted, and CSS shows one per theme. The pair is only ever a pair —
 * a slide with no dark still renders the light one in both themes, unclassed.
 *
 * @param {string} lightHtml - the converted light image block, or `''`.
 * @param {string} darkHtml - the converted dark image block, or `''`.
 * @returns {string} the media markup, or `''` when the slide has no image.
 */
function renderMedia(lightHtml, darkHtml) {
  const light = lightHtml ? (IMG_RX.exec(lightHtml) || [])[0] : ''
  const dark = darkHtml ? (IMG_RX.exec(darkHtml) || [])[0] : ''
  if (!light && !dark) return ''
  const themed = light && dark
  const lightModifierClass = themed ? ' docouture-feature-tabs__image--light' : ''
  return (
    '<div class="docouture-feature-tabs__media">' +
    (light ? light.replace('<img', '<img class="docouture-feature-tabs__image' + lightModifierClass + '"') : '') +
    (dark
      ? dark.replace('<img', '<img class="docouture-feature-tabs__image docouture-feature-tabs__image--dark"')
      : '') +
    '</div>'
  )
}

/**
 * The slide's call to action, as an IDS ghost Button.
 *
 * The anchor the author wrote is not reused as-is — its href and label are
 * taken and the DS's own markup is built around them, so the control is a real
 * Button rather than a link wearing a button's classes. `getContent()` on a
 * paragraph is already-converted HTML, so the label is passed through
 * untouched (see lib/html.js on what must and must not be escaped).
 *
 * @param {string} converted - the converted `[.cta]` paragraph, or `''`.
 * @param {Block} parent - the enclosing block, for warnings.
 * @returns {string} the button markup, or `''`.
 */
function renderCta(converted, parent) {
  if (!converted) return ''
  const match = CTA_RX.exec(converted)
  if (!match) {
    warn(parent, '[.cta]', "a slide's call to action carries no link; make it an `xref:` or a `link:`")
    return ''
  }
  const href = match[1] || ''
  const label = match[2] || ''
  const external = EXTERNAL_RX.test(href)
  return (
    '<a class="dt-button dt-button--ghost docouture-feature-tabs__cta' +
    (external ? ' dt-button--icon-and-label dt-button--icon-action' : '') +
    '"' +
    attr('href', href) +
    '>' +
    '<span class="dt-button__content">' +
    label +
    (external
      ? '<span class="dt-button__icon dt-button__icon-action docouture-feature-tabs__cta-icon ' +
        'dt-icon-mask--external-link" aria-hidden="true"></span>'
      : '') +
    '</span>' +
    '</a>'
  )
}

/**
 * One slide: its tab, and its panel.
 *
 * The two are built together so the ids that pair them come from the same
 * iteration rather than being parsed back out of one another — see
 * lib/unique-id.js on why the counter is per document.
 *
 * @param {Block} block - the `[feature]` block.
 * @param {number} index - its position, zero-based.
 * @param {Block} parent - the enclosing block, for warnings and for ids.
 * @returns {{ tab: string, panel: string } | Promise<{ tab: string, panel: string }>}
 */
function renderFeature(block, index, parent) {
  // NOT escaped: `getTitle()` returns CONVERTED HTML, not raw text (lib/html.js).
  // Optional — a slide is a media panel with prose under it, and the design's
  // own slides carry no heading at all (Figma 2696:54811). What is NOT optional
  // is having something to put in the label column, so a slide with neither a
  // title nor a `label=` is an authoring error rather than a nameless tab.
  const title = block.getTitle()
  // A block attribute, so raw, so escaped — the other half of that same rule.
  const label = block.getAttribute('label')
  if (!title && !label) {
    warn(parent, '[feature]', 'a slide has no label; give it a `.Title` line or a `label=` attribute')
    return { tab: '', panel: '' }
  }
  const tabLabel = label ? escapeHtml(label) : title

  const { images, ctas, bodies } = featureParts(block)
  if (!images.length) {
    warn(parent, '[feature] ' + (label || block.getAttribute('title')), 'a slide has no `image::` of its own')
  }
  if (ctas.length > 1) {
    warn(parent, '[feature]', 'a slide has ' + ctas.length + ' `[.cta]` paragraphs; only the first is rendered')
  }
  const { light, dark } = splitImages(images, parent)

  const panelId = uniqueId(parent, 'feature-tabs-panel')
  const tabId = uniqueId(parent, 'feature-tabs-tab')
  const headingId = title ? uniqueId(parent, 'feature-tabs-label') : ''

  const cta = ctas[0]
  const parts = [light ? light.convert() : '', dark ? dark.convert() : '', cta ? cta.getContent() : '']
  bodies.forEach((body) => parts.push(body.convert()))

  return chainAll(parts, ([lightHtml, darkHtml, ctaHtml, ...bodyHtmls]) => {
    const tab =
      '<li class="docouture-feature-tabs__item">' +
      '<a class="dt-tabs-item docouture-feature-tabs__tab' +
      (index === 0 ? ' dt-tabs-item--selected' : '') +
      '"' +
      attr('id', tabId) +
      attr('href', '#' + panelId) +
      '>' +
      tabLabel +
      '</a>' +
      '</li>'

    const headingModifierClass = label ? '' : ' docouture-feature-tabs__heading--redundant'
    const heading = title
      ? '<h3 class="docouture-feature-tabs__heading' +
        // No explicit label means the heading and the tab say the same thing, so
        // the enhanced state hides the heading rather than printing it twice.
        headingModifierClass +
        '"' +
        attr('id', headingId) +
        '>' +
        title +
        '</h3>'
      : ''

    const panel =
      '<section class="docouture-feature-tabs__panel' +
      (index === 0 ? ' is-selected' : '') +
      '"' +
      attr('id', panelId) +
      // Named by its heading where there is one, and by the label column's own
      // text where there is not — a panel with no accessible name at all would
      // be an unnamed region in the unenhanced document, before the script that
      // names it after its tab has run.
      (headingId ? attr('aria-labelledby', headingId) : attr('aria-label', label || '')) +
      '>' +
      heading +
      renderMedia(lightHtml, darkHtml) +
      '<div class="docouture-feature-tabs__body">' +
      bodyHtmls.filter(Boolean).join('') +
      '</div>' +
      renderCta(ctaHtml, parent) +
      '</section>'

    return { tab, panel }
  })
}

/**
 * Assembles the block once every slide has been rendered.
 *
 * @param {Block} parent - the block this replaces.
 * @param {Block} wrapper - the parsed `[feature-tabs]` content.
 * @param {object} attrs - the block's own attributes.
 * @param {{ createBlock: Function }} self - the block processor.
 * @returns {object | Promise<object>} the `pass` block carrying the markup.
 */
function finish(parent, wrapper, attrs, self) {
  const features = wrapper.getBlocks().filter((block) => block.getStyle() === 'feature')
  if (!features.length) {
    warn(parent, '[feature-tabs]', 'a feature-tabs block with no `[feature]` in it')
  }

  const rendered = features.map((feature, index) => renderFeature(feature, index, parent))

  return chainAll(rendered, (slides) => {
    const tabs = slides.map((slide) => slide.tab).join('')
    const panels = slides.map((slide) => slide.panel).join('')
    const html =
      '<div class="docouture-feature-tabs" data-feature-tabs>' +
      '<ul class="docouture-feature-tabs__list">' +
      tabs +
      '</ul>' +
      '<div class="docouture-feature-tabs__panels">' +
      panels +
      '</div>' +
      '</div>'
    return self.createBlock(parent, 'pass', html, attrs)
  })
}

function featureTabsBlock() {
  this.named('feature-tabs')
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
    // this function `async` unconditionally. precomputeSubtree is what makes
    // a `.Title` carrying inline markup arrive converted rather than raw.
    return chain(this.parseContent(wrapper, reader.getLines()), () =>
      chain(precomputeSubtree(wrapper), () => finish(parent, wrapper, attrs, self))
    )
  })
}

module.exports = function registerFeatureTabs(registry) {
  registry.block(featureTabsBlock)
}
module.exports.featureTabsBlock = featureTabsBlock
