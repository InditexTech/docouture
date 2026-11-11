// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it } from 'vitest'

import { bumpVersion, compareSemver, highestSemver, parseSemver } from './semver.js'

describe('compareSemver', () => {
  // The ordering example from semver.org section 11, in ascending order.
  const ascending = [
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-alpha.beta',
    '1.0.0-beta',
    '1.0.0-beta.2',
    '1.0.0-beta.11',
    '1.0.0-rc.1',
    '1.0.0',
    '1.0.1',
    '1.1.0',
    '2.0.0',
    '10.0.0',
  ]

  it('orders the SemVer spec example ascending', () => {
    for (let i = 0; i < ascending.length - 1; i++) {
      expect(compareSemver(ascending[i]!, ascending[i + 1]!)).toBe(-1)
      expect(compareSemver(ascending[i + 1]!, ascending[i]!)).toBe(1)
    }
  })

  it('ignores build metadata', () => {
    expect(compareSemver('1.2.3+a', '1.2.3+b')).toBe(0)
  })

  it('throws on invalid input', () => {
    expect(() => compareSemver('v1.2.3', '1.2.3')).toThrow()
  })
})

describe('highestSemver', () => {
  it('picks the highest, ignoring invalid entries', () => {
    expect(highestSemver(['1.2.0-rc.1', '1.1.9', 'junk', '1.2.0-beta'])).toBe('1.2.0-rc.1')
  })

  it('returns null when nothing valid', () => {
    expect(highestSemver([])).toBeNull()
    expect(highestSemver(['x'])).toBeNull()
  })
})

describe('bumpVersion', () => {
  // Expected values are semver.inc's own results.
  it.each([
    ['1.2.3', 'patch', '1.2.4'],
    ['1.2.3', 'minor', '1.3.0'],
    ['1.2.3', 'major', '2.0.0'],
    ['1.2.0-rc.1', 'patch', '1.2.0'],
    ['1.2.3-rc.1', 'patch', '1.2.3'],
    ['1.2.0-rc.1', 'minor', '1.2.0'],
    ['1.2.3-rc.1', 'minor', '1.3.0'],
    ['2.0.0-rc.1', 'major', '2.0.0'],
    ['2.1.0-rc.1', 'major', '3.0.0'],
    ['1.2.3+build.5', 'patch', '1.2.4'],
  ] as const)('%s %s -> %s', (version, level, expected) => {
    expect(bumpVersion(version, level)).toBe(expected)
  })

  it('throws on invalid input', () => {
    expect(() => bumpVersion('1.2', 'patch')).toThrow()
  })
})

describe('parseSemver', () => {
  it('parses prerelease identifiers', () => {
    expect(parseSemver('1.2.3-beta.2+x')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: ['beta', '2'] })
  })
})
