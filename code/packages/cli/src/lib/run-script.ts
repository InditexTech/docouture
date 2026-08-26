'use strict'

import { spawn } from 'node:child_process'

import { debugLog } from './debug-log.js'

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
    // On Windows, npm is installed as `npm.cmd` — a bare `spawn('npm', ...)`
    // without `shell: true` resolves nothing and throws ENOENT. Using the
    // platform-specific binary name avoids that without opting into a full
    // shell (and its own quoting/escaping rules) just to launch one command.
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    debugLog(`spawning: ${npmCmd} ${args.join(' ')} (cwd=${options.cwd})`)
    const child = spawn(npmCmd, args, {
      cwd: options.cwd,
      stdio: 'inherit',
      env: options.env ? { ...process.env, ...options.env } : process.env,
    })

    // Forward SIGINT/SIGTERM to the child so `pdocs build` sent a signal
    // directly (not just a terminal Ctrl-C, which already reaches the whole
    // foreground process group on its own) still gives npm/antora a chance
    // to shut down cleanly instead of being silently orphaned.
    const onSigint = (): void => {
      child.kill('SIGINT')
    }
    const onSigterm = (): void => {
      child.kill('SIGTERM')
    }
    process.once('SIGINT', onSigint)
    process.once('SIGTERM', onSigterm)

    function cleanup(): void {
      process.removeListener('SIGINT', onSigint)
      process.removeListener('SIGTERM', onSigterm)
    }

    child.on('close', (code) => {
      cleanup()
      resolvePromise(code ?? 1)
    })
    child.on('error', (err) => {
      cleanup()
      reject(err)
    })
  })
}
