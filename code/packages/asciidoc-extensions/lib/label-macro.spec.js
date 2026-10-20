// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it } from 'vitest'

const asciidoctor = require('@asciidoctor/core')
const registerLabelMacro = require('./label-macro')

describe('label macro severities', () => {
  it('errors on an unknown variant', async () => {
    const logger = asciidoctor.MemoryLogger.create()
    asciidoctor.LoggerManager.setLogger(logger)
    const registry = asciidoctor.Extensions.create()
    registerLabelMacro(registry)
    await asciidoctor.convert('label:mauve[Hi]', { extension_registry: registry, safe: 'safe' })
    const messages = logger.getMessages()
    expect(messages).toHaveLength(1)
    expect(messages[0]?.getSeverity().toString()).toBe('ERROR')
    expect(messages[0]?.getText()).toContain('unknown IDS Label variant "mauve"')
  })
})
