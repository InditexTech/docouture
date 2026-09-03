// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

const firstPositional = require('./first-positional')

// No variant, no target — `mono:[text]` always renders the same way, so
// unlike `label:` there is nothing to capture before the bracket. The
// regex still needs two groups (an empty, unused one for "target") because
// Asciidoctor 4.0's inline-macro engine (the ui-bundle preview harness)
// unconditionally tries to parse a second group as an attribute list and
// throws if it's missing — verified empirically; 2.2 (site builds) doesn't
// care either way, so the two-group shape is what's portable.
const MACRO_RX = /\bmono:()\[((?:\\\]|[^\]])*?)\]/ // NOSONAR: the empty group is required, see comment above

/**
 * `mono:[className]` →
 *
 *   <code class="dt-mono">className</code>
 *
 * Plain monospaced text with none of the GH-12 inline-code chip
 * (background, padding) — for a property/table cell whose ENTIRE content
 * is a name or token (Figma 2735:55589's `className` column) where the
 * chip would otherwise apply to literally every cell and read as noise.
 * `` `backtick code` `` keeps its chip; this is the deliberate opt-out.
 * The `.dt-mono` class is doc.css's own — nothing in the DS itself models
 * "code with no surrounding treatment", so this one rule is ours to own,
 * not a component skipped.
 */
module.exports = function registerMonoMacro(registry) {
  registry.inlineMacro('mono', function () {
    this.match(MACRO_RX)
    // Arrow function, not `self = this`: Asciidoctor's own extension DSL
    // rebinds `this` inside `process`'s callback to the macro's runtime
    // context, not the processor instance `match`/`createInline` live on —
    // an arrow function sidesteps that entirely by capturing the outer
    // `this` (the processor instance) lexically instead, so there's no
    // rebinding to route around with a local alias.
    this.process((parent, target, attrs) => {
      // Already specialcharacters-substituted by the time macros run
      // (verified, same as label-macro.js) — safe to place directly.
      const text = firstPositional(attrs) || ''
      return this.createInline(parent, 'quoted', '<code class="dt-mono">' + text + '</code>')
    })
  })
}
