// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// Shared reader/writer for the `docouture.versionSource` (and optional
// `docouture.versionSourcePrefix`) declaration in docs/package.json — where
// the docs release version comes from. Same shape as package-branching.ts:
// every other key keeps its value and order, and the keys are placed directly
// after `branching`/`prereleaseBranch`.

import { readFile, writeFile } from 'node:fs/promises'

import { parseVersionSource, type VersionSource } from './release-resolve.js'

type Docouture = Record<string, unknown>

export interface VersionSourceDeclaration {
  // The raw declared value, or null when absent. Not validated here so
  // callers can report an unknown value with its text.
  raw: string | null
  // The declared source when valid; 'descriptor' when absent; null when the
  // declared value is not one of the three.
  source: VersionSource | null
  prefix: string | null
}

export async function readVersionSourceDeclaration(packageJsonFile: string): Promise<VersionSourceDeclaration> {
  const pkg = JSON.parse(await readFile(packageJsonFile, 'utf8')) as { docouture?: Docouture }
  const { versionSource, versionSourcePrefix } = pkg.docouture ?? {}
  const raw = typeof versionSource === 'string' ? versionSource : null
  return {
    raw,
    source: raw === null ? 'descriptor' : parseVersionSource(raw),
    prefix: typeof versionSourcePrefix === 'string' ? versionSourcePrefix : null,
  }
}

/**
 * Read-modify-write of the `docouture` block. `prefix` is only kept for
 * `github-release`. Returns true when the file content changed.
 */
export async function setVersionSource(
  packageJsonFile: string,
  source: VersionSource,
  prefix?: string
): Promise<boolean> {
  const original = await readFile(packageJsonFile, 'utf8')
  const pkg = JSON.parse(original) as { docouture?: Docouture }
  const entries = Object.entries(pkg.docouture ?? {}).filter(
    ([key]) => key !== 'versionSource' && key !== 'versionSourcePrefix'
  )

  const additions: [string, unknown][] = [['versionSource', source]]
  const keepPrefix = source === 'github-release' ? (prefix ?? readExistingPrefix(pkg)) : undefined
  if (keepPrefix) additions.push(['versionSourcePrefix', keepPrefix])

  let insertAt = 0
  entries.forEach(([key], index) => {
    if (key === 'branching' || key === 'prereleaseBranch') insertAt = index + 1
  })
  entries.splice(insertAt, 0, ...additions)

  pkg.docouture = Object.fromEntries(entries)
  const out = `${JSON.stringify(pkg, null, 2)}\n`
  if (out === original) return false
  await writeFile(packageJsonFile, out, 'utf8')
  return true
}

function readExistingPrefix(pkg: { docouture?: Docouture }): string | undefined {
  const value = pkg.docouture?.versionSourcePrefix
  return typeof value === 'string' && value !== '' ? value : undefined
}
