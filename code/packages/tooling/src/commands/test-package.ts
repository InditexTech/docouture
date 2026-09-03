// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { spawnSync } from 'node:child_process'

/**
 * Runs tests for one or more packages given as comma-separated short names
 * (e.g. `cli` or `cli,ui-bundle`) — ported from the justfile's own
 * `test-package` recipe (GH-140), which did the same name-mangling as an
 * inline bash loop.
 */
export async function runTestPackage(argv: string[]): Promise<number> {
  const [packages, ...rest] = argv
  if (!packages) {
    console.error('usage: docouture-tooling test-package <name>[,<name>...] [-- <nx args>]')
    return 2
  }

  const projects = packages
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .map((name) => `@inditextech/docouture-${name}`)

  if (projects.length === 0) {
    console.error(`no package names found in '${packages}'`)
    return 2
  }

  // Resolves 'pnpm' off PATH, same as any shell script would — this
  // internal tooling CLI runs only on a maintainer's own machine/CI, and
  // needs whichever pnpm is already on it (nvm/asdf/volta/corepack, ...).
  const result = spawnSync('pnpm', ['nx', 'run-many', '-t', 'test', '-p', projects.join(','), ...rest], {
    // NOSONAR
    stdio: 'inherit',
  })
  return result.status ?? 1
}
