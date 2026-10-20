// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { readBranchingDeclaration, setBranching } from './package-branching.js'

async function fixture(docouture: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pkg-branching-'))
  const file = join(dir, 'package.json')
  await writeFile(file, `${JSON.stringify({ name: 'x', docouture, version: '1.0.0' }, null, 2)}\n`)
  return file
}

const read = async (file: string) => JSON.parse(await readFile(file, 'utf8'))

describe('setBranching', () => {
  it('adds prereleaseBranch right after branching for git-flow', async () => {
    const file = await fixture({ branching: 'trunk-based', publish: {} })
    expect(await setBranching(file, 'git-flow', 'develop')).toBe(true)
    const pkg = await read(file)
    expect(Object.keys(pkg.docouture)).toEqual(['branching', 'prereleaseBranch', 'publish'])
    expect(pkg.docouture.prereleaseBranch).toBe('develop')
  })

  it('corrects a stale prereleaseBranch', async () => {
    const file = await fixture({ branching: 'git-flow', prereleaseBranch: 'old', publish: {} })
    await setBranching(file, 'git-flow', 'develop')
    expect((await read(file)).docouture.prereleaseBranch).toBe('develop')
  })

  it('removes prereleaseBranch for trunk-based', async () => {
    const file = await fixture({ branching: 'git-flow', prereleaseBranch: 'develop', publish: {} })
    await setBranching(file, 'trunk-based')
    const pkg = await read(file)
    expect(pkg.docouture).toEqual({ branching: 'trunk-based', publish: {} })
  })

  it('inserts branching first when absent and keeps other keys and top-level order', async () => {
    const file = await fixture({ publish: {} })
    await setBranching(file, 'git-flow', 'develop')
    const pkg = await read(file)
    expect(Object.keys(pkg)).toEqual(['name', 'docouture', 'version'])
    expect(Object.keys(pkg.docouture)).toEqual(['branching', 'prereleaseBranch', 'publish'])
  })

  it('reports no change when already correct', async () => {
    const file = await fixture({ branching: 'trunk-based' })
    expect(await setBranching(file, 'trunk-based')).toBe(false)
  })
})

describe('readBranchingDeclaration', () => {
  it('reads both fields, null when absent', async () => {
    const file = await fixture({ branching: 'git-flow' })
    expect(await readBranchingDeclaration(file)).toEqual({ branching: 'git-flow', prereleaseBranch: null })
  })
})
