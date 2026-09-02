// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { afterEach, describe, expect, it } from 'vitest'
const shikiInstance = require('./shiki-instance')
// Registering the 'shiki' SyntaxHighlighter is a side effect of requiring
// this module (see its own header) — there is no other exported surface to
// call directly, so every case here drives it the same way Antora would:
// converting a `[source]` block through the real 2.2 Asciidoctor factory
// with `source-highlighter=shiki`.
require('./shiki-syntax-highlighter')

const asciidoctor = /** @type {any} */ (require('asciidoctor-core-2.2'))()

/**
 * @param {string | undefined} lang
 * @param {string} body
 */
function convertSource(lang, body) {
  const source = (lang ? '[source,' + lang + ']' : '[source]') + '\n----\n' + body + '\n----'
  return asciidoctor.convert(source, { attributes: { 'source-highlighter': 'shiki' }, safe: 'safe' })
}

describe('shiki syntax highlighter', () => {
  afterEach(() => {
    // Reset the module-level singleton between tests — shiki-instance.js is
    // one shared handle for the whole process (see its own header). `set`'s
    // own JSDoc requires a real highlighter/rootStyle; this is the one place
    // that intentionally puts it back to the "never warmed" state its own
    // `get()` documents returning `null` for.
    shikiInstance.set(/** @type {any} */ (null), /** @type {any} */ (null))
  })

  it('degrades to plain escaped text when the pre-warm listener never ran', () => {
    const html = convertSource('javascript', 'const x = 1 < 2;')
    expect(html).toContain('<pre class="shiki highlight"><code data-lang="javascript">const x = 1 &lt; 2;</code></pre>')
  })

  it('strips Shiki\'s own <pre><code> wrapper and re-declares the root style', () => {
    shikiInstance.set(
      {
        getLoadedLanguages: () => ['javascript'],
        codeToHtml: (source) => '<pre class="shiki" style="--shiki-fake:1"><code>' + source.toUpperCase() + '</code></pre>',
      },
      '--root-style:1'
    )
    const html = convertSource('javascript', 'const x = 1;')
    expect(html).toContain(
      '<pre class="shiki highlight"><code data-lang="javascript"><span style="--root-style:1">CONST X = 1;</span></code></pre>'
    )
  })

  it('falls back to the "text" grammar for a language the loaded set does not carry', () => {
    shikiInstance.set(
      {
        getLoadedLanguages: () => ['text'],
        codeToHtml: (source, opts) => '<pre><code>' + opts.lang + ':' + source + '</code></pre>',
      },
      ''
    )
    const html = convertSource('ruby', 'puts 1')
    expect(html).toContain('text:puts 1')
  })

  it('resolves an unannotated [source] block (lang "none") to the "text" grammar', () => {
    shikiInstance.set(
      {
        getLoadedLanguages: () => ['text'],
        codeToHtml: (source, opts) => '<pre><code>' + opts.lang + ':' + source + '</code></pre>',
      },
      ''
    )
    const html = convertSource(undefined, 'plain text')
    expect(html).toContain('text:plain text')
  })

  it('maps a LANG_ALIASES entry (objectivec) to its Shiki grammar id', () => {
    shikiInstance.set(
      {
        getLoadedLanguages: () => ['objective-c'],
        codeToHtml: (source, opts) => '<pre><code>' + opts.lang + ':' + source + '</code></pre>',
      },
      ''
    )
    const html = convertSource('objectivec', '@interface Foo @end')
    expect(html).toContain('objective-c:@interface Foo @end')
  })
})
