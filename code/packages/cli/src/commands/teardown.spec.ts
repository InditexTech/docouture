// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runTeardown } from './teardown.js'

let base: string
let siteRoot: string
let errorSpy: ReturnType<typeof vi.spyOn>
let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'docouture-cli-teardown-cmd-'))
  siteRoot = join(base, 'docs')
  await mkdir(siteRoot, { recursive: true })
  await writeFile(join(siteRoot, 'package.json'), JSON.stringify({ name: 'my-project-docs' }))
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
  logSpy.mockRestore()
})

describe('runTeardown', () => {
  it('fails when no target is given', async () => {
    const code = await runTeardown(['--dir', base])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('usage: docouture teardown'))
  })

  it('fails on an unsupported target', async () => {
    const code = await runTeardown(['not-a-real-target', '--dir', base])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('usage: docouture teardown'))
  })

  it('fails when no package.json is found under --dir/docs', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'docouture-cli-teardown-cmd-empty-'))
    const code = await runTeardown(['kroki', '--dir', empty])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('no package.json found'))
  })

  it('fails with an actionable message when no compose file can be resolved', async () => {
    const resolveEffectiveComposeFile = vi.fn().mockResolvedValue(null)

    const code = await runTeardown(['kroki', '--dir', base], { resolveEffectiveComposeFile })

    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('could not find'))
  })

  it('runs docker compose down against the resolved compose file', async () => {
    const composeFile = join(siteRoot, 'kroki-compose.yml')
    await writeFile(composeFile, 'services: {}')
    const resolveEffectiveComposeFile = vi.fn().mockResolvedValue(composeFile)
    const execFileAsync = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })

    const code = await runTeardown(['kroki', '--dir', base], { resolveEffectiveComposeFile, execFileAsync })

    expect(resolveEffectiveComposeFile).toHaveBeenCalledWith(siteRoot)
    expect(execFileAsync).toHaveBeenCalledWith('docker', ['compose', '-f', composeFile, 'down'])
    expect(code).toBe(0)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('stopped the Kroki service'))
  })

  it('surfaces a docker compose failure as a failing exit code', async () => {
    const composeFile = join(siteRoot, 'kroki-compose.yml')
    const resolveEffectiveComposeFile = vi.fn().mockResolvedValue(composeFile)
    const execFileAsync = vi.fn().mockRejectedValue(new Error('no such service'))

    const code = await runTeardown(['kroki', '--dir', base], { resolveEffectiveComposeFile, execFileAsync })

    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('no such service'))
  })
})
