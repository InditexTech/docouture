// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { COMMANDS, runCompletion } from './completion.js'

let writeSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  writeSpy.mockRestore()
  errorSpy.mockRestore()
})

describe('runCompletion', () => {
  it('prints a bash completion script to stdout listing every command', () => {
    const code = runCompletion(['bash'])
    expect(code).toBe(0)
    const output = String(writeSpy.mock.calls[0]?.[0])
    expect(output).toContain('complete -F _docouture_completions docouture')
    for (const command of COMMANDS) expect(output).toContain(command)
  })

  it('prints a zsh completion script to stdout listing every command', () => {
    const code = runCompletion(['zsh'])
    expect(code).toBe(0)
    const output = String(writeSpy.mock.calls[0]?.[0])
    expect(output).toContain('#compdef docouture')
    for (const command of COMMANDS) expect(output).toContain(command)
  })

  it('fails with a usage message for an unsupported or missing shell', () => {
    expect(runCompletion([])).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('usage: docouture completion'))

    errorSpy.mockClear()
    expect(runCompletion(['fish'])).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('usage: docouture completion'))
  })
})
