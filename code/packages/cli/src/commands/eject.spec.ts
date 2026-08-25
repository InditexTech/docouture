'use strict'

import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runEject } from './eject.js'

let base: string
let siteRoot: string
let errorSpy: ReturnType<typeof vi.spyOn>
let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'pdocs-cli-eject-cmd-'))
  siteRoot = join(base, 'docs')
  await mkdir(siteRoot, { recursive: true })
  await writeFile(join(siteRoot, 'package.json'), JSON.stringify({ name: 'my-project-docs' }))
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
  logSpy.mockRestore()
})

describe('runEject', () => {
  it('fails when no target is given', async () => {
    const code = await runEject(['--dir', base])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('usage: pdocs eject'))
  })

  it('fails on an unsupported target', async () => {
    const code = await runEject(['not-a-real-target', '--dir', base])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('usage: pdocs eject'))
  })

  it('fails when no package.json is found under --dir/docs', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'pdocs-cli-eject-cmd-empty-'))
    const code = await runEject(['kroki', '--dir', empty])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('no package.json found'))
  })

  it('fails with an actionable message when the package resource cannot be resolved', async () => {
    const resolveBundledComposeFile = vi.fn(() => {
      throw new Error('Cannot find module')
    })

    const code = await runEject(['kroki', '--dir', base], { resolveBundledComposeFile })

    expect(code).toBe(1)
    expect(resolveBundledComposeFile).toHaveBeenCalledWith(join(siteRoot, 'package.json'))
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('could not find resources/kroki-compose.yml'))
  })

  it('copies the bundled file to docs/kroki-compose.yml', async () => {
    const sourceFile = join(base, 'fixture-kroki-compose.yml')
    await writeFile(sourceFile, 'services:\n  kroki:\n    image: yuzutech/kroki:latest\n')

    const code = await runEject(['kroki', '--dir', base], { resolveBundledComposeFile: () => sourceFile })

    expect(code).toBe(0)
    const written = await readFile(join(siteRoot, 'kroki-compose.yml'), 'utf8')
    expect(written).toContain('yuzutech/kroki:latest')
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('wrote'))
  })

  it('refuses to overwrite an existing docs/kroki-compose.yml', async () => {
    await writeFile(join(siteRoot, 'kroki-compose.yml'), 'already here')
    const sourceFile = join(base, 'fixture-kroki-compose.yml')
    await writeFile(sourceFile, 'services: {}')

    const code = await runEject(['kroki', '--dir', base], { resolveBundledComposeFile: () => sourceFile })

    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('already exists'))
    expect(await readFile(join(siteRoot, 'kroki-compose.yml'), 'utf8')).toBe('already here')
  })

  it('resolves the real, on-disk bundled resource when no override is injected', async () => {
    // End-to-end sanity check of the actual createRequire-based resolver,
    // same shape as publish.spec.ts's own equivalent test — a real
    // @inditextech/pdocs-antora-extensions install under the site's own
    // node_modules, not a fixture package name.
    const pkgDir = join(siteRoot, 'node_modules', '@inditextech', 'pdocs-antora-extensions')
    await mkdir(join(pkgDir, 'resources'), { recursive: true })
    await writeFile(join(pkgDir, 'package.json'), JSON.stringify({ name: 'fixture', main: 'index.js' }))
    await writeFile(join(pkgDir, 'index.js'), 'module.exports = {}')
    await writeFile(join(pkgDir, 'resources', 'kroki-compose.yml'), 'services:\n  kroki: {}\n')

    const code = await runEject(['kroki', '--dir', base])

    expect(code).toBe(0)
    const written = await readFile(join(siteRoot, 'kroki-compose.yml'), 'utf8')
    expect(written).toContain('kroki: {}')
  })
})
