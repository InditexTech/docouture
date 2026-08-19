'use strict'

const { escapeHtml } = require('./html')
const shikiInstance = require('./shiki-instance')
const { LIGHT_THEME, DARK_THEME, LANG_ALIASES } = require('./shiki-config')

// Registers a custom Asciidoctor SyntaxHighlighter adapter, 'shiki' (GH-89),
// against `@asciidoctor/core ~2.2` — the version actually used to convert
// pages, via `antora@3.1.15` → `@antora/asciidoc-loader` (see
// .opencode/skills/asciidoc/reference/extensions.md's version table).
//
// THIS IS NOT AN `asciidoc.extensions` REGISTRY EXTENSION. Every other
// module in this package (label-macro.js, card-grid.js, …) is registered
// through the per-page `registry` object Antora hands `index.js`'s
// `register(registry)` — see that file's own header. A syntax highlighter is
// different: Asciidoctor.js exposes it as a GLOBAL, STATIC registry —
// `Asciidoctor.SyntaxHighlighter.register(name, functions)` — that lives on
// the `@asciidoctor/core` module object itself, not on any one page's
// registry instance. Requiring THIS file (done once, at the top of
// index.js, not inside `registerAll`) performs that global registration
// exactly once per process, thanks to node's module cache — which is
// correct here because pnpm dedupes `@asciidoctor/core` to the identical
// installed `~2.2` package Antora's own require of it resolves to, so both
// requires return the very same module singleton.
//
// `require('@asciidoctor/core')` is a FACTORY in 2.2 (call it to get the
// real API object) — see extensions.md's "2.2 — factory export" example.
//
// Required under an ALIAS ('asciidoctor-core-2.2', see package.json's
// `dependencies`), not the bare package name: this package's
// `devDependencies` already pins `@asciidoctor/core` to `~4.0.8` — a
// TYPE-ONLY dependency the rest of this package's extensions (accordion.js,
// cta.js, …) annotate their JSDoc against (see tsconfig.json's own header).
// pnpm can only link ONE physical `node_modules/@asciidoctor/core` per
// package, so declaring the real `~2.2` runtime dependency under that same
// bare name would silently replace those files' 4.0 types with 2.2's —
// verified empirically: it broke typecheck on every `AbstractBlock`
// reference elsewhere in this package. `npm:` aliasing keeps both physically
// installed side by side under different names.
//
// `2.2`'s own `.d.ts` types the module's export as a namespace object with no
// call signature, even though the actual JS bridge IS a factory function
// (verified empirically — the shape 2.2's own README documents, and the same
// shape `extensions.md`'s version table describes). `/** @type {any} */`
// bridges that one gap between the shipped types and the real runtime API,
// deliberately, rather than fighting it with an incorrect type assertion.
const asciidoctor = /** @type {any} */ (require('asciidoctor-core-2.2'))()

// Shiki always wraps its own output in `<pre class="shiki ..." style="...">
// <code>...</code></pre>` — there is no lower-level call that returns just
// the inner tokens. `highlight()` is only allowed to return the STRING that
// becomes the block's `content` (Asciidoctor's own `format()` — inherited
// unmodified from `SyntaxHighlighter::Base` since this adapter doesn't
// override it — wraps that in ITS OWN `<pre class="shiki highlight">
// <code data-lang="…">…</code></pre>`, which is what ui-bundle's
// 06-copy-to-clipboard.ts and doc.css actually key off: `pre.highlight` and
// `code[data-lang]`). So the outer tags Shiki generated have to be stripped
// back off; this regex depends on the exact shape Shiki 4.x's HTML renderer
// produces (verified empirically — see this package's README for how to
// re-check it against a future Shiki upgrade).
const SHIKI_WRAPPER_RX = /^<pre[^>]*><code[^>]*>([\s\S]*)<\/code>\s*<\/pre>\s*$/

/**
 * Asciidoctor passes `lang: 'none'` for an unannotated `[source]` block —
 * the same case highlight.bundle.ts used to alias to its own 'plaintext'
 * grammar. Shiki needs no grammar loaded at all for this: 'text' is a
 * reserved id its core always understands, same as 'plain'/'txt' upstream.
 */
function resolveLang(lang) {
  if (!lang || lang === 'none') return 'text'
  return LANG_ALIASES[lang] || lang
}

/**
 * @param {string} source - raw source text, already run through Asciidoctor's
 *   own callout extraction (this is the value `highlight()` receives, NOT
 *   `node.getSource()` — using the passed-in `source` rather than reading the
 *   node directly is what keeps `<1>` callout bubbles in source blocks
 *   working: Asciidoctor re-inserts their markup into this function's return
 *   value by string position, matched against `opts.callouts`).
 */
function highlightSource(source, lang) {
  const instance = shikiInstance.get()
  if (!instance) {
    // The pre-warm listener (@inditextech/pdocs-antora-extensions'
    // shiki-prewarm.js) never ran — the ui-bundle preview harness, which has
    // no Antora pipeline at all (see extensions.md), or a future caller that
    // forgets to list the extension. Degrade to plain escaped text rather
    // than throwing: a build with `runtime.log.failure_level: warn` should
    // fail loudly on a real authoring mistake, not on missing highlighting.
    return escapeHtml(source)
  }
  const { highlighter, rootStyle } = instance
  const resolved = resolveLang(lang)
  const effective = highlighter.getLoadedLanguages().includes(resolved) ? resolved : 'text'
  const html = highlighter.codeToHtml(source, {
    lang: effective,
    themes: { light: LIGHT_THEME, dark: DARK_THEME },
    // "CSS variables" dual-theme mode: emits `--shiki-light`/`--shiki-dark`
    // custom properties per token instead of a literal colour, so ONE build
    // output serves both the site's light and dark theme — see
    // ui-bundle/src/css/doc.css's own `--shiki-*` rules for the switch.
    defaultColor: false,
  })
  const match = SHIKI_WRAPPER_RX.exec(html.trim())
  const inner = match ? match[1] : escapeHtml(source)
  // Re-declares the default-colour variables Shiki put on its own (now
  // discarded) `<pre>` — see shiki-instance.js's own header for why this
  // can't just read them back off `html` on every call instead.
  return `<span style="${rootStyle}">${inner}</span>`
}

asciidoctor.SyntaxHighlighter.register('shiki', {
  handlesHighlighting() {
    return true
  },
  highlight(node, source, lang) {
    return highlightSource(source, lang)
  },
  // Overridden rather than left to `SyntaxHighlighter::Base`'s own default:
  // that default reads `self.pre_class`, an instance variable ONLY a real
  // Ruby subclass's `initialize` sets (to its own registered `name`) —
  // registering a plain JS functions object the way this file does (per
  // `.register`'s own contract, see the header above) never runs that
  // Ruby-side `initialize`, so `pre_class` comes back JS `undefined` and
  // Base's format would literally emit `class="undefined highlight"`
  // (verified empirically). Reimplementing `format` here sidesteps that
  // entirely, for one extra benefit: `node.getContent()` — Asciidoctor's own
  // already-substituted, callout-restored content, i.e. exactly `highlight()`'s
  // return value above — is read directly, rather than trusting an
  // ivar-driven default this adapter doesn't fully participate in.
  format(node, lang, opts) {
    const preClass = opts && opts.nowrap ? 'shiki highlight nowrap' : 'shiki highlight'
    const langAttr = lang ? ' data-lang="' + escapeHtml(lang) + '"' : ''
    return `<pre class="${preClass}"><code${langAttr}>${node.getContent()}</code></pre>`
  },
})
