// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it } from 'vitest'

const asciidoctor = require('@asciidoctor/core')
const registerKroki = require('./kroki')

describe('kroki block severities', () => {
  it('notices (warn, not error) when no prewarmed render exists, and falls back to source', async () => {
    const logger = asciidoctor.MemoryLogger.create()
    asciidoctor.LoggerManager.setLogger(logger)
    const registry = asciidoctor.Extensions.create()
    registerKroki(registry)
    await asciidoctor.convert('[mermaid]\n....\ngraph TD; A-->B\n....\n', {
      extension_registry: registry,
      safe: 'safe',
      attributes: { 'kroki-enabled': 'true' },
    })
    const messages = logger.getMessages()
    expect(messages.length).toBeGreaterThan(0)
    expect(messages.every((m) => m.getSeverity().toString() === 'WARN')).toBe(true)
  })
})
