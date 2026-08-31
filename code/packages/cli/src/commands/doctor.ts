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
  checkReleaseLabelExists,
  type CheckResult,
} from '../lib/doctor-checks.js'

interface PackageJson {
  name?: string
  engines?: { node?: string }
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
  const match = /^name:\s*(.+?)\s*$/m.exec(content)
  return match?.[1] ?? null
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

  let status = 0
  const report: JsonCheckResult[] = []
  const log = (line: string): void => {
    if (!json) console.log(line)
  }

  log('toolchain')
  const pkg = await readJson<PackageJson>(join(siteRoot, 'package.json'))
  const nodeResult = checkNodeVersion(pkg?.engines?.node, process.version)
  status |= record(report, 'toolchain', nodeResult, 'fail')
  if (!json) printResult(nodeResult)

  log('names')
  const playbookFile = join(siteRoot, 'antora-playbook.yml')
  const antoraYmlFile = join(siteRoot, 'src', 'antora.yml')

  const playbookContent = (await exists(playbookFile)) ? await readFile(playbookFile, 'utf8') : null
  const antoraYmlContent = (await exists(antoraYmlFile)) ? await readFile(antoraYmlFile, 'utf8') : null

  if (!playbookContent) {
    const result = { ok: false, label: 'antora-playbook.yml', message: `not found at '${playbookFile}'` }
    status |= record(report, 'names', result, 'fail')
    if (!json) printResult(result)
  }
  if (!antoraYmlContent) {
    const result = { ok: false, label: 'src/antora.yml', message: `not found at '${antoraYmlFile}'` }
    status |= record(report, 'names', result, 'fail')
    if (!json) printResult(result)
  }

  if (playbookContent && antoraYmlContent) {
    const sourceUrl = readSourceUrl(playbookContent)
    if (sourceUrl && sourceUrl !== '.') {
      // The repository-root-relative form of `src/antora.yml`'s real
      // location — see lib/playbook-yml.ts's own comment on why `url: .`
      // only works when the playbook itself sits at the repository root.
      const descriptorPath = relative(target, dirname(antoraYmlFile)).split(sep).join('/')

      const results = checkNamesAgree({
        antoraYmlName: readAntoraYmlName(antoraYmlContent),
        startPageComponent: readStartPageComponent(playbookContent),
        startPath: readStartPath(playbookContent),
        descriptorPath,
        packageName: pkg?.name ?? null,
      })
      for (const result of results) {
        status |= record(report, 'names', result, 'fail')
        if (!json) printResult(result)
      }
    } else {
      const result = {
        ok: false,
        label: 'content source url',
        message: `content.sources[0].url is '.' but the playbook does not sit at the repository root`,
        detail:
          "url: '.' only works when antora-playbook.yml sits at the repository root — use 'url: ..' (or however many levels reach it) otherwise",
      }
      status |= record(report, 'names', result, 'fail')
      if (!json) printResult(result)
    }
  }

  log('content')
  const gitResult = await checkGitHasCommit(target)
  status |= record(report, 'content', gitResult, 'fail')
  if (!json) printResult(gitResult)

  log('dependencies')
  const antoraResult = checkAntoraAvailable(siteRoot)
  status |= record(report, 'dependencies', antoraResult, 'fail')
  if (!json) printResult(antoraResult)

  log('agent files')
  for (const result of checkAgentFilesPresent(target)) {
    record(report, 'agent files', result, 'warn')
    if (!json) printAdvisory(result)
  }

  log('release')
  const releaseResult = await checkReleaseLabelExists(target)
  record(report, 'release', releaseResult, 'warn')
  if (!json) printAdvisory(releaseResult)

  log('branching')
  const detectedBranches = await detectBranches(siteRoot, target)
  const branchingResult = checkBranchingAgrees({
    declaredBranching: pkg?.docouture?.branching ?? null,
    actualBranching: inferBranching(detectedBranches),
  })
  record(report, 'branching', branchingResult, 'warn')
  if (!json) printAdvisory(branchingResult)

  if (json) {
    process.stdout.write(`${JSON.stringify({ status: status === 0 ? 'ok' : 'fail', checks: report }, null, 2)}\n`)
  }

  return status === 0 ? 0 : 1
}
