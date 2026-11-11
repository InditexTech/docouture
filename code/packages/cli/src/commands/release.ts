// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { parseArgs } from '../lib/args.js'
import { exists } from '../lib/copy-template.js'
import { listDocsTags } from '../lib/docs-tags.js'
import { findRepoRoot } from '../lib/repo-root.js'
import { readVersionSourceDeclaration, type VersionSourceDeclaration } from '../lib/package-version-source.js'
import {
  type ReleaseMode,
  type ReleaseResolution,
  resolveRelease,
  VERSION_SOURCES,
  type VersionSource,
} from '../lib/release-resolve.js'

const USAGE =
  'usage: docouture release resolve --mode <versioned|standalone> [--version <v>] [--event <name>] [--release-tag <tag>] [--labels <a,b>] [--tags <a,b>] [--report] [--dir <path>]'

type Flags = Record<string, string | boolean>

function stringFlag(flags: Flags, name: string): string | undefined {
  const value = flags[name]
  return typeof value === 'string' ? value : undefined
}

// A comma- (or, with `newlines`, newline-) separated flag value as a clean list.
function listFlag(value: string | undefined, separator: RegExp): string[] | undefined {
  if (value === undefined) return undefined
  return value
    .split(separator)
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

async function readDescriptor(repoRoot: string): Promise<string | null> {
  const file = join(repoRoot, 'docs', '.release-version')
  return (await exists(file)) ? await readFile(file, 'utf8') : null
}

async function readDeclaration(repoRoot: string): Promise<VersionSourceDeclaration> {
  const file = join(repoRoot, 'docs', 'package.json')
  if (!(await exists(file))) return { raw: null, source: 'descriptor', prefix: null }
  return readVersionSourceDeclaration(file)
}

function warnIgnoredStandaloneVersion(mode: ReleaseMode, explicit: string | undefined): void {
  if (mode !== 'standalone' || explicit === undefined || explicit === 'stable') return
  console.error(
    `::warning::Standalone mode always releases to the 'stable' tag — ignoring provided version '${explicit}'.`
  )
}

// Only a versioned `tag-bump` run reads tags. --tags injects the names (comma-
// or newline-separated) for callers with no local tags to list, such as a
// shallow checkout without credentials.
async function resolveTags(
  mode: ReleaseMode,
  source: VersionSource,
  injected: string[] | undefined,
  repoRoot: string
): Promise<string[]> {
  if (mode !== 'versioned' || source !== 'tag-bump') return []
  return injected ?? (await listDocsTags(repoRoot))
}

function printResult(result: ReleaseResolution, mode: ReleaseMode, source: VersionSource): void {
  console.log(`version=${result.version}`)
  console.log(`tag=${result.tag}`)
  console.log(`source=${result.source}`)
  console.log(`version_source=${mode === 'standalone' ? 'standalone' : source}`)
  console.log(`uses_descriptor=${result.usesDescriptor === true}`)
  if (result.error) {
    console.log(`error=${result.error.kind}`)
    console.log(`error_value=${result.error.value}`)
  }
}

async function runResolve(argv: string[]): Promise<number> {
  const { flags } = parseArgs(argv)

  const mode = flags.mode
  if (mode !== 'versioned' && mode !== 'standalone') {
    console.error(USAGE)
    console.error(`invalid --mode: '${typeof mode === 'string' ? mode : ''}' — expected 'versioned' or 'standalone'`)
    return 1
  }

  const explicit = stringFlag(flags, 'version')
  const startDir = typeof flags.dir === 'string' ? resolve(flags.dir) : resolve(process.cwd())
  const repoRoot = await findRepoRoot(startDir)

  const declaration = await readDeclaration(repoRoot)
  if (declaration.source === null) {
    console.error(
      `::error::docs/package.json declares docouture.versionSource '${declaration.raw}' — expected one of: ${VERSION_SOURCES.join(', ')}`
    )
    return 1
  }
  const source = declaration.source

  warnIgnoredStandaloneVersion(mode, explicit)

  const result = resolveRelease({
    mode,
    explicit,
    descriptor: await readDescriptor(repoRoot),
    source,
    event: stringFlag(flags, 'event'),
    releaseTag: stringFlag(flags, 'release-tag'),
    prefix: declaration.prefix ?? undefined,
    labels: listFlag(stringFlag(flags, 'labels'), /,/) ?? [],
    tags: await resolveTags(mode, source, listFlag(stringFlag(flags, 'tags'), /[,\n]/), repoRoot),
  })

  if (result.error && flags.report !== true) {
    console.error(`::error::${result.error.message}`)
    return 1
  }

  printResult(result, mode, source)
  return 0
}

export async function runRelease(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv
  if (sub === 'resolve') return runResolve(rest)
  console.error(USAGE)
  console.error(`unknown release subcommand: '${sub ?? ''}' — expected 'resolve'`)
  return 1
}
