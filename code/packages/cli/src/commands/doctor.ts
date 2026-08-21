'use strict'

import { readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

import { parseArgs } from '../lib/args.js'
import { exists } from '../lib/copy-template.js'
import { findRepoRoot } from '../lib/repo-root.js'
import { readSourceUrl, readStartPageComponent, readStartPath } from '../lib/playbook-yml.js'
import {
  checkAgentFilesPresent,
  checkAntoraAvailable,
  checkGitHasCommit,
  checkNamesAgree,
  checkNodeVersion,
  checkReleaseLabelExists,
  type CheckResult,
} from '../lib/doctor-checks.js'

interface PackageJson {
  name?: string
  engines?: { node?: string }
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

function printResult(result: CheckResult, colour: boolean): number {
  const ok = colour ? '\u001b[32m ok \u001b[0m' : ' ok '
  const fail = colour ? '\u001b[31mFAIL\u001b[0m' : 'FAIL'
  console.log(`  ${result.ok ? ok : fail}  ${result.label} — ${result.message}`)
  if (!result.ok && result.detail) {
    console.log(`         ${result.detail}`)
  }
  return result.ok ? 0 : 1
}

// Same rendering as printResult, but never contributes to the overall exit
// code — used only for checkAgentFilesPresent, which is presence, not
// something a build actually depends on (see that function's own comment).
// 'warn' instead of 'FAIL' so a missing file reads as advisory, not as the
// same severity as a broken build.
function printAdvisory(result: CheckResult, colour: boolean): void {
  const ok = colour ? '\u001b[32m ok \u001b[0m' : ' ok '
  const warn = colour ? '\u001b[33mwarn\u001b[0m' : 'warn'
  console.log(`  ${result.ok ? ok : warn}  ${result.label} — ${result.message}`)
  if (!result.ok && result.detail) {
    console.log(`         ${result.detail}`)
  }
}

export async function runDoctor(argv: string[]): Promise<number> {
  const { flags } = parseArgs(argv)
  const startDir = typeof flags.dir === 'string' ? resolve(flags.dir) : resolve(process.cwd())
  // --dir (or cwd) can be anywhere inside the repository — its root, inside
  // docs/, wherever — findRepoRoot walks up to find the actual repository
  // root the same way `git` itself would, so doctor always looks at
  // <repoRoot>/docs regardless of where it was invoked from.
  const target = await findRepoRoot(startDir)
  const siteRoot = join(target, 'docs')
  const colour = process.stdout.isTTY === true && !process.env.NO_COLOR

  if (!(await exists(siteRoot))) {
    console.error(`no site found at '${siteRoot}'`)
    console.error('pass --dir <path> to a component root (the parent of docs/), or run pdocs new first')
    return 1
  }

  let status = 0

  console.log('toolchain')
  const pkg = await readJson<PackageJson>(join(siteRoot, 'package.json'))
  status |= printResult(checkNodeVersion(pkg?.engines?.node, process.version), colour)

  console.log('names')
  const playbookFile = join(siteRoot, 'antora-playbook.yml')
  const antoraYmlFile = join(siteRoot, 'docs', 'antora.yml')

  const playbookContent = (await exists(playbookFile)) ? await readFile(playbookFile, 'utf8') : null
  const antoraYmlContent = (await exists(antoraYmlFile)) ? await readFile(antoraYmlFile, 'utf8') : null

  if (!playbookContent) {
    status |= printResult(
      { ok: false, label: 'antora-playbook.yml', message: `not found at '${playbookFile}'` },
      colour
    )
  }
  if (!antoraYmlContent) {
    status |= printResult({ ok: false, label: 'docs/antora.yml', message: `not found at '${antoraYmlFile}'` }, colour)
  }

  if (playbookContent && antoraYmlContent) {
    const sourceUrl = readSourceUrl(playbookContent)
    if (sourceUrl && sourceUrl !== '.') {
      // The repository-root-relative form of `docs/antora.yml`'s real
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
      for (const result of results) status |= printResult(result, colour)
    } else {
      status |= printResult(
        {
          ok: false,
          label: 'content source url',
          message: `content.sources[0].url is '.' but the playbook does not sit at the repository root`,
          detail:
            "url: '.' only works when antora-playbook.yml sits at the repository root — use 'url: ..' (or however many levels reach it) otherwise",
        },
        colour
      )
    }
  }

  console.log('content')
  status |= printResult(await checkGitHasCommit(target), colour)

  console.log('dependencies')
  status |= printResult(checkAntoraAvailable(siteRoot), colour)

  console.log('agent files')
  for (const result of checkAgentFilesPresent(target)) printAdvisory(result, colour)

  console.log('release')
  printAdvisory(await checkReleaseLabelExists(target), colour)

  return status === 0 ? 0 : 1
}
