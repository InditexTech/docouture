// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it } from 'vitest'

import { parseArgs } from './args.js'

describe('parseArgs', () => {
  it('collects positional arguments', () => {
    expect(parseArgs(['foo', 'bar']).positional).toEqual(['foo', 'bar'])
  })

  it('reads a flag followed by a value', () => {
    const { flags } = parseArgs(['--dir', './site'])
    expect(flags.dir).toBe('./site')
  })

  it('treats a flag at the end of argv as boolean true', () => {
    const { flags } = parseArgs(['--prerelease'])
    expect(flags.prerelease).toBe(true)
  })

  it('treats a flag immediately followed by another flag as boolean true', () => {
    const { flags } = parseArgs(['--prerelease', '--stable'])
    expect(flags.prerelease).toBe(true)
    expect(flags.stable).toBe(true)
  })

  it('mixes positionals and flags in any order', () => {
    const { positional, flags } = parseArgs(['version', '2.0.0', '--dir', 'site', '--prerelease'])
    expect(positional).toEqual(['version', '2.0.0'])
    expect(flags.dir).toBe('site')
    expect(flags.prerelease).toBe(true)
  })
})
