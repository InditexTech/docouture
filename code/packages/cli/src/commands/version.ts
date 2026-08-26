'use strict'

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { parseArgs } from '../lib/args.js'
import { exists } from '../lib/copy-template.js'
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

  const file =
    typeof flags.file === 'string'
      ? resolve(flags.file)
      : resolve(typeof flags.dir === 'string' ? flags.dir : '.', 'src', 'antora.yml')

  if (!(await exists(file))) {
    console.error(`no antora.yml found at '${file}'`)
    console.error('pass --dir <path> (a component root, i.e. the parent of src/) or --file <path> directly')
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
