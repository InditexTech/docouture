// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

const { parse, NodeType } = require('node-html-parser')

// Same rationale as search-index.js's own STRIPPED_TAGS/STRIPPED_CLASSES:
// the table of contents Asciidoctor emits inline in some layouts and any
// inline icon SVGs are page furniture, not article content, and neither
// survives translation to Markdown meaningfully.
const STRIPPED_TAGS = new Set(['svg'])
const STRIPPED_CLASSES = new Set(['toc', 'icon'])

// Asciidoctor's five admonition kinds (NOTE/TIP/IMPORTANT/CAUTION/WARNING),
// each rendered as `<div class="admonitionblock <kind>">`. See
// admonitionToMarkdown for why this needs its own case rather than falling
// through to the generic table handler.
const ADMONITION_LABELS = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  caution: 'Caution',
  warning: 'Warning',
}

const BLOCK_TAGS = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'aside', 'figure', 'figcaption'])

/**
 * Converts one page's converted-HTML article body (`page.contents` at the
 * `navigationBuilt` event — chrome-free, since page-composer has not yet
 * wrapped it in the UI layout; see llms-txt.js's own header) into Markdown
 * suitable for `llms-full.txt`.
 *
 * Deliberately narrow: this repo's pages are built from a known, small set
 * of block shapes (Asciidoctor's own admonitions/tables/code blocks, plus
 * this project's card/step/tabs/accordion block extensions — see
 * search-index.js's own note on those). Anything not explicitly handled
 * below is opened up and its text recursed into, the same fallback
 * search-index.js's walk() uses for the same reason: an unrecognised
 * wrapper's prose should still surface somewhere rather than vanish.
 *
 * @param {String} html
 * @returns {String} Markdown
 */
module.exports = function htmlToMarkdown(html) {
  // node-html-parser treats `<pre>` as a "block text" element by default —
  // the same bucket as `<script>`/`<style>` — and keeps its content as raw,
  // unparsed text rather than a `<code>` child element. That is exactly
  // wrong for a fenced code block: it needs the language class off the
  // nested `<code>`, so parsing has to be told to open `<pre>` up too. Note
  // this has to be done by OMITTING `pre` from the map, not setting it to
  // `false`: the parser's `is_block_text_element` check tests key presence
  // only, ignoring the boolean value — `{ pre: false }` still block-texts it.
  const root = parse(html, { blockTextElements: { script: true, style: true } })
  const md = blockToMarkdown(root, 0)
  // Collapse the accumulation of blank lines block joins tend to produce
  // down to at most one, and trim the trailing whitespace every block
  // emitter leaves behind it.
  return md.replace(/\n{3,}/g, '\n\n').trim()
}

function blockToMarkdown(node, listDepth) {
  let out = ''
  for (const child of node.childNodes) {
    out += nodeToMarkdown(child, listDepth)
  }
  return out
}

function nodeToMarkdown(node, listDepth) {
  if (node.nodeType === NodeType.TEXT_NODE) return node.text
  if (node.nodeType !== NodeType.ELEMENT_NODE) return ''

  const tag = node.rawTagName?.toLowerCase()
  if (STRIPPED_TAGS.has(tag)) return ''
  const classes = node.classList?.value || []
  if (classes.some((cls) => STRIPPED_CLASSES.has(cls))) return ''
  if (tag === 'div' && classes.includes('admonitionblock')) return admonitionToMarkdown(node, classes)

  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return `\n\n${'#'.repeat(Number(tag[1]))} ${inlineText(node)}\n\n`

    case 'pre': {
      const code = node.querySelector('code')
      const lang = (code?.classList?.value || []).map((c) => c.replace(/^language-/, '')).find(Boolean) || ''
      const text = (code || node).text.replace(/\n+$/, '')
      return `\n\n\`\`\`${lang}\n${text}\n\`\`\`\n\n`
    }

    case 'code':
      return `\`${node.text}\``

    case 'strong':
    case 'b': {
      const text = inlineText(node)
      // An icon font glyph (`<i class="fa icon-warning">`, no text content —
      // the glyph is painted by CSS `content`) falls through here empty.
      // Emphasising nothing would render as a bare `**`/`*`, so it is
      // dropped rather than kept.
      return text ? `**${text}**` : ''
    }

    case 'em':
    case 'i': {
      const text = inlineText(node)
      return text ? `*${text}*` : ''
    }

    case 'a': {
      const href = node.getAttribute('href')
      const text = inlineText(node)
      // Antora's `sectanchors` emits an empty `<a class="anchor">` right
      // before every heading's own text, purely for a CSS hover affordance —
      // see the asciidoc skill's own note on the attribute. No text, no link
      // worth keeping.
      if (!text) return ''
      return href ? `[${text}](${href})` : text
    }

    case 'img': {
      const alt = node.getAttribute('alt') || ''
      const src = node.getAttribute('src') || ''
      return `![${alt}](${src})`
    }

    case 'br':
      return '\n'

    case 'hr':
      return '\n\n---\n\n'

    case 'blockquote':
      return `\n\n${blockToMarkdown(node, listDepth)
        .trim()
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')}\n\n`

    case 'ul':
    case 'ol':
      return `\n\n${listToMarkdown(node, listDepth, tag === 'ol')}\n\n`

    case 'li':
      // Handled by listToMarkdown per item; a stray <li> outside ul/ol
      // (shouldn't happen in Asciidoctor output) just falls through to its
      // own content below.
      return blockToMarkdown(node, listDepth)

    case 'table':
      return `\n\n${tableToMarkdown(node)}\n\n`

    case 'p':
      return `\n\n${inlineText(node)}\n\n`

    default:
      // Generic wrapper (div/section/this project's own block extensions/
      // etc.) — open it up rather than drop its text. Block-level tags get
      // paragraph breaks around them so prose from adjacent wrappers doesn't
      // run together; the smaller set of pure-inline unknown tags does not.
      if (BLOCK_TAGS.has(tag)) return `\n\n${blockToMarkdown(node, listDepth).trim()}\n\n`
      return blockToMarkdown(node, listDepth)
  }
}

function inlineText(node) {
  return collapseWhitespace(blockToMarkdown(node, 0))
}

function collapseWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim()
}

// Asciidoctor renders an admonition as a two-cell `<table>`: `td.icon`
// (an empty `<i>` painted by CSS/an icon font, no real content) and
// `td.content` (the admonition's own body, sometimes with its own
// `div.title` — the "Example"/custom caption text — ahead of the prose).
// Falling through to the generic table handler would render the icon cell
// as a bare, empty `**` (see the strong/em cases' own note) and produce a
// one-row "table" that isn't really tabular data at all, so this is
// rendered as a labelled blockquote instead — content only, icon dropped.
function admonitionToMarkdown(node, classes) {
  const kind = classes.find((cls) => cls in ADMONITION_LABELS)
  const label = ADMONITION_LABELS[kind] || 'Note'
  const contentCell = node.querySelector('td.content')
  const body = (contentCell ? blockToMarkdown(contentCell, 0) : inlineText(node)).replace(/\n{3,}/g, '\n\n').trim()
  const quoted = body
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n')
  return `\n\n> **${label}**\n${quoted}\n\n`
}

function listToMarkdown(listNode, depth, ordered) {
  const indent = '  '.repeat(depth)
  const lines = []
  let i = 0
  for (const child of listNode.childNodes) {
    if (child.nodeType !== NodeType.ELEMENT_NODE || child.rawTagName?.toLowerCase() !== 'li') continue
    i += 1
    const marker = ordered ? `${i}.` : '-'
    const { inline, nested } = splitListItem(child, depth)
    lines.push(`${indent}${marker} ${inline}`)
    if (nested) lines.push(nested)
  }
  return lines.join('\n')
}

// A list item's own text and a nested sub-list are pulled apart rather than
// walked as one blob: the sub-list already renders itself fully indented (it
// recurses with `depth + 1`), so folding it back through the generic inline
// text path would double-indent it and, worse, collapse the blank line its
// own block wrapping leaves behind into the middle of the item's text.
function splitListItem(li, depth) {
  let inline = ''
  let nested = ''
  for (const child of li.childNodes) {
    const tag = child.nodeType === NodeType.ELEMENT_NODE ? child.rawTagName?.toLowerCase() : null
    if (tag === 'ul' || tag === 'ol') {
      nested += (nested ? '\n' : '') + listToMarkdown(child, depth + 1, tag === 'ol')
    } else {
      inline += nodeToMarkdown(child, depth)
    }
  }
  return { inline: collapseWhitespace(inline), nested }
}

function tableToMarkdown(tableNode) {
  const rows = []
  // Backslash and pipe are escaped in a single pass — not two chained
  // .replace() calls — so neither escape can interfere with the other:
  // escaping `|` first would let a source backslash immediately before one
  // combine with the new backslash to produce `\\|`, an escaped backslash
  // followed by a live, unescaped column separator. A single regex with a
  // replacer callback visits each original character exactly once, so this
  // ordering hazard can't occur no matter which character comes first in
  // the input.
  const escapeCell = (text) => text.replace(/[\\|]/g, (ch) => (ch === '\\' ? '\\\\' : '\\|'))
  for (const rowNode of tableNode.querySelectorAll('tr')) {
    const cells = rowNode.querySelectorAll('th,td').map((cell) => escapeCell(inlineText(cell)) || ' ')
    if (cells.length) rows.push(cells)
  }
  if (!rows.length) return ''

  const colCount = Math.max(...rows.map((r) => r.length))
  const pad = (row) => {
    const padded = row.slice()
    while (padded.length < colCount) padded.push(' ')
    return padded
  }

  const [header, ...body] = rows
  const lines = [
    `| ${pad(header).join(' | ')} |`,
    `| ${Array(colCount).fill('---').join(' | ')} |`,
    ...body.map((row) => `| ${pad(row).join(' | ')} |`),
  ]
  return lines.join('\n')
}
