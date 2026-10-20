// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'

import { removeCheckLinks } from './check-links-removal.js'

const full = {
  scripts: { build: 'antora', 'check-links': 'node scripts/check-links.mjs' },
  devDependencies: { antora: '3.2.0', linkinator: '8.0.4' },
  docouture: { branching: 'trunk', checkLinks: { ignore: ['x'] } },
}

describe('removeCheckLinks', () => {
  it('removes script, config and linkinator, keeping the rest and the indent', () => {
    const r = removeCheckLinks(JSON.stringify(full, null, 4) + '\n')!
    const out = JSON.parse(r.content)
    expect(r.changed).toBe(true)
    expect(r.removed).toEqual(['scripts.check-links', 'docouture.checkLinks', 'devDependencies.linkinator'])
    expect(out.scripts).toEqual({ build: 'antora' })
    expect(out.devDependencies).toEqual({ antora: '3.2.0' })
    expect(out.docouture).toEqual({ branching: 'trunk' })
    expect(r.content).toContain('\n    "scripts"')
  })

  it('keeps linkinator when another script uses it', () => {
    const pkg = structuredClone(full)
    ;(pkg.scripts as Record<string, string>).lint = 'linkinator build'
    const r = removeCheckLinks(JSON.stringify(pkg))!
    expect(r.keptLinkinator).toBe(true)
    expect(JSON.parse(r.content).devDependencies.linkinator).toBe('8.0.4')
  })

  it('is a no-op on a clean package.json', () => {
    const text = JSON.stringify({ scripts: { build: 'antora' } }, null, 2) + '\n'
    const r = removeCheckLinks(text)!
    expect(r.changed).toBe(false)
    expect(r.content).toBe(text)
  })

  it('returns null on invalid JSON', () => {
    expect(removeCheckLinks('{nope')).toBeNull()
  })
})
