'use strict'

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runPublish } from './publish.js'

let base: string
let siteRoot: string
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'pdocs-cli-publish-cmd-'))
  siteRoot = join(base, 'docs')
  await mkdir(join(siteRoot, 'build', 'site'), { recursive: true })
  await writeFile(join(siteRoot, 'package.json'), JSON.stringify({ name: 'my-project-docs' }))
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
})

describe('runPublish', () => {
  it('fails when no target is given', async () => {
    const code = await runPublish(['--dir', base])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('usage: pdocs publish'))
  })

  it('fails when no package.json is found under --dir/docs', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'pdocs-cli-publish-cmd-empty-'))
    const code = await runPublish(['gh-pages', '--dir', empty])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('no package.json found'))
  })

  it('fails with an actionable message when the driver cannot be loaded', async () => {
    const loadDriver = vi.fn(() => {
      throw new Error('Cannot find module')
    })

    const code = await runPublish(['gh-pages', '--dir', base], { loadDriver })

    expect(code).toBe(1)
    expect(loadDriver).toHaveBeenCalledWith(join(siteRoot, 'package.json'), '@inditextech/pdocs-publish-gh-pages')
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("could not load publish driver '@inditextech/pdocs-publish-gh-pages'")
    )
  })

  it('fails when the site has not been built yet', async () => {
    const unbuilt = await mkdtemp(join(tmpdir(), 'pdocs-cli-publish-cmd-unbuilt-'))
    await mkdir(join(unbuilt, 'docs'), { recursive: true })
    await writeFile(join(unbuilt, 'docs', 'package.json'), JSON.stringify({ name: 'x' }))
    const driver = vi.fn().mockResolvedValue(true)

    const code = await runPublish(['gh-pages', '--dir', unbuilt], { loadDriver: () => driver })

    expect(code).toBe(1)
    expect(driver).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("run 'pdocs build' first"))
  })

  it('resolves and calls the driver with the built site directory', async () => {
    const driver = vi.fn().mockResolvedValue(true)

    const code = await runPublish(['gh-pages', '--dir', base], { loadDriver: () => driver })

    expect(code).toBe(0)
    expect(driver).toHaveBeenCalledTimes(1)
    expect(driver.mock.calls[0]?.[0]).toBe(join(siteRoot, 'build', 'site'))
  })

  it("merges docs/package.json's pdocs.publish.<target> config under CLI flags", async () => {
    await writeFile(
      join(siteRoot, 'package.json'),
      JSON.stringify({
        name: 'my-project-docs',
        pdocs: { publish: { 'gh-pages': { branch: 'from-config', message: 'from-config' } } },
      })
    )
    const driver = vi.fn().mockResolvedValue(true)

    await runPublish(['gh-pages', '--dir', base, '--message', 'from-flag'], { loadDriver: () => driver })

    const options = driver.mock.calls[0]?.[1]
    expect(options.branch).toBe('from-config')
    expect(options.message).toBe('from-flag')
  })

  it('combines --user-name/--user-email into a nested user option', async () => {
    const driver = vi.fn().mockResolvedValue(true)

    await runPublish(['gh-pages', '--dir', base, '--user-name', 'Docs Bot', '--user-email', 'bot@example.com'], {
      loadDriver: () => driver,
    })

    const options = driver.mock.calls[0]?.[1]
    expect(options.user).toEqual({ name: 'Docs Bot', email: 'bot@example.com' })
  })

  it('reports a failing exit code when the driver reports it did not publish', async () => {
    const driver = vi.fn().mockResolvedValue(false)

    const code = await runPublish(['gh-pages', '--dir', base], { loadDriver: () => driver })

    expect(code).toBe(1)
  })

  it('surfaces a thrown driver error as a failing exit code', async () => {
    const driver = vi.fn().mockRejectedValue(new Error('push rejected'))

    const code = await runPublish(['gh-pages', '--dir', base], { loadDriver: () => driver })

    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('push rejected'))
  })

  it('reads output.dir from antora-playbook.yml instead of assuming build/site', async () => {
    await mkdir(join(siteRoot, 'dist'), { recursive: true })
    await writeFile(join(siteRoot, 'antora-playbook.yml'), 'site:\n  title: X\noutput:\n  dir: dist\n')
    const driver = vi.fn().mockResolvedValue(true)

    const code = await runPublish(['gh-pages', '--dir', base], { loadDriver: () => driver })

    expect(code).toBe(0)
    expect(driver.mock.calls[0]?.[0]).toBe(join(siteRoot, 'dist'))
  })

  it('resolves a real, on-disk driver package when no loadDriver is injected', async () => {
    // End-to-end sanity check of the actual createRequire-based resolver —
    // every other test injects loadDriver to sidestep a vitest quirk where
    // a bare require() of a name that ALSO happens to be a real published
    // dependency of this monorepo (e.g. '@inditextech/pdocs-publish-gh-pages'
    // itself) can resolve to that real package regardless of the `from`
    // path, instead of failing as it would under plain Node. A name with no
    // real counterpart avoids that entirely, so this exercises the genuine
    // node_modules resolution path.
    const driverDir = join(siteRoot, 'node_modules', '@inditextech', 'pdocs-publish-fixture-only-target')
    await mkdir(driverDir, { recursive: true })
    await writeFile(join(driverDir, 'package.json'), JSON.stringify({ name: 'fixture', main: 'index.js' }))
    await writeFile(
      join(driverDir, 'index.js'),
      'module.exports = async function (dir, options) { return { dir, options } }'
    )

    const code = await runPublish(['fixture-only-target', '--dir', base])

    expect(code).toBe(0)
  })
})
