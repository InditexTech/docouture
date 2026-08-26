'use strict'

import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import ora from 'ora'

import { parseArgs } from '../lib/args.js'
import { exists } from '../lib/copy-template.js'
import { findRepoRoot } from '../lib/repo-root.js'
import { readOutputDir } from '../lib/playbook-yml.js'
import { resolveConfig } from '../lib/config-resolver.js'
import { debugLog } from '../lib/debug-log.js'

// `docouture publish <target>` is deliberately decoupled from `docouture build`:
// it publishes whatever is already sitting at `output.dir` (Antora's own
// default, `build/site`, unless the playbook says otherwise) rather than
// building first itself. docouture-publish.yml runs `docouture build` then
// `docouture publish <target>` as two separate steps for exactly this reason —
// re-publishing an already-built site never needs a rebuild.
//
// There is no Antora extension involved (an earlier design hooked Antora's
// own `sitePublished` pipeline event instead) — publishing is a CLI
// concern. `<target>` resolves by convention to the npm package
// `@inditextech/docouture-publish-<target>`, `require()`d out of the site's own
// `node_modules` — the site opts in by adding that package to its own
// devDependencies, the same way it already depends on
// @inditextech/docouture-antora-extensions.

interface PublishConfig {
  docouture?: {
    publish?: Record<string, Record<string, unknown>>
  }
}

// The contract a publish driver package exports: a plain async function,
// not an Antora extension. Returns whether it actually published (a driver
// may legitimately no-op — e.g. @inditextech/docouture-publish-gh-pages skips
// itself outside CI without --force) — that is reported as a failing exit
// code here, since a `docouture publish` invocation that silently does nothing
// is far more often a misconfiguration (a missing secret in CI) than
// something to succeed quietly.
type PublishDriver = (dir: string, options: Record<string, unknown>) => Promise<boolean | void>

/**
 * Resolved from the SITE's own node_modules (via its package.json), not
 * this CLI's — a driver is a devDependency of the site being published,
 * not of docouture itself. Exposed as its own function — rather than inlined
 * in runPublish — so tests can inject a fake in its place: under the test
 * runner, a bare `require()` of a package name that also happens to be a
 * real published dependency of this monorepo can resolve to THAT real
 * package instead of failing, regardless of the `from` path passed to
 * `createRequire` — the dynamic-require equivalent of `vi.mock` not
 * intercepting a plain CommonJS `require()` (see
 * @inditextech/docouture-publish-gh-pages's own index.js for the same
 * seam-over-mock reasoning applied to its `gh-pages` dependency).
 */
function loadDriver(packageJsonFile: string, driverPackageName: string): PublishDriver {
  return createRequire(packageJsonFile)(driverPackageName) as PublishDriver
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    return null
  }
}

/**
 * Every flag except `--dir` (which this command consumes itself) is
 * forwarded to the driver as one of its own options. `--user-name`/
 * `--user-email`, if given, are combined into the nested `user: {name,
 * email}` shape @inditextech/docouture-publish-gh-pages (and presumably other
 * drivers needing a commit identity) expects — the only nested option
 * shape a flat `--flag value` CLI syntax can't express directly.
 */
function flagsToOptions(flags: Record<string, string | boolean>): Record<string, unknown> {
  const { 'user-name': userName, 'user-email': userEmail, ...rest } = flags
  delete rest.dir
  const options: Record<string, unknown> = { ...rest }
  if (userName !== undefined || userEmail !== undefined) {
    options.user = { name: userName, email: userEmail }
  }
  return options
}

export async function runPublish(argv: string[], deps: { loadDriver?: typeof loadDriver } = {}): Promise<number> {
  const resolveDriver = deps.loadDriver ?? loadDriver
  const { positional, flags } = parseArgs(argv)
  const target = positional[0]

  if (!target) {
    console.error('usage: docouture publish <target> [--dir <path>] [--<option> <value> ...]')
    console.error('example: docouture publish gh-pages --branch gh-pages')
    return 1
  }

  const startDir = typeof flags.dir === 'string' ? resolve(flags.dir) : resolve(process.cwd())
  const repoRoot = await findRepoRoot(startDir)
  const siteRoot = join(repoRoot, 'docs')
  const packageJsonFile = join(siteRoot, 'package.json')

  if (!(await exists(packageJsonFile))) {
    console.error(`no package.json found at '${siteRoot}'`)
    console.error('pass --dir <path> to a component root (the parent of docs/), or run docouture new first')
    return 1
  }

  const driverPackageName = `@inditextech/docouture-publish-${target}`
  let driver: PublishDriver
  try {
    driver = resolveDriver(packageJsonFile, driverPackageName)
  } catch {
    console.error(`could not load publish driver '${driverPackageName}'`)
    console.error(`add it to ${packageJsonFile}'s devDependencies, e.g.: npm install --save-dev ${driverPackageName}`)
    return 1
  }

  const playbookFile = join(siteRoot, 'antora-playbook.yml')
  const playbookContent = (await exists(playbookFile)) ? await readFile(playbookFile, 'utf8') : ''
  const siteDir = resolve(siteRoot, readOutputDir(playbookContent) || 'build/site')

  if (!(await exists(siteDir))) {
    console.error(`no built site found at '${siteDir}' — run 'docouture build' first`)
    return 1
  }

  const packageJson = await readJson<PublishConfig>(packageJsonFile)
  const configuredOptions = packageJson?.docouture?.publish?.[target] ?? {}
  // CLI flags win over docs/package.json's own "docouture".publish.<target>
  // config, which wins over whatever defaults the driver applies itself —
  // see lib/config-resolver.ts for this precedence rule shared with upgrade.
  const options = resolveConfig<Record<string, unknown>>({}, configuredOptions, flagsToOptions(flags))
  debugLog(`publishing '${target}' from ${siteDir} with options: ${JSON.stringify(options)}`)

  const spinner = ora({ text: `Publishing to ${target}…`, stream: process.stderr }).start()
  try {
    const published = await driver(siteDir, options)
    if (published === false) {
      spinner.fail(`'${target}' driver reported it did not publish`)
      return 1
    }
    spinner.succeed(`Published to ${target}`)
    return 0
  } catch (err) {
    spinner.fail(`publishing to '${target}' failed`)
    console.error(err instanceof Error ? err.stack : String(err))
    return 1
  }
}
