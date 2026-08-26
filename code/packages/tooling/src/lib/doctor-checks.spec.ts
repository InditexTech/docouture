'use strict'

import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  checkGitHasCommit,
  checkIdsTokensPresent,
  checkNodeModulesPresent,
  checkRegistryPinned,
  checkToolVersion,
} from './doctor-checks.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'docouture-tooling-doctor-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('checkToolVersion', () => {
  it('passes when the installed version matches .tool-versions', async () => {
    await writeFile(join(dir, '.tool-versions'), 'nodejs 24.1.0\npnpm 10.5.0\n')
    const result = await checkToolVersion(dir, 'nodejs', '24.1.0')
    expect(result.ok).toBe(true)
  })

  it('fails when the installed version does not match', async () => {
    await writeFile(join(dir, '.tool-versions'), 'nodejs 24.1.0\n')
    const result = await checkToolVersion(dir, 'nodejs', '22.0.0')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('expected 24.1.0')
  })

  it('fails when .tool-versions is missing', async () => {
    const result = await checkToolVersion(dir, 'nodejs', '24.1.0')
    expect(result.ok).toBe(false)
  })
})

describe('checkNodeModulesPresent', () => {
  it('fails when node_modules is missing', () => {
    expect(checkNodeModulesPresent(dir).ok).toBe(false)
  })

  it('passes when node_modules exists', async () => {
    await mkdir(join(dir, 'node_modules'))
    expect(checkNodeModulesPresent(dir).ok).toBe(true)
  })
})

describe('checkRegistryPinned', () => {
  it('fails when .npmrc is missing', async () => {
    expect((await checkRegistryPinned(dir)).ok).toBe(false)
  })

  it('fails when the registry line is absent', async () => {
    await writeFile(join(dir, '.npmrc'), 'auto-install-peers=true\n')
    expect((await checkRegistryPinned(dir)).ok).toBe(false)
  })

  it('passes when the registry is pinned to npmjs', async () => {
    await writeFile(join(dir, '.npmrc'), 'registry=https://registry.npmjs.org/\n')
    expect((await checkRegistryPinned(dir)).ok).toBe(true)
  })
})

describe('checkIdsTokensPresent', () => {
  it('fails when the token derivative is missing', () => {
    expect(checkIdsTokensPresent(dir).ok).toBe(false)
  })

  it('passes when both files exist', async () => {
    await mkdir(join(dir, 'packages/ui-bundle/src/css'), { recursive: true })
    await writeFile(join(dir, 'packages/ui-bundle/src/css/ids-tokens.css'), '')
    await writeFile(join(dir, 'packages/ui-bundle/src/css/ids-breakpoints.css'), '')
    expect(checkIdsTokensPresent(dir).ok).toBe(true)
  })
})

describe('checkGitHasCommit', () => {
  it('fails outside a git repository', async () => {
    expect((await checkGitHasCommit(dir)).ok).toBe(false)
  })

  it('passes once there is a commit', async () => {
    execFileSync('git', ['init', '--quiet'], { cwd: dir })
    execFileSync('git', ['config', 'user.email', 'a@a.com'], { cwd: dir })
    execFileSync('git', ['config', 'user.name', 'a'], { cwd: dir })
    await writeFile(join(dir, 'README.md'), 'x')
    execFileSync('git', ['add', '.'], { cwd: dir })
    execFileSync('git', ['commit', '--quiet', '-m', 'init'], { cwd: dir })
    expect((await checkGitHasCommit(dir)).ok).toBe(true)
  })
})
