// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// The generated workflows run the CLI the project itself installed
// (`npx docouture ...` under docs/), not whichever one is running now. This
// reads back what that is, so `upgrade` and `doctor` can warn about a skew.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { exists } from './copy-template.js'

const CLI_PACKAGE = '@inditextech/docouture-cli'

export interface ProjectCli {
  // Version of the CLI the project resolves, or null when it cannot be told.
  version: string | null
  // Whether the project's installed CLI ships `release resolve`; null when
  // the CLI is not installed (so there is nothing to probe).
  hasReleaseResolve: boolean | null
  // 'installed' (read from node_modules) or 'declared' (from package.json).
  from: 'installed' | 'declared' | null
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    return null
  }
}

interface InstalledCli {
  version: string
  hasReleaseResolve: boolean
}

async function readInstalledCli(base: string): Promise<InstalledCli | null> {
  const dir = join(base, 'node_modules', ...CLI_PACKAGE.split('/'))
  const pkg = await readJson<{ version?: string }>(join(dir, 'package.json'))
  if (!pkg?.version) return null
  return { version: pkg.version, hasReleaseResolve: await exists(join(dir, 'build', 'commands', 'release.js')) }
}

export async function readProjectCli(siteRoot: string, repoRoot: string): Promise<ProjectCli> {
  // The site's own node_modules wins over the repository root's.
  const candidates = await Promise.all([siteRoot, repoRoot].map(readInstalledCli))
  const installed = candidates.find((candidate) => candidate !== null)
  if (installed) return { ...installed, from: 'installed' }

  const sitePkg = await readJson<{ devDependencies?: Record<string, string>; dependencies?: Record<string, string> }>(
    join(siteRoot, 'package.json')
  )
  const declared = sitePkg?.devDependencies?.[CLI_PACKAGE] ?? sitePkg?.dependencies?.[CLI_PACKAGE]
  if (declared && /^\d/.test(declared)) return { version: declared, hasReleaseResolve: null, from: 'declared' }
  return { version: null, hasReleaseResolve: null, from: null }
}

// The one-line warning shared by upgrade and doctor; null when there is no
// skew (or nothing to compare).
export function cliSkewMessage(running: string, project: ProjectCli): string | null {
  if (project.version === null || project.version === running) return null
  return (
    `running CLI ${running} differs from the project's ${project.from === 'declared' ? 'declared' : 'installed'} ` +
    `@inditextech/docouture-cli ${project.version} — the workflows use the project's, so update it in docs/package.json and install first`
  )
}
