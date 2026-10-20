// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it } from 'vitest'

const asciidoctor = require('@asciidoctor/core')
const registerCardGrid = require('./card-grid')

/**
 * @param {string} source
 * @returns {Promise<{ html: string, messages: { severity: string, text: string }[] }>}
 */
async function run(source) {
  const logger = asciidoctor.MemoryLogger.create()
  asciidoctor.LoggerManager.setLogger(logger)
  const registry = asciidoctor.Extensions.create()
  registerCardGrid(registry)
  const html = await asciidoctor.convert(source, { extension_registry: registry, safe: 'safe' })
  const messages = logger.getMessages().map((m) => ({ severity: m.getSeverity().toString(), text: m.getText() }))
  return { html: String(html), messages }
}

const errorsOf = (messages) => messages.filter((m) => m.severity === 'ERROR').map((m) => m.text)

describe('cards block severities', () => {
  it('errors on an unknown type, width and an empty block', async () => {
    const { messages } = await run('[cards,type=bogus,width=huge]\n====\nJust text.\n====\n')
    const text = errorsOf(messages).join('\n')
    expect(text).toContain('unknown card type "bogus"')
    expect(text).toContain('unknown width "huge"')
    expect(text).toContain('a cards block with no `[card]` in it')
  })

  it('errors on unreadable columns, an unknown breakpoint and an out-of-range count', async () => {
    const { messages } = await run('[cards,columns="x zz:3 m:99"]\n====\nJust text.\n====\n')
    const text = errorsOf(messages).join('\n')
    expect(text).toContain('cannot read the column "x"')
    expect(text).toContain('unknown breakpoint "zz"')
    expect(text).toContain('outside the supported range')
  })

  it('errors on a card without a title and on a title without a link', async () => {
    const { messages } = await run(
      '[cards,type=no-image]\n====\n[card]\nNo title here.\n\n[card]\n.Plain title\nBody.\n====\n'
    )
    const text = errorsOf(messages).join('\n')
    expect(text).toContain('a card has no title')
    expect(text).toContain('a card title carries no link')
  })

  it('errors when an image does not match the card type, or is missing', async () => {
    const withImage = await run(
      '[cards,type=no-image]\n====\n[card]\n.link:https://example.com[A]\n--\nimage::a.png[A]\n--\n====\n'
    )
    expect(errorsOf(withImage.messages).join('\n')).toContain('this card has an image but the block is `type=no-image`')
    const missing = await run('[cards,type=image-square]\n====\n[card]\n.link:https://example.com[A]\nBody.\n====\n')
    expect(errorsOf(missing.messages).join('\n')).toContain('needs an `image::` of its own')
  })

  it('notices extra images (warn, not error) and errors on a non-paragraph body', async () => {
    const { messages } = await run(
      '[cards,type=image-square]\n====\n[card]\n.link:https://example.com[A]\n--\nimage::a.png[A]\nimage::b.png[B]\n\n* a list\n--\n====\n'
    )
    expect(messages.some((m) => m.severity === 'WARN' && m.text.includes('only the first is rendered'))).toBe(true)
    expect(errorsOf(messages).join('\n')).toContain('only paragraphs are supported')
  })
})
