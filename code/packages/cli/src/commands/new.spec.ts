'use strict'

import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Imports the BUILT command, not the source module: runNew resolves its
// templates directory relative to its own file location under
// build/templates/{starter,workflows} (copied there by
// scripts/copy-templates.mjs — see new.ts's own comment on templatesRoot) —
// a path that only exists once built. The package.json `test` script runs
// `npm run build` first so this is always fresh.
import { runNew } from '../../build/commands/new.js'

let base: string
let errorSpy: ReturnType<typeof vi.spyOn>
let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  // realpath: on macOS, os.tmpdir() itself lives under a symlink (/var ->
  // /private/var), which would otherwise make every path assertion below
  // fragile against which form Node happens to resolve to.
  base = await realpath(await mkdtemp(join(tmpdir(), 'pdocs-cli-new-')))
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
  logSpy.mockRestore()
})

// runNew now scaffolds into an EXISTING repository rather than creating a
// fresh one — every scaffolding test needs one already in place at --dir.
async function initRepo(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  execFileSync('git', ['init', '--quiet'], { cwd: dir })
}

describe('runNew', () => {
  it('rejects an invalid name', async () => {
    const code = await runNew(['Not_Valid', '--dir', join(base, 'repo')])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('invalid name'))
  })

  it('rejects an invalid --mode value', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)

    const code = await runNew(['my-project-docs', '--dir', repo, '--mode', 'bogus'])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('invalid --mode'))
  })

  it('refuses to scaffold when --dir is not inside a git repository', async () => {
    const notARepo = join(base, 'not-a-repo')
    await mkdir(notARepo, { recursive: true })

    const code = await runNew(['my-project-docs', '--dir', notARepo])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('is not inside a git repository'))
  })

  it('refuses to scaffold when docs/ already exists and is not empty', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)
    await mkdir(join(repo, 'docs'), { recursive: true })
    await writeFile(join(repo, 'docs', 'existing.txt'), 'hi', 'utf8')

    const code = await runNew(['my-project-docs', '--dir', repo])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('already exists and is not empty'))
  })

  it('refuses to scaffold when a target workflow file already exists', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)
    await mkdir(join(repo, '.github', 'workflows'), { recursive: true })
    await writeFile(join(repo, '.github', 'workflows', 'pdocs-release.yml'), 'existing', 'utf8')

    const code = await runNew(['my-project-docs', '--dir', repo])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('refusing to overwrite existing workflow'))
  })

  it('scaffolds docs/ (standalone by default) and .github/workflows/ into an existing repo', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)

    const code = await runNew(['my-project-docs', '--dir', repo, '--title', 'My Project Docs'])
    expect(code).toBe(0)

    // The whole starter subtree lands under docs/, unflattened — its own
    // nested docs/antora.yml keeps that shape.
    const antoraYml = await readFile(join(repo, 'docs', 'docs', 'antora.yml'), 'utf8')
    expect(antoraYml).toContain('name: my-project-docs')
    expect(antoraYml).toContain('title: My Project Docs')
    expect(antoraYml).toContain('version: ~')

    const pkg = JSON.parse(await readFile(join(repo, 'docs', 'package.json'), 'utf8')) as { name?: string }
    expect(pkg.name).toBe('my-project-docs')

    // Antora resolves a local `url` relative to the PLAYBOOK FILE's own
    // directory, not the build's cwd, and requires that resolved path to be
    // a git worktree root itself — this playbook lives one level below the
    // scaffolded repository's root, so `url: .` fails with "Local content
    // source must be a git repository" the moment someone actually builds.
    // `start_path` is then repo-root relative, and lands one level deeper
    // than a bare `docs` because the whole starter subtree (itself holding
    // a `docs/`) was copied under this repo's own `docs/`.
    const playbook = await readFile(join(repo, 'docs', 'antora-playbook.yml'), 'utf8')
    expect(playbook).toContain('url: ..')
    expect(playbook).toContain('start_path: docs/docs')

    // Workflows are peeled out to the true repo root — GitHub Actions never
    // discovers them nested under docs/.
    for (const workflow of ['pdocs-publish.yml', 'pdocs-release.yml', 'pdocs-pr-verify.yml']) {
      const content = await readFile(join(repo, '.github', 'workflows', workflow), 'utf8')
      expect(content.length).toBeGreaterThan(0)
    }
  })

  it('derives a title-cased default title from the name when --title is omitted', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)

    await runNew(['my-project-docs', '--dir', repo])
    const antoraYml = await readFile(join(repo, 'docs', 'docs', 'antora.yml'), 'utf8')
    expect(antoraYml).toContain('title: My Project Docs')
  })

  it('scaffolds Mode 2 (versioned) shape with --mode versioned', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)

    const code = await runNew(['my-project-docs', '--dir', repo, '--mode', 'versioned'])
    expect(code).toBe(0)

    const antoraYml = await readFile(join(repo, 'docs', 'docs', 'antora.yml'), 'utf8')
    expect(antoraYml).toContain('version: prerelease')
    expect(antoraYml).toContain('prerelease: true')

    const playbook = await readFile(join(repo, 'docs', 'antora-playbook.yml'), 'utf8')
    expect(playbook).toContain("tags: ['stable']")
    expect(playbook).toContain('branches: [main]')
    expect(playbook).toContain('url: ..')
    expect(playbook).toContain('start_path: docs/docs')
  })

  it('prompts for whatever was not supplied when run against an interactive io', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)

    // A PassThrough fed one line at a time, with a tick between writes —
    // readline's own `close` fires as soon as its input stream ends, which
    // would fire immediately (before the sequential question() calls below
    // have all run) if every answer were written and the stream ended in
    // one synchronous burst. Never calling .end() sidesteps that: promptWizard
    // closes the readline interface itself once done (see its `finally`).
    const input = new PassThrough()
    const output = new PassThrough()
    output.resume() // drain the prompts so the stream never backs up

    const resultPromise = runNew(['--dir', repo], { input, output, isTTY: true })

    const tick = () => new Promise((r) => setImmediate(r))
    await tick()
    input.write('my-wizard-docs\n')
    await tick()
    input.write('\n') // Enter — accept the default title
    await tick()
    input.write('2\n') // Versioned mode

    const code = await resultPromise
    input.end()
    expect(code).toBe(0)

    const antoraYml = await readFile(join(repo, 'docs', 'docs', 'antora.yml'), 'utf8')
    expect(antoraYml).toContain('name: my-wizard-docs')
    expect(antoraYml).toContain('title: My Wizard Docs')
    expect(antoraYml).toContain('version: prerelease')
  })

  it('--yes skips the wizard even against an interactive io, using defaults', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)

    const input = new PassThrough()
    const output = new PassThrough()
    output.resume()

    const code = await runNew(['my-project-docs', '--dir', repo, '--yes'], { input, output, isTTY: true })
    expect(code).toBe(0)

    const antoraYml = await readFile(join(repo, 'docs', 'docs', 'antora.yml'), 'utf8')
    expect(antoraYml).toContain('name: my-project-docs')
    expect(antoraYml).toContain('version: ~')
  })
})
