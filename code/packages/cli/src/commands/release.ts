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
import { readVersionSourceDeclaration } from '../lib/package-version-source.js'
import { type ReleaseMode, resolveRelease, VERSION_SOURCES } from '../lib/release-resolve.js'

const USAGE =
  'usage: docouture release resolve --mode <versioned|standalone> [--version <v>] [--event <name>] [--release-tag <tag>] [--labels <a,b>] [--tags <a,b>] [--report] [--dir <path>]'

async function runResolve(argv: string[]): Promise<number> {
  const { flags } = parseArgs(argv)

  const mode = flags.mode
  if (mode !== 'versioned' && mode !== 'standalone') {
    console.error(USAGE)
    console.error(`invalid --mode: '${typeof mode === 'string' ? mode : ''}' — expected 'versioned' or 'standalone'`)
    return 1
  }

  const explicit = typeof flags.version === 'string' ? flags.version : undefined
  const report = flags.report === true
  const startDir = typeof flags.dir === 'string' ? resolve(flags.dir) : resolve(process.cwd())
  const repoRoot = await findRepoRoot(startDir)
  const descriptorFile = join(repoRoot, 'docs', '.release-version')
  const descriptor = (await exists(descriptorFile)) ? await readFile(descriptorFile, 'utf8') : null

  const packageJsonFile = join(repoRoot, 'docs', 'package.json')
  const declaration = (await exists(packageJsonFile))
    ? await readVersionSourceDeclaration(packageJsonFile)
    : { raw: null, source: 'descriptor' as const, prefix: null }
  if (declaration.source === null) {
    console.error(
      `::error::docs/package.json declares docouture.versionSource '${declaration.raw}' — expected one of: ${VERSION_SOURCES.join(', ')}`
    )
    return 1
  }
  const source = declaration.source
  const event = typeof flags.event === 'string' ? flags.event : undefined
  const releaseTag = typeof flags['release-tag'] === 'string' ? flags['release-tag'] : undefined
  const labels =
    typeof flags.labels === 'string'
      ? flags.labels
          .split(',')
          .map((label) => label.trim())
          .filter((label) => label !== '')
      : []
  // --tags injects the tag names (comma- or newline-separated) for callers with
  // no local tags to list, such as a shallow checkout without credentials.
  const injectedTags =
    typeof flags.tags === 'string'
      ? flags.tags
          .split(/[,\n]/)
          .map((tag) => tag.trim())
          .filter((tag) => tag !== '')
      : undefined
  const tags = source === 'tag-bump' && mode === 'versioned' ? (injectedTags ?? (await listDocsTags(repoRoot))) : []

  if (mode === 'standalone' && explicit !== undefined && explicit !== 'stable') {
    console.error(
      `::warning::Standalone mode always releases to the 'stable' tag — ignoring provided version '${explicit}'.`
    )
  }

  const result = resolveRelease({
    mode: mode as ReleaseMode,
    explicit,
    descriptor,
    source,
    event,
    releaseTag,
    prefix: declaration.prefix ?? undefined,
    labels,
    tags,
  })

  if (result.error && !report) {
    console.error(`::error::${result.error.message}`)
    return 1
  }

  console.log(`version=${result.version}`)
  console.log(`tag=${result.tag}`)
  console.log(`source=${result.source}`)
  console.log(`version_source=${mode === 'standalone' ? 'standalone' : source}`)
  console.log(`uses_descriptor=${result.usesDescriptor === true}`)
  if (result.error) {
    console.log(`error=${result.error.kind}`)
    console.log(`error_value=${result.error.value}`)
  }
  return 0
}

export async function runRelease(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv
  if (sub === 'resolve') return runResolve(rest)
  console.error(USAGE)
  console.error(`unknown release subcommand: '${sub ?? ''}' — expected 'resolve'`)
  return 1
}
