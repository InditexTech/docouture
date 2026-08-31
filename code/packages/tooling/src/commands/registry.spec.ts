// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it, vi } from 'vitest'

import { runRegistry } from './registry.js'

describe('runRegistry', () => {
  it('rejects an unknown subcommand', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const code = await runRegistry(['stop'])
    expect(code).toBe(1)
    errorSpy.mockRestore()
  })

  it('rejects no subcommand at all', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const code = await runRegistry([])
    expect(code).toBe(1)
    errorSpy.mockRestore()
  })
})
