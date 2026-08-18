'use strict'

const { chain, chainAll, precomputeSubtree } = require('./async-compat')

// Steps — the migration's answer to Fumadocs' `<Steps>`/`<Step>` (see
// code/tools/fumadocs-migrate's README and the Weave.js migration's Phase 2
// plan: 78 files, 325 markers in the source corpus, degraded during Phase 1
// to plain unwrapped headings until this existed).
//
// Renders IDS Timeline (timeline/timeline.css, timeline/timeline-item.css)
// with every item marked `--completed`: a documentation page has no "in
// progress" reader state the way a wizard does, so the solid
// marker/connector — the DS's "done" look, not `--current`/`--incompleted`
// — is the only one of Timeline's three states that reads correctly for
// procedural docs content. See `ids-components.yml` for why Timeline was
// chosen over Progress Steps (the catalogue's other numbered-procedure
// candidate): Progress Steps' CSS models a wizard's linear progress bar
// with no room for arbitrary body content per step; Timeline's `-detail`
// slot is a plain flex column, which is what rich step bodies need.
//
// Syntax — an example block (`====`), one child block per step. Each
// step's own `.Title` line becomes its label: Asciidoctor already renders a
// titled block's title as a `<div class="title">` ahead of its content, so
// steps.css just styles that div specifically inside
// `.ids-timeline-item-content` — no separate label markup to build or
// keep in sync.
//
//   [steps]
//   ====
//   .Import the Action
//   Start by importing the action:
//
//   [source,ts]
//   ----
//   import { WeaveRectangleToolAction } from "@inditextech/weave-sdk";
//   ----
//
//   .Register the Action
//   Then register it on the Weave instance.
//   ====
//
// A block with no title starts an untitled first step rather than being
// silently dropped — every real step in the migrated corpus has one, but a
// missing one shouldn't disappear.
function groupBySteps(blocks) {
  const groups = []
  blocks.forEach((block) => {
    if (groups.length === 0 || block.getTitle()) groups.push([])
    groups[groups.length - 1].push(block)
  })
  return groups
}

function renderStep(blocks, index) {
  // `.convert()` is sync under 2.2, Promise-returning under 4.0 (see
  // async-compat.js's own header comment) — chainAll handles either.
  const bodies = blocks.map((block) => block.convert())
  return chainAll(bodies, (parts) => {
    return (
      '<div class="ids-timeline-item ids-timeline-item--completed" data-step="' +
      (index + 1) +
      '">' +
      '<div class="ids-timeline-item-indicator">' +
      '<div class="ids-timeline-item-marker"></div>' +
      '<div class="ids-timeline-item-connector"></div>' +
      '</div>' +
      '<div class="ids-timeline-item-content">' +
      parts.join('\n') +
      '</div>' +
      '</div>'
    )
  })
}

function finish(parent, wrapper, attrs, self) {
  const steps = groupBySteps(wrapper.getBlocks())
  const stepHtmls = steps.map((blocks, index) => renderStep(blocks, index))
  return chainAll(stepHtmls, (parts) => {
    const html = '<div class="ids-timeline pdocs-steps">' + parts.join('') + '</div>'
    return self.createBlock(parent, 'pass', html, attrs)
  })
}

function stepsBlock() {
  this.named('steps')
  this.onContext('example')
  this.process((parent, reader, attrs) => {
    // Opal (2.2, real Antora builds) can hand this a bare JS `null` for a
    // block with no attributes beyond its style (e.g. a plain `[steps]`
    // with nothing else) — `createBlock` then crashes deep in Opal's own
    // Ruby-side `attrs.nil_or_empty?` check, which expects a Hash-like
    // object, never a raw `null`. 4.0 tolerates `null` fine; normalizing
    // here is cheaper than guarding every `createBlock` call site.
    attrs = attrs || {}
    // A literal JS `null` "source" crashes Opal (2.2): it lands straight in
    // the block's `source` attribute and `Block#initialize` unconditionally
    // calls `.nil_or_empty?()` on it, a Ruby method a raw `null` doesn't
    // have (4.0 tolerates `null` fine — this is 2.2-only). Empty string
    // means the same thing ("no literal source, children attached
    // separately via parseContent") without the crash.
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

module.exports = function registerSteps(registry) {
  registry.block(stepsBlock)
}
module.exports.stepsBlock = stepsBlock
