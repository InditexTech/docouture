'use strict'

import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Same reasoning as new.spec.ts/upgrade.spec.ts: imports the BUILT command,
// since runBranchModel (like runNew/runUpgrade) resolves its templates
// directory relative to its own file location under build/templates/.
import { runBranchModel } from '../../build/commands/branch-model.js'
import { runNew } from '../../build/commands/new.js'

let base: string
let errorSpy: ReturnType<typeof vi.spyOn>
let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'docouture-cli-branch-model-')))
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

async function scaffoldTrunkBased(repo: string): Promise<void> {
  await initRepo(repo)
  const code = await runNew(['my-project-docs', '--dir', repo, '--yes'])
  expect(code).toBe(0)
}

describe('runBranchModel', () => {
  it('rejects an invalid target model', async () => {
    const repo = join(base, 'repo')
    await scaffoldTrunkBased(repo)

    const code = await runBranchModel(['bogus', '--dir', repo])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('invalid target'))
  })

  it('refuses to run when --dir is not inside a git repository', async () => {
    const notARepo = join(base, 'not-a-repo')
    await mkdir(notARepo, { recursive: true })

    const code = await runBranchModel(['git-flow', '--dir', notARepo, '--integration-branch', 'develop'])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('is not inside a git repository'))
  })

  it('refuses to run when no site exists at --dir', async () => {
    const repo = join(base, 'repo')
    await initRepo(repo)

    const code = await runBranchModel(['git-flow', '--dir', repo, '--integration-branch', 'develop'])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('no site found'))
  })

  it('is a no-op when already at the target model with no branch-name changes', async () => {
    const repo = join(base, 'repo')
    await scaffoldTrunkBased(repo)

    const code = await runBranchModel(['trunk-based', '--dir', repo])
    expect(code).toBe(0)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('already trunk-based'))
  })

  it('trunk-based -> git-flow requires --integration-branch', async () => {
    const repo = join(base, 'repo')
    await scaffoldTrunkBased(repo)

    const code = await runBranchModel(['git-flow', '--dir', repo])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('--integration-branch'))
  })

  it('switches trunk-based -> git-flow, keeping the current branch as release by default', async () => {
    const repo = join(base, 'repo')
    await scaffoldTrunkBased(repo)

    const code = await runBranchModel(['git-flow', '--dir', repo, '--integration-branch', 'develop'])
    expect(code).toBe(0)

    const playbook = await readFile(join(repo, 'docs', 'antora-playbook.yml'), 'utf8')
    expect(playbook).toContain('branches: [develop]')

    const workflow = await readFile(join(repo, '.github', 'workflows', 'docouture-release.yml'), 'utf8')
    expect(workflow).toContain('ref: main')
    expect(workflow).not.toContain('__DOCOUTURE_')

    const publishPrerelease = await readFile(
      join(repo, '.github', 'workflows', 'docouture-publish-prerelease.yml'),
      'utf8'
    )
    expect(publishPrerelease).toContain("branches: ['develop*']")

    const pkg = JSON.parse(await readFile(join(repo, 'docs', 'package.json'), 'utf8')) as {
      docouture?: { branching?: string }
    }
    expect(pkg.docouture?.branching).toBe('git-flow')
  })

  it('switches trunk-based -> git-flow with an explicit --release-branch too', async () => {
    const repo = join(base, 'repo')
    await scaffoldTrunkBased(repo)

    const code = await runBranchModel([
      'git-flow',
      '--dir',
      repo,
      '--integration-branch',
      'develop',
      '--release-branch',
      'release',
    ])
    expect(code).toBe(0)

    const workflow = await readFile(join(repo, '.github', 'workflows', 'docouture-release.yml'), 'utf8')
    expect(workflow).toContain('ref: release')
  })

  it('git-flow -> trunk-based requires --branch', async () => {
    const repo = join(base, 'repo')
    await scaffoldTrunkBased(repo)
    await runBranchModel(['git-flow', '--dir', repo, '--integration-branch', 'develop'])

    const code = await runBranchModel(['trunk-based', '--dir', repo])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('--branch'))
  })

  it('refuses to invent a third branch name switching git-flow -> trunk-based', async () => {
    const repo = join(base, 'repo')
    await scaffoldTrunkBased(repo)
    await runBranchModel(['git-flow', '--dir', repo, '--integration-branch', 'develop'])

    const code = await runBranchModel(['trunk-based', '--dir', repo, '--branch', 'something-else'])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('does not match either current branch'))
  })

  it('switches git-flow -> trunk-based, collapsing to one of the two existing branches', async () => {
    const repo = join(base, 'repo')
    await scaffoldTrunkBased(repo)
    await runBranchModel(['git-flow', '--dir', repo, '--integration-branch', 'develop'])

    const code = await runBranchModel(['trunk-based', '--dir', repo, '--branch', 'develop'])
    expect(code).toBe(0)

    const playbook = await readFile(join(repo, 'docs', 'antora-playbook.yml'), 'utf8')
    expect(playbook).toContain('branches: [develop]')

    const workflow = await readFile(join(repo, '.github', 'workflows', 'docouture-release.yml'), 'utf8')
    expect(workflow).toContain('ref: develop')

    const pkg = JSON.parse(await readFile(join(repo, 'docs', 'package.json'), 'utf8')) as {
      docouture?: { branching?: string }
    }
    expect(pkg.docouture?.branching).toBe('trunk-based')
  })

  it('--dry-run lists planned writes without touching disk', async () => {
    const repo = join(base, 'repo')
    await scaffoldTrunkBased(repo)

    const code = await runBranchModel(['git-flow', '--dir', repo, '--integration-branch', 'develop', '--dry-run'])
    expect(code).toBe(0)

    const playbook = await readFile(join(repo, 'docs', 'antora-playbook.yml'), 'utf8')
    expect(playbook).toContain('branches: [main]')

    const allLogs = logSpy.mock.calls.map((call) => String(call[0])).join('\n')
    expect(allLogs).toContain('would write:')
    expect(allLogs).toContain('docouture-release.yml')
  })

  it('prints a reminder that it does not touch actual git branches/protection/default-branch settings', async () => {
    const repo = join(base, 'repo')
    await scaffoldTrunkBased(repo)

    const code = await runBranchModel(['git-flow', '--dir', repo, '--integration-branch', 'develop'])
    expect(code).toBe(0)

    const allLogs = logSpy.mock.calls.map((call) => String(call[0])).join('\n')
    expect(allLogs).toContain('does NOT')
    expect(allLogs).toContain('rename actual git branches')
  })
})
