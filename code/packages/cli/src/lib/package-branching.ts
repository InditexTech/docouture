// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// Shared writer for the `docouture.branching` / `docouture.prereleaseBranch`
// declaration in docs/package.json — the one place docouture-release.yml reads
// the flow (and, under git-flow, the prerelease branch name) from. Trunk-based
// declares `branching` only; git-flow declares both, `prereleaseBranch`
// directly after `branching`.

import { readFile, writeFile } from 'node:fs/promises'

import type { Branching } from './branch-detect.js'

type Docouture = Record<string, unknown>

export interface BranchingDeclaration {
  branching: string | null
  prereleaseBranch: string | null
}

export async function readBranchingDeclaration(packageJsonFile: string): Promise<BranchingDeclaration> {
  const pkg = JSON.parse(await readFile(packageJsonFile, 'utf8')) as { docouture?: Docouture }
  const { branching, prereleaseBranch } = pkg.docouture ?? {}
  return {
    branching: typeof branching === 'string' ? branching : null,
    prereleaseBranch: typeof prereleaseBranch === 'string' ? prereleaseBranch : null,
  }
}

/**
 * Read-modify-write of the `docouture` block. Preserves every other key and
 * its order. Returns true when the file content changed.
 */
export async function setBranching(
  packageJsonFile: string,
  branching: Branching,
  prereleaseBranch?: string
): Promise<boolean> {
  const original = await readFile(packageJsonFile, 'utf8')
  const pkg = JSON.parse(original) as { docouture?: Docouture }
  const next: Docouture = {}
  let placed = false
  for (const [key, value] of Object.entries(pkg.docouture ?? {})) {
    if (key === 'branching') {
      next.branching = branching
      if (branching === 'git-flow' && prereleaseBranch) next.prereleaseBranch = prereleaseBranch
      placed = true
    } else if (key !== 'prereleaseBranch') {
      next[key] = value
    }
  }
  if (!placed) {
    const head: Docouture = { branching }
    if (branching === 'git-flow' && prereleaseBranch) head.prereleaseBranch = prereleaseBranch
    pkg.docouture = { ...head, ...next }
  } else {
    pkg.docouture = next
  }
  const out = `${JSON.stringify(pkg, null, 2)}\n`
  if (out === original) return false
  await writeFile(packageJsonFile, out, 'utf8')
  return true
}
