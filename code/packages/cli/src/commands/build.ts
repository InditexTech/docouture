'use strict'

import { join, resolve } from 'node:path'

import { parseArgs } from '../lib/args.js'
import { ANTORA_LOG_LEVEL_ARGS } from '../lib/antora-log.js'
import { exists } from '../lib/copy-template.js'
import { findRepoRoot } from '../lib/repo-root.js'
import { runNpmScript } from '../lib/run-script.js'

export async function runBuild(argv: string[]): Promise<number> {
  const { flags } = parseArgs(argv)

  // --dir (or cwd) can be anywhere inside the repository — findRepoRoot
  // walks up to the actual repository root, same as `new`/`version`/`doctor`.
  const startDir = typeof flags.dir === 'string' ? resolve(flags.dir) : resolve(process.cwd())
  const target = await findRepoRoot(startDir)
  const siteRoot = join(target, 'docs')

  if (!(await exists(join(siteRoot, 'package.json')))) {
    console.error(`no package.json found at '${siteRoot}'`)
    console.error('pass --dir <path> to a component root (the parent of docs/), or run docouture new first')
    return 1
  }

  return runNpmScript('build', { cwd: siteRoot, args: [...ANTORA_LOG_LEVEL_ARGS] })
}
