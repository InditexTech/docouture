// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { access } = require('node:fs/promises')
const path = require('node:path')

// GH-44: starts the local Kroki service on demand, the first time a
// `kroki-enabled: true` build actually needs it and finds nothing already
// listening. No teardown of any kind — see kroki-prewarm.js's own header for
// why: a container left running is reused by the next build (the
// reachability check below short-circuits straight past a start attempt),
// and simply discarded whenever the machine or CI runner it ran on goes
// away. This is deliberately the ONE place across every invocation path —
// `docouture dev`/`docouture build`, this monorepo's own `just dev`/`just
// build-site`, a raw `antora` invocation, any consumer's own CI — that
// starts Kroki, because it is the one piece of code every single one of
// those paths runs through: the Antora pipeline extension itself.
const execFileAsync = promisify(execFile)

const BUNDLED_COMPOSE_FILE = path.join(__dirname, '..', 'resources', 'kroki-compose.yml')

// The file `docouture eject kroki` copies the bundled compose definition to —
// see that command's own header. Looked up relative to the PLAYBOOK's own
// directory (`playbook.dir`, set by @antora/playbook-builder to wherever
// `antora-playbook.yml` actually is), i.e. the site root, the same
// directory `docouture eject kroki` writes it into.
const OVERRIDE_FILENAME = 'kroki-compose.yml'

const REACHABLE_TIMEOUT_MS = 1000
const STARTUP_TIMEOUT_MS = 60000
const POLL_INTERVAL_MS = 2000

async function isReachable(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REACHABLE_TIMEOUT_MS)
  try {
    await fetch(url, { signal: controller.signal })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function resolveComposeFile(playbookDir) {
  if (playbookDir) {
    const override = path.join(playbookDir, OVERRIDE_FILENAME)
    try {
      await access(override)
      return override
    } catch {
      // No ejected override — fall through to the bundled default.
    }
  }
  return BUNDLED_COMPOSE_FILE
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

/**
 * Ensures a Kroki service answers at `url`, starting one via `docker
 * compose` if nothing does yet. Never throws: a missing `docker` binary, a
 * daemon that isn't running, or a service that never comes up within the
 * timeout all degrade to a logged warning — kroki.js's own cache-miss
 * fallback (raw diagram source, exactly like a disabled site) already
 * handles the rest, so this never needs to fail a build itself.
 *
 * @param {string} url - the fixed Kroki URL (`kroki-config.js`'s `KROKI_URL`).
 * @param {string | undefined} playbookDir - `playbook.dir`; used to look up
 *   an ejected override compose file before falling back to the bundled one.
 * @param {{ info: (fmt: string, ...args: unknown[]) => void, warn: (fmt: string, ...args: unknown[]) => void }} logger -
 *   `info` gives every run — cache hit or cold start — a visible trail of
 *   what actually happened, since the only prior signal was a `warn` on
 *   failure; a healthy run was otherwise silent and indistinguishable from
 *   Nx quietly replaying a stale cached build (see kroki-prewarm.js's own
 *   header on cache interaction).
 * @param {{ isReachable?: typeof isReachable, execFileAsync?: typeof execFileAsync, sleep?: typeof sleep }} [deps] -
 *   swappable seams for tests, rather than mocking `node:child_process`/
 *   `fetch` at the module level.
 * @returns {Promise<void>}
 */
async function ensureKrokiRunning(url, playbookDir, logger, deps = {}) {
  const checkReachable = deps.isReachable || isReachable
  const runDockerCompose = deps.execFileAsync || execFileAsync
  const wait = deps.sleep || sleep
  const startedAt = Date.now()

  if (await checkReachable(url)) {
    logger.info('Kroki service already reachable at %s — reusing it', url)
    return
  }

  const composeFile = await resolveComposeFile(playbookDir)
  logger.info('Kroki service not reachable at %s yet — starting it via %s', url, composeFile)
  let composeResult
  try {
    composeResult = await runDockerCompose('docker', ['compose', '-f', composeFile, 'up', '-d'])
  } catch (err) {
    // Node attaches `stdout`/`stderr` to the rejection itself (not just
    // `message`) for a failed execFile — surfacing them is the difference
    // between "is Docker installed?" and actually seeing docker's own error
    // (a missing image, a port already bound, a daemon that refused the
    // connection, ...).
    const stdout = /** @type {{ stdout?: string }} */ (err).stdout
    const stderr = /** @type {{ stderr?: string }} */ (err).stderr
    logger.warn(
      'Could not start the local Kroki service (%s) — is Docker installed and running? Diagrams will render as raw source until %s is reachable.%s',
      /** @type {Error} */ (err).message,
      url,
      formatProcessOutput(stdout, stderr)
    )
    return
  }
  logger.info(
    'docker compose up -d succeeded — waiting for %s to become reachable...%s',
    url,
    formatProcessOutput(composeResult && composeResult.stdout, composeResult && composeResult.stderr)
  )

  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (await checkReachable(url)) {
      logger.info('Kroki service reachable at %s after %ds', url, Math.round((Date.now() - startedAt) / 1000))
      return
    }
    logger.info(
      'Still waiting for Kroki at %s to become reachable (%ds elapsed, giving up after %ds — a cold `docker compose up` pulling images for the first time is the usual reason this takes a while)...',
      url,
      Math.round((Date.now() - startedAt) / 1000),
      STARTUP_TIMEOUT_MS / 1000
    )
    await wait(POLL_INTERVAL_MS)
  }
  logger.warn(
    'Started the local Kroki service but it did not become reachable at %s within %ds — diagrams will render as raw source for this build.',
    url,
    STARTUP_TIMEOUT_MS / 1000
  )
}

/**
 * Renders captured process output for a log message — empty/whitespace-only
 * streams (the common case: `docker compose up -d` is quiet on a warm image
 * cache) contribute nothing, so a healthy run's log line doesn't grow a
 * trailing blank appendix.
 *
 * @param {string | undefined} stdout
 * @param {string | undefined} stderr
 * @returns {string}
 */
function formatProcessOutput(stdout, stderr) {
  const parts = []
  if (stdout && stdout.trim()) parts.push('stdout:\n' + stdout.trim())
  if (stderr && stderr.trim()) parts.push('stderr:\n' + stderr.trim())
  return parts.length ? '\n' + parts.join('\n') : ''
}

module.exports = { ensureKrokiRunning, BUNDLED_COMPOSE_FILE, OVERRIDE_FILENAME }
