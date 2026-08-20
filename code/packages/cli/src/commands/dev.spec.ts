'use strict'

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runDev } from './dev.js'

let base: string
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'pdocs-cli-dev-cmd-'))
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
})

describe('runDev', () => {
  it('fails when no antora-playbook.yml is found under --dir/docs', async () => {
    const code = await runDev(['--dir', base])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('no antora-playbook.yml found'))
  })

  it('rejects an invalid --port', async () => {
    await mkdir(join(base, 'docs'), { recursive: true })
    await writeFile(join(base, 'docs', 'antora-playbook.yml'), 'site:\n  title: X\n', 'utf8')

    const code = await runDev(['--dir', base, '--port', 'not-a-number'])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('invalid --port'))
  })

  it('rejects a non-positive --port', async () => {
    await mkdir(join(base, 'docs'), { recursive: true })
    await writeFile(join(base, 'docs', 'antora-playbook.yml'), 'site:\n  title: X\n', 'utf8')

    const code = await runDev(['--dir', base, '--port', '0'])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('invalid --port'))
  })
})
