'use strict'

import { join, resolve } from 'node:path'

import { parseArgs } from '../lib/args.js'
import { exists } from '../lib/copy-template.js'
import { runNpmScript } from '../lib/run-script.js'

export async function runBuild(argv: string[]): Promise<number> {
  const { flags } = parseArgs(argv)

  // Mirrors `new`/`version`: --dir is the repository root, not the site
  // directory itself.
  const target = typeof flags.dir === 'string' ? resolve(flags.dir) : resolve(process.cwd())
  const siteRoot = join(target, 'docs')

  if (!(await exists(join(siteRoot, 'package.json')))) {
    console.error(`no package.json found at '${siteRoot}'`)
    console.error('pass --dir <path> to a component root (the parent of docs/), or run pdocs new first')
    return 1
  }

  return runNpmScript('build', { cwd: siteRoot })
}
