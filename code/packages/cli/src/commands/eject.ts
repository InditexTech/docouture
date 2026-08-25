'use strict'

import { copyFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { parseArgs } from '../lib/args.js'
import { exists } from '../lib/copy-template.js'
import { findRepoRoot } from '../lib/repo-root.js'
import { PACKAGE_NAME, RESOURCE, OVERRIDE_FILENAME, resolveBundledComposeFile } from '../lib/kroki-compose.js'

// `pdocs eject kroki` copies the Kroki + mermaid-companion `docker compose`
// definition @inditextech/pdocs-antora-extensions' `kroki-prewarm.js` starts
// automatically (GH-44) out to the site's own repository, as
// `docs/kroki-compose.yml`. kroki-prewarm.js checks that exact path first,
// before its own bundled default — see its own header, and kroki-docker.js's
// — so a site that runs this once and edits the result (a different image
// version, a companion for another diagram type, ...) never needs to fork
// or patch the package itself; the auto-start logic just picks up whatever
// is there. `pdocs teardown kroki` is the matching stop side — see that
// command's own header.
//
// A site that never added `kroki-enabled: true` (and so never installed
// @inditextech/pdocs-antora-extensions, or has an old version predating this
// resource) gets a clear error telling it what to add, rather than a raw
// `MODULE_NOT_FOUND` — see lib/kroki-compose.js's own header for why
// resolution goes through the site's own install rather than this CLI's.

const SUPPORTED_TARGETS: Record<string, { resolve: typeof resolveBundledComposeFile }> = {
  kroki: { resolve: resolveBundledComposeFile },
}

export async function runEject(
  argv: string[],
  deps: { resolveBundledComposeFile?: typeof resolveBundledComposeFile } = {}
): Promise<number> {
  const { positional, flags } = parseArgs(argv)
  const target = positional[0]

  if (!target || !(target in SUPPORTED_TARGETS)) {
    console.error('usage: pdocs eject <target> [--dir <path>]')
    console.error(`supported targets: ${Object.keys(SUPPORTED_TARGETS).join(', ')}`)
    return 1
  }

  const startDir = typeof flags.dir === 'string' ? resolve(flags.dir) : resolve(process.cwd())
  const repoRoot = await findRepoRoot(startDir)
  const siteRoot = join(repoRoot, 'docs')
  const packageJsonFile = join(siteRoot, 'package.json')

  if (!(await exists(packageJsonFile))) {
    console.error(`no package.json found at '${siteRoot}'`)
    console.error('pass --dir <path> to a component root (the parent of docs/), or run pdocs new first')
    return 1
  }

  const destFile = join(siteRoot, OVERRIDE_FILENAME)
  if (await exists(destFile)) {
    console.error(`'${destFile}' already exists`)
    console.error('remove it first if you want to re-eject the bundled default')
    return 1
  }

  const resolveFile = deps.resolveBundledComposeFile || resolveBundledComposeFile
  let sourceFile: string
  try {
    sourceFile = resolveFile(packageJsonFile)
  } catch {
    console.error(`could not find ${RESOURCE} in ${PACKAGE_NAME}`)
    console.error(`add it to ${packageJsonFile}'s devDependencies, e.g.: npm install --save-dev ${PACKAGE_NAME}`)
    return 1
  }

  await copyFile(sourceFile, destFile)
  console.log(`wrote ${destFile}`)
  console.log('edit it freely — the next build automatically prefers it over the bundled default')
  return 0
}
