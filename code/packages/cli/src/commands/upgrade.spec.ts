// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { execFileSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Imports the BUILT command, same reasoning as new.spec.ts: runUpgrade
// resolves its templates directory relative to its own file location under
// build/templates/{workflows,agent-support} — a path that only exists once
// built. The package.json `test` script runs `npm run build` first so this
// is always fresh.
import { runUpgrade } from '../../build/commands/upgrade.js'
import { runNew } from '../../build/commands/new.js'

let base: string
let errorSpy: ReturnType<typeof vi.spyOn>
let logSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'docouture-cli-upgrade-')))
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
  logSpy.mockRestore()
  warnSpy.mockRestore()
})

async function initRepo(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  execFileSync('git', ['init', '--quiet'], { cwd: dir })
}

describe('runUpgrade', () => {
  it('sets runtime.log.failure_level to error in existing playbooks and tells the user', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)
    await runNew(['my-docs', '--dir', repo, '--yes'])
    const playbook = join(repo, 'docs', 'antora-playbook.yml')
    const original = await readFile(playbook, 'utf8')
    await writeFile(playbook, original.replace('failure_level: error', 'failure_level: warn'), 'utf8')

    expect(await runUpgrade(['--dir', repo, '--dry-run'])).toBe(0)
    expect(await readFile(playbook, 'utf8')).toContain('failure_level: warn')

    expect(await runUpgrade(['--dir', repo])).toBe(0)
    expect(await readFile(playbook, 'utf8')).toContain('failure_level: error')
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('failure_level: warn -> error'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('builds now fail on errors'))
  })

  it('prints no strict-build note when playbooks already say error', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)
    await runNew(['my-docs', '--dir', repo, '--yes'])
    logSpy.mockClear()
    expect(await runUpgrade(['--dir', repo])).toBe(0)
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('builds now fail on errors'))
  })

  it('backfills docouture.prereleaseBranch in docs/package.json for a git-flow site', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)
    await runNew(['my-docs', '--dir', repo, '--flow', 'git-flow', '--integration-branch', 'develop', '--yes'])

    const pkgPath = join(repo, 'docs', 'package.json')
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
    delete pkg.docouture.prereleaseBranch
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2), 'utf8')

    expect(await runUpgrade(['--dir', repo])).toBe(0)
    const after = JSON.parse(await readFile(pkgPath, 'utf8'))
    expect(after.docouture.branching).toBe('git-flow')
    expect(after.docouture.prereleaseBranch).toBe('develop')
  })

  it('leaves a trunk-based site package.json untouched', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)
    await runNew(['my-docs', '--dir', repo, '--yes'])
    const pkgPath = join(repo, 'docs', 'package.json')
    const before = await readFile(pkgPath, 'utf8')
    expect(await runUpgrade(['--dir', repo])).toBe(0)
    expect(await readFile(pkgPath, 'utf8')).toBe(before)
  })

  it('refuses to run when --dir is not inside a git repository', async () => {
    const notARepo = join(base, 'not-a-repo')
    await mkdir(notARepo, { recursive: true })

    const code = await runUpgrade(['--dir', notARepo])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('is not inside a git repository'))
  })

  it('overwrites existing workflow files and agent support files, unlike new', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)

    const newCode = await runNew(['my-project-docs', '--dir', repo, '--title', 'My Project Docs', '--yes'])
    expect(newCode).toBe(0)

    // Simulate drift: a workflow and a skill file were hand-edited (or are
    // simply stale relative to the CLI's current templates).
    const workflowPath = join(repo, '.github', 'workflows', 'docouture-release.yml')
    await writeFile(workflowPath, 'stale content', 'utf8')
    const agentsPath = join(repo, 'AGENTS.md')
    await writeFile(agentsPath, 'stale content', 'utf8')

    const code = await runUpgrade(['--dir', repo])
    expect(code).toBe(0)

    const workflow = await readFile(workflowPath, 'utf8')
    expect(workflow).not.toBe('stale content')
    expect(workflow.length).toBeGreaterThan(0)

    const agentsMd = await readFile(agentsPath, 'utf8')
    expect(agentsMd).not.toBe('stale content')
    // Re-reads the title back out of docs/antora.yml, since upgrade takes
    // no <name> argument.
    expect(agentsMd).toContain('My Project Docs')
  })

  it('removes check-links leftovers from an old-style site and reports them', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)
    await runNew(['my-project-docs', '--dir', repo, '--yes'])

    const pkgPath = join(repo, 'docs', 'package.json')
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
    pkg.scripts['check-links'] = 'node scripts/check-links.mjs'
    pkg.devDependencies.linkinator = '8.0.4'
    pkg.docouture.checkLinks = { ignore: ['x'] }
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
    const scriptPath = join(repo, 'docs', 'scripts', 'check-links.mjs')
    await mkdir(join(repo, 'docs', 'scripts'), { recursive: true })
    await writeFile(scriptPath, 'old', 'utf8')
    await writeFile(join(repo, '.github', 'workflows', 'mine.yml'), 'run: pnpm run check-links\n', 'utf8')

    const code = await runUpgrade(['--dir', repo])
    expect(code).toBe(0)

    await expect(access(scriptPath)).rejects.toThrow()
    await expect(access(join(repo, 'docs', 'scripts'))).rejects.toThrow()
    const after = JSON.parse(await readFile(pkgPath, 'utf8'))
    expect(after.scripts['check-links']).toBeUndefined()
    expect(after.devDependencies.linkinator).toBeUndefined()
    expect(after.docouture.checkLinks).toBeUndefined()
    const logs = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(logs).toContain('removed docs/scripts/check-links.mjs')
    expect(logs).toContain(' install')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('.github/workflows/mine.yml'))
  })

  it('leaves a fresh scaffold free of check-links and prints no removal', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)
    await runNew(['my-project-docs', '--dir', repo, '--yes'])
    await runUpgrade(['--dir', repo])
    const logs = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(logs).not.toContain('removed')
    await expect(access(join(repo, 'docs', 'scripts', 'check-links.mjs'))).rejects.toThrow()
  })

  it('does not touch docs/ content, ', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)
    await runNew(['my-project-docs', '--dir', repo, '--yes'])

    const antoraYmlPath = join(repo, 'docs', 'src', 'antora.yml')
    const before = await readFile(antoraYmlPath, 'utf8')

    await runUpgrade(['--dir', repo])

    const after = await readFile(antoraYmlPath, 'utf8')
    expect(after).toBe(before)
  })

  it('--dry-run lists planned writes without touching disk', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)
    await runNew(['my-project-docs', '--dir', repo, '--yes'])

    const workflowPath = join(repo, '.github', 'workflows', 'docouture-release.yml')
    await writeFile(workflowPath, 'stale content', 'utf8')

    const code = await runUpgrade(['--dir', repo, '--dry-run'])
    expect(code).toBe(0)

    // Untouched — dry-run must not have written anything.
    const workflow = await readFile(workflowPath, 'utf8')
    expect(workflow).toBe('stale content')

    expect(logSpy).toHaveBeenCalledWith('would write:')
    const allLogs = logSpy.mock.calls.map((call) => String(call[0])).join('\n')
    expect(allLogs).toContain('docouture-release.yml')
    expect(allLogs).toContain('AGENTS.md')
  })

  it('re-detects the package manager and re-pins the CLI version fresh on every run', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)
    await runNew(['my-project-docs', '--dir', repo, '--yes'])

    const code = await runUpgrade(['--dir', repo])
    expect(code).toBe(0)

    const workflow = await readFile(join(repo, '.github', 'workflows', 'docouture-release.yml'), 'utf8')
    // Never a leftover placeholder token, whatever the actual value is.
    expect(workflow).not.toContain('__DOCOUTURE_')
  })

  it('falls back to a directory-derived title when docs/antora.yml is absent, and --title overrides it', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)
    await mkdir(join(repo, '.github', 'workflows'), { recursive: true })

    const code = await runUpgrade(['--dir', repo, '--title', 'Custom Title'])
    expect(code).toBe(0)

    const agentsMd = await readFile(join(repo, 'AGENTS.md'), 'utf8')
    expect(agentsMd).toContain('Custom Title')
  })

  it('re-syncs at the true repo root when --dir points at a nested subdirectory', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)
    await runNew(['my-project-docs', '--dir', repo, '--yes'])

    const nested = join(repo, 'docs', 'src', 'modules', 'ROOT', 'pages')
    await mkdir(nested, { recursive: true })

    const workflowPath = join(repo, '.github', 'workflows', 'docouture-release.yml')
    await writeFile(workflowPath, 'stale content', 'utf8')

    const code = await runUpgrade(['--dir', nested])
    expect(code).toBe(0)

    const workflow = await readFile(workflowPath, 'utf8')
    expect(workflow).not.toBe('stale content')
  })

  it("merges into AGENTS.md's docouture-managed section, leaving a human's own content around it untouched", async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)
    await runNew(['my-project-docs', '--dir', repo, '--title', 'My Project Docs', '--yes'])

    const agentsPath = join(repo, 'AGENTS.md')
    const scaffolded = await readFile(agentsPath, 'utf8')

    // A human adds their own notes before and after docouture' own section.
    const withHandEdits = `# Team notes\n\nSay hi to the docs bot.\n\n${scaffolded}\n## Also see\n\nOur internal wiki.\n`
    await writeFile(agentsPath, withHandEdits, 'utf8')

    const code = await runUpgrade(['--dir', repo])
    expect(code).toBe(0)

    const after = await readFile(agentsPath, 'utf8')
    expect(after).toContain('# Team notes')
    expect(after).toContain('Say hi to the docs bot.')
    expect(after).toContain('## Also see')
    expect(after).toContain('Our internal wiki.')
    // The managed section itself is still there, refreshed.
    expect(after).toContain('docouture:start')
    expect(after).toContain('My Project Docs documentation')
  })
})
