// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it } from 'vitest'

import { extractGlobalFlags } from './global-flags.js'

describe('extractGlobalFlags', () => {
  it('recognises --json, --verbose and --no-color anywhere in argv', () => {
    expect(extractGlobalFlags(['doctor', '--json'])).toEqual({
      json: true,
      verbose: false,
      noColor: false,
      rest: ['doctor'],
    })
    expect(extractGlobalFlags(['--verbose', 'dev', '--port', '3000'])).toEqual({
      json: false,
      verbose: true,
      noColor: false,
      rest: ['dev', '--port', '3000'],
    })
    expect(extractGlobalFlags(['--no-color', 'doctor'])).toEqual({
      json: false,
      verbose: false,
      noColor: true,
      rest: ['doctor'],
    })
  })

  it('leaves ordinary command flags untouched', () => {
    const result = extractGlobalFlags(['new', 'my-site', '--dir', './x', '--yes'])
    expect(result.rest).toEqual(['new', 'my-site', '--dir', './x', '--yes'])
    expect(result.json).toBe(false)
  })

  it('--color re-enables colour after an earlier --no-color', () => {
    const result = extractGlobalFlags(['--no-color', 'doctor', '--color'])
    expect(result.noColor).toBe(false)
    expect(result.rest).toEqual(['doctor'])
  })

  it('returns no global flags set for a plain command', () => {
    expect(extractGlobalFlags(['build'])).toEqual({ json: false, verbose: false, noColor: false, rest: ['build'] })
  })
})
