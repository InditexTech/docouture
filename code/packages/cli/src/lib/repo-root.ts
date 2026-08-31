// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { execFile } from 'node:child_process'

/**
 * Resolves the git repository root containing `startDir` — so `docouture dev`,
 * `docouture build` and `docouture doctor` work from anywhere inside a scaffolded
 * repository (its root, inside `docs/`, in a nested page directory, ...),
 * not only when `--dir`/cwd happens to already be the repository root.
 *
 * Returns `startDir` itself when it is not inside a git repository at all —
 * callers then fail with their own "no site found at ..." message instead of
 * a git error, which is the more useful failure for someone who simply
 * hasn't run `docouture new` yet.
 */
export function findRepoRoot(startDir: string): Promise<string> {
  return new Promise((resolvePromise) => {
    execFile('git', ['rev-parse', '--show-toplevel'], { cwd: startDir }, (err, stdout) => {
      resolvePromise(err ? startDir : stdout.trim())
    })
  })
}
