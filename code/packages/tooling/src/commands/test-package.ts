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

  const result = spawnSync('pnpm', ['nx', 'run-many', '-t', 'test', '-p', projects.join(','), ...rest], {
    stdio: 'inherit',
  })
  return result.status ?? 1
}
