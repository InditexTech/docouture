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
  base = await realpath(await mkdtemp(join(tmpdir(), 'pdocs-cli-copy-template-')))
})

afterEach(() => {})

async function makeSrc(): Promise<string> {
  const src = join(base, 'src')
  await mkdir(join(src, 'nested'), { recursive: true })
  await writeFile(join(src, 'top.txt'), 'hello __PDOCS_TITLE__', 'utf8')
  await writeFile(join(src, 'nested', 'inner.txt'), 'name: __PDOCS_NAME__', 'utf8')
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
})
