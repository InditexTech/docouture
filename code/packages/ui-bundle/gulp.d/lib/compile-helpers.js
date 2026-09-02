// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

const { execFile } = require('node:child_process')
const fs = require('fs-extra')
const ospath = require('node:path')
const { promisify } = require('node:util')

const execFileAsync = promisify(execFile)

const PROJECT_ROOT = ospath.join(__dirname, '..', '..')
const TSCONFIG = ospath.join(PROJECT_ROOT, 'tsconfig.helpers.json')
const OUT_ROOT = ospath.join(PROJECT_ROOT, '.tsbuild')

/**
 * Compile `src/helpers/*.ts` to CommonJS in `.tsbuild/helpers`.
 *
 * Antora loads every file in the bundle's `helpers` directory as a CommonJS
 * module and expects `module.exports` to be the helper function itself. Only
 * TypeScript's `export =` emits exactly that, so this goes through tsc rather
 * than esbuild — esbuild's CJS output would expose the function as
 * `exports.default`, which Handlebars would register as a non-callable helper.
 *
 * The build and preview-pages tasks both need the compiled helpers and run in
 * parallel, so concurrent calls share a single tsc run: without this, two tsc
 * processes would write to the same outDir at once. The result is deliberately
 * NOT cached beyond that — each preview rebuild recompiles, so edits to a
 * helper show up in the running preview.
 *
 * `preview`/`preview:build` never run the top-level `clean` task the way
 * `bundle` does (see gulpfile.js), and a plain `tsc -p` run has no notion of
 * "no longer part of this compilation" — it only ever emits files for what
 * `tsconfig.helpers.json` currently includes, never deletes a file some
 * EARLIER run emitted that a later one doesn't. A helper renamed, deleted, or
 * newly excluded (e.g. a `*.spec.ts` file) would otherwise leave its stale
 * `.js` sitting in `OUT_ROOT` forever, still matched by build.js's own
 * `helpers/*.js` glob and staged into the bundle right alongside the real
 * ones — removing the whole output directory first is what makes every
 * compile a clean, deterministic one regardless of what changed since the
 * last one.
 *
 * @returns {Promise<string>} the directory containing the compiled `helpers` folder
 */
module.exports = function compileHelpers() {
  inFlight = inFlight || compile().finally(() => (inFlight = undefined))
  return inFlight
}

let inFlight

async function compile() {
  await fs.remove(OUT_ROOT)
  const tsc = require.resolve('typescript/bin/tsc')
  try {
    await execFileAsync(process.execPath, [tsc, '-p', TSCONFIG])
  } catch (err) {
    const detail = [err.stdout, err.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`Failed to compile UI helpers:\n${detail || err.message}`, { cause: err })
  }
  return OUT_ROOT
}
