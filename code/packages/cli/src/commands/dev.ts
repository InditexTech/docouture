// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { join, resolve } from 'node:path'
import ora from 'ora'

import { parseArgs } from '../lib/args.js'
import { exists } from '../lib/copy-template.js'
import { findRepoRoot } from '../lib/repo-root.js'
import { startDevServer } from '../lib/dev-server.js'

export async function runDev(argv: string[]): Promise<number> {
  const { flags } = parseArgs(argv)

  // --dir (or cwd) can be anywhere inside the repository — findRepoRoot
  // walks up to the actual repository root, same as `new`/`version`/`doctor`.
  const startDir = typeof flags.dir === 'string' ? resolve(flags.dir) : resolve(process.cwd())
  const target = await findRepoRoot(startDir)
  const siteRoot = join(target, 'docs')

  if (!(await exists(join(siteRoot, 'antora-playbook.local.yml')))) {
    console.error(`no antora-playbook.local.yml found at '${siteRoot}'`)
    console.error('pass --dir <path> to a component root (the parent of docs/), or run docouture new first')
    return 1
  }

  let port: number | undefined
  if (typeof flags.port === 'string') {
    port = Number(flags.port)
    if (!Number.isInteger(port) || port <= 0) {
      console.error(`invalid --port: '${flags.port}'`)
      return 1
    }
  }

  // Spinner covers only the initial build+listen wait, where the previous
  // behaviour was otherwise silent for however long the first Antora build
  // takes — ora auto-detects a non-TTY stderr (CI, piped output) and
  // degrades to plain text on its own, so this stays quiet under
  // automation without a separate flag. Once the server is up, log/logError
  // below revert to plain per-rebuild lines exactly as before.
  const spinner = ora({ text: 'Starting dev server…', stream: process.stderr }).start()
  let ready = false
  const log = (msg: string): void => {
    if (ready) console.error(`dev ${msg}`)
  }
  const logError = (msg: string): void => {
    if (ready) console.error(`dev ${msg}`)
  }

  try {
    const server = await startDevServer({ siteRoot, port, log, logError })
    ready = true
    spinner.succeed(`Serving ${server.url}`)

    await new Promise<void>((resolvePromise) => {
      const shutdown = (): void => {
        void server.close().then(resolvePromise)
      }
      process.once('SIGINT', shutdown)
      process.once('SIGTERM', shutdown)
    })

    return 0
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'EADDRINUSE') {
      spinner.fail(`port ${port ?? 5000} is already in use`)
      console.error('  stop whatever is listening on it, or pass --port <port>')
      return 1
    }
    spinner.fail(err instanceof Error ? err.message : String(err))
    return 1
  }
}
