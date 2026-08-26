'use strict'

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { theme } from '../lib/theme.js'

const BUMP_LEVELS = ['major', 'minor', 'patch', 'premajor', 'preminor', 'prepatch', 'prerelease']

function isExplicitVersion(value: string): boolean {
  return /^\d+\.\d+\.\d+/.test(value)
}

function readVersion(cwd: string): string {
  const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as { version?: string }
  return pkg.version ?? '0.0.0'
}

/**
 * Sets the version of every package: major, minor, patch or an explicit
 * X.Y.Z — ported from the justfile's own `bump` recipe (GH-140). The
 * workspace root carries the version everything else follows: npm does the
 * semver arithmetic there, the result is propagated as the resolved literal
 * to every other package (rather than re-running the same bump level in
 * each), so a package that had drifted is pulled back into line instead of
 * drifting further.
 */
export async function runBump(argv: string[]): Promise<number> {
  const level = argv[0] ?? 'patch'
  const cwd = process.cwd()

  if (!BUMP_LEVELS.includes(level) && !isExplicitVersion(level)) {
    console.error(`  not a bump level or version: '${level}'`)
    console.error(`  expected: ${BUMP_LEVELS.join(' | ')} | X.Y.Z`)
    return 2
  }

  const oldVersion = readVersion(cwd)

  // --loglevel error suppresses npm's complaints about the pnpm-specific
  // keys in .npmrc; it understands the version arithmetic fine regardless.
  execSync(`pnpm version '${level}' --no-git-tag-version --loglevel error`, { cwd, stdio: 'ignore' })

  const newVersion = readVersion(cwd)

  // `pnpm -r` excludes the workspace root, already bumped above.
  execSync(`pnpm -r exec -- npm version "${newVersion}" --allow-same-version --no-git-tag-version --loglevel error`, {
    cwd,
    stdio: 'ignore',
  })

  // npm rewrites these files itself; without this a bump can leave `just check` failing on formatting.
  execSync(`pnpm exec prettier --write --log-level warn package.json 'packages/*/package.json'`, {
    cwd,
    stdio: 'ignore',
  })

  console.log(`  ${theme.dim(oldVersion)} → ${theme.bold(newVersion)}\n`)
  return 0
}
