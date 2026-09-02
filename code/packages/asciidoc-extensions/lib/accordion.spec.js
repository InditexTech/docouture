// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { afterEach, describe, expect, it } from 'vitest'

const asciidoctor = require('@asciidoctor/core')
const registerAccordion = require('./accordion')

/**
 * @param {string} source
 * @param {{ logger?: { warn: (message: string) => void } }} [options]
 * @returns {Promise<string>}
 */
function convert(source, { logger } = {}) {
  const registry = asciidoctor.Extensions.create()
  registerAccordion(registry)
  if (logger) asciidoctor.LoggerManager.setLogger(logger)
  return /** @type {Promise<string>} */ (asciidoctor.convert(source, { extension_registry: registry, safe: 'safe' }))
}

describe('accordion block', () => {
  afterEach(() => {
    asciidoctor.LoggerManager.setLogger(asciidoctor.MemoryLogger.create())
  })

  it('wraps every [%collapsible] child in a role=group with the given aria-label', async () => {
    const html = await convert(`[accordion,aria-label="Frequently asked questions"]
--
.Question one
[%collapsible]
====
Answer one.
====

.Question two
[%collapsible]
====
Answer two.
====
--
`)
    expect(html).toContain('role="group" aria-label="Frequently asked questions"')
    expect(html).toContain('Question one')
    expect(html).toContain('Question two')
    // Independent mode by default — no shared `name=` attribute.
    expect(html).not.toContain('name=')
  })

  it('escapes a quote inside an authored aria-label', async () => {
    const html = await convert(`[accordion,aria-label="Say \\"hi\\""]
--
.Q
[%collapsible]
====
A.
====
--
`)
    expect(html).toContain('aria-label="Say &quot;hi&quot;"')
  })

  it('single-open shares one native <details name> across every child', async () => {
    const html = await convert(`[accordion%single-open,aria-label="FAQ"]
--
.Q1
[%collapsible]
====
A1.
====

.Q2
[%collapsible]
====
A2.
====
--
`)
    const names = [...html.matchAll(/<details name="([^"]+)"/g)].map((m) => m[1])
    expect(names).toHaveLength(2)
    expect(names[0]).toBe(names[1])
  })

  it('warns when a group has no [%collapsible] items in it', async () => {
    const logger = asciidoctor.MemoryLogger.create()
    const html = await convert(
      `[accordion,aria-label="Empty"]
--
Just a stray paragraph.
--
`,
      { logger }
    )
    expect(html).toContain('docouture-accordion-group')
    const messages = logger.getMessages().map((m) => m.getText()).join('\n')
    expect(messages).toContain('an accordion group with no `[%collapsible]` items in it')
  })

  it('warns when a group has no aria-label and no title', async () => {
    const logger = asciidoctor.MemoryLogger.create()
    await convert(
      `[accordion]
--
.Q
[%collapsible]
====
A.
====
--
`,
      { logger }
    )
    const messages = logger.getMessages().map((m) => m.getText()).join('\n')
    expect(messages).toContain('has no `aria-label=` and no title')
  })
})
