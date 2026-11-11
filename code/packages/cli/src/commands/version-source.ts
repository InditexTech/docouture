// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { execFileSync } from 'node:child_process'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

import { parseArgs } from '../lib/args.js'
import { exists } from '../lib/copy-template.js'
import { listDocsTags } from '../lib/docs-tags.js'
import { readVersionSourceDeclaration, setVersionSource } from '../lib/package-version-source.js'
import { printTagBumpLabelCommands } from '../lib/release-labels.js'
import { parseVersionSource, SEMVER_RE, TAG_PREFIX, VERSION_SOURCES } from '../lib/release-resolve.js'
import { findRepoRoot } from '../lib/repo-root.js'
import { bumpVersion, highestSemver } from '../lib/semver.js'
import { detectSiteMode } from '../lib/site-mode.js'

const USAGE =
  'usage: docouture version-source [descriptor|github-release|tag-bump] [--prefix <p>] [--version <X.Y.Z>] [--dir <path>] [--dry-run]'

// Seed used when a `descriptor` site has no docs/v* tag to bump from — the
// same value `docouture new` lays down for a fresh versioned site.
const FIRST_VERSION = '0.1.0'

function isInsideGitWorkTree(dir: string): boolean {
  try {
    // Resolves 'git' off PATH, same as any shell script would — same
    // reasoning as branch-model.ts's own copy of this function.
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dir, stdio: 'ignore' }) // NOSONAR
    return true
  } catch {
    return false
  }
}

async function seedVersion(repoRoot: string, explicit: string | undefined): Promise<string> {
  if (explicit !== undefined) return explicit
  const tags = await listDocsTags(repoRoot)
  const latest = highestSemver(
    tags.filter((tag) => tag.startsWith(TAG_PREFIX)).map((tag) => tag.slice(TAG_PREFIX.length))
  )
  return latest === null ? FIRST_VERSION : bumpVersion(latest, 'patch')
}

export async function runVersionSource(argv: string[]): Promise<number> {
  const { positional, flags } = parseArgs(argv)

  const dryRun = flags['dry-run'] === true
  const explicitVersion = typeof flags.version === 'string' ? flags.version : undefined
  const prefix = typeof flags.prefix === 'string' ? flags.prefix : undefined
  const startDir = typeof flags.dir === 'string' ? resolve(flags.dir) : resolve(process.cwd())

  const targetArg = positional[0]
  const target = targetArg === undefined ? null : parseVersionSource(targetArg)
  if (targetArg !== undefined && target === null) {
    console.error(USAGE)
    console.error(`invalid source: '${targetArg}' — expected one of: ${VERSION_SOURCES.join(', ')}`)
    return 1
  }

  if (explicitVersion !== undefined && !SEMVER_RE.test(explicitVersion)) {
    console.error(`--version '${explicitVersion}' is not a valid SemVer version like 1.2.0`)
    return 1
  }

  if (!isInsideGitWorkTree(startDir)) {
    console.error(`'${startDir}' is not inside a git repository`)
    console.error(
      'docouture version-source re-configures an already-scaffolded repository — run it from your repo root, or pass --dir <path> to one'
    )
    return 1
  }

  const repoRoot = await findRepoRoot(startDir)
  const siteRoot = join(repoRoot, 'docs')
  const packageJsonFile = join(siteRoot, 'package.json')
  if (!(await exists(packageJsonFile))) {
    console.error(`no site found at '${siteRoot}'`)
    console.error('pass --dir <path> to a component root (the parent of docs/), or run docouture new first')
    return 1
  }

  const mode = await detectSiteMode(siteRoot)
  if (mode === 'standalone') {
    console.error('this is a standalone (Stable + Prerelease) site — it has no docs version source')
    console.error("standalone releases always target the 'docs/stable' tag; only versioned sites choose a source")
    return 1
  }
  if (mode === null) {
    console.error("could not tell whether this site is versioned or standalone from docs/antora-playbook.yml's tags")
    console.error('is this a docouture-scaffolded site? (run docouture new first, or check --dir)')
    return 1
  }

  const declaration = await readVersionSourceDeclaration(packageJsonFile)
  if (target === null) {
    console.log(`version source: ${declaration.source ?? `${declaration.raw} (invalid)`}`)
    if (declaration.prefix) console.log(`prefix: ${declaration.prefix}`)
    return 0
  }

  if (prefix !== undefined && target !== 'github-release') {
    console.error('--prefix only applies to the github-release source')
    return 1
  }

  const descriptorFile = join(siteRoot, '.release-version')
  const descriptorExists = await exists(descriptorFile)
  const rel = (path: string): string => relative(repoRoot, path)

  const plan: string[] = []
  const warnings: string[] = []
  let seed: string | null = null

  if (target === 'descriptor') {
    if (explicitVersion !== undefined || !descriptorExists) {
      seed = await seedVersion(repoRoot, explicitVersion)
      plan.push(`${descriptorExists ? 'overwrite' : 'create'} ${rel(descriptorFile)} with ${seed}`)
    }
  } else if (descriptorExists) {
    const pending = (await readFile(descriptorFile, 'utf8')).trim()
    if (pending !== '') {
      warnings.push(`${rel(descriptorFile)} held the pending version '${pending}', which is discarded`)
    }
    plan.push(`remove ${rel(descriptorFile)}`)
  }

  const prefixChange = target === 'github-release' && prefix !== undefined && prefix !== declaration.prefix
  if (declaration.source !== target || declaration.raw === null || prefixChange) {
    plan.unshift(`set docouture.versionSource to '${target}' in ${rel(packageJsonFile)}`)
  }

  if (plan.length === 0) {
    console.log(`already '${target}' — nothing to do`)
    return 0
  }

  if (dryRun) {
    console.log('would:')
    for (const line of plan) console.log(`  ${line}`)
    for (const warning of warnings) console.log(`warning: ${warning}`)
    return 0
  }

  await setVersionSource(packageJsonFile, target, prefix)
  if (seed !== null) await writeFile(descriptorFile, `${seed}\n`, 'utf8')
  else if (target !== 'descriptor' && descriptorExists) await rm(descriptorFile)

  console.log(`version source is now '${target}'`)
  for (const line of plan.slice(1)) console.log(`  ${line}`)
  for (const warning of warnings) console.warn(`warning: ${warning}`)

  console.log('')
  console.log('The release workflows read the source at run time — no workflow files need re-rendering,')
  console.log('but they run the project\u2019s installed CLI: make sure it is a version with `release resolve`.')
  if (target === 'tag-bump') {
    console.log('')
    printTagBumpLabelCommands()
  }
  if (target === 'github-release') {
    console.log('')
    console.log("Docs are now released when your code release publishes a GitHub Release — a merged 'docs/release'")
    console.log('pull request fails. Use --prefix <p> if your release tags carry a prefix (e.g. docs-site@).')
  }
  return 0
}
