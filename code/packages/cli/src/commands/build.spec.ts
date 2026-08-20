'use strict'

import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runBuild } from './build.js'

let base: string
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'pdocs-cli-build-cmd-'))
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
})

describe('runBuild', () => {
  it('fails when no package.json is found under --dir/docs', async () => {
    const code = await runBuild(['--dir', base])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('no package.json found'))
  })

  it("runs the site's own npm build script and forwards its exit code", async () => {
    await mkdir(join(base, 'docs'), { recursive: true })
    await writeFile(
      join(base, 'docs', 'package.json'),
      JSON.stringify({
        name: 'my-project-docs',
        scripts: { build: `node -e "require('fs').writeFileSync('built.txt', 'ok')"` },
      }),
      'utf8'
    )

    const code = await runBuild(['--dir', base])
    expect(code).toBe(0)
    expect(await readFile(join(base, 'docs', 'built.txt'), 'utf8')).toBe('ok')
  })

  it('surfaces a non-zero exit code from a failing build script', async () => {
    await mkdir(join(base, 'docs'), { recursive: true })
    await writeFile(
      join(base, 'docs', 'package.json'),
      JSON.stringify({ name: 'my-project-docs', scripts: { build: 'node -e "process.exit(3)"' } }),
      'utf8'
    )

    const code = await runBuild(['--dir', base])
    expect(code).toBe(3)
  })
})
