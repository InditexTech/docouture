'use strict'

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runChangelog } from './changelog.js'

let dir: string
let cwdSpy: ReturnType<typeof vi.spyOn>
let stdoutSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'docouture-tooling-changelog-'))
  cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir)
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(async () => {
  cwdSpy.mockRestore()
  stdoutSpy.mockRestore()
  errorSpy.mockRestore()
  await rm(dir, { recursive: true, force: true })
})

describe('runChangelog', () => {
  it('prints only the Unreleased section', async () => {
    await writeFile(
      join(dir, 'CHANGELOG.md'),
      [
        '# Changelog',
        '',
        '## [Unreleased]',
        '',
        '- added a thing',
        '',
        '## [0.1.0] - 2024-01-01',
        '',
        '- old entry',
        '',
      ].join('\n')
    )
    const code = await runChangelog([])
    expect(code).toBe(0)
    const printed = String(stdoutSpy.mock.calls[0]![0])
    expect(printed).toContain('added a thing')
    expect(printed).not.toContain('old entry')
  })

  it('fails when there is no Unreleased section', async () => {
    await writeFile(join(dir, 'CHANGELOG.md'), '# Changelog\n\n## [0.1.0] - 2024-01-01\n')
    const code = await runChangelog([])
    expect(code).toBe(1)
  })
})
