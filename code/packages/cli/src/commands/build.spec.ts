'use strict'

import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runBuild } from './build.js'

let base: string
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'docouture-cli-build-cmd-'))
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
        // The trailing `--` matters here, unlike a real `antora` build
        // script: without it, `node -e` itself parses the
        // `--log-level=info` runBuild now always forwards (see
        // antora-log.ts) as one of *node's own* CLI flags rather than a
        // script argument, and fails with "bad option" before the eval
        // body ever runs. A real `antora` binary parses `--log-level`
        // itself just fine either way.
        scripts: { build: `node -e "require('fs').writeFileSync('built.txt', 'ok')" --` },
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
      JSON.stringify({ name: 'my-project-docs', scripts: { build: 'node -e "process.exit(3)" --' } }),
      'utf8'
    )

    const code = await runBuild(['--dir', base])
    expect(code).toBe(3)
  })

  it('forwards --log-level=info so docouture-* extension logs are actually emitted (GH-44 follow-up)', async () => {
    await mkdir(join(base, 'docs'), { recursive: true })
    await writeFile(
      join(base, 'docs', 'package.json'),
      JSON.stringify({
        name: 'my-project-docs',
        scripts: {
          build: `node -e "require('fs').writeFileSync('argv.json', JSON.stringify(process.argv.slice(1)))" --`,
        },
      }),
      'utf8'
    )

    await runBuild(['--dir', base])
    const argv: string[] = JSON.parse(await readFile(join(base, 'docs', 'argv.json'), 'utf8'))
    expect(argv).toContain('--log-level=info')
  })
})
