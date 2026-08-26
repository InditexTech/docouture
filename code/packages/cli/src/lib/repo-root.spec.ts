'use strict'

import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { findRepoRoot } from './repo-root.js'

let repo: string

beforeEach(async () => {
  // realpath: on macOS, os.tmpdir() itself lives under a symlink (/var ->
  // /private/var) that `git rev-parse --show-toplevel` resolves through,
  // which would otherwise make the equality checks below fragile.
  repo = await realpath(await mkdtemp(join(tmpdir(), 'docouture-cli-repo-root-')))
})

describe('findRepoRoot', () => {
  it('returns the directory itself when not inside a git repository', async () => {
    expect(await findRepoRoot(repo)).toBe(repo)
  })

  it('returns the same root whether called from the root or a nested directory', async () => {
    execFileSync('git', ['init', '--quiet'], { cwd: repo })
    const nested = join(repo, 'docs', 'modules', 'ROOT', 'pages')
    await mkdir(nested, { recursive: true })

    expect(await findRepoRoot(repo)).toBe(repo)
    expect(await findRepoRoot(nested)).toBe(repo)
  })
})
