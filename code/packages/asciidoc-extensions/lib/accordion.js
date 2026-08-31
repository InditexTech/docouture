// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

const { chain, chainAll, precomputeSubtree } = require('./async-compat')
const { escapeHtml, attr, stripTags } = require('./html')
const uniqueId = require('./unique-id')
const warn = require('./warn')

// Accordion grouping — GH-61 Part 2. Adds only what a native `[%collapsible]`
// cannot express on its own: group semantics (`role=group`, an accessible
// name) and, optionally, single-open behaviour. Part 1 (accordion.css,
// ui-bundle) already restyles every `[%collapsible]` as a DS accordion item,
// independent-mode by construction — this block is the thinnest possible
// wrapper around a run of them, never a reimplementation.
//
// SYNTAX
//
// An OPEN block (`--`/`--`), not an example block (`====`) like every other
// grouping extension in this package (`[cards]`, `[steps]`, `[feature-tabs]`
// all use `onContext('example')`). Deliberate: the children here are
// THEMSELVES example blocks — a `[%collapsible]` is `[%collapsible]====…====`
// — and nesting an example block inside another example block forces the
// child to `=====` (one more `=`), which is easy to get wrong and stops
// looking like an ordinary, standalone collapsible. An open block's own
// delimiter is `--`, so the children stay ordinary `====` blocks, unchanged,
// exactly as they would read outside a group:
//
//   [accordion%single-open,aria-label="Frequently asked questions"]
//   --
//   .Can I use Weave.js with any UI framework?
//   [%collapsible]
//   ====
//   Yes, Weave.js is framework-agnostic by design.
//   ====
//
//   .Can I deploy the frontend and backend on a single artifact?
//   [%collapsible]
//   ====
//   Yes, you can bundle them together.
//   ====
//   --
//
// `single-open` is the DS component's own vocabulary (`AccordionProps.
// singleOpen`, `accordion.d.ts`), spelled as Asciidoctor's own option
// shorthand — the same `%name` mechanism `[%collapsible]` itself already
// uses (`Parser.parseStyleAttribute`, verified against the vendored parser:
// a style token can carry a style name AND `%option`s together, e.g. the
// `[%collapsible%open]` an author can already write today). Absent the
// option, items are independent — the same default the DS component's own
// `singleOpen` prop has.
//
// WHAT THIS EMITS
//
// `<div class="docouture-accordion-group" role="group" aria-label="…">` wrapping
// the children's OWN converted markup verbatim — nothing here re-renders a
// collapsible; `child.convert()` is Asciidoctor's own `convert_example`
// (`node.hasOption('collapsible')` branch), unchanged. `docouture-accordion-group`
// is not an invented DS class — the real `Accordion` component's own wrapper
// `<div>` (`accordion.js`) carries no class of its own beyond whatever the
// CALLER passes; there is nothing to match here, so this file names its own
// wrapper the same way every other non-DS wrapper in this package does
// (`docouture-cta`, `docouture-card-grid`, `docouture-feature-tabs`). Styled in
// `ui-bundle/src/css/accordion.css`, alongside the items it groups.
//
// Single-open is implemented with the native `<details name="…">` radio-group
// behaviour, `name` shared across every child in the group via
// `lib/unique-id.js` — regex-patched onto each child's own rendered
// `<details>` tag, the same "lift the converter's own tag, patch one
// attribute" technique `video-size.js`/`cta.js` already use. That makes
// single-open work with NO JavaScript in every browser new enough to
// support `<details name>` (Chrome 120+, Safari 17.2+, Firefox 130+) — a
// degradation to independent mode elsewhere, never a break. Real keyboard
// roving focus (arrow/Home/End across headers) is layered on top of this
// same markup by `ui-bundle/src/js/10-accordion.ts`; this file emits no
// script and no inline `style`.

/** The first `<details` of a child's own converted markup — see header. */
const DETAILS_OPEN_RX = /^<details\b/

/**
 * Cross-major `hasOption` — the same split `first-positional.js`'s own
 * header documents for a different method, here for this one: 2.2's JS API
 * names it `isOption` (verified against the vendored dist,
 * `AbstractNode.prototype.isOption`); 4.0 renamed it to `hasOption`
 * (`abstract_node.js`'s own comment: "option? → hasOption"). Needed here,
 * unlike `child.hasRole(...)` elsewhere in this package's other extensions —
 * `hasRole` kept its name across both majors, `hasOption` did not.
 *
 * @param {Block} node
 * @param {string} name
 * @returns {boolean}
 */
function hasOption(node, name) {
  if (typeof node.hasOption === 'function') return node.hasOption(name)
  // 2.2's own JS API (Opal, real Antora builds) — absent from 4.0's
  // `AbstractNode` type declarations, so a plain property access is a type
  // error even though it exists at runtime; only reachable when the
  // `hasOption` branch above is false, i.e. actually running 2.2.
  return /** @type {{ isOption(name: string): boolean }} */ (/** @type {unknown} */ (node)).isOption(name)
}

/**
 * An Asciidoctor block, in whichever major is running.
 *
 * @typedef {import('@asciidoctor/core').AbstractBlock} Block
 */

/**
 * Escapes a value ALREADY produced by the converter (`getTitle()`) for
 * placement inside a double-quoted HTML attribute. Deliberately not
 * `lib/html.js`'s `escapeHtml` — that helper is for RAW block attributes
 * Asciidoctor never substitutes; a block's title is the opposite case
 * (`lib/html.js`'s own header: "anything from `getText()`/`getTitle()` is
 * already converted HTML"), so `&`/`<`/`>` are already entities and escaping
 * them again would double-encode (`&amp;` → `&amp;amp;`). Only the quote
 * that would otherwise close the attribute early needs handling here.
 *
 * @param {string} html - converted HTML, e.g. `wrapper.getTitle()`.
 * @returns {string} the same text, safe inside `"…"`.
 */
function escapeConvertedAttribute(html) {
  return html.replace(/"/g, '&quot;')
}

/**
 * The group's accessible name: the `aria-label=` attribute when given (a raw
 * block attribute, so escaped normally), falling back to the wrapper's own
 * block title with its markup stripped (converted HTML, so quote-escaped
 * only — see {@link escapeConvertedAttribute}) — an ARIA attribute value
 * cannot itself carry HTML, so any tags a titled `.Title` line converted to
 * (a bold word, an `xref:`) are dropped rather than left as visible text.
 *
 * @param {object} attrs - the block's own attributes.
 * @param {Block} wrapper - the parsed `[accordion]` content, for its title.
 * @returns {string} the label, or `''` when there is none.
 */
function ariaLabelFor(attrs, wrapper) {
  const raw = attrs['aria-label']
  if (raw) return escapeHtml(raw)
  const title = wrapper.getTitle()
  if (!title) return ''
  return escapeConvertedAttribute(stripTags(String(title)))
}

/**
 * The group's `[%collapsible]` children — anything else authored inside the
 * open block (a stray paragraph, a non-collapsible example block) is left
 * out silently, the same judgement `card-grid.js`/`feature-tabs.js` make for
 * a stray child that isn't their own `[card]`/`[feature]` style.
 *
 * @param {Block} wrapper
 * @returns {Block[]}
 */
function collapsibleChildren(wrapper) {
  return wrapper.getBlocks().filter((block) => block.getContext() === 'example' && hasOption(block, 'collapsible'))
}

/**
 * Assembles the block once every child has been rendered.
 *
 * @param {Block} parent - the block this replaces.
 * @param {Block} wrapper - the parsed `[accordion]` content.
 * @param {object} attrs - the block's own attributes.
 * @param {{ createBlock: Function }} self
 * @returns {object | Promise<object>}
 */
function finish(parent, wrapper, attrs, self) {
  const children = collapsibleChildren(wrapper)
  if (!children.length) {
    warn(parent, '[accordion]', 'an accordion group with no `[%collapsible]` items in it')
  }

  const ariaLabel = ariaLabelFor(attrs, wrapper)
  if (!ariaLabel) {
    warn(
      parent,
      '[accordion]',
      'an accordion group has no `aria-label=` and no title; give it one — a `role=group` with no accessible name is a strongly-discouraged pattern for screen reader users'
    )
  }

  // Shared across every child so native `<details name>` groups them into
  // one mutually-exclusive set — `null` (and no `name=` patched in below)
  // leaves every child independent, the DS's own `singleOpen` default.
  const groupName = 'single-open-option' in attrs ? uniqueId(wrapper, 'accordion-group') : null

  const rendered = children.map((child) => child.convert())

  return chainAll(rendered, (htmls) => {
    const itemsHtml = htmls
      .map((html, index) => {
        if (!groupName) return html
        if (!DETAILS_OPEN_RX.test(html)) {
          warn(
            parent,
            '[accordion]',
            'child ' + (index + 1) + " didn't render as a <details>; single-open needs every item to be one"
          )
          return html
        }
        return html.replace(DETAILS_OPEN_RX, '<details' + attr('name', groupName))
      })
      .join('')

    const html =
      '<div class="docouture-accordion-group" role="group"' +
      (ariaLabel ? ' aria-label="' + ariaLabel + '"' : '') +
      '>' +
      itemsHtml +
      '</div>'
    return self.createBlock(parent, 'pass', html, attrs)
  })
}

function accordionBlock() {
  this.named('accordion')
  this.onContext('open')
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
    // a `.Title` carrying inline markup (this block's own, or a child
    // `[%collapsible]`'s) arrive converted rather than raw.
    return chain(this.parseContent(wrapper, reader.getLines()), () =>
      chain(precomputeSubtree(wrapper), () => finish(parent, wrapper, attrs, self))
    )
  })
}

module.exports = function registerAccordion(registry) {
  registry.block(accordionBlock)
}
module.exports.accordionBlock = accordionBlock
