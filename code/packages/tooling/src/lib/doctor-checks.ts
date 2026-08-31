'use strict'

import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Individual, unit-testable checks behind the `doctor` command — ported
// one-for-one from the justfile's own `doctor` recipe (GH-140), which had
// these as inline bash string comparisons with no test coverage of their own.

export interface CheckResult {
  ok: boolean
  label: string
  message: string
  detail?: string
}

function readToolVersion(content: string, tool: string): string | undefined {
  const match = new RegExp(`^${tool}\\s+(\\S+)`, 'm').exec(content)
  return match?.[1]
}

export async function checkToolVersion(cwd: string, tool: 'nodejs' | 'pnpm', have: string): Promise<CheckResult> {
  const label = tool === 'nodejs' ? 'node' : 'pnpm'
  let content: string
  try {
    content = await readFile(join(cwd, '.tool-versions'), 'utf8')
  } catch {
    return { ok: false, label, message: `.tool-versions not found in ${cwd}` }
  }
  const want = readToolVersion(content, tool)
  if (!want) {
    return { ok: false, label, message: `'${tool}' entry not found in .tool-versions` }
  }
  if (have === want) {
    return { ok: true, label, message: have }
  }
  return {
    ok: false,
    label,
    message: `${have || 'missing'}, expected ${want}`,
    detail: `run 'asdf install'`,
  }
}

export function checkNodeModulesPresent(cwd: string): CheckResult {
  const present = existsSync(join(cwd, 'node_modules'))
  return present
    ? { ok: true, label: 'node_modules', message: 'present' }
    : { ok: false, label: 'node_modules', message: 'missing', detail: `run 'just bootstrap'` }
}

export async function checkRegistryPinned(cwd: string): Promise<CheckResult> {
  let content: string
  try {
    content = await readFile(join(cwd, '.npmrc'), 'utf8')
  } catch {
    content = ''
  }
  const pinned = content.split('\n').some((line) => line.trim() === 'registry=https://registry.npmjs.org/')
  if (pinned) {
    return { ok: true, label: 'registry', message: 'default registry pinned to npmjs' }
  }
  return {
    ok: false,
    label: 'registry',
    message: 'default registry not pinned in code/.npmrc',
    detail:
      'Without the pin, installs inherit `registry=` from ~/.npmrc. A machine that defaults to an internal ' +
      'mirror resolves every package through it, and CI — which has no such default — resolves them from ' +
      'somewhere else.',
  }
}

export function checkGitHasCommit(cwd: string): Promise<CheckResult> {
  return new Promise((resolvePromise) => {
    execFile('git', ['rev-parse', 'HEAD'], { cwd }, (err) => {
      resolvePromise(
        err
          ? {
              ok: false,
              label: 'content',
              message: 'repository has no commits',
              detail:
                'Antora reads content from git. It picks up uncommitted working-tree changes, but the ' +
                'repository must have at least one commit, or the content source resolves to nothing and ' +
                "every site builds with zero pages: 'Start page specified for site not found'. Make an initial commit.",
            }
          : { ok: true, label: 'content', message: 'repository has at least one commit' }
      )
    })
  })
}
