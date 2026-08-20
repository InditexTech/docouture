'use strict'

import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Imports the BUILT command, not the source module: runNew resolves its
// templates directory relative to its own file location under
// build/templates/starter (copied there by scripts/copy-templates.mjs — see
// new.ts's own comment on templateDir) — a path that only exists once built.
// The package.json `test` script runs `npm run build` first so this is
// always fresh.
import { runNew } from '../../build/commands/new.js'

let base: string
let errorSpy: ReturnType<typeof vi.spyOn>
let logSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  // realpath: on macOS, os.tmpdir() itself lives under a symlink (/var ->
  // /private/var), which would otherwise make every 'created <path>' assertion
  // below fragile against which form Node happens to resolve to.
  base = await realpath(await mkdtemp(join(tmpdir(), 'pdocs-cli-new-')))
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
  logSpy.mockRestore()
  warnSpy.mockRestore()
})

describe('runNew', () => {
  it('rejects an invalid name', async () => {
    const code = await runNew(['Not_Valid', '--dir', join(base, 'site')])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('invalid name'))
  })

  it('refuses to scaffold into a non-empty existing directory', async () => {
    const target = join(base, 'site')
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'existing.txt'), 'hi', 'utf8')

    const code = await runNew(['site', '--dir', target])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('already exists and is not empty'))
  })

  it('scaffolds the starter template with the given name and title, and inits git', async () => {
    const target = join(base, 'my-project-docs')

    const code = await runNew(['my-project-docs', '--dir', target, '--title', 'My Project Docs'])
    expect(code).toBe(0)

    const antoraYml = await readFile(join(target, 'docs', 'antora.yml'), 'utf8')
    expect(antoraYml).toContain('name: my-project-docs')
    expect(antoraYml).toContain('title: My Project Docs')

    const pkg = JSON.parse(await readFile(join(target, 'package.json'), 'utf8')) as { name?: string }
    expect(pkg.name).toBe('my-project-docs')

    // A repository with no commits leaves every Antora content source
    // resolving to nothing — runNew commits precisely to avoid that.
    const log = execFileSync('git', ['log', '--oneline'], { cwd: target, encoding: 'utf8' })
    expect(log).toContain('chore: initial commit')
  })

  it('derives a title-cased default title from the name when --title is omitted', async () => {
    const target = join(base, 'my-project-docs')
    await runNew(['my-project-docs', '--dir', target])
    const antoraYml = await readFile(join(target, 'docs', 'antora.yml'), 'utf8')
    expect(antoraYml).toContain('title: My Project Docs')
  })

  it('skips git init when the target already lives inside a git work tree', async () => {
    const parentRepo = join(base, 'parent-repo')
    await mkdir(parentRepo, { recursive: true })
    execFileSync('git', ['init', '--quiet'], { cwd: parentRepo })

    const target = join(parentRepo, 'nested-docs')
    const code = await runNew(['nested-docs', '--dir', target])
    expect(code).toBe(0)

    expect(logSpy.mock.calls.flat().join('\n')).toContain('already inside a git repository')

    // No nested .git directory was created for the scaffolded site itself.
    const rootOfNested = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: target,
      encoding: 'utf8',
    }).trim()
    expect(rootOfNested).toBe(await realpath(parentRepo))
  })
})
