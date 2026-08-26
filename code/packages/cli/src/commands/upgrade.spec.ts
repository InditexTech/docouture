'use strict'

import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
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

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'pdocs-cli-upgrade-')))
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
  logSpy.mockRestore()
})

async function initRepo(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  execFileSync('git', ['init', '--quiet'], { cwd: dir })
}

describe('runUpgrade', () => {
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
    const workflowPath = join(repo, '.github', 'workflows', 'pdocs-release.yml')
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

  it('does not touch docs/', async () => {
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

    const workflowPath = join(repo, '.github', 'workflows', 'pdocs-release.yml')
    await writeFile(workflowPath, 'stale content', 'utf8')

    const code = await runUpgrade(['--dir', repo, '--dry-run'])
    expect(code).toBe(0)

    // Untouched — dry-run must not have written anything.
    const workflow = await readFile(workflowPath, 'utf8')
    expect(workflow).toBe('stale content')

    expect(logSpy).toHaveBeenCalledWith('would write:')
    const allLogs = logSpy.mock.calls.map((call) => String(call[0])).join('\n')
    expect(allLogs).toContain('pdocs-release.yml')
    expect(allLogs).toContain('AGENTS.md')
  })

  it('re-detects the package manager and re-pins the CLI version fresh on every run', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)
    await runNew(['my-project-docs', '--dir', repo, '--yes'])

    const code = await runUpgrade(['--dir', repo])
    expect(code).toBe(0)

    const workflow = await readFile(join(repo, '.github', 'workflows', 'pdocs-release.yml'), 'utf8')
    // Never a leftover placeholder token, whatever the actual value is.
    expect(workflow).not.toContain('__PDOCS_')
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
})
