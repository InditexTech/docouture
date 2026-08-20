'use strict'

import { spawn } from 'node:child_process'

export interface RunNpmScriptOptions {
  cwd: string
  /** Forwarded after `--`, e.g. `npm run build -- --stacktrace`. */
  args?: string[]
  env?: NodeJS.ProcessEnv
}

/**
 * Runs `npm run <script>` in `cwd` with inherited stdio, resolving the exit
 * code. Used by `pdocs build` — a genuine thin wrapper, unlike `pdocs dev`,
 * which owns its server logic directly (see lib/dev-server.ts) rather than
 * shelling out to a copy of it.
 */
export function runNpmScript(script: string, options: RunNpmScriptOptions): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const args = ['run', script, ...(options.args?.length ? ['--', ...options.args] : [])]
    const child = spawn('npm', args, {
      cwd: options.cwd,
      stdio: 'inherit',
      env: options.env ? { ...process.env, ...options.env } : process.env,
    })
    child.on('close', (code) => resolvePromise(code ?? 1))
    child.on('error', (err) => reject(err))
  })
}
