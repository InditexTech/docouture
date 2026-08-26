'use strict'

// Shared handle to the one Shiki highlighter instance for an entire Antora
// build.
//
// `shiki-prewarm.js` — an @inditextech/docouture-antora-extensions PIPELINE
// extension, hooking Antora's own generator lifecycle — creates it exactly
// once, asynchronously, before any page is converted. This file's
// `highlight()` counterpart in shiki-syntax-highlighter.js is an ASCIIDOCTOR
// extension instead: called synchronously, per source block, by
// @asciidoctor/core 2.2's fully-synchronous Opal conversion loop, which
// cannot itself await anything (see asciidoc-extensions/lib/async-compat.js
// for the first instance of that exact constraint). Splitting the async
// setup from the sync use is GH-89's whole answer to the issue's own "Key
// Risk / Spike Required" section — this module is the seam between the two
// halves, since they live in different packages and are wired into the
// build by different playbook keys (`antora.extensions` vs
// `asciidoc.extensions`).
//
// A plain module-level variable is enough: @antora/site-generator runs one
// build per process (see `just build-site`), so there is exactly one
// instance to hold, and both packages `require()` the exact same file (node's
// module cache, not a singleton class) — no DI container needed.
let state = null

module.exports = {
  /**
   * Called once by shiki-prewarm.js, after its async Shiki setup resolves.
   *
   * @param {object} highlighter - the synchronous-capable Shiki core
   *   instance (`createHighlighterCoreSync`, built from an
   *   already-instantiated engine — see that file). Typed loosely as
   *   `object`, not `import('shiki/core').HighlighterCore`: shiki ships ESM-
   *   only types, and importing an ESM type from this CommonJS package needs
   *   a `resolution-mode` assertion this tsconfig doesn't carry — not worth
   *   adding for one call site when `noImplicitAny`/`noImplicitThis` are
   *   already off package-wide (see tsconfig.json's own header).
   * @param {string} rootStyle - the `style` attribute value Shiki itself puts
   *   on the `<pre>` it generates for a throwaway probe block — the
   *   `--shiki-light`/`--shiki-dark`/`-*-bg` custom property declarations
   *   that carry each theme's default foreground/background. Needed because
   *   `highlight()` returns only the INNER content of the `<code>`
   *   Asciidoctor wraps it in (see that file's own header for why) — those
   *   declarations, which normally live on the `<pre>` element Shiki
   *   generates itself, have nowhere to go, so `highlight()` re-declares them
   *   verbatim on its own outermost wrapper span instead of trying to parse
   *   them back out of markup it already discarded.
   * @returns {void}
   */
  set(highlighter, rootStyle) {
    state = { highlighter, rootStyle }
  },

  /**
   * @returns {{ highlighter: object, rootStyle: string } | null} `null`
   *   before the prewarm listener has run — e.g. the ui-bundle preview
   *   harness, which never registers `@inditextech/docouture-antora-extensions`
   *   at all (see extensions.md: it has no content catalog and no Antora
   *   pipeline). `highlight()` degrades to plain escaped text in that case.
   */
  get() {
    return state
  },
}
