'use strict'

import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runVersion } from './version.js'

let dir: string
let errorSpy: ReturnType<typeof vi.spyOn>
let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pdocs-cli-version-'))
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
  logSpy.mockRestore()
})

async function writeAntoraYml(content: string): Promise<string> {
  const srcDir = join(dir, 'src')
  await mkdir(srcDir, { recursive: true })
  const file = join(srcDir, 'antora.yml')
  await writeFile(file, content, 'utf8')
  return file
}

describe('runVersion', () => {
  it('fails with usage when no value is given', async () => {
    const code = await runVersion([])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('usage: pdocs version'))
  })

  it('rejects --prerelease and --stable together', async () => {
    const code = await runVersion(['1.0.0', '--prerelease', '--stable'])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('mutually exclusive'))
  })

  it('fails when no antora.yml is found at the resolved location', async () => {
    const code = await runVersion(['1.0.0', '--dir', dir])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('no antora.yml found'))
  })

  it('patches version at src/antora.yml under --dir', async () => {
    const file = await writeAntoraYml("name: example\nversion: '0.1.0'\n")
    const code = await runVersion(['1.0.0', '--dir', dir])
    expect(code).toBe(0)
    const content = await readFile(file, 'utf8')
    expect(content).toContain('version: 1.0.0')
  })

  it('patches version at an explicit --file path', async () => {
    const file = join(dir, 'custom.yml')
    await writeFile(file, "name: example\nversion: '0.1.0'\n", 'utf8')
    const code = await runVersion(['2.0.0', '--file', file])
    expect(code).toBe(0)
    const content = await readFile(file, 'utf8')
    expect(content).toContain('version: 2.0.0')
  })

  it('sets prerelease: true when --prerelease is given', async () => {
    const file = await writeAntoraYml("name: example\nversion: '0.1.0'\n")
    const code = await runVersion(['next', '--dir', dir, '--prerelease'])
    expect(code).toBe(0)
    const content = await readFile(file, 'utf8')
    expect(content).toContain('prerelease: true')
  })

  it('reports an error when the file is not a valid component descriptor', async () => {
    const file = join(dir, 'src', 'antora.yml')
    await mkdir(join(dir, 'src'), { recursive: true })
    await writeFile(file, 'no version line here\n', 'utf8')
    const code = await runVersion(['1.0.0', '--dir', dir])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('does not look like an Antora component descriptor'))
  })
})
