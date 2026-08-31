'use strict'

import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  checkAgentFilesPresent,
  checkAntoraAvailable,
  checkBranchingAgrees,
  checkGitHasCommit,
  checkNamesAgree,
  checkNodeVersion,
  checkReleaseLabelExists,
} from './doctor-checks.js'

describe('checkNodeVersion', () => {
  it('passes when no engine range is declared', () => {
    const result = checkNodeVersion(undefined, 'v24.0.0')
    expect(result.ok).toBe(true)
  })

  it('passes when the running major satisfies the range', () => {
    const result = checkNodeVersion('>=24.0.0', 'v24.5.0')
    expect(result.ok).toBe(true)
  })

  it('passes on a newer major than required', () => {
    const result = checkNodeVersion('>=24.0.0', 'v26.0.0')
    expect(result.ok).toBe(true)
  })

  it('fails on an older major than required', () => {
    const result = checkNodeVersion('>=24.0.0', 'v20.10.0')
    expect(result.ok).toBe(false)
    expect(result.detail).toContain('install Node 24')
  })

  it('does not fail when the range cannot be parsed', () => {
    const result = checkNodeVersion('whatever the docs say', 'v24.0.0')
    expect(result.ok).toBe(true)
  })
})

describe('checkNamesAgree', () => {
  it('passes every pair when all four names agree', () => {
    const results = checkNamesAgree({
      antoraYmlName: 'my-project-docs',
      startPageComponent: 'my-project-docs',
      startPath: 'docs/src',
      descriptorPath: 'docs/src',
      packageName: 'my-project-docs',
    })
    expect(results.every((r) => r.ok)).toBe(true)
    expect(results).toHaveLength(3)
  })

  it('reports the component name mismatch specifically', () => {
    const results = checkNamesAgree({
      antoraYmlName: 'my-project-docs',
      startPageComponent: 'renamed-docs',
      startPath: 'docs/src',
      descriptorPath: 'docs/src',
      packageName: 'my-project-docs',
    })
    const failed = results.filter((r) => !r.ok)
    expect(failed).toHaveLength(1)
    expect(failed[0]?.label).toBe('component name')
  })

  it('reports the content path mismatch specifically', () => {
    const results = checkNamesAgree({
      antoraYmlName: 'my-project-docs',
      startPageComponent: 'my-project-docs',
      startPath: 'docs',
      descriptorPath: 'docs/src',
      packageName: 'my-project-docs',
    })
    const failed = results.filter((r) => !r.ok)
    expect(failed).toHaveLength(1)
    expect(failed[0]?.label).toBe('content path')
  })

  it('reports the package name mismatch specifically', () => {
    const results = checkNamesAgree({
      antoraYmlName: 'my-project-docs',
      startPageComponent: 'my-project-docs',
      startPath: 'docs/src',
      descriptorPath: 'docs/src',
      packageName: 'something-else',
    })
    const failed = results.filter((r) => !r.ok)
    expect(failed).toHaveLength(1)
    expect(failed[0]?.label).toBe('package name')
  })

  it('skips a pair when either side is unknown', () => {
    const results = checkNamesAgree({
      antoraYmlName: null,
      startPageComponent: null,
      startPath: 'docs/src',
      descriptorPath: 'docs/src',
      packageName: 'my-project-docs',
    })
    expect(results).toHaveLength(1)
    expect(results[0]?.label).toBe('content path')
  })

  it('passes the package name pair when the component is the reserved ROOT name, even though it differs from package.json', () => {
    const results = checkNamesAgree({
      antoraYmlName: 'ROOT',
      startPageComponent: 'ROOT',
      startPath: 'docs/src',
      descriptorPath: 'docs/src',
      packageName: 'my-project-docs',
    })
    expect(results.every((r) => r.ok)).toBe(true)
    const packageNameResult = results.find((r) => r.label === 'package name')
    expect(packageNameResult?.ok).toBe(true)
  })
})

describe('checkGitHasCommit', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'docouture-cli-doctor-git-'))
  })

  it('fails when the directory is not a git repository', async () => {
    const result = await checkGitHasCommit(dir)
    expect(result.ok).toBe(false)
  })

  it('fails when the repository has no commits', async () => {
    execFileSync('git', ['init', '--quiet'], { cwd: dir })
    const result = await checkGitHasCommit(dir)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('no commits')
  })

  it('passes once there is at least one commit', async () => {
    execFileSync('git', ['init', '--quiet'], { cwd: dir })
    execFileSync('git', ['config', 'user.email', 'a@a.com'], { cwd: dir })
    execFileSync('git', ['config', 'user.name', 'a'], { cwd: dir })
    execFileSync('git', ['commit', '--quiet', '--allow-empty', '-m', 'init'], { cwd: dir })
    const result = await checkGitHasCommit(dir)
    expect(result.ok).toBe(true)
  })
})

describe('checkAntoraAvailable', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'docouture-cli-doctor-antora-'))
  })

  it('fails when node_modules/antora is missing', () => {
    expect(checkAntoraAvailable(dir).ok).toBe(false)
  })

  it('passes once the antora package and its bin are present', async () => {
    await mkdir(join(dir, 'node_modules', 'antora'), { recursive: true })
    await mkdir(join(dir, 'node_modules', '.bin'), { recursive: true })
    await writeFile(join(dir, 'node_modules', '.bin', 'antora'), '', 'utf8')
    expect(checkAntoraAvailable(dir).ok).toBe(true)
  })
})

describe('checkAgentFilesPresent', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'docouture-cli-doctor-agent-files-'))
  })

  it('flags every path missing on a bare directory', () => {
    const results = checkAgentFilesPresent(dir)
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => !r.ok)).toBe(true)
  })

  it('passes AGENTS.md once scaffolded', async () => {
    await writeFile(join(dir, 'AGENTS.md'), '# hi', 'utf8')

    const results = checkAgentFilesPresent(dir)
    expect(results.every((r) => r.ok)).toBe(true)
  })
})

describe('checkReleaseLabelExists', () => {
  it('is advisory-only (ok: true) when gh cannot answer for this directory — no GitHub remote/auth in a bare tmp dir', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'docouture-cli-doctor-release-label-'))
    execFileSync('git', ['init', '--quiet'], { cwd: dir })

    const result = await checkReleaseLabelExists(dir)

    // Never a hard failure here: no `gh` remote/auth is exactly the
    // "cannot check" case this function treats as advisory, not broken.
    expect(result.ok).toBe(true)
    expect(result.label).toBe('docs/release label')
  })
})

describe('checkBranchingAgrees', () => {
  it('is advisory-only (ok: true) when no docouture.branching is declared yet — predates GH #175', () => {
    const result = checkBranchingAgrees({ declaredBranching: null, actualBranching: 'trunk-based' })
    expect(result.ok).toBe(true)
  })

  it('is advisory-only (ok: true) when the actual branching could not be derived', () => {
    const result = checkBranchingAgrees({ declaredBranching: 'trunk-based', actualBranching: null })
    expect(result.ok).toBe(true)
  })

  it('passes when the declared value matches the derived one', () => {
    const result = checkBranchingAgrees({ declaredBranching: 'git-flow', actualBranching: 'git-flow' })
    expect(result.ok).toBe(true)
  })

  it('fails when the declared value disagrees with the derived one', () => {
    const result = checkBranchingAgrees({ declaredBranching: 'trunk-based', actualBranching: 'git-flow' })
    expect(result.ok).toBe(false)
    expect(result.message).toContain("'trunk-based'")
    expect(result.message).toContain("'git-flow'")
    expect(result.detail).toContain('docouture branch-model')
  })
})
