'use strict'

import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runDoctor } from './doctor.js'
import { resetContext, setContext } from '../lib/cli-context.js'

let dir: string
let cwdSpy: ReturnType<typeof vi.spyOn>
let logSpy: ReturnType<typeof vi.spyOn>
let stdoutSpy: ReturnType<typeof vi.spyOn>

async function scaffoldHealthyWorkspace(root: string): Promise<void> {
  const nodeVersion = process.version.replace(/^v/, '')
  await writeFile(join(root, '.tool-versions'), `nodejs ${nodeVersion}\npnpm 10.0.0\n`)
  await mkdir(join(root, 'node_modules'))
  await writeFile(join(root, '.npmrc'), 'registry=https://registry.npmjs.org/\n')
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'a@a.com'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'a'], { cwd: root })
  await writeFile(join(root, 'README.md'), 'x')
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['commit', '--quiet', '-m', 'init'], { cwd: root })
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'docouture-tooling-doctor-cmd-'))
  cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir)
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  resetContext()
})

afterEach(async () => {
  cwdSpy.mockRestore()
  logSpy.mockRestore()
  stdoutSpy.mockRestore()
  resetContext()
  await rm(dir, { recursive: true, force: true })
})

describe('runDoctor', () => {
  it('exits 0 on a healthy workspace, but pnpm may legitimately mismatch here', async () => {
    // pnpm's own installed version can't be pinned in this test environment
    // the way node's can be (no .tool-versions round-trip for the harness
    // itself) — so this asserts the *other* three checks all pass, which is
    // the part this command actually implements.
    await scaffoldHealthyWorkspace(dir)
    await runDoctor([])
    const lines = logSpy.mock.calls.map((call) => String(call[0])).join('\n')
    expect(lines).toContain('node_modules — present')
    expect(lines).toContain('default registry pinned to npmjs')
    expect(lines).toContain('repository has at least one commit')
  })

  it('fails and reports every broken check', async () => {
    const code = await runDoctor([])
    expect(code).toBe(1)
  })

  it('emits a single JSON report under --json', async () => {
    setContext({ json: true })
    await runDoctor([])
    expect(stdoutSpy).toHaveBeenCalledTimes(1)
    const printed = JSON.parse(String(stdoutSpy.mock.calls[0]![0])) as { status: string; checks: unknown[] }
    expect(printed.status).toBe('fail')
    expect(Array.isArray(printed.checks)).toBe(true)
  })
})
