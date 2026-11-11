// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { cliSkewMessage, readProjectCli } from './project-cli.js'

let root: string
let site: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'docouture-project-cli-'))
  site = join(root, 'docs')
  await mkdir(site, { recursive: true })
})

async function install(version: string, withRelease: boolean): Promise<void> {
  const dir = join(site, 'node_modules', '@inditextech', 'docouture-cli')
  await mkdir(join(dir, 'build', 'commands'), { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify({ version }))
  if (withRelease) await writeFile(join(dir, 'build', 'commands', 'release.js'), '')
}

describe('readProjectCli', () => {
  it('reads the installed version and release resolve support', async () => {
    await install('1.4.0', true)
    expect(await readProjectCli(site, root)).toEqual({ version: '1.4.0', hasReleaseResolve: true, from: 'installed' })
  })

  it('reports an installed CLI without release resolve', async () => {
    await install('1.3.2', false)
    expect(await readProjectCli(site, root)).toMatchObject({ version: '1.3.2', hasReleaseResolve: false })
  })

  it('falls back to an exact pin in package.json', async () => {
    await writeFile(
      join(site, 'package.json'),
      JSON.stringify({ devDependencies: { '@inditextech/docouture-cli': '1.3.2' } })
    )
    expect(await readProjectCli(site, root)).toEqual({ version: '1.3.2', hasReleaseResolve: null, from: 'declared' })
  })

  it('ignores a range it cannot compare', async () => {
    await writeFile(
      join(site, 'package.json'),
      JSON.stringify({ devDependencies: { '@inditextech/docouture-cli': '^1.3.2' } })
    )
    expect((await readProjectCli(site, root)).version).toBeNull()
  })

  it('returns nothing when the CLI is not a dependency', async () => {
    expect(await readProjectCli(site, root)).toEqual({ version: null, hasReleaseResolve: null, from: null })
  })
})

describe('cliSkewMessage', () => {
  it('is null when versions match or nothing is known', () => {
    expect(cliSkewMessage('1.4.0', { version: '1.4.0', hasReleaseResolve: true, from: 'installed' })).toBeNull()
    expect(cliSkewMessage('1.4.0', { version: null, hasReleaseResolve: null, from: null })).toBeNull()
  })

  it('names both versions on a skew', () => {
    const message = cliSkewMessage('1.4.0', { version: '1.3.2', hasReleaseResolve: false, from: 'installed' })
    expect(message).toContain('1.4.0')
    expect(message).toContain('1.3.2')
  })
})
