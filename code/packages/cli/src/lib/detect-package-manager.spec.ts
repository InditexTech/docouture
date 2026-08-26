'use strict'

import { mkdtemp, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { detectPackageManager, packageManagerPlan } from './detect-package-manager.js'

let dir: string
const originalUserAgent = process.env.npm_config_user_agent

beforeEach(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'docouture-cli-detect-pm-')))
  delete process.env.npm_config_user_agent
})

afterEach(() => {
  if (originalUserAgent === undefined) delete process.env.npm_config_user_agent
  else process.env.npm_config_user_agent = originalUserAgent
})

describe('detectPackageManager', () => {
  it('defaults to npm with no signal at all', () => {
    expect(detectPackageManager(dir)).toBe('npm')
  })

  it('detects pnpm from a pnpm-lock.yaml at the target root', async () => {
    await writeFile(join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    expect(detectPackageManager(dir)).toBe('pnpm')
  })

  it('detects pnpm from a pnpm-workspace.yaml at the target root', async () => {
    await writeFile(join(dir, 'pnpm-workspace.yaml'), 'packages: []\n')
    expect(detectPackageManager(dir)).toBe('pnpm')
  })

  it('prefers an explicit packageManager field over a lockfile guess', async () => {
    await writeFile(join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    await writeFile(join(dir, 'package.json'), JSON.stringify({ packageManager: 'npm@10.0.0' }))
    expect(detectPackageManager(dir)).toBe('npm')
  })

  it('falls back to how docouture new was invoked (npm_config_user_agent) with no repo signal', () => {
    process.env.npm_config_user_agent = 'pnpm/9.1.0 npm/? node/v20.11.0 darwin x64'
    expect(detectPackageManager(dir)).toBe('pnpm')
  })
})

describe('packageManagerPlan', () => {
  it('returns npm commands for npm', () => {
    const plan = packageManagerPlan('npm')
    expect(plan.installCmd).toBe('npm install')
    expect(plan.devCmd).toBe('npm run dev')
    expect(plan.ciCmd).toBe('npm ci')
    expect(plan.lockfile).toBe('package-lock.json')
    expect(plan.cacheName).toBe('npm')
    expect(plan.setupStepYaml).toBe('')
  })

  it('returns pnpm commands for pnpm, including a pnpm/action-setup step', () => {
    const plan = packageManagerPlan('pnpm')
    expect(plan.installCmd).toBe('pnpm install')
    expect(plan.devCmd).toBe('pnpm run dev')
    expect(plan.ciCmd).toBe('pnpm install --frozen-lockfile')
    expect(plan.lockfile).toBe('pnpm-lock.yaml')
    expect(plan.cacheName).toBe('pnpm')
    expect(plan.setupStepYaml).toContain('pnpm/action-setup')
  })
})
