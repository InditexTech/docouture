'use strict'

// GH-89: pre-warms the one Shiki highlighter instance the whole build's
// source blocks share, asynchronously, before any page is converted.
//
// This is an ANTORA pipeline extension (`antora.extensions` in the
// playbook) — see index.js's own header for why this package's exports are
// that kind and not the `asciidoc.extensions` kind. It exists only to solve
// GH-89's own "Key Risk / Spike Required" section: `@asciidoctor/core ~2.2`
// converts every page through a fully-synchronous (Opal) loop, but building
// a Shiki highlighter — instantiating its WASM oniguruma engine, loading
// every bundled language/theme grammar — is asynchronous. So that async
// work has to happen ONCE, up front, outside the conversion loop entirely,
// and its result handed to the synchronous side through a plain shared
// module (`shiki-instance.js`, in the SIBLING
// @inditextech/docouture-asciidoc-extensions package — that's where the
// synchronous consumer, `shiki-syntax-highlighter.js`'s `highlight()`,
// lives too).
//
// `contentAggregated` is the event to hook: @antora/site-generator awaits it
// (`generate-site.js`, `await context.notify('contentAggregated', …)`)
// before `contentClassified`, itself before `documentsConverted` — the
// phase that actually calls into Asciidoctor. Same ordering guarantee
// nav-modules.js already relies on for its own `contentAggregated` listener
// (see that file's header) — this one just doesn't touch `contentAggregate`
// itself, so it declares zero parameters.
const { createOnigurumaEngine } = require('shiki/engine/oniguruma')
const { createHighlighterCoreSync } = require('shiki/core')
const shikiInstance = require('@inditextech/docouture-asciidoc-extensions/lib/shiki-instance')
const { LANGS, LIGHT_THEME, DARK_THEME } = require('@inditextech/docouture-asciidoc-extensions/lib/shiki-config')

async function loadLangs() {
  return Promise.all(LANGS.map((id) => import('@shikijs/langs/' + id).then((mod) => mod.default)))
}

async function loadThemes() {
  return Promise.all([LIGHT_THEME, DARK_THEME].map((id) => import('@shikijs/themes/' + id).then((mod) => mod.default)))
}

module.exports = function registerShikiPrewarm(context) {
  context.on('contentAggregated', async function docoutureShikiPrewarm() {
    const [engine, langs, themes] = await Promise.all([
      // `shiki/wasm` ships the pre-built oniguruma binary — no network fetch,
      // no separate build step. Instantiating it is the one truly
      // asynchronous piece; everything downstream of this `await` in
      // shiki-syntax-highlighter.js's `highlight()` is synchronous.
      createOnigurumaEngine(import('shiki/wasm')),
      loadLangs(),
      loadThemes(),
    ])

    // Sync from here: `createHighlighterCoreSync` (note: NOT
    // `createHighlighterCore`) requires its engine and grammars already
    // resolved, in exchange for a highlighter whose own `codeToHtml` is a
    // plain synchronous function — the whole point of doing all of the
    // above up front instead of on first use.
    const highlighter = createHighlighterCoreSync({ engine, langs, themes })

    // Shiki's own default-colour custom properties normally live on the
    // `<pre>` it generates itself; shiki-syntax-highlighter.js discards that
    // wrapper (see its own header) and needs them separately. Probing a
    // trivial block through the real highlighter — rather than reading
    // theme JSON fields directly — guarantees this matches whatever Shiki
    // itself would have put there, without this file needing to know how
    // Shiki derives a theme's default foreground/background.
    const probe = highlighter.codeToHtml('', {
      lang: 'text',
      themes: { light: LIGHT_THEME, dark: DARK_THEME },
      defaultColor: false,
    })
    const match = /<pre[^>]*\sstyle="([^"]*)"/.exec(probe)
    const rootStyle = match ? match[1] : ''

    shikiInstance.set(highlighter, rootStyle)
  })
}
