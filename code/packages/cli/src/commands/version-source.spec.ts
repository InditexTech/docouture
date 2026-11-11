// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { exists } from '../lib/copy-template.js'
import { runVersionSource } from './version-source.js'

let dir: string
let errorSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>
let logSpy: ReturnType<typeof vi.spyOn>

function git(...args: string[]): void {
  execFileSync('git', args, { cwd: dir, stdio: 'ignore' }) // NOSONAR
}

async function scaffold(
  options: { mode?: 'versioned' | 'standalone'; docouture?: Record<string, unknown>; descriptor?: string } = {}
) {
  const { mode = 'versioned', docouture = { branching: 'trunk-based' }, descriptor } = options
  await mkdir(join(dir, 'docs'), { recursive: true })
  await writeFile(
    join(dir, 'docs', 'antora-playbook.yml'),
    `content:\n  sources:\n    - tags: ['${mode === 'versioned' ? 'docs/v*' : 'docs/stable'}']\n`
  )
  await writeFile(join(dir, 'docs', 'package.json'), `${JSON.stringify({ name: 'docs', docouture }, null, 2)}\n`)
  if (descriptor !== undefined) await writeFile(join(dir, 'docs', '.release-version'), `${descriptor}\n`)
}

async function pkg(): Promise<{ docouture: Record<string, unknown> }> {
  return JSON.parse(await readFile(join(dir, 'docs', 'package.json'), 'utf8'))
}

const output = (spy: ReturnType<typeof vi.spyOn>): string => spy.mock.calls.flat().join('\n')

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'docouture-cli-version-source-'))
  git('init', '-q')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-qm', 'x')
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
  warnSpy.mockRestore()
  logSpy.mockRestore()
})

describe('runVersionSource', () => {
  it('prints the current source when given no argument', async () => {
    await scaffold({ docouture: { branching: 'trunk-based', versionSource: 'tag-bump' } })
    expect(await runVersionSource(['--dir', dir])).toBe(0)
    expect(output(logSpy)).toContain('version source: tag-bump')
  })

  it('fails naming the valid values when the declared source is unknown', async () => {
    await scaffold({ docouture: { branching: 'trunk-based', versionSource: 'tag_bump' } })
    expect(await runVersionSource(['--dir', dir])).toBe(1)
    expect(output(errorSpy)).toContain('descriptor, github-release, tag-bump')
  })

  it('refuses a standalone site', async () => {
    await scaffold({ mode: 'standalone' })
    expect(await runVersionSource(['tag-bump', '--dir', dir])).toBe(1)
    expect(output(errorSpy)).toContain('standalone')
    expect((await pkg()).docouture).not.toHaveProperty('versionSource')
  })

  it('rejects an unknown source and a bad --version', async () => {
    await scaffold()
    expect(await runVersionSource(['tag_bump', '--dir', dir])).toBe(1)
    expect(await runVersionSource(['descriptor', '--version', 'v1', '--dir', dir])).toBe(1)
  })

  it('switches to tag-bump: removes the file, warns about the pending version, prints the labels', async () => {
    await scaffold({ descriptor: '1.3.0' })
    expect(await runVersionSource(['tag-bump', '--dir', dir])).toBe(0)
    expect((await pkg()).docouture.versionSource).toBe('tag-bump')
    expect(await exists(join(dir, 'docs', '.release-version'))).toBe(false)
    expect(output(warnSpy)).toContain("pending version '1.3.0'")
    expect(output(logSpy)).toContain('gh label create docs/release-minor')
    expect(output(logSpy)).toContain('gh label create docs/release-major')
  })

  it('does not warn when the removed file is empty', async () => {
    await scaffold({ descriptor: '' })
    await runVersionSource(['github-release', '--dir', dir])
    expect(output(warnSpy)).toBe('')
  })

  it('switches back to descriptor, seeding the next patch of the latest tag', async () => {
    await scaffold({ docouture: { branching: 'trunk-based', versionSource: 'tag-bump' } })
    git('tag', 'docs/v1.2.4')
    git('tag', 'docs/v1.2.0')
    expect(await runVersionSource(['descriptor', '--dir', dir])).toBe(0)
    expect((await readFile(join(dir, 'docs', '.release-version'), 'utf8')).trim()).toBe('1.2.5')
  })

  it('seeds 0.1.0 with no tags and honours --version', async () => {
    await scaffold({ docouture: { branching: 'trunk-based', versionSource: 'tag-bump' } })
    await runVersionSource(['descriptor', '--dir', dir])
    expect((await readFile(join(dir, 'docs', '.release-version'), 'utf8')).trim()).toBe('0.1.0')
    await runVersionSource(['descriptor', '--version', '4.0.0', '--dir', dir])
    expect((await readFile(join(dir, 'docs', '.release-version'), 'utf8')).trim()).toBe('4.0.0')
  })

  it('sets the github-release prefix and only for that source', async () => {
    await scaffold()
    expect(await runVersionSource(['github-release', '--prefix', 'docs-site@', '--dir', dir])).toBe(0)
    expect((await pkg()).docouture).toMatchObject({
      versionSource: 'github-release',
      versionSourcePrefix: 'docs-site@',
    })
    expect(await runVersionSource(['tag-bump', '--prefix', 'x', '--dir', dir])).toBe(1)
  })

  it('--dry-run writes nothing and lists the plan', async () => {
    await scaffold({ descriptor: '1.3.0' })
    expect(await runVersionSource(['tag-bump', '--dry-run', '--dir', dir])).toBe(0)
    expect(output(logSpy)).toContain('would:')
    expect(output(logSpy)).toContain('remove docs/.release-version')
    expect((await pkg()).docouture).not.toHaveProperty('versionSource')
    expect(await exists(join(dir, 'docs', '.release-version'))).toBe(true)
  })

  it('is idempotent', async () => {
    await scaffold({ docouture: { branching: 'trunk-based', versionSource: 'descriptor' }, descriptor: '1.0.0' })
    expect(await runVersionSource(['descriptor', '--dir', dir])).toBe(0)
    expect(output(logSpy)).toContain('nothing to do')
    await runVersionSource(['tag-bump', '--dir', dir])
    logSpy.mockClear()
    expect(await runVersionSource(['tag-bump', '--dir', dir])).toBe(0)
    expect(output(logSpy)).toContain('nothing to do')
  })
})
