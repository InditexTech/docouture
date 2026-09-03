// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

import { parseArgs } from '../lib/args.js'
import { exists } from '../lib/copy-template.js'
import { findRepoRoot } from '../lib/repo-root.js'
import { getContext } from '../lib/cli-context.js'
import { theme } from '../lib/theme.js'
import { readSourceUrl, readStartPageComponent, readStartPath } from '../lib/playbook-yml.js'
import { detectBranches, inferBranching } from '../lib/branch-detect.js'
import {
  checkAgentFilesPresent,
  checkAntoraAvailable,
  checkBranchingAgrees,
  checkGitHasCommit,
  checkNamesAgree,
  checkNodeVersion,
  checkPackageManagerAvailable,
  checkReleaseLabelExists,
  type CheckResult,
} from '../lib/doctor-checks.js'

interface PackageJson {
  name?: string
  engines?: { node?: string }
  packageManager?: string
  docouture?: { branching?: string }
}

interface JsonCheckResult extends CheckResult {
  section: string
  severity: 'fail' | 'warn' | 'ok'
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    return null
  }
}

function readAntoraYmlName(content: string): string | null {
  // No trailing `\s*$`: a lazy `.+?` immediately followed by `\s*$` is
  // ambiguous about where the captured value ends and the trimmed
  // whitespace begins (both can match a trailing space) — the classic
  // shape a catastrophic-backtracking scanner flags. Capturing greedily to
  // the real end of the line and trimming in JS gets the identical value
  // with no such ambiguity.
  const match = /^name:\s*(.+)$/m.exec(content)
  return match?.[1]?.trim() || null
}

// Every check is recorded here as it runs, in section order, regardless of
// whether the human-readable report or --json is what actually gets
// printed — this is the one source of truth both output modes read from,
// so they can never drift from each other on which checks ran or what they
// found.
function record(report: JsonCheckResult[], section: string, result: CheckResult, severity: 'fail' | 'warn'): number {
  report.push({ ...result, section, severity: result.ok ? 'ok' : severity })
  if (severity === 'fail') return result.ok ? 0 : 1
  return 0
}

function printResult(result: CheckResult): void {
  const ok = theme.success(' ok ')
  const fail = theme.error('FAIL')
  console.log(`  ${result.ok ? ok : fail}  ${result.label} — ${result.message}`)
  if (!result.ok && result.detail) {
    console.log(`         ${result.detail}`)
  }
}

// Same rendering as printResult, but never contributes to the overall exit
// code — used only for advisory checks (agent files, release label): 'warn'
// instead of 'FAIL' so a missing file reads as advisory, not as the same
// severity as a broken build.
function printAdvisory(result: CheckResult): void {
  const ok = theme.success(' ok ')
  const warn = theme.warn('warn')
  console.log(`  ${result.ok ? ok : warn}  ${result.label} — ${result.message}`)
  if (!result.ok && result.detail) {
    console.log(`         ${result.detail}`)
  }
}

// Records one result and prints it (or not, in --json mode), returning the
// exit-code contribution — this is the single place that couples "what
// happened" (record) to "what the human sees" (printResult/printAdvisory),
// so every check site below is a single expression instead of a three-line
// record-then-print block.
function runCheck(
  report: JsonCheckResult[],
  section: string,
  result: CheckResult,
  severity: 'fail' | 'warn',
  json: boolean
): number {
  const inc = record(report, section, result, severity)
  if (json) return inc
  if (severity === 'fail') printResult(result)
  else printAdvisory(result)
  return inc
}

function runChecks(
  report: JsonCheckResult[],
  section: string,
  results: CheckResult[],
  severity: 'fail' | 'warn',
  json: boolean
): number {
  let status = 0
  for (const result of results) status |= runCheck(report, section, result, severity, json)
  return status
}

async function runToolchainSection(report: JsonCheckResult[], json: boolean, pkg: PackageJson | null): Promise<number> {
  const nodeResult = checkNodeVersion(pkg?.engines?.node, process.version)
  let status = runCheck(report, 'toolchain', nodeResult, 'fail', json)
  const pmResult = await checkPackageManagerAvailable(pkg?.packageManager ?? null)
  status |= runCheck(report, 'toolchain', pmResult, 'fail', json)
  return status
}

// The one section with real branching: names only agree with each other
// once both files exist AND the playbook's content source url actually
// resolves to where src/antora.yml lives (see lib/playbook-yml.ts for why
// `url: .` is special-cased) — every other case is a guard clause that
// records a single failing check and stops, so nesting never goes past one
// level.
async function runNamesSection(params: {
  report: JsonCheckResult[]
  json: boolean
  target: string
  siteRoot: string
  pkg: PackageJson | null
}): Promise<number> {
  const { report, json, target, siteRoot, pkg } = params
  const playbookFile = join(siteRoot, 'antora-playbook.yml')
  const antoraYmlFile = join(siteRoot, 'src', 'antora.yml')
  const playbookContent = (await exists(playbookFile)) ? await readFile(playbookFile, 'utf8') : null
  const antoraYmlContent = (await exists(antoraYmlFile)) ? await readFile(antoraYmlFile, 'utf8') : null

  let status = 0
  if (!playbookContent) {
    status |= runCheck(
      report,
      'names',
      { ok: false, label: 'antora-playbook.yml', message: `not found at '${playbookFile}'` },
      'fail',
      json
    )
  }
  if (!antoraYmlContent) {
    status |= runCheck(
      report,
      'names',
      { ok: false, label: 'src/antora.yml', message: `not found at '${antoraYmlFile}'` },
      'fail',
      json
    )
  }
  if (!playbookContent || !antoraYmlContent) return status

  const sourceUrl = readSourceUrl(playbookContent)
  if (!sourceUrl || sourceUrl === '.') {
    return (
      status |
      runCheck(
        report,
        'names',
        {
          ok: false,
          label: 'content source url',
          message: `content.sources[0].url is '.' but the playbook does not sit at the repository root`,
          detail:
            "url: '.' only works when antora-playbook.yml sits at the repository root — use 'url: ..' (or however many levels reach it) otherwise",
        },
        'fail',
        json
      )
    )
  }

  // The repository-root-relative form of `src/antora.yml`'s real location —
  // see lib/playbook-yml.ts's own comment on why `url: .` only works when
  // the playbook itself sits at the repository root.
  const descriptorPath = relative(target, dirname(antoraYmlFile)).split(sep).join('/')
  const results = checkNamesAgree({
    antoraYmlName: readAntoraYmlName(antoraYmlContent),
    startPageComponent: readStartPageComponent(playbookContent),
    startPath: readStartPath(playbookContent),
    descriptorPath,
    packageName: pkg?.name ?? null,
  })
  return status | runChecks(report, 'names', results, 'fail', json)
}

export async function runDoctor(argv: string[]): Promise<number> {
  const { flags } = parseArgs(argv)
  const json = getContext().json
  const startDir = typeof flags.dir === 'string' ? resolve(flags.dir) : resolve(process.cwd())
  // --dir (or cwd) can be anywhere inside the repository — its root, inside
  // docs/, wherever — findRepoRoot walks up to find the actual repository
  // root the same way `git` itself would, so doctor always looks at
  // <repoRoot>/docs regardless of where it was invoked from.
  const target = await findRepoRoot(startDir)
  const siteRoot = join(target, 'docs')

  if (!(await exists(siteRoot))) {
    console.error(`no site found at '${siteRoot}'`)
    console.error('pass --dir <path> to a component root (the parent of docs/), or run docouture new first')
    return 1
  }

  const report: JsonCheckResult[] = []
  const log = (line: string): void => {
    if (!json) console.log(line)
  }
  const pkg = await readJson<PackageJson>(join(siteRoot, 'package.json'))

  let status = 0

  log('toolchain')
  status |= await runToolchainSection(report, json, pkg)

  log('names')
  status |= await runNamesSection({ report, json, target, siteRoot, pkg })

  log('content')
  status |= runCheck(report, 'content', await checkGitHasCommit(target), 'fail', json)

  log('dependencies')
  status |= runCheck(report, 'dependencies', checkAntoraAvailable(siteRoot), 'fail', json)

  log('agent files')
  runChecks(report, 'agent files', checkAgentFilesPresent(target), 'warn', json)

  log('release')
  runCheck(report, 'release', await checkReleaseLabelExists(target), 'warn', json)

  log('branching')
  const detectedBranches = await detectBranches(siteRoot, target)
  runCheck(
    report,
    'branching',
    checkBranchingAgrees({
      declaredBranching: pkg?.docouture?.branching ?? null,
      actualBranching: inferBranching(detectedBranches),
    }),
    'warn',
    json
  )

  if (json) {
    process.stdout.write(`${JSON.stringify({ status: status === 0 ? 'ok' : 'fail', checks: report }, null, 2)}\n`)
  }

  return status === 0 ? 0 : 1
}
