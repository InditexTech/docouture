'use strict'

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { runNpmScript } from './run-script.js'

describe('runNpmScript', () => {
  it('does not leak SIGINT/SIGTERM listeners once the child has exited', async () => {
    const base = await mkdtemp(join(tmpdir(), 'docouture-cli-run-script-'))
    await mkdir(base, { recursive: true })
    await writeFile(
      join(base, 'package.json'),
      JSON.stringify({ name: 'x', scripts: { build: 'node -e "process.exit(0)" --' } }),
      'utf8'
    )

    const sigintBefore = process.listenerCount('SIGINT')
    const sigtermBefore = process.listenerCount('SIGTERM')

    const code = await runNpmScript('build', { cwd: base })

    expect(code).toBe(0)
    expect(process.listenerCount('SIGINT')).toBe(sigintBefore)
    expect(process.listenerCount('SIGTERM')).toBe(sigtermBefore)
  })
})
