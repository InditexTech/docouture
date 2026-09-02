// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it } from 'vitest'

const htmlToMarkdown = require('./html-to-markdown')

describe('htmlToMarkdown', () => {
  it('converts headings', () => {
    expect(htmlToMarkdown('<h1 id="a">Title</h1><h2 id="b">Sub</h2>')).toBe('# Title\n\n## Sub')
  })

  it('converts paragraphs and inline emphasis', () => {
    const html = '<p>Some <strong>bold</strong> and <em>italic</em> text.</p>'
    expect(htmlToMarkdown(html)).toBe('Some **bold** and *italic* text.')
  })

  it('converts links', () => {
    expect(htmlToMarkdown('<p><a href="https://example.com">Example</a></p>')).toBe('[Example](https://example.com)')
  })

  it('converts inline code and fenced code blocks with a language', () => {
    const html = '<p>Run <code>npm install</code></p><pre><code class="language-js">const x = 1;</code></pre>'
    expect(htmlToMarkdown(html)).toBe('Run `npm install`\n\n```js\nconst x = 1;\n```')
  })

  it('converts unordered and ordered lists, including nesting', () => {
    const html = '<ul><li>One</li><li>Two<ul><li>Nested</li></ul></li></ul>'
    expect(htmlToMarkdown(html)).toBe('- One\n- Two\n  - Nested')

    expect(htmlToMarkdown('<ol><li>First</li><li>Second</li></ol>')).toBe('1. First\n2. Second')
  })

  it('converts tables to GitHub-flavoured Markdown tables', () => {
    const html = '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>'
    expect(htmlToMarkdown(html)).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |')
  })

  // Regression test for the escaping order: a cell containing a literal
  // backslash must come out doubled, and a cell containing a literal pipe
  // must come out backslash-escaped, without either interfering with the
  // other — see escapeCell's own comment in html-to-markdown.js.
  it('escapes backslashes and pipes in table cells', () => {
    const html = '<table><tr><th>A</th><th>B</th></tr><tr><td>back\\slash</td><td>pipe|char</td></tr></table>'
    expect(htmlToMarkdown(html)).toBe('| A | B |\n| --- | --- |\n| back\\\\slash | pipe\\|char |')
  })

  it('drops table-of-contents and icon elements', () => {
    const html = '<div class="toc"><a href="#a">A</a></div><p>Body</p><svg><path/></svg>'
    expect(htmlToMarkdown(html)).toBe('Body')
  })

  it('opens up unrecognised wrapper elements rather than dropping their text', () => {
    const html = '<div class="card"><h3 id="c">Card title</h3><p>Card body</p></div>'
    expect(htmlToMarkdown(html)).toBe('### Card title\n\nCard body')
  })

  it("drops sectanchors' empty anchor links ahead of headings", () => {
    const html = '<h2 id="x"><a class="anchor" href="#x"></a>Section</h2>'
    expect(htmlToMarkdown(html)).toBe('## Section')
  })

  it('renders an admonition block as a labelled blockquote, dropping the icon cell', () => {
    const html =
      '<div class="admonitionblock warning"><table><tr>' +
      '<td class="icon"><i class="fa icon-warning" title="Warning"></i></td>' +
      '<td class="content"><div class="paragraph"><p>Careful here.</p></div></td>' +
      '</tr></table></div>'
    expect(htmlToMarkdown(html)).toBe('> **Warning**\n> Careful here.')
  })

  it('collapses the blank-line gap between an admonition title and its body', () => {
    const html =
      '<div class="admonitionblock note"><table><tr>' +
      '<td class="icon"><i class="fa icon-note" title="Note"></i></td>' +
      '<td class="content">' +
      '<div class="title">Example</div>' +
      '<div class="paragraph"><p>See the docs.</p></div>' +
      '</td>' +
      '</tr></table></div>'
    expect(htmlToMarkdown(html)).toBe('> **Note**\n> Example\n>\n> See the docs.')
  })
})
