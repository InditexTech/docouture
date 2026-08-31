// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Starts an ephemeral local npm registry (Verdaccio) on :4873, for
 * `release-local` — ported from the justfile's own `local-registry-start`
 * recipe (GH-140). Foreground, blocks until Ctrl-C, then removes its
 * storage directory. Proxies everything except @inditextech/* to npmjs, so
 * a consuming repo's other dependencies still resolve normally through
 * this registry if pointed at it wholesale rather than scoped.
 */
function start(): number {
  const dir = mkdtempSync(join(tmpdir(), 'docouture-registry-'))
  const storage = join(dir, 'storage')
  const configPath = join(dir, 'config.yaml')
  mkdirSync(storage, { recursive: true })

  const config = `storage: ${storage}
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
packages:
  '@inditextech/*':
    access: $all
    publish: $all
    unpublish: $all
  '**':
    access: $all
    proxy: npmjs
log:
  - { type: stdout, format: pretty, level: warn }
`
  writeFileSync(configPath, config, 'utf8')

  console.log('  Verdaccio starting on http://localhost:4873')
  console.log(`  storage: ${storage}`)
  console.log('  Ctrl-C to stop and remove the storage directory.\n')

  try {
    // Foreground, inherited stdio: Ctrl-C reaches npx/verdaccio directly,
    // same as the justfile recipe's own `exec`-less invocation did.
    const result = spawnSync('npx', ['--yes', 'verdaccio', '--config', configPath, '--listen', '4873'], {
      stdio: 'inherit',
    })
    return result.status ?? 0
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export async function runRegistry(argv: string[]): Promise<number> {
  const [sub] = argv
  if (sub === 'start') return start()

  console.error(`unknown 'registry' subcommand: '${sub ?? ''}'`)
  console.error('usage: docouture-tooling registry start')
  return 1
}
