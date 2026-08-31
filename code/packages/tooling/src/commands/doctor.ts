// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { execSync } from 'node:child_process'

import { parseArgs } from '../lib/args.js'
import { getContext } from '../lib/cli-context.js'
import { theme } from '../lib/theme.js'
import {
  checkGitHasCommit,
  checkNodeModulesPresent,
  checkRegistryPinned,
  checkToolVersion,
  type CheckResult,
} from '../lib/doctor-checks.js'

interface JsonCheckResult extends CheckResult {
  section: string
}

function currentVersion(bin: string, versionFlag = '--version'): string {
  try {
    return execSync(`${bin} ${versionFlag}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
      .replace(/^v/, '')
  } catch {
    return ''
  }
}

function printResult(result: CheckResult): void {
  const ok = theme.success(' ok ')
  const fail = theme.error('FAIL')
  console.log(`  ${result.ok ? ok : fail}  ${result.label} — ${result.message}`)
  if (!result.ok && result.detail) {
    console.log(`         ${result.detail}`)
  }
}

/**
 * Repo-level environment/workspace doctor — ported from the justfile's own
 * `doctor` recipe (GH-140). Checks the toolchain, dependencies, registry
 * pin, and git history of *this monorepo* — a different concern from
 * packages/cli's own `docouture doctor`, which inspects a scaffolded/consumer
 * *site*, not this repository's own dev environment.
 */
export async function runDoctor(argv: string[]): Promise<number> {
  parseArgs(argv) // no command-specific flags today, --json is a global flag
  const json = getContext().json
  const cwd = process.cwd()

  let status = 0
  const report: JsonCheckResult[] = []
  const log = (line: string): void => {
    if (!json) console.log(line)
  }

  const run = (section: string, result: CheckResult): void => {
    report.push({ ...result, section })
    if (!result.ok) status = 1
    if (!json) printResult(result)
  }

  log('toolchain')
  run('toolchain', await checkToolVersion(cwd, 'nodejs', currentVersion('node')))
  run('toolchain', await checkToolVersion(cwd, 'pnpm', currentVersion('pnpm')))

  log('dependencies')
  run('dependencies', checkNodeModulesPresent(cwd))

  log('registry')
  run('registry', await checkRegistryPinned(cwd))

  log('content')
  run('content', await checkGitHasCommit(cwd))

  if (json) {
    process.stdout.write(`${JSON.stringify({ status: status === 0 ? 'ok' : 'fail', checks: report }, null, 2)}\n`)
  }

  return status
}
