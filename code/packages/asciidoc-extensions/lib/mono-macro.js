'use strict'

const firstPositional = require('./first-positional')

// No variant, no target — `mono:[text]` always renders the same way, so
// unlike `label:` there is nothing to capture before the bracket. The
// regex still needs two groups (an empty, unused one for "target") because
// Asciidoctor 4.0's inline-macro engine (the ui-bundle preview harness)
// unconditionally tries to parse a second group as an attribute list and
// throws if it's missing — verified empirically; 2.2 (site builds) doesn't
// care either way, so the two-group shape is what's portable.
const MACRO_RX = /\bmono:()\[((?:\\\]|[^\]])*?)\]/

/**
 * `mono:[className]` →
 *
 *   <code class="ids-mono">className</code>
 *
 * Plain monospaced text with none of the GH-12 inline-code chip
 * (background, padding) — for a property/table cell whose ENTIRE content
 * is a name or token (Figma 2735:55589's `className` column) where the
 * chip would otherwise apply to literally every cell and read as noise.
 * `` `backtick code` `` keeps its chip; this is the deliberate opt-out.
 * The `.ids-mono` class is doc.css's own — nothing in the DS itself models
 * "code with no surrounding treatment", so this one rule is ours to own,
 * not a component skipped.
 */
module.exports = function registerMonoMacro(registry) {
  registry.inlineMacro('mono', function () {
    // See label-macro.js's own comment on this same pattern.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    self.match(MACRO_RX)
    self.process(function (parent, target, attrs) {
      // Already specialcharacters-substituted by the time macros run
      // (verified, same as label-macro.js) — safe to place directly.
      const text = firstPositional(attrs) || ''
      return self.createInline(parent, 'quoted', '<code class="ids-mono">' + text + '</code>')
    })
  })
}
