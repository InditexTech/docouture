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

  it('refuses to scaffold when AGENTS.md already exists at the repo root', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)
    await writeFile(join(repo, 'AGENTS.md'), 'existing', 'utf8')

    const code = await runNew(['my-project-docs', '--dir', repo])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('refusing to overwrite existing agent file'))
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('AGENTS.md'))
  })

  it('refuses to scaffold when a skill directory already exists and is non-empty', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)
    await mkdir(join(repo, '.opencode', 'skills', 'docs-internals'), { recursive: true })
    await writeFile(join(repo, '.opencode', 'skills', 'docs-internals', 'SKILL.md'), 'existing', 'utf8')

    const code = await runNew(['my-project-docs', '--dir', repo])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('refusing to overwrite existing agent file'))
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('docs-internals'))
  })

  it('scaffolds docs/ (standalone by default, Stable + Prerelease) and .github/workflows/ into an existing repo', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)

    const code = await runNew(['my-project-docs', '--dir', repo, '--title', 'My Project Docs'])
    expect(code).toBe(0)

    // The whole starter subtree lands under docs/, unflattened — its own
    // nested docs/antora.yml keeps that shape.
    const antoraYml = await readFile(join(repo, 'docs', 'src', 'antora.yml'), 'utf8')
    expect(antoraYml).toContain('name: my-project-docs')
    expect(antoraYml).toContain('title: My Project Docs')
    expect(antoraYml).toContain('version: prerelease')
    expect(antoraYml).toContain('prerelease: true')

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
    expect(playbook).toContain('start_path: docs/src')
    expect(playbook).toContain('branches: [main]')
    expect(playbook).toContain("tags: ['stable']")

    // Workflows are peeled out to the true repo root — GitHub Actions never
    // discovers them nested under docs/.
    for (const workflow of [
      'pdocs-publish.yml',
      'pdocs-release.yml',
      'pdocs-release-preview.yml',
      'pdocs-pr-verify.yml',
    ]) {
      const content = await readFile(join(repo, '.github', 'workflows', workflow), 'utf8')
      expect(content.length).toBeGreaterThan(0)
    }

    // asciidoc/antora pdocs extensions are wired into the playbook, and both
    // packages are pinned as devDependencies alongside ui-bundle/cli.
    expect(playbook).toContain('@inditextech/pdocs-asciidoc-extensions')
    expect(playbook).toContain('@inditextech/pdocs-antora-extensions')

    // GH #137: standalone mode must not set `latest_version_segment` (it
    // turns `/stable/…` into a permanent redirect stub the moment a release
    // exists) and must instead opt into duplicateLatestVersion, which
    // publishes `stable`'s content a second time under `/latest/…` as a
    // real, independent copy.
    expect(playbook).not.toContain('latest_version_segment:')
    expect(playbook).toContain('duplicate_latest_version: true')
  })

  it('scaffolds docs/.gitignore under its real dotfile name (GH regression: npm strips .git*-named files from published packages, so the template source is named plain `gitignore` and must be renamed back on write)', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)

    const code = await runNew(['my-project-docs', '--dir', repo])
    expect(code).toBe(0)

    const gitignore = await readFile(join(repo, 'docs', '.gitignore'), 'utf8')
    expect(gitignore).toContain('node_modules/')
    expect(gitignore).toContain('build/')

    // The plain-named source file must never survive un-renamed alongside it.
    await expect(readFile(join(repo, 'docs', 'gitignore'), 'utf8')).rejects.toThrow()
  })

  it('scaffolds AGENTS.md and mirrored .opencode/.claude skills at the repo root', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)

    const code = await runNew(['my-project-docs', '--dir', repo, '--title', 'My Project Docs'])
    expect(code).toBe(0)

    const agentsMd = await readFile(join(repo, 'AGENTS.md'), 'utf8')
    expect(agentsMd).toContain('My Project Docs')

    for (const platform of ['.opencode', '.claude']) {
      for (const skill of ['documenting-your-repo', 'writing-docs-pages', 'docs-internals']) {
        const skillMd = await readFile(join(repo, platform, 'skills', skill, 'SKILL.md'), 'utf8')
        expect(skillMd).toContain(`name: ${skill}`)
      }
    }

    // Standalone mode (the default) does not get the docs-versioning skill.
    await expect(readFile(join(repo, '.opencode', 'skills', 'docs-versioning', 'SKILL.md'), 'utf8')).rejects.toThrow()
    await expect(readFile(join(repo, '.claude', 'skills', 'docs-versioning', 'SKILL.md'), 'utf8')).rejects.toThrow()

    // Both platforms' copies are byte-identical.
    for (const skill of ['documenting-your-repo', 'writing-docs-pages', 'docs-internals']) {
      const opencode = await readFile(join(repo, '.opencode', 'skills', skill, 'SKILL.md'), 'utf8')
      const claude = await readFile(join(repo, '.claude', 'skills', skill, 'SKILL.md'), 'utf8')
      expect(opencode).toBe(claude)
    }
  })

  it('scaffolds the docs-versioning skill only under --mode versioned', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)

    const code = await runNew(['my-project-docs', '--dir', repo, '--mode', 'versioned'])
    expect(code).toBe(0)

    for (const platform of ['.opencode', '.claude']) {
      const skillMd = await readFile(join(repo, platform, 'skills', 'docs-versioning', 'SKILL.md'), 'utf8')
      expect(skillMd).toContain('name: docs-versioning')
    }

    const opencode = await readFile(join(repo, '.opencode', 'skills', 'docs-versioning', 'SKILL.md'), 'utf8')
    const claude = await readFile(join(repo, '.claude', 'skills', 'docs-versioning', 'SKILL.md'), 'utf8')
    expect(opencode).toBe(claude)
  })

  it('derives a title-cased default title from the name when --title is omitted', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)

    await runNew(['my-project-docs', '--dir', repo])
    const antoraYml = await readFile(join(repo, 'docs', 'src', 'antora.yml'), 'utf8')
    expect(antoraYml).toContain('title: My Project Docs')
  })

  it('scaffolds versioned (Full History) shape with --mode versioned', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)

    const code = await runNew(['my-project-docs', '--dir', repo, '--mode', 'versioned'])
    expect(code).toBe(0)

    // docs/antora.yml is identical for both modes — only antora-playbook.yml
    // and .release-version differ.
    const antoraYml = await readFile(join(repo, 'docs', 'src', 'antora.yml'), 'utf8')
    expect(antoraYml).toContain('version: prerelease')
    expect(antoraYml).toContain('prerelease: true')

    const releaseVersion = await readFile(join(repo, 'docs', '.release-version'), 'utf8')
    expect(releaseVersion.trim()).toMatch(/^\d+\.\d+\.\d+$/)

    const playbook = await readFile(join(repo, 'docs', 'antora-playbook.yml'), 'utf8')
    expect(playbook).toContain("tags: ['v*']")
    expect(playbook).toContain('branches: [main]')
    expect(playbook).toContain('url: ..')
    expect(playbook).toContain('start_path: docs/src')

    // GH #137: versioned mode also opts into duplicateLatestVersion, so
    // whichever release tag Antora computes as latest is also published
    // under /latest/… as a real, independent copy.
    expect(playbook).toContain('duplicate_latest_version: true')
  })

  it('pins @inditextech/pdocs-cli and antora to exact versions in the scaffolded package.json', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)

    const code = await runNew(['my-project-docs', '--dir', repo])
    expect(code).toBe(0)

    const pkg = JSON.parse(await readFile(join(repo, 'docs', 'package.json'), 'utf8')) as {
      devDependencies?: Record<string, string>
    }
    // Exact pins, never a range — see the CLI's own package.json for the
    // version this must match: a snapshot/local-release build's version
    // (0.0.0-local.<sha>.<ts>) has to resolve on install exactly as
    // published, which a ^/~ range around a different number never does.
    expect(pkg.devDependencies?.['@inditextech/pdocs-cli']).not.toMatch(/[\^~]/)
    expect(pkg.devDependencies?.antora).toBe('3.1.15')
    expect(pkg.devDependencies?.['@inditextech/pdocs-asciidoc-extensions']).not.toMatch(/[\^~]/)
    expect(pkg.devDependencies?.['@inditextech/pdocs-antora-extensions']).not.toMatch(/[\^~]/)
    expect(pkg.devDependencies?.['@inditextech/pdocs-asciidoc-extensions']).toBe(
      pkg.devDependencies?.['@inditextech/pdocs-cli']
    )
  })

  it('prompts for whatever was not supplied when run against an interactive io', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)

    // @inquirer/prompts renders each prompt asynchronously (several
    // microtask/setImmediate hops deep inside its own promise chain) before
    // it starts reading keystrokes — writing answers on a fixed tick schedule
    // races that and silently drops keystrokes typed before the next
    // prompt's listener has attached. Waiting for each prompt's own message
    // to actually appear in the output stream before typing its answer is
    // the reliable equivalent of a person watching the terminal before
    // typing.
    const input = new PassThrough()
    const output = new PassThrough()
    let rendered = ''
    output.on('data', (chunk: Buffer) => {
      rendered += chunk.toString('utf8')
    })

    function waitForPrompt(text: string): Promise<void> {
      return new Promise((resolve, reject) => {
        const start = Date.now()
        const check = (): void => {
          if (rendered.includes(text)) {
            resolve()
            return
          }
          if (Date.now() - start > 4000) {
            reject(new Error(`timed out waiting for prompt '${text}' — rendered so far: ${rendered}`))
            return
          }
          setTimeout(check, 5)
        }
        check()
      })
    }

    const resultPromise = runNew(['--dir', repo], { input, output, isTTY: true })

    await waitForPrompt('Site / component name')
    input.write('my-wizard-docs\n')
    await waitForPrompt('Site title')
    input.write('\n') // Enter — accept the default title
    await waitForPrompt('Versioning mode')
    input.write('2\n') // Versioned mode (second choice)

    const code = await resultPromise
    input.end()
    expect(code).toBe(0)

    const antoraYml = await readFile(join(repo, 'docs', 'src', 'antora.yml'), 'utf8')
    expect(antoraYml).toContain('name: my-wizard-docs')
    expect(antoraYml).toContain('title: My Wizard Docs')
    expect(antoraYml).toContain('version: prerelease')

    const playbook = await readFile(join(repo, 'docs', 'antora-playbook.yml'), 'utf8')
    expect(playbook).toContain("tags: ['v*']")
  })

  it('--yes skips the wizard even against an interactive io, using defaults', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)

    const input = new PassThrough()
    const output = new PassThrough()
    output.resume()

    const code = await runNew(['my-project-docs', '--dir', repo, '--yes'], { input, output, isTTY: true })
    expect(code).toBe(0)

    const antoraYml = await readFile(join(repo, 'docs', 'src', 'antora.yml'), 'utf8')
    expect(antoraYml).toContain('name: my-project-docs')
    expect(antoraYml).toContain('version: prerelease')
  })
})
