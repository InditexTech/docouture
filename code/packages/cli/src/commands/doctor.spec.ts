'use strict'

import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runDoctor } from './doctor.js'

let repo: string
let logSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'pdocs-cli-doctor-cmd-'))
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  logSpy.mockRestore()
  errorSpy.mockRestore()
})

function loggedLines(): string {
  return logSpy.mock.calls.map((call) => String(call[0])).join('\n')
}

async function scaffoldGoodSite(root: string): Promise<void> {
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'a@a.com'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'a'], { cwd: root })

  const siteRoot = join(root, 'docs')
  await mkdir(join(siteRoot, 'docs'), { recursive: true })
  await mkdir(join(siteRoot, 'node_modules', '.bin'), { recursive: true })
  await mkdir(join(siteRoot, 'node_modules', 'antora'), { recursive: true })
  await writeFile(join(siteRoot, 'node_modules', '.bin', 'antora'), '', 'utf8')

  await writeFile(
    join(siteRoot, 'package.json'),
    JSON.stringify({ name: 'my-project-docs', engines: { node: '>=24.0.0' } }),
    'utf8'
  )
  await writeFile(
    join(siteRoot, 'docs', 'antora.yml'),
    'name: my-project-docs\ntitle: My Project Docs\nversion: ~\n',
    'utf8'
  )
  await writeFile(
    join(siteRoot, 'antora-playbook.yml'),
    'site:\n  start_page: my-project-docs::index.adoc\n\ncontent:\n  sources:\n    - url: ..\n      start_path: docs/docs\n',
    'utf8'
  )

  execFileSync('git', ['add', '-A'], { cwd: root })
  execFileSync('git', ['commit', '--quiet', '-m', 'init'], { cwd: root })
}

describe('runDoctor', () => {
  it('fails when no site is found at --dir/docs', async () => {
    const code = await runDoctor(['--dir', repo])
    expect(code).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('no site found'))
  })

  it('passes every check on a correctly scaffolded, committed, installed site', async () => {
    await scaffoldGoodSite(repo)
    const code = await runDoctor(['--dir', repo])
    expect(code).toBe(0)
    const out = loggedLines()
    expect(out).toContain('component name')
    expect(out).toContain('content path')
    expect(out).toContain('package name')
    expect(out).not.toContain('FAIL')
  })

  it('fails on an uncommitted repository', async () => {
    const siteRoot = join(repo, 'docs')
    await mkdir(join(siteRoot, 'docs'), { recursive: true })
    await writeFile(join(siteRoot, 'package.json'), JSON.stringify({ name: 'x' }), 'utf8')
    await writeFile(join(siteRoot, 'docs', 'antora.yml'), 'name: x\nversion: ~\n', 'utf8')
    await writeFile(
      join(siteRoot, 'antora-playbook.yml'),
      'site:\n  start_page: x::index.adoc\n\ncontent:\n  sources:\n    - url: ..\n      start_path: docs/docs\n',
      'utf8'
    )

    const code = await runDoctor(['--dir', repo])
    expect(code).toBe(1)
    expect(loggedLines()).toContain('git history')
  })

  it('flags a component-name mismatch between docs/antora.yml and site.start_page', async () => {
    await scaffoldGoodSite(repo)
    await writeFile(
      join(repo, 'docs', 'antora-playbook.yml'),
      'site:\n  start_page: renamed::index.adoc\n\ncontent:\n  sources:\n    - url: ..\n      start_path: docs/docs\n',
      'utf8'
    )

    const code = await runDoctor(['--dir', repo])
    expect(code).toBe(1)
    expect(loggedLines()).toContain('component name')
  })

  it('flags the url: . misconfiguration when the playbook is not at the repo root', async () => {
    await scaffoldGoodSite(repo)
    await writeFile(
      join(repo, 'docs', 'antora-playbook.yml'),
      'site:\n  start_page: my-project-docs::index.adoc\n\ncontent:\n  sources:\n    - url: .\n      start_path: docs\n',
      'utf8'
    )

    const code = await runDoctor(['--dir', repo])
    expect(code).toBe(1)
    expect(loggedLines()).toContain('content source url')
  })
})
