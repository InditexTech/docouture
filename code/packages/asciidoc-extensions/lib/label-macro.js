'use strict'

const firstPositional = require('./first-positional')

// IDS Label variants shipped in `label.css` (@inditex/sewingiopdsweb-react-
// components), already vendored into ui-bundle's ids-components.css — see
// .opencode/skills/iop-ds-components. Anything outside this list is an
// authoring mistake, not a themeable extension point, so it fails the build
// (see the logger call below) instead of silently rendering unstyled.
const VARIANTS = ['white', 'grey', 'red', 'orange', 'green', 'blue', 'purple', 'pink', 'teal']

// The Datagrid cell's own default (Figma 2735:55639 light / 2735:56411
// dark) — the one variant a table cell actually uses. Every other variant
// exists so `label:` is useful outside a table too.
const DEFAULT_VARIANT = 'grey'

// Asciidoctor's built-in "long format" inline macro regex requires a
// non-empty target (`\S+?` between `:` and `[`) — verified empirically
// against both Asciidoctor versions this repo runs (2.2 for site builds,
// 4.0 for the ui-bundle preview harness, see reference/extensions.md): a
// bare `label:[String]` with the colour omitted never reaches `process`
// at all under the default regex, it renders as literal text. Overriding
// the match regexp (`self.match`, the DSL's documented escape hatch for
// this) with our own — target group `([a-z]*)`, zero or more — is what
// makes the empty-colour form work.
const MACRO_RX = /\blabel:([a-z]*)\[((?:\\\]|[^\]])*?)\]/

/**
 * `label:red[Blocked]` / `label:[String]` (colour omitted → grey, the
 * table default) →
 *
 *   <span class="ids-label ids-label--grey">
 *     <span class="ids-label__content">String</span>
 *   </span>
 *
 * Exactly the DS's own BEM markup (label/label.css) — every colour, every
 * theme, comes free from the component already vendored into
 * ids-components.css. This macro emits markup only, no styling of its own.
 */
module.exports = function registerLabelMacro(registry) {
  registry.inlineMacro('label', function () {
    // `self` is captured so `self.createInline(...)` below can still reach
    // the processor instance from inside the nested `process` callback,
    // where `this` is rebound to the macro's runtime context instead —
    // Asciidoctor's own extension DSL idiom (see extend/extensions/
    // inline-macro-processor/), not an avoidable local alias.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    self.match(MACRO_RX)
    self.process(function (parent, target, attrs) {
      const variant = target || DEFAULT_VARIANT
      if (VARIANTS.indexOf(variant) === -1) {
        parent
          .getDocument()
          .getLogger()
          .warn(
            'label:' +
              target +
              '[] — unknown IDS Label variant "' +
              variant +
              '"; expected one of ' +
              VARIANTS.join(', ')
          )
      }
      // The bracket content has already been through Asciidoctor's own
      // `specialcharacters` substitution by the time macros run (verified:
      // `label:[A & B <x>]` arrives here as `A &amp; B &lt;x&gt;`, both
      // Asciidoctor versions), so it is already safe to place inside HTML
      // without a second escaping pass.
      const text = firstPositional(attrs) || ''
      const html =
        '<span class="ids-label ids-label--' + variant + '"><span class="ids-label__content">' + text + '</span></span>'
      return self.createInline(parent, 'quoted', html)
    })
  })
}
