// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it } from 'vitest'

import { hasVersionLine, patchVersion, readVersion } from './antora-yml.js'

const SAMPLE = `name: example
title: Example
version: '1.0.0'
`

describe('readVersion', () => {
  it('reads the value of a top-level version line', () => {
    expect(readVersion(SAMPLE)).toBe("'1.0.0'")
  })

  it('returns null when there is no version line', () => {
    expect(readVersion('name: example\ntitle: Example\n')).toBeNull()
  })

  it('returns null when the version line has no value', () => {
    expect(readVersion('name: example\nversion:\n')).toBeNull()
  })
})

describe('hasVersionLine', () => {
  it('is true when a top-level version: line exists', () => {
    expect(hasVersionLine(SAMPLE)).toBe(true)
  })

  it('is false otherwise', () => {
    expect(hasVersionLine('name: example\n')).toBe(false)
  })

  it('does not match version: nested under another key', () => {
    // Only column-0 matches count — see antora-yml.ts's own header comment.
    expect(hasVersionLine('name: example\nasciidoc:\n  version: 1.0\n')).toBe(false)
  })
})

describe('patchVersion', () => {
  it('replaces the version value', () => {
    const patched = patchVersion(SAMPLE, { version: '2.0.0', prerelease: false })
    expect(readVersion(patched)).toBe('2.0.0')
  })

  it('throws when there is no version line to patch', () => {
    expect(() => patchVersion('name: example\n', { version: '1.0.0', prerelease: false })).toThrow(
      /no top-level 'version:' line found/
    )
  })

  it('inserts a prerelease line directly after version when turning it on', () => {
    const patched = patchVersion(SAMPLE, { version: 'next', prerelease: true })
    expect(patched).toContain('version: next\nprerelease: true')
  })

  it('flips an existing prerelease line to true', () => {
    const before = `${SAMPLE}prerelease: false\n`
    const patched = patchVersion(before, { version: '2.0.0', prerelease: true })
    expect(patched).toContain('prerelease: true')
    expect(patched).not.toContain('prerelease: false')
  })

  it('removes the prerelease line when turning it off', () => {
    const before = `${SAMPLE}prerelease: true\n`
    const patched = patchVersion(before, { version: '2.0.0', prerelease: false })
    expect(patched).not.toMatch(/^prerelease:/m)
  })

  it('is a no-op on prerelease when there was never a line and it stays off', () => {
    const patched = patchVersion(SAMPLE, { version: '2.0.0', prerelease: false })
    expect(patched).not.toMatch(/^prerelease:/m)
  })

  it('does not collapse unrelated blank lines when removing prerelease', () => {
    const before = `name: example\ntitle: Example\nversion: '1.0.0'\nprerelease: true\n\ndescription: foo\n`
    const patched = patchVersion(before, { version: '1.0.0', prerelease: false })
    expect(patched).toContain('\n\ndescription: foo')
    expect(patched).not.toMatch(/^prerelease:/m)
  })
})
