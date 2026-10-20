// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { copyTemplate, exists, type TemplateValues } from './copy-template.js'

let base: string

const values: TemplateValues = {
  name: 'my-site',
  title: 'My Site',
  cliVersion: '1.2.3',
  pmName: 'npm',
  pmCacheName: 'npm',
  pmLockfile: 'package-lock.json',
  pmCiCmd: 'npm ci',
  pmSetupStepYaml: '',
}

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'docouture-cli-copy-template-')))
})

afterEach(() => {})

async function makeSrc(): Promise<string> {
  const src = join(base, 'src')
  await mkdir(join(src, 'nested'), { recursive: true })
  await writeFile(join(src, 'top.txt'), 'hello __DOCOUTURE_TITLE__', 'utf8')
  await writeFile(join(src, 'nested', 'inner.txt'), 'name: __DOCOUTURE_NAME__', 'utf8')
  return src
}

describe('copyTemplate', () => {
  it('copies files recursively and substitutes placeholders', async () => {
    const src = await makeSrc()
    const dest = join(base, 'dest')

    const written = await copyTemplate(src, dest, values)

    expect(written.sort()).toEqual([join(dest, 'nested', 'inner.txt'), join(dest, 'top.txt')].sort())

    expect(await readFile(join(dest, 'top.txt'), 'utf8')).toBe('hello My Site')
    expect(await readFile(join(dest, 'nested', 'inner.txt'), 'utf8')).toBe('name: my-site')
  })

  it('under dryRun, returns the same paths without writing anything to disk', async () => {
    const src = await makeSrc()
    const dest = join(base, 'dest-dry')

    const written = await copyTemplate(src, dest, values, { dryRun: true })

    expect(written.sort()).toEqual([join(dest, 'nested', 'inner.txt'), join(dest, 'top.txt')].sort())
    expect(await exists(dest)).toBe(false)
  })

  it('substitutes the whole site url line, active or as the commented hint', async () => {
    const src = join(base, 'src-url')
    await mkdir(src, { recursive: true })
    await writeFile(join(src, 'p.yml'), 'site:\n  # __DOCOUTURE_SITE_URL_LINE__\n  start: x\n', 'utf8')

    await copyTemplate(src, join(base, 'd1'), { ...values, siteUrlLine: '  url: https://a.io/r\n' })
    expect(await readFile(join(base, 'd1', 'p.yml'), 'utf8')).toBe('site:\n  url: https://a.io/r\n  start: x\n')

    await copyTemplate(src, join(base, 'd2'), { ...values, siteUrlLine: '  # url: https://<org>.github.io/<repo>\n' })
    expect(await readFile(join(base, 'd2', 'p.yml'), 'utf8')).toBe(
      'site:\n  # url: https://<org>.github.io/<repo>\n  start: x\n'
    )
  })
})
