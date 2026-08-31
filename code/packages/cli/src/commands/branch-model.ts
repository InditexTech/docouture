// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseArgs } from '../lib/args.js'
import { readCliInfo } from '../lib/cli-info.js'
import { copyTemplate, exists } from '../lib/copy-template.js'
import { detectPackageManager, packageManagerPlan } from '../lib/detect-package-manager.js'
import { findRepoRoot } from '../lib/repo-root.js'
import { readBranches, writeBranches } from '../lib/playbook-yml.js'
import { cacheWarmBranchesYaml, detectBranches, type Branching } from '../lib/branch-detect.js'

const BRANCH_MODELS = ['trunk-based', 'git-flow'] as const

// Same duplication precedent upgrade.ts's own isInsideGitWorkTree comment
// documents (doctor-checks.ts already sets it) — a small piece of new.ts's
// logic reused rather than importing the wizard-heavy module it lives in.
function isInsideGitWorkTree(dir: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dir, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function readAntoraField(content: string, key: 'name' | 'title'): string | null {
  const match = new RegExp(`^${key}:.*$`, 'm').exec(content)
  if (!match) return null
  const value = match[0].slice(key.length + 1).trim()
  return value.length > 0 ? value : null
}

interface DocouturePackageJson {
  docouture?: { branching?: string; [key: string]: unknown }
  [key: string]: unknown
}

// The one JSON write this command performs — a single field
// (`docouture.branching`), read-modify-write rather than a regex patch
// (unlike antora-playbook.yml/docouture-release.yml, package.json is
// already JSON, so there is no comment-preservation reason to avoid
// JSON.parse/stringify here the way playbook-yml.ts avoids a full YAML
// round-trip). Re-serializes the whole file at 2-space indent — matching
// every template's own style — rather than only touching the one line, so
// key ordering is preserved (JSON.parse/stringify both preserve insertion
// order) but incidental whitespace a human introduced is not.
async function writeBranching(packageJsonFile: string, branching: Branching): Promise<void> {
  const content = await readFile(packageJsonFile, 'utf8')
  const pkg = JSON.parse(content) as DocouturePackageJson
  pkg.docouture = { ...pkg.docouture, branching }
  await writeFile(packageJsonFile, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
}

export async function runBranchModel(argv: string[]): Promise<number> {
  const { positional, flags } = parseArgs(argv)

  const target = positional[0]
  if (!target || !(BRANCH_MODELS as readonly string[]).includes(target)) {
    console.error(
      `usage: docouture branch-model <trunk-based|git-flow> [--branch <name>] [--integration-branch <name>] [--release-branch <name>] [--dir <path>] [--dry-run]`
    )
    console.error(`invalid target: '${target ?? ''}' — expected 'trunk-based' or 'git-flow'`)
    return 1
  }
  const targetModel = target as Branching

  const dryRun = flags['dry-run'] === true
  const branchFlag = typeof flags.branch === 'string' ? flags.branch : undefined
  const integrationBranchFlag =
    typeof flags['integration-branch'] === 'string' ? flags['integration-branch'] : undefined
  const releaseBranchFlag = typeof flags['release-branch'] === 'string' ? flags['release-branch'] : undefined

  const startDir = typeof flags.dir === 'string' ? resolve(flags.dir) : resolve(process.cwd())

  if (!isInsideGitWorkTree(startDir)) {
    console.error(`'${startDir}' is not inside a git repository`)
    console.error(
      'docouture branch-model re-configures an already-scaffolded repository — run it from your repo root, or pass --dir <path> to one'
    )
    return 1
  }

  const repoRoot = await findRepoRoot(startDir)
  const siteRoot = join(repoRoot, 'docs')

  if (!(await exists(siteRoot))) {
    console.error(`no site found at '${siteRoot}'`)
    console.error('pass --dir <path> to a component root (the parent of docs/), or run docouture new first')
    return 1
  }

  // Always derived live, never read back from a stored config — see
  // lib/branch-detect.ts's own comment on why. Falls back to nothing
  // special for a site scaffolded before this feature existed: its
  // antora-playbook.yml/docouture-release.yml already have the exact same
  // shape (one literal branch, `main` in both places), so this is the only
  // path, not a legacy-only fallback.
  const detected = await detectBranches(siteRoot, repoRoot)
  if (!detected.prerelease || !detected.release) {
    console.error('could not determine this site\u2019s current branch names')
    console.error(`  antora-playbook.yml content.sources[0].branches: ${detected.prerelease ?? '(not found)'}`)
    console.error(`  docouture-release.yml checkout ref: ${detected.release ?? '(not found)'}`)
    console.error('is this a docouture-scaffolded site? (run docouture new first, or check --dir)')
    return 1
  }

  const currentModel: Branching = detected.prerelease === detected.release ? 'trunk-based' : 'git-flow'

  let newPrerelease: string
  let newRelease: string

  if (targetModel === 'trunk-based') {
    if (currentModel === 'git-flow') {
      if (!branchFlag) {
        console.error('switching from git-flow to trunk-based requires --branch <name>')
        console.error(`  must match one of the current two branches: '${detected.prerelease}' or '${detected.release}'`)
        return 1
      }
      if (branchFlag !== detected.prerelease && branchFlag !== detected.release) {
        console.error(`--branch '${branchFlag}' does not match either current branch`)
        console.error(`  current prerelease branch: '${detected.prerelease}'`)
        console.error(`  current release branch: '${detected.release}'`)
        console.error(
          'refusing to invent a third branch name — collapsing two branches into one is lossy: pick one of the two that already exist'
        )
        return 1
      }
      newPrerelease = branchFlag
      newRelease = branchFlag
    } else {
      const branch = branchFlag ?? detected.release
      newPrerelease = branch
      newRelease = branch
    }
  } else {
    if (currentModel === 'trunk-based') {
      // Least-disruption default (see the issue's own design note): the
      // current single branch becomes *release* — whatever already got
      // tagged off it keeps working unchanged — and a NEW name is required
      // for the integration/prerelease branch, since there is nothing
      // already on disk to infer that from.
      if (!integrationBranchFlag) {
        console.error('switching from trunk-based to git-flow requires --integration-branch <name>')
        console.error(`  the current branch ('${detected.release}') becomes the release branch by default`)
        console.error('  (override with --release-branch if you want a different name for it too)')
        return 1
      }
      newPrerelease = integrationBranchFlag
      newRelease = releaseBranchFlag ?? detected.release
    } else {
      newPrerelease = integrationBranchFlag ?? detected.prerelease
      newRelease = releaseBranchFlag ?? detected.release
    }
  }

  if (targetModel === currentModel && newPrerelease === detected.prerelease && newRelease === detected.release) {
    console.log(
      `already ${currentModel} (${newPrerelease === newRelease ? newPrerelease : `${newPrerelease}/${newRelease}`}) — nothing to do`
    )
    return 0
  }

  const here = dirname(fileURLToPath(import.meta.url))
  const templatesRoot = join(here, '..', 'templates')
  const workflowsTemplateDir = join(templatesRoot, 'workflows')
  const workflowsDir = join(repoRoot, '.github', 'workflows')

  const { version: cliVersion } = await readCliInfo(import.meta.url, 2)
  const pm = packageManagerPlan(detectPackageManager(repoRoot))

  const descriptorPath = join(siteRoot, 'src', 'antora.yml')
  let name = 'docs'
  let title = 'Docs'
  if (await exists(descriptorPath)) {
    const content = await readFile(descriptorPath, 'utf8')
    name = readAntoraField(content, 'name') ?? name
    title = readAntoraField(content, 'title') ?? title
  }

  const values = {
    name,
    title,
    // Same reasoning as upgrade.ts's own comment: neither placeholder
    // appears in any file this command re-renders (workflows only), so
    // there is nothing meaningful to compute either from.
    componentName: 'unused-by-branch-model',
    cliVersion,
    pmName: pm.pm,
    pmCacheName: pm.cacheName,
    pmLockfile: pm.lockfile,
    pmCiCmd: pm.ciCmd,
    pmSetupStepYaml: pm.setupStepYaml,
    pmPackageManagerField: 'unused-by-branch-model',
    repoIgnoreGlob: 'unused-by-branch-model',
    prereleaseBranch: newPrerelease,
    releaseBranch: newRelease,
    // docs/package.json is patched directly below (writeBranching), not via
    // copyTemplate — this placeholder only ever appears in that file.
    branching: 'unused-by-branch-model',
    cacheWarmBranchesYaml: cacheWarmBranchesYaml(newPrerelease, newRelease),
  }

  const playbookFile = join(siteRoot, 'antora-playbook.yml')
  const packageJsonFile = join(siteRoot, 'package.json')

  if (dryRun) {
    const plannedWorkflows = await copyTemplate(workflowsTemplateDir, workflowsDir, values, { dryRun: true })
    console.log(`would switch ${currentModel} -> ${targetModel}`)
    console.log(`  prerelease branch: '${detected.prerelease}' -> '${newPrerelease}'`)
    console.log(`  release branch: '${detected.release}' -> '${newRelease}'`)
    console.log('would write:')
    for (const path of [...plannedWorkflows, playbookFile, packageJsonFile]) {
      console.log(`  ${relative(repoRoot, path)}`)
    }
    return 0
  }

  await copyTemplate(workflowsTemplateDir, workflowsDir, values)

  const playbookContent = await readFile(playbookFile, 'utf8')
  // Only rewritten if the prerelease branch actually changed and the line
  // is still there in the shape readBranches/writeBranches expect —
  // guards against a hand-edited playbook this regex can't safely touch.
  if (newPrerelease !== detected.prerelease && readBranches(playbookContent)) {
    await writeFile(playbookFile, writeBranches(playbookContent, newPrerelease), 'utf8')
  }

  await writeBranching(packageJsonFile, targetModel)

  console.log(`switched ${currentModel} -> ${targetModel}`)
  console.log(`  prerelease branch: '${detected.prerelease}' -> '${newPrerelease}'`)
  console.log(`  release branch: '${detected.release}' -> '${newRelease}'`)
  console.log(`updated ${relative(repoRoot, workflowsDir)}`)
  console.log(`updated ${relative(repoRoot, playbookFile)}`)
  console.log(`updated ${relative(repoRoot, packageJsonFile)}`)
  console.log('')
  console.log('this command does NOT:')
  console.log('  - rename actual git branches')
  console.log('  - touch branch-protection/ruleset rules')
  console.log("  - change GitHub's configured default branch")
  console.log('these are still manual steps — see docs/src/modules/main/pages/guides-branching-model.adoc')

  return 0
}
