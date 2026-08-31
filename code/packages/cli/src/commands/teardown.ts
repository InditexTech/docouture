// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, resolve } from 'node:path'

import { parseArgs } from '../lib/args.js'
import { exists } from '../lib/copy-template.js'
import { findRepoRoot } from '../lib/repo-root.js'
import { resolveEffectiveComposeFile } from '../lib/kroki-compose.js'

// `docouture teardown kroki` — the explicit, manual stop side of GH-44's Kroki
// auto-start. `kroki-prewarm.js` (in @inditextech/docouture-antora-extensions)
// starts the service on demand but never stops it — see kroki-docker.js's
// own header for why: a build has no natural "I'm completely done with this
// machine for good" moment to hook, and stopping it mid-session would only
// force the next build to pay the startup latency again. This command is
// the escape hatch for the moment a human actually does know that: done for
// the day, freeing the port for something else, before switching to a
// project with different diagram types configured, etc.
//
// Targets whichever compose file is ACTUALLY in effect — an ejected
// override at the site root if one exists, else the bundled default — via
// the exact same resolution order kroki-docker.js's own auto-start uses
// (lib/kroki-compose.js's `resolveEffectiveComposeFile`), so this always
// stops the containers a build would actually have started, not
// necessarily the package's un-customized default.
const execFileAsync = promisify(execFile)

const SUPPORTED_TARGETS: Record<string, { description: string }> = {
  kroki: { description: 'Kroki diagram rendering service (docker compose)' },
}

export async function runTeardown(
  argv: string[],
  deps: {
    resolveEffectiveComposeFile?: typeof resolveEffectiveComposeFile
    execFileAsync?: typeof execFileAsync
  } = {}
): Promise<number> {
  const { positional, flags } = parseArgs(argv)
  const target = positional[0]

  if (!target || !(target in SUPPORTED_TARGETS)) {
    console.error('usage: docouture teardown <target> [--dir <path>]')
    console.error('supported targets:')
    for (const [name, { description }] of Object.entries(SUPPORTED_TARGETS)) {
      console.error(`  ${name} — ${description}`)
    }
    return 1
  }

  const startDir = typeof flags.dir === 'string' ? resolve(flags.dir) : resolve(process.cwd())
  const repoRoot = await findRepoRoot(startDir)
  const siteRoot = join(repoRoot, 'docs')

  if (!(await exists(join(siteRoot, 'package.json')))) {
    console.error(`no package.json found at '${siteRoot}'`)
    console.error('pass --dir <path> to a component root (the parent of docs/), or run docouture new first')
    return 1
  }

  const resolveFile = deps.resolveEffectiveComposeFile || resolveEffectiveComposeFile
  const composeFile = await resolveFile(siteRoot)
  if (!composeFile) {
    console.error(
      `could not find @inditextech/docouture-antora-extensions' bundled kroki-compose.yml, and no override exists at '${join(siteRoot, 'kroki-compose.yml')}'`
    )
    console.error('add @inditextech/docouture-antora-extensions to devDependencies, or run docouture eject kroki first')
    return 1
  }

  try {
    const runDockerCompose = deps.execFileAsync || execFileAsync
    await runDockerCompose('docker', ['compose', '-f', composeFile, 'down'])
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return 1
  }

  console.log(`stopped the Kroki service (${composeFile})`)
  return 0
}
