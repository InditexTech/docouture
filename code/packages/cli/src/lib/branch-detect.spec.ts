'use strict'

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  cacheWarmBranchesYaml,
  detectBranches,
  inferBranching,
  readReleaseBranchFromWorkflow,
} from './branch-detect.js'

describe('readReleaseBranchFromWorkflow', () => {
  it("reads the checkout step's ref: literal", () => {
    const workflow = 'steps:\n  - name: Checkout\n    uses: actions/checkout@v4\n    with:\n      ref: main\n'
    expect(readReleaseBranchFromWorkflow(workflow)).toBe('main')
  })

  it('reads a non-default branch name', () => {
    const workflow = 'steps:\n  - uses: actions/checkout@v4\n    with:\n      ref: release\n'
    expect(readReleaseBranchFromWorkflow(workflow)).toBe('release')
  })

  it('returns null when there is no ref: line at all', () => {
    expect(readReleaseBranchFromWorkflow('steps:\n  - uses: actions/checkout@v4\n')).toBeNull()
  })
})

describe('inferBranching', () => {
  it('is trunk-based when both roles are the same branch', () => {
    expect(inferBranching({ prerelease: 'main', release: 'main' })).toBe('trunk-based')
  })

  it('is git-flow when the two roles differ', () => {
    expect(inferBranching({ prerelease: 'develop', release: 'main' })).toBe('git-flow')
  })

  it('is null when either side could not be read', () => {
    expect(inferBranching({ prerelease: null, release: 'main' })).toBeNull()
    expect(inferBranching({ prerelease: 'main', release: null })).toBeNull()
  })
})

describe('cacheWarmBranchesYaml', () => {
  it('collapses to a single glob when both roles are the same branch (trunk-based)', () => {
    expect(cacheWarmBranchesYaml('main', 'main')).toBe("'main*'")
  })

  it('lists both globs, release first, when the two roles differ (git-flow)', () => {
    expect(cacheWarmBranchesYaml('develop', 'main')).toBe("'main*', 'develop*'")
  })
})

describe('detectBranches', () => {
  async function scaffold(dir: string, prerelease: string, release: string): Promise<void> {
    await mkdir(join(dir, 'docs'), { recursive: true })
    await mkdir(join(dir, '.github', 'workflows'), { recursive: true })
    await writeFile(
      join(dir, 'docs', 'antora-playbook.yml'),
      `content:\n  sources:\n    - url: ..\n      start_path: docs/src\n      branches: [${prerelease}]\n      tags: ['docs/stable']\n`,
      'utf8'
    )
    await writeFile(
      join(dir, '.github', 'workflows', 'docouture-release.yml'),
      `steps:\n  - name: Checkout\n    uses: actions/checkout@v4\n    with:\n      fetch-depth: 0\n      ref: ${release}\n`,
      'utf8'
    )
  }

  it('reads both roles back from a trunk-based site', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'docouture-cli-branch-detect-'))
    await scaffold(dir, 'main', 'main')

    const result = await detectBranches(join(dir, 'docs'), dir)
    expect(result).toEqual({ prerelease: 'main', release: 'main' })
    expect(inferBranching(result)).toBe('trunk-based')
  })

  it('reads both roles back from a git-flow site', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'docouture-cli-branch-detect-'))
    await scaffold(dir, 'develop', 'main')

    const result = await detectBranches(join(dir, 'docs'), dir)
    expect(result).toEqual({ prerelease: 'develop', release: 'main' })
    expect(inferBranching(result)).toBe('git-flow')
  })

  it('resolves both sides to null when neither file exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'docouture-cli-branch-detect-'))
    const result = await detectBranches(join(dir, 'docs'), dir)
    expect(result).toEqual({ prerelease: null, release: null })
    expect(inferBranching(result)).toBeNull()
  })
})
