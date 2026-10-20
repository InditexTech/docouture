// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it } from 'vitest'

const asciidoctor = require('@asciidoctor/core')
const registerNowrapCols = require('./nowrap-cols')

describe('nowrap-cols severities', () => {
  it('errors on an invalid column token', async () => {
    const logger = asciidoctor.MemoryLogger.create()
    asciidoctor.LoggerManager.setLogger(logger)
    const registry = asciidoctor.Extensions.create()
    registerNowrapCols(registry)
    await asciidoctor.convert('[cols="1,1",nowrap-cols="*"]\n|===\n|a |b\n|===\n', {
      extension_registry: registry,
      safe: 'safe',
    })
    const messages = logger.getMessages()
    expect(messages).toHaveLength(1)
    expect(messages[0]?.getSeverity().toString()).toBe('ERROR')
    expect(messages[0]?.getText()).toContain('ignoring invalid column "*"')
  })
})
