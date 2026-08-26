'use strict'

import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { parseArgs } from '../lib/args.js'
import { exists } from '../lib/copy-template.js'
import { findRepoRoot } from '../lib/repo-root.js'
import { patchVersion, readVersion } from '../lib/antora-yml.js'

// Unlike `just bump` — which moves this workspace's own package.json files
// through npm semver arithmetic — this takes the target version as a literal
// value rather than a bump level (major/minor/patch/...). Antora's component
// `version` is a free-form string, not required to be semver: sites in the
// wild use "2.1", "v3", "latest". Guessing what "minor" means for "2.1" would
// be presumptuous, and wrong for the sites where it does not apply. If your
// documented version does happen to be semver, compute the next value
// yourself and pass it here.
export async function runVersion(argv: string[]): Promise<number> {
  const { positional, flags } = parseArgs(argv)
  const value = positional[0]

  if (!value) {
    console.error('usage: pdocs version <value> [--dir <path>] [--file <path>] [--prerelease | --stable]')
    return 1
  }

  if (flags.prerelease && flags.stable) {
    console.error('--prerelease and --stable are mutually exclusive')
    return 1
  }

  // --dir (or cwd) can be anywhere inside the repository — findRepoRoot
  // walks up to the actual repository root, same as dev/build/doctor, so
  // this works whether run from the repo root, from inside docs/, or from a
  // nested page directory. --file bypasses all of this with a literal path.
  let file: string
  if (typeof flags.file === 'string') {
    file = resolve(flags.file)
  } else {
    const startDir = typeof flags.dir === 'string' ? resolve(flags.dir) : resolve(process.cwd())
    const repoRoot = await findRepoRoot(startDir)
    file = join(repoRoot, 'docs', 'src', 'antora.yml')
  }

  if (!(await exists(file))) {
    console.error(`no antora.yml found at '${file}'`)
    console.error('pass --dir <path> (anywhere inside the repository) or --file <path> directly')
    return 1
  }

  const content = await readFile(file, 'utf8')
  const before = readVersion(content)

  let patched: string
  try {
    patched = patchVersion(content, { version: value, prerelease: flags.prerelease === true })
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    console.error(`'${file}' does not look like an Antora component descriptor`)
    return 1
  }

  await writeFile(file, patched, 'utf8')

  console.log(`  ${before ?? '(none)'} → ${value}${flags.prerelease ? ' (prerelease)' : ''}`)
  return 0
}
