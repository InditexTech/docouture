'use strict'

const { chain, chainAll, precomputeSubtree } = require('./async-compat')
const { escapeHtml, attr } = require('./html')
const warn = require('./warn')

// Call to action — a full-width band closing out a landing section, styled
// after Fumadocs' "Free & Open Source" block on the Weave.js docs home
// (`app/(home)/page.tsx`'s `OpenSource()`) rather than after any Figma frame:
// GH-23 notes this block has none. Composed from primitives already vendored
// for the landing (button, text) — no new DS component, no new CSS import
// beyond this file.
//
// WHY IT DEVIATES FROM THE ISSUE THAT PROPOSED IT
//
// GH-23 sketched `cta::[primary-url="…"]`, a block MACRO with the target as a
// raw attribute string. That can never resolve an `xref:` to a page in this
// site — only Asciidoctor itself does that, during its own inline
// substitution — which is the exact reason card-grid.js's card link and
// feature-tabs.js's slide CTA are both roled PARAGRAPHS instead of attributes.
// This block makes the same call, for the same reason: `[.primary]`/
// `[.secondary]` paragraphs carrying a real `xref:`/`link:`, resolved by the
// time this file ever sees them.
//
// It also drops the issue's inverse surface (`--ids-color-bg-inverse` +
// `--ids-color-content-inverse`) and its eyebrow chip, neither of which the
// Fumadocs reference has. An inverse band would need a real fix for its
// buttons too — the DS ships no inverse button variant, so a plain
// `.ids-button--primary` resolves BLACK text on a BLACK band in light theme
// (`--ids-comp-button-primary-default`). Fixing that means widening
// `tools/ids/sync.mjs`'s THEME_SCOPES the way the dark code-block surface
// already does (see that file's own comment) — deferred; this block instead
// sits on `--ids-color-bg-low`, which needs none of that: DS buttons already
// read correctly against it in both themes, no scope-inversion, no new
// token, no rule at all separating the band from the page.
//
// SYNTAX
//
// A `[cta]` example block, authored as its own `==` SECTION — like every
// other landing block (home.css's own header: "the content column is a
// stack of blocks... each a section of the AsciiDoc document"), it needs a
// real section heading to get the landing's uniform dashed-rule band, and
// that heading also names it in the document outline. `title=` is an
// optional block-style attribute (raw, so escaped) for a SECOND, larger line
// inside the band itself — the reference draws only one, so most callers
// need neither this nor a `.Title` line (which would attach to the image
// anyway, not to this wrapper — the same "an image consumes the marker
// immediately touching it" trap card-grid.js and feature-tabs.js hit for a
// block's STYLE, here for a title instead).
//
// Everything else is prose paragraphs, an optional pair of `image::` marks
// (light and `role=dark`, same split as feature-tabs.js's media still), and
// one or two role-marked action paragraphs:
//
//   == Free & open source
//
//   [cta]
//   ====
//   image::product-logo.svg[Product mark]
//   image::product-logo-dark.svg[role=dark]
//
//   Actively maintained and open for contributions. Comes with
//   best-in-class documentation and developer experience.
//
//   [.primary]
//   https://github.com/InditexTech/weavejs-frontend/fork[Create a fork]
//   ====
//
// Parts are emitted in a fixed order — title, prose, mark, actions —
// regardless of the order they were authored in, the same discipline
// feature-tabs.js applies to a slide: this is a fixed composition, not a
// flow of blocks, and an author reordering them by accident should not
// produce a layout nothing drew.
//
// `align=` on the block itself switches the inner column between
// `center` (default, the reference) and `start`.

/** The role marking the block's primary call-to-action paragraph. */
const PRIMARY_ROLE = 'primary'
/** The role marking the block's secondary call-to-action paragraph. */
const SECONDARY_ROLE = 'secondary'
/** The role marking a mark image meant for the dark theme. */
const DARK_ROLE = 'dark'

const ALIGNMENTS = ['center', 'start']
const DEFAULT_ALIGN = 'center'

/** The converter's own `<img>`, lifted whole — see card-grid.js/feature-tabs.js's identical note on why. */
const IMG_RX = /<img\b[^>]*>/i

/** The first anchor of a converted action paragraph: its href and its label. */
const CTA_RX = /<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i

/**
 * A target on github.com — derived from the href, never authored. GitHub has
 * no place in `icon-masks.css`: that file is generated exclusively from the
 * design system's own icon mirror (its own header, `Do not edit by hand`),
 * and this is a brand mark, not a DS icon — so it is the one hand-authored
 * mask this package carries, in cta.css, and lives only there. No generic
 * external-link icon accompanies it (there was one; removed) — a second,
 * unbranded arrow beside the mark read as redundant rather than
 * informative.
 */
const GITHUB_RX = /^https?:\/\/(?:www\.)?github\.com\//i

/**
 * An Asciidoctor block, in whichever major is running.
 *
 * @typedef {import('@asciidoctor/core').AbstractBlock} Block
 */

/**
 * The block's children, sorted into the four roles it has.
 *
 * @param {Block} wrapper - the parsed `[cta]` content.
 * @returns {{ images: Block[], primaries: Block[], secondaries: Block[], bodies: Block[] }}
 */
function ctaParts(wrapper) {
  /** @type {Block[]} */
  const images = []
  /** @type {Block[]} */
  const primaries = []
  /** @type {Block[]} */
  const secondaries = []
  /** @type {Block[]} */
  const bodies = []
  for (const child of wrapper.getBlocks()) {
    if (child.getContext() === 'image') images.push(child)
    else if (child.hasRole(PRIMARY_ROLE)) primaries.push(child)
    else if (child.hasRole(SECONDARY_ROLE)) secondaries.push(child)
    else bodies.push(child)
  }
  return { images, primaries, secondaries, bodies }
}

/**
 * Splits the mark images into the light still and its optional dark
 * counterpart — the same split, and the same reason, as feature-tabs.js's
 * `splitImages`.
 *
 * @param {Block[]} images
 * @param {Block} parent - for warnings.
 * @returns {{ light: Block | undefined, dark: Block | undefined }}
 */
function splitImages(images, parent) {
  const dark = images.filter((image) => image.hasRole(DARK_ROLE))
  const light = images.filter((image) => !image.hasRole(DARK_ROLE))
  if (light.length > 1) {
    warn(parent, '[cta]', 'a cta has ' + light.length + ' mark images; only the first is rendered')
  }
  if (dark.length > 1) {
    warn(parent, '[cta]', 'a cta has ' + dark.length + ' `role=dark` mark images; only the first is rendered')
  }
  if (dark.length && !light.length) {
    warn(parent, '[cta]', 'a cta has a `role=dark` mark image but no mark for the light theme')
  }
  return { light: light[0], dark: dark[0] }
}

/**
 * The mark: the light still, and the dark one when there is one — laid out
 * exactly like feature-tabs.js's `renderMedia`.
 *
 * @param {string} lightHtml
 * @param {string} darkHtml
 * @returns {string}
 */
function renderMark(lightHtml, darkHtml) {
  const light = lightHtml ? (IMG_RX.exec(lightHtml) || [])[0] : ''
  const dark = darkHtml ? (IMG_RX.exec(darkHtml) || [])[0] : ''
  if (!light && !dark) return ''
  const themed = light && dark
  return (
    '<div class="docouture-cta__mark">' +
    (light
      ? light.replace(
          '<img',
          '<img class="docouture-cta__mark-image' + (themed ? ' docouture-cta__mark-image--light' : '') + '"'
        )
      : '') +
    (dark ? dark.replace('<img', '<img class="docouture-cta__mark-image docouture-cta__mark-image--dark"') : '') +
    '</div>'
  )
}

/**
 * One action as a real DS Button, built around the converted paragraph's
 * own href and label — the same construction as feature-tabs.js's
 * `renderCta`, applied to either role.
 *
 * @param {string} converted - the converted action paragraph, or `''`.
 * @param {'primary' | 'secondary'} variant
 * @param {string} role - `[.primary]` or `[.secondary]`, for warnings.
 * @param {Block} parent
 * @returns {string}
 */
function renderAction(converted, variant, role, parent) {
  if (!converted) return ''
  const match = CTA_RX.exec(converted)
  if (!match) {
    warn(parent, '[.' + role + ']', 'a cta action carries no link; make it an `xref:` or a `link:`')
    return ''
  }
  const href = match[1] || ''
  const label = match[2] || ''
  const github = GITHUB_RX.test(href)
  return (
    '<a class="ids-button ids-button--' +
    variant +
    ' docouture-cta__action' +
    (github ? ' ids-button--icon-and-label ids-button--icon-icon' : '') +
    '"' +
    attr('href', href) +
    '>' +
    '<span class="ids-button__content">' +
    (github
      ? '<span class="ids-button__icon ids-button__icon-icon docouture-cta__action-icon ' +
        'docouture-cta__action-icon--github" aria-hidden="true"></span>'
      : '') +
    label +
    '</span>' +
    '</a>'
  )
}

/**
 * Assembles the block once every part has been rendered.
 *
 * @param {Block} parent - the block this replaces.
 * @param {Block} wrapper - the parsed `[cta]` content.
 * @param {object} attrs - the block's own attributes.
 * @param {{ createBlock: Function }} self
 * @returns {object | Promise<object>}
 */
function finish(parent, wrapper, attrs, self) {
  const align = attrs.align || DEFAULT_ALIGN
  if (!ALIGNMENTS.includes(align)) {
    warn(parent, '[cta,align=' + attrs.align + ']', 'unknown alignment "' + attrs.align + '"', ALIGNMENTS)
  }

  // A block-style attribute, so raw, so escaped — see the header comment on
  // why this is optional: the real heading is the `==` section's own, not
  // this.
  const title = escapeHtml(attrs.title)

  const { images, primaries, secondaries, bodies } = ctaParts(wrapper)
  if (!primaries.length) {
    warn(parent, '[cta]', 'a cta has no `[.primary]` action')
  }
  if (primaries.length > 1) {
    warn(parent, '[cta]', 'a cta has ' + primaries.length + ' `[.primary]` paragraphs; only the first is rendered')
  }
  if (secondaries.length > 1) {
    warn(parent, '[cta]', 'a cta has ' + secondaries.length + ' `[.secondary]` paragraphs; only the first is rendered')
  }
  if (secondaries.length && !primaries.length) {
    warn(parent, '[cta]', 'a cta has a `[.secondary]` action but no `[.primary]` one')
  }
  for (const body of bodies) {
    if (body.getContext() !== 'paragraph') {
      warn(parent, '[cta]', 'a cta body holds a ' + body.getContext() + ' block; only paragraphs are supported')
    }
  }
  const { light, dark } = splitImages(images, parent)

  const primary = primaries[0]
  const secondary = secondaries[0]
  const parts = [
    light ? light.convert() : '',
    dark ? dark.convert() : '',
    primary ? primary.getContent() : '',
    secondary ? secondary.getContent() : '',
  ]
  bodies.forEach((body) => parts.push(body.getContent()))

  return chainAll(parts, ([lightHtml, darkHtml, primaryHtml, secondaryHtml, ...bodyHtmls]) => {
    const titleHtml = title ? '<h2 class="docouture-cta__title discrete ids-text--title-l">' + title + '</h2>' : ''
    const leadHtml = bodyHtmls
      .filter(Boolean)
      .map((text) => '<p class="docouture-cta__lead ids-text--body-l">' + text + '</p>')
      .join('')
    const markHtml = renderMark(lightHtml, darkHtml)
    const actionsHtml =
      primaryHtml || secondaryHtml
        ? '<div class="docouture-cta__actions">' +
          renderAction(primaryHtml, 'primary', 'primary', parent) +
          renderAction(secondaryHtml, 'secondary', 'secondary', parent) +
          '</div>'
        : ''

    const html =
      '<div class="docouture-cta docouture-cta--' +
      (ALIGNMENTS.includes(align) ? align : DEFAULT_ALIGN) +
      '">' +
      '<div class="docouture-cta__body">' +
      titleHtml +
      leadHtml +
      '</div>' +
      markHtml +
      actionsHtml +
      '</div>'
    return self.createBlock(parent, 'pass', html, attrs)
  })
}

function ctaBlock() {
  this.named('cta')
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

module.exports = function registerCta(registry) {
  registry.block(ctaBlock)
}
module.exports.ctaBlock = ctaBlock
