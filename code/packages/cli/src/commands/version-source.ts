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
import {
  readVersionSourceDeclaration,
  setVersionSource,
  type VersionSourceDeclaration,
} from '../lib/package-version-source.js'
import { printTagBumpLabelCommands } from '../lib/release-labels.js'
import { parseVersionSource, TAG_PREFIX, VERSION_SOURCES, type VersionSource } from '../lib/release-resolve.js'
import { findRepoRoot } from '../lib/repo-root.js'
import { bumpVersion, highestSemver, isSemver } from '../lib/semver.js'
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

interface Invocation {
  target: VersionSource | null
  dryRun: boolean
  explicitVersion: string | undefined
  prefix: string | undefined
  startDir: string
}

type Parsed = { ok: true; invocation: Invocation } | { ok: false; errors: string[] }

function parseInvocation(argv: string[]): Parsed {
  const { positional, flags } = parseArgs(argv)
  const explicitVersion = typeof flags.version === 'string' ? flags.version : undefined
  const prefix = typeof flags.prefix === 'string' ? flags.prefix : undefined
  const targetArg = positional[0]
  const target = targetArg === undefined ? null : parseVersionSource(targetArg)

  if (targetArg !== undefined && target === null) {
    return {
      ok: false,
      errors: [USAGE, `invalid source: '${targetArg}' — expected one of: ${VERSION_SOURCES.join(', ')}`],
    }
  }
  if (explicitVersion !== undefined && !isSemver(explicitVersion)) {
    return { ok: false, errors: [`--version '${explicitVersion}' is not a valid SemVer version like 1.2.0`] }
  }
  if (prefix !== undefined && target !== 'github-release') {
    return { ok: false, errors: ['--prefix only applies to the github-release source'] }
  }
  const startDir = typeof flags.dir === 'string' ? resolve(flags.dir) : resolve(process.cwd())
  return { ok: true, invocation: { target, dryRun: flags['dry-run'] === true, explicitVersion, prefix, startDir } }
}

interface Site {
  repoRoot: string
  siteRoot: string
  packageJsonFile: string
}

type Located = { ok: true; site: Site } | { ok: false; errors: string[] }

// Finds the repository and its versioned site; every other outcome is an
// error naming what is wrong (not a git repo, no site, standalone, unknown).
async function locateSite(startDir: string): Promise<Located> {
  if (!isInsideGitWorkTree(startDir)) {
    return {
      ok: false,
      errors: [
        `'${startDir}' is not inside a git repository`,
        'docouture version-source re-configures an already-scaffolded repository — run it from your repo root, or pass --dir <path> to one',
      ],
    }
  }
  const repoRoot = await findRepoRoot(startDir)
  const siteRoot = join(repoRoot, 'docs')
  const packageJsonFile = join(siteRoot, 'package.json')
  if (!(await exists(packageJsonFile))) {
    return {
      ok: false,
      errors: [
        `no site found at '${siteRoot}'`,
        'pass --dir <path> to a component root (the parent of docs/), or run docouture new first',
      ],
    }
  }
  const mode = await detectSiteMode(siteRoot)
  if (mode === 'standalone') {
    return {
      ok: false,
      errors: [
        'this is a standalone (Stable + Prerelease) site — it has no docs version source',
        "standalone releases always target the 'docs/stable' tag; only versioned sites choose a source",
      ],
    }
  }
  if (mode === null) {
    return {
      ok: false,
      errors: [
        "could not tell whether this site is versioned or standalone from docs/antora-playbook.yml's tags",
        'is this a docouture-scaffolded site? (run docouture new first, or check --dir)',
      ],
    }
  }
  return { ok: true, site: { repoRoot, siteRoot, packageJsonFile } }
}

interface Plan {
  steps: string[]
  warnings: string[]
  // Version to write to docs/.release-version, when it is to be (re)written.
  seed: string | null
  removeDescriptor: boolean
}

async function planDescriptor(site: Site, invocation: Invocation, descriptorExists: boolean): Promise<Plan> {
  const { explicitVersion } = invocation
  if (!descriptorExists || explicitVersion !== undefined) {
    const seed = await seedVersion(site.repoRoot, explicitVersion)
    const verb = descriptorExists ? 'overwrite' : 'create'
    return {
      steps: [`${verb} ${relative(site.repoRoot, join(site.siteRoot, '.release-version'))} with ${seed}`],
      warnings: [],
      seed,
      removeDescriptor: false,
    }
  }
  return { steps: [], warnings: [], seed: null, removeDescriptor: false }
}

async function planRemoval(site: Site, descriptorExists: boolean): Promise<Plan> {
  if (!descriptorExists) return { steps: [], warnings: [], seed: null, removeDescriptor: false }
  const file = join(site.siteRoot, '.release-version')
  const rel = relative(site.repoRoot, file)
  const pending = (await readFile(file, 'utf8')).trim()
  return {
    steps: [`remove ${rel}`],
    warnings: pending === '' ? [] : [`${rel} held the pending version '${pending}', which is discarded`],
    seed: null,
    removeDescriptor: true,
  }
}

function needsDeclarationChange(declaration: VersionSourceDeclaration, invocation: Invocation): boolean {
  const { target, prefix } = invocation
  if (declaration.source !== target || declaration.raw === null) return true
  return target === 'github-release' && prefix !== undefined && prefix !== declaration.prefix
}

async function buildPlan(site: Site, invocation: Invocation, declaration: VersionSourceDeclaration): Promise<Plan> {
  const descriptorExists = await exists(join(site.siteRoot, '.release-version'))
  const files =
    invocation.target === 'descriptor'
      ? await planDescriptor(site, invocation, descriptorExists)
      : await planRemoval(site, descriptorExists)
  if (!needsDeclarationChange(declaration, invocation)) return files
  const declare = `set docouture.versionSource to '${invocation.target}' in ${relative(site.repoRoot, site.packageJsonFile)}`
  return { ...files, steps: [declare, ...files.steps] }
}

function printNotes(target: VersionSource): void {
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
}

function printCurrent(declaration: VersionSourceDeclaration): number {
  if (declaration.source === null) {
    console.error(
      `docouture.versionSource '${declaration.raw}' is not a known source — expected one of: ${VERSION_SOURCES.join(', ')}`
    )
    return 1
  }
  console.log(`version source: ${declaration.source}`)
  if (declaration.prefix) console.log(`prefix: ${declaration.prefix}`)
  return 0
}

function fail(errors: string[]): number {
  for (const line of errors) console.error(line)
  return 1
}

export async function runVersionSource(argv: string[]): Promise<number> {
  const parsed = parseInvocation(argv)
  if (!parsed.ok) return fail(parsed.errors)
  const { invocation } = parsed
  const { target, dryRun, prefix } = invocation

  const located = await locateSite(invocation.startDir)
  if (!located.ok) return fail(located.errors)
  const { site } = located

  const declaration = await readVersionSourceDeclaration(site.packageJsonFile)
  if (target === null) return printCurrent(declaration)

  const plan = await buildPlan(site, invocation, declaration)
  if (plan.steps.length === 0) {
    console.log(`already '${target}' — nothing to do`)
    return 0
  }

  if (dryRun) {
    console.log('would:')
    for (const step of plan.steps) console.log(`  ${step}`)
    for (const warning of plan.warnings) console.log(`warning: ${warning}`)
    return 0
  }

  const descriptorFile = join(site.siteRoot, '.release-version')
  await setVersionSource(site.packageJsonFile, target, prefix)
  if (plan.seed !== null) await writeFile(descriptorFile, `${plan.seed}\n`, 'utf8')
  if (plan.removeDescriptor) await rm(descriptorFile)

  console.log(`version source is now '${target}'`)
  for (const step of plan.steps) console.log(`  ${step}`)
  for (const warning of plan.warnings) console.warn(`warning: ${warning}`)
  printNotes(target)
  return 0
}
