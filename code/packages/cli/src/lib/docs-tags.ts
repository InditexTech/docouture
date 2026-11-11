// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { execFile } from 'node:child_process'

import { TAG_PREFIX } from './release-resolve.js'

// Existing docs/v* tag names, from the local clone — callers fetch tags first.
export function listDocsTags(repoRoot: string): Promise<string[]> {
  return new Promise((resolvePromise) => {
    // Resolves 'git' off PATH, same as the other commands that shell out to it.
    execFile('git', ['tag', '-l', `${TAG_PREFIX}*`], { cwd: repoRoot }, (err, stdout) => {
      // NOSONAR
      resolvePromise(err ? [] : stdout.split('\n').filter((line) => line.trim() !== ''))
    })
  })
}
