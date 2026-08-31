// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it } from 'vitest'

import { extractGlobalFlags } from './global-flags.js'

describe('extractGlobalFlags', () => {
  it('recognises flags before the command', () => {
    expect(extractGlobalFlags(['--json', 'doctor'])).toEqual({
      json: true,
      verbose: false,
      noColor: false,
      rest: ['doctor'],
    })
  })

  it('recognises flags after the command', () => {
    expect(extractGlobalFlags(['doctor', '--verbose'])).toEqual({
      json: false,
      verbose: true,
      noColor: false,
      rest: ['doctor'],
    })
  })

  it('lets --color override an earlier --no-color', () => {
    expect(extractGlobalFlags(['--no-color', '--color', 'doctor']).noColor).toBe(false)
  })

  it('leaves unrelated args untouched', () => {
    expect(extractGlobalFlags(['bump', 'patch']).rest).toEqual(['bump', 'patch'])
  })
})
