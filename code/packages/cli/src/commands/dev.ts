'use strict'

import { join, resolve } from 'node:path'

import { parseArgs } from '../lib/args.js'
import { exists } from '../lib/copy-template.js'
import { startDevServer } from '../lib/dev-server.js'

export async function runDev(argv: string[]): Promise<number> {
  const { flags } = parseArgs(argv)

  // Mirrors `new`/`version`: --dir is the repository root `pdocs new`
  // scaffolded into, defaulting to cwd — not the site directory itself.
  const target = typeof flags.dir === 'string' ? resolve(flags.dir) : resolve(process.cwd())
  const siteRoot = join(target, 'docs')

  if (!(await exists(join(siteRoot, 'antora-playbook.yml')))) {
    console.error(`no antora-playbook.yml found at '${siteRoot}'`)
    console.error('pass --dir <path> to a component root (the parent of docs/), or run pdocs new first')
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

  try {
    const server = await startDevServer({ siteRoot, port })

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
      console.error(`port ${port ?? 5000} is already in use`)
      console.error('  stop whatever is listening on it, or pass --port <port>')
      return 1
    }
    console.error(err instanceof Error ? err.message : String(err))
    return 1
  }
}
