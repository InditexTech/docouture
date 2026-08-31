'use strict'

const { chain, chainAll, precomputeSubtree } = require('./async-compat')
const { escapeHtml, attr } = require('./html')
const uniqueId = require('./unique-id')
const warn = require('./warn')

// Content tabs — GH-45. IDS Tabs (`Kind=Underlined`, Figma 2735:69397 for
// light, 2735:69401 for dark), used for the one real case the migration
// found: `main/quickstart.adoc`'s package-manager command blocks
// (`code/tools/fumadocs-migrate`'s README, "Degraded" section). Both frames
// are the same component with only the ink swapped (`#000000` / `#FFFFFF`,
// which is `--dt-color-content-default` in each theme) — dark costs
// tabs.css nothing, same reasoning as card-grid.js's own header.
//
// Not to be confused with `feature-tabs.js` (GH-22, the landing's "Key
// features" switcher): that block's slides are a fixed composition — media,
// prose, one call to action, in the design's own order regardless of
// authoring order. A tab here is arbitrary CONTENT — prose, tables, images,
// admonitions, titled blocks, a nested `[cards]` — so this holds authored
// blocks in authored order and never re-sorts anything.
//
// SYNTAX
//
// An OPEN block (`--`/`--`), not an example block (`====`) like every other
// grouping extension in this package (`[cards]`, `[steps]`, `[feature-tabs]`
// all use `onContext('example')`). Deliberate, for the opposite reason
// accordion.js gives for the same choice: the real use site nests this
// INSIDE `[steps]`'s own `====`, and if `[tabs]` were also an example block,
// that nesting would force it to `=====` (one more `=`) — easy to get wrong
// and a pattern with no precedent anywhere in this corpus. An open block's
// delimiter never collides with the enclosing `====`, so `[tabs]` reads the
// same whether it sits at a page's top level or inside a step.
//
// Each child is `[tab,label="…"]` on its OWN SIDEBAR block (`****`), not an
// example block and not title-grouped the way `[steps]` groups its
// children. Two reasons, not one:
//
//   - a tab can hold prose, tables, a titled source block, even another
//     titled block entirely, and title-grouping (steps.js's own
//     `groupBySteps`) would silently start a new tab at the first titled
//     child it found. An explicit per-tab delimiter has no such trap.
//   - it CANNOT be `====` either, despite `[tabs]` itself being an open
//     block: AsciiDoc's delimited-block matching is a plain stack keyed on
//     the exact delimiter string, with no regard for what sits between two
//     fences of the same kind. A `[tab]` example block nested inside
//     `[tabs]`'s `--`, itself nested inside `[steps]`'s `====`, closes the
//     OUTER `[steps]` block the instant Asciidoctor meets the tab's own
//     closing `====` — verified empirically (the outer step's remaining
//     content and the whole rest of the page fell out of the timeline and
//     rendered as a bare, un-stepped `====` example instead). `****` never
//     collides with `====` at any nesting depth, which is the only property
//     that matters here.
//
// One more line per tab than an example block would need, in exchange for
// never having to reason about ambient nesting depth:
//
//   [tabs]
//   --
//   [tab,label="pnpm"]
//   ****
//   [source,bash]
//   ----
//   pnpm create weave-backend-app
//   ----
//   ****
//
//   [tab,label="npm"]
//   ****
//   [source,bash]
//   ----
//   npm create weave-backend-app
//   ----
//   ****
//   --
//
// `label=` is required on every tab — a block style attribute, not a
// `.Title` (unlike `[card]`/`[feature]`, whose titles are already-converted
// links or headings the label reuses): a tab's label is never itself
// content, and reading it off a `.Title` line would make an author's first
// line of prose double as the tab strip by accident. A `[tabs]` with fewer
// than two `[tab]` children is a build-fatal warning — a single tab is not a
// choice.
//
// Every `[tabs]` block is independent. There is no cross-block linking (no
// `sync=`, nothing shared in `localStorage`): an earlier revision of this
// file had exactly that, and it was wrong on two counts — picking a tab in
// one block is not supposed to change an unrelated block elsewhere on the
// page, full stop, and the mechanism used to make GROUPS switch together
// (real `<a href="#panel-id">` tabs) collided with
// `ui-bundle/src/js/03-fragment-jumper.ts`, which globally rewrites
// `window.location.hash` for every `a[href^="#"]` on the page regardless of
// this file's own `click` handler and its `preventDefault()`. Two problems,
// one fix: tabs are BUTTONS now (see below), and every block only ever
// touches its own DOM.
//
// WHAT THIS EMITS
//
// One `<button type="button">` per tab (never an anchor — see above),
// `role=tab`/`aria-selected`/`aria-controls` set here directly rather than
// layered on by script: unlike `feature-tabs.js`, there is no readable
// "plain document" state this degrades to first — exactly one panel is
// ever visible (`ui-bundle/src/js/11-tabs.ts` only handles switching which
// one, never whether more than one shows), so the tab semantics are true
// from the first paint, script or not. A reader without JavaScript sees the
// first tab's content and a strip of inert (but clearly labelled) buttons —
// a real limitation of a widget that fundamentally requires script to
// switch state, same trade-off any tab component makes.
//
// CASE SENSITIVITY (GH-45's own requirement)
//
// Labels render in the author's own case — tabs.css does not force
// uppercase (a deliberate deviation from the Figma text styles it is
// otherwise built from; see that file's header) — and are matched
// CASE-SENSITIVELY everywhere: `data-tab-value` and the ARIA relationships
// this file builds both use the author's label byte for byte, and an exact
// duplicate or a same-except-case pair (`"pnpm"` vs `"Pnpm"`) both warn,
// since two tabs that differ only by case are almost always a typo rather
// than an intentional pair.

/**
 * An Asciidoctor block, in whichever major is running.
 *
 * @typedef {import('@asciidoctor/core').AbstractBlock} Block
 */

/**
 * One tab: its strip button, and its panel.
 *
 * @param {Block} block - the `[tab]` sidebar block.
 * @param {number} index - its position, zero-based.
 * @param {string} groupId - the unique id shared by every tab/panel pair in this block.
 * @param {string[]} seenLabels - every raw label rendered so far in this block, for duplicate detection.
 * @param {Block} parent - the enclosing block, for warnings.
 * @returns {{ tab: string, panel: string } | Promise<{ tab: string, panel: string }>}
 */
function renderTab(block, index, groupId, seenLabels, parent) {
  // A block style attribute, so raw and unsubstituted — escaped, per
  // lib/html.js's own table (row "block style attribute").
  const label = block.getAttribute('label')
  if (!label) {
    warn(parent, '[tab]', 'a tab has no `label=`; give it one, e.g. `[tab,label="pnpm"]`')
    return { tab: '', panel: '' }
  }

  if (seenLabels.includes(label)) {
    warn(parent, '[tab,label="' + label + '"]', 'a tab set already has a tab labelled "' + label + '"')
  } else if (seenLabels.some((seen) => seen.toLowerCase() === label.toLowerCase())) {
    warn(
      parent,
      '[tab,label="' + label + '"]',
      'a tab set already has a tab labelled "' +
        seenLabels.find((seen) => seen.toLowerCase() === label.toLowerCase()) +
        '"; labels are matched case-sensitively, but two that differ only by case are ' +
        'almost always a typo rather than an intentional pair'
    )
  }
  seenLabels.push(label)

  const tabId = groupId + '-tab-' + (index + 1)
  const panelId = groupId + '-panel-' + (index + 1)
  const selected = index === 0

  const bodies = block.getBlocks().map((child) => child.convert())

  return chainAll(bodies, (parts) => {
    const tab =
      '<li class="docouture-tabs__item" role="presentation">' +
      '<button type="button" class="dt-tabs-item docouture-tabs__tab' +
      (selected ? ' dt-tabs-item--selected' : '') +
      '"' +
      attr('id', tabId) +
      attr('role', 'tab') +
      attr('aria-selected', String(selected)) +
      attr('aria-controls', panelId) +
      attr('tabindex', selected ? '0' : '-1') +
      attr('data-tab-value', label) +
      '>' +
      '<span class="dt-tabs-item__label">' +
      escapeHtml(label) +
      '</span>' +
      '</button>' +
      '</li>'

    const panel =
      '<section class="docouture-tabs__panel' +
      (selected ? ' is-selected' : '') +
      '"' +
      attr('id', panelId) +
      attr('role', 'tabpanel') +
      attr('aria-labelledby', tabId) +
      attr('tabindex', '0') +
      attr('data-tab-value', label) +
      '>' +
      parts.join('\n') +
      '</section>'

    return { tab, panel }
  })
}

/**
 * Assembles the block once every tab has been rendered.
 *
 * @param {Block} parent - the block this replaces.
 * @param {Block} wrapper - the parsed `[tabs]` content.
 * @param {Record<string, unknown>} attrs - the block's own attributes.
 * @param {{ createBlock: Function }} self - the block processor.
 * @returns {object | Promise<object>} the `pass` block carrying the markup.
 */
function finish(parent, wrapper, attrs, self) {
  const tabBlocks = wrapper.getBlocks().filter((block) => block.getStyle() === 'tab')
  if (tabBlocks.length < 2) {
    warn(parent, '[tabs]', tabBlocks.length + ' `[tab]` block(s) found; a tab set needs at least two')
  }

  const groupId = uniqueId(parent, 'tabs')
  /** @type {string[]} */
  const seenLabels = []
  const rendered = tabBlocks.map((block, index) => renderTab(block, index, groupId, seenLabels, parent))

  return chainAll(rendered, (tabs) => {
    const html =
      '<div class="docouture-tabs" data-tabs>' +
      '<ul class="docouture-tabs__list" role="tablist">' +
      tabs.map((tab) => tab.tab).join('') +
      '</ul>' +
      '<div class="docouture-tabs__panels">' +
      tabs.map((tab) => tab.panel).join('') +
      '</div>' +
      '</div>'
    return self.createBlock(parent, 'pass', html, attrs)
  })
}

function tabsBlock() {
  this.named('tabs')
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
    // this function `async` unconditionally.
    return chain(this.parseContent(wrapper, reader.getLines()), () =>
      chain(precomputeSubtree(wrapper), () => finish(parent, wrapper, attrs, self))
    )
  })
}

module.exports = function registerTabs(registry) {
  registry.block(tabsBlock)
}
module.exports.tabsBlock = tabsBlock
