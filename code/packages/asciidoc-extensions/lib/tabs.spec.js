// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it } from 'vitest'

const asciidoctor = require('@asciidoctor/core')
const registerTabs = require('./tabs')

async function errors(source) {
  const logger = asciidoctor.MemoryLogger.create()
  asciidoctor.LoggerManager.setLogger(logger)
  const registry = asciidoctor.Extensions.create()
  registerTabs(registry)
  await asciidoctor.convert(source, { extension_registry: registry, safe: 'safe' })
  return logger
    .getMessages()
    .filter((m) => m.getSeverity().toString() === 'ERROR')
    .map((m) => m.getText())
    .join('\n')
}

describe('tabs block severities', () => {
  it('errors on a tab with no label', async () => {
    const text = await errors('[tabs]\n--\n[tab]\n====\nOne\n====\n\n[tab,label="B"]\n====\nTwo\n====\n--\n')
    expect(text).toContain('a tab has no `label=`')
  })

  it('errors on a duplicate label and on a case-only duplicate', async () => {
    const text = await errors(
      '[tabs]\n--\n[tab,label="npm"]\n====\nOne\n====\n\n[tab,label="npm"]\n====\nTwo\n====\n\n[tab,label="NPM"]\n====\nThree\n====\n--\n'
    )
    expect(text).toContain('already has a tab labelled "npm"')
    expect(text).toContain('differ only by case')
  })

  it('errors when a tab set has fewer than two tabs', async () => {
    const text = await errors('[tabs]\n--\n[tab,label="Only"]\n====\nOne\n====\n--\n')
    expect(text).toContain('a tab set needs at least two')
  })
})
