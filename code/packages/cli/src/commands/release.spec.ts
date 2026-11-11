// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runRelease } from './release.js'

let dir: string
let errorSpy: ReturnType<typeof vi.spyOn>
let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'docouture-cli-release-'))
  await mkdir(join(dir, 'docs'), { recursive: true })
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
  logSpy.mockRestore()
})

const out = () => logSpy.mock.calls.map((c: unknown[]) => String(c[0]))

describe('runRelease resolve', () => {
  it('prints key=value lines from the descriptor', async () => {
    await writeFile(join(dir, 'docs', '.release-version'), '1.2.0\n')
    expect(await runRelease(['resolve', '--mode', 'versioned', '--dir', dir])).toBe(0)
    expect(out()).toEqual([
      'version=1.2.0',
      'tag=docs/v1.2.0',
      'source=docs/.release-version',
      'version_source=descriptor',
      'uses_descriptor=true',
    ])
  })

  it('prefers --version', async () => {
    await writeFile(join(dir, 'docs', '.release-version'), '1.2.0\n')
    expect(await runRelease(['resolve', '--mode', 'versioned', '--version', '2.0.0', '--dir', dir])).toBe(0)
    expect(out()[0]).toBe('version=2.0.0')
  })

  it('reports stable for standalone', async () => {
    expect(await runRelease(['resolve', '--mode', 'standalone', '--dir', dir])).toBe(0)
    expect(out()).toContain('tag=docs/stable')
    expect(out()).toContain('uses_descriptor=false')
  })

  it('warns and ignores a mismatched standalone version', async () => {
    expect(await runRelease(['resolve', '--mode', 'standalone', '--version', '1.2.3', '--dir', dir])).toBe(0)
    expect(errorSpy.mock.calls.flat().join('\n')).toContain('ignoring provided version')
    expect(out()).toContain('version=stable')
  })

  it('fails on a missing file', async () => {
    expect(await runRelease(['resolve', '--mode', 'versioned', '--dir', dir])).toBe(1)
    expect(errorSpy.mock.calls.flat().join('\n')).toContain('missing')
    expect(out()).toEqual([])
  })

  it('fails on an invalid version', async () => {
    await writeFile(join(dir, 'docs', '.release-version'), 'v1.2\n')
    expect(await runRelease(['resolve', '--mode', 'versioned', '--dir', dir])).toBe(1)
  })

  it('--report exits 0 with the error kind and value', async () => {
    await writeFile(join(dir, 'docs', '.release-version'), '1.2\n')
    expect(await runRelease(['resolve', '--mode', 'versioned', '--report', '--dir', dir])).toBe(0)
    expect(out()).toContain('error=invalid')
    expect(out()).toContain('error_value=1.2')
  })

  it('--report on a missing file reports missing', async () => {
    expect(await runRelease(['resolve', '--mode', 'versioned', '--report', '--dir', dir])).toBe(0)
    expect(out()).toContain('error=missing')
  })

  it('rejects a bad mode and an unknown subcommand', async () => {
    expect(await runRelease(['resolve', '--mode', 'x'])).toBe(1)
    expect(await runRelease(['nope'])).toBe(1)
  })

  describe('version sources', () => {
    async function writeSource(docouture: Record<string, unknown>): Promise<void> {
      await writeFile(join(dir, 'docs', 'package.json'), JSON.stringify({ name: 'docs', docouture }))
    }

    function git(...args: string[]): void {
      execFileSync('git', args, { cwd: dir, stdio: 'ignore' }) // NOSONAR
    }

    it('fails naming the valid values on an unknown source', async () => {
      await writeSource({ versionSource: 'tag_bump' })
      expect(await runRelease(['resolve', '--mode', 'versioned', '--dir', dir])).toBe(1)
      const message = errorSpy.mock.calls.flat().join('\n')
      expect(message).toContain('tag_bump')
      expect(message).toContain('descriptor, github-release, tag-bump')
    })

    it('resolves github-release from the release tag, stripping the prefix', async () => {
      await writeSource({ versionSource: 'github-release', versionSourcePrefix: 'docs-site@' })
      const argv = [
        'resolve',
        '--mode',
        'versioned',
        '--event',
        'release',
        '--release-tag',
        'docs-site@1.4.0',
        '--dir',
        dir,
      ]
      expect(await runRelease(argv)).toBe(0)
      expect(out()).toContain('version=1.4.0')
      expect(out()).toContain('version_source=github-release')
      expect(out()).toContain('uses_descriptor=false')
    })

    it('fails a docs/release pull request under github-release', async () => {
      await writeSource({ versionSource: 'github-release' })
      const argv = [
        'resolve',
        '--mode',
        'versioned',
        '--event',
        'pull_request',
        '--labels',
        'docs/release',
        '--dir',
        dir,
      ]
      expect(await runRelease(argv)).toBe(1)
      expect(errorSpy.mock.calls.flat().join('\n')).toContain('github-release')
    })

    it('bumps tag-bump from real git tags and the label list', async () => {
      await writeSource({ versionSource: 'tag-bump' })
      git('init', '-q')
      git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-qm', 'x')
      for (const tag of ['docs/v1.2.3', 'docs/v1.1.0', 'docs/stable']) git('tag', tag)
      const argv = ['resolve', '--mode', 'versioned', '--labels', 'docs/release, docs/release-minor', '--dir', dir]
      expect(await runRelease(argv)).toBe(0)
      expect(out()).toContain('version=1.3.0')
      expect(out()).toContain('tag=docs/v1.3.0')
      expect(out()).toContain('version_source=tag-bump')
      expect(out()).toContain('uses_descriptor=false')
    })

    it('uses injected --tags instead of listing git tags', async () => {
      await writeSource({ versionSource: 'tag-bump' })
      const argv = ['resolve', '--mode', 'versioned', '--tags', 'docs/v2.0.0,docs/v1.9.0\ndocs/stable', '--dir', dir]
      expect(await runRelease(argv)).toBe(0)
      expect(out()).toContain('version=2.0.1')
    })

    it('fails the first tag-bump release without a version', async () => {
      await writeSource({ versionSource: 'tag-bump' })
      git('init', '-q')
      expect(await runRelease(['resolve', '--mode', 'versioned', '--dir', dir])).toBe(1)
      expect(errorSpy.mock.calls.flat().join('\n')).toContain('explicit version')
    })

    it('does not read the descriptor under tag-bump', async () => {
      await writeSource({ versionSource: 'tag-bump' })
      await writeFile(join(dir, 'docs', '.release-version'), '9.9.9\n')
      git('init', '-q')
      expect(await runRelease(['resolve', '--mode', 'versioned', '--version', '2.0.0', '--dir', dir])).toBe(0)
      expect(out()).toContain('version=2.0.0')
    })
  })
})
