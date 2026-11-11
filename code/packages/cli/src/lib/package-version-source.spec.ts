// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { readVersionSourceDeclaration, setVersionSource } from './package-version-source.js'

let file: string

async function write(docouture: Record<string, unknown> | undefined): Promise<void> {
  const pkg: Record<string, unknown> = { name: 'docs', version: '1.0.0' }
  if (docouture) pkg.docouture = docouture
  pkg.scripts = { build: 'x' }
  await writeFile(file, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
}

async function read(): Promise<{ docouture?: Record<string, unknown>; scripts?: unknown }> {
  return JSON.parse(await readFile(file, 'utf8'))
}

beforeEach(async () => {
  file = join(await mkdtemp(join(tmpdir(), 'docouture-version-source-')), 'package.json')
})

describe('readVersionSourceDeclaration', () => {
  it('treats an absent value as descriptor', async () => {
    await write({ branching: 'trunk-based' })
    expect(await readVersionSourceDeclaration(file)).toEqual({ raw: null, source: 'descriptor', prefix: null })
  })

  it('reads a valid source and prefix', async () => {
    await write({ versionSource: 'github-release', versionSourcePrefix: 'v' })
    expect(await readVersionSourceDeclaration(file)).toEqual({
      raw: 'github-release',
      source: 'github-release',
      prefix: 'v',
    })
  })

  it('flags an unknown value', async () => {
    await write({ versionSource: 'tag_bump' })
    expect(await readVersionSourceDeclaration(file)).toEqual({ raw: 'tag_bump', source: null, prefix: null })
  })

  it('handles a missing docouture block', async () => {
    await write(undefined)
    expect((await readVersionSourceDeclaration(file)).source).toBe('descriptor')
  })
})

describe('setVersionSource', () => {
  it('places the key after branching and prereleaseBranch, keeping other keys in order', async () => {
    await write({ branching: 'git-flow', prereleaseBranch: 'develop', other: 1 })
    expect(await setVersionSource(file, 'tag-bump')).toBe(true)
    const pkg = await read()
    expect(Object.keys(pkg.docouture!)).toEqual(['branching', 'prereleaseBranch', 'versionSource', 'other'])
    expect(pkg.docouture!.versionSource).toBe('tag-bump')
    expect(Object.keys(pkg)).toEqual(['name', 'version', 'docouture', 'scripts'])
  })

  it('adds the key to an empty block and creates the block when absent', async () => {
    await write(undefined)
    await setVersionSource(file, 'descriptor')
    expect((await read()).docouture).toEqual({ versionSource: 'descriptor' })
  })

  it('is idempotent', async () => {
    await write({ branching: 'trunk-based' })
    expect(await setVersionSource(file, 'descriptor')).toBe(true)
    expect(await setVersionSource(file, 'descriptor')).toBe(false)
  })

  it('writes the prefix only for github-release', async () => {
    await write({ branching: 'trunk-based' })
    await setVersionSource(file, 'github-release', 'docs-site@')
    expect((await read()).docouture).toMatchObject({
      versionSource: 'github-release',
      versionSourcePrefix: 'docs-site@',
    })
    await setVersionSource(file, 'tag-bump')
    expect((await read()).docouture).not.toHaveProperty('versionSourcePrefix')
  })

  it('keeps an existing prefix when switching to github-release again', async () => {
    await write({ versionSource: 'github-release', versionSourcePrefix: 'v' })
    expect(await setVersionSource(file, 'github-release')).toBe(false)
  })
})
