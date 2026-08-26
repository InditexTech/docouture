'use strict'

import { execFileSync, execSync, spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { theme } from '../lib/theme.js'

const REGISTRY = 'http://localhost:4873'

function publishablePackages(cwd: string): string[] {
  const out = execFileSync('node', ['scripts/publishable-packages.mjs', '--json'], { cwd }).toString()
  return JSON.parse(out) as string[]
}

async function registryReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${REGISTRY}/-/ping`)
    return res.ok
  } catch {
    return false
  }
}

function isDirty(cwd: string, path: string): boolean {
  // `git diff --quiet` exits 1 when the path differs, 0 when clean —
  // spawnSync (not execFileSync, which throws on a non-zero exit) is what
  // lets that exit code be read as a plain boolean instead of a thrown error.
  const unstaged = spawnSync('git', ['diff', '--quiet', '--', path], { cwd }).status
  const staged = spawnSync('git', ['diff', '--quiet', '--cached', '--', path], { cwd }).status
  return unstaged !== 0 || staged !== 0
}

function shortSha(cwd: string): string {
  return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd }).toString().trim()
}

function packageName(cwd: string, pkg: string): string {
  const raw = execFileSync('node', ['-p', 'require("./package.json").name'], { cwd: join(cwd, 'packages', pkg) })
  return raw.toString().trim()
}

/**
 * Snapshot-publishes every non-private packages/* package to the Verdaccio
 * instance started by `registry start` — ported from the justfile's own
 * `release-local` recipe (GH-140). Two-phase, mirroring the original bash:
 * validate (registry reachable, no uncommitted package.json changes), then
 * bump/build/publish/revert, with the revert guaranteed via try/finally
 * even on failure or Ctrl-C.
 */
export async function runReleaseLocal(argv: string[]): Promise<number> {
  void argv // no command-specific flags today
  const cwd = process.cwd()
  const packages = publishablePackages(cwd)

  if (!(await registryReachable())) {
    console.error(`  no registry responding at ${REGISTRY}`)
    console.error(`  run 'just local-registry-start' in another terminal first`)
    return 1
  }

  const dirty = packages.map((pkg) => `packages/${pkg}/package.json`).filter((path) => isDirty(cwd, path))

  if (dirty.length > 0) {
    console.error('  uncommitted changes in:')
    for (const path of dirty) console.error(`    ${path}`)
    console.error(
      '  commit or stash them first — release-local reverts these files to their committed state when it finishes.'
    )
    return 1
  }

  const snapshot = `0.0.0-local.${shortSha(cwd)}.${Math.floor(Date.now() / 1000)}`
  console.log(`  snapshot version: ${snapshot}`)

  let status = 0
  try {
    for (const pkg of packages) {
      execFileSync(
        'npm',
        ['version', snapshot, '--no-git-tag-version', '--allow-same-version', '--loglevel', 'error'],
        {
          cwd: join(cwd, 'packages', pkg),
          stdio: 'ignore',
        }
      )
    }

    // Only ui-bundle and cli have a build step; antora-extensions,
    // asciidoc-extensions and publish-gh-pages publish their committed JS
    // source directly.
    execSync('pnpm nx run-many -t build -p @inditextech/docouture-ui-bundle @inditextech/docouture-cli', {
      cwd,
      stdio: 'inherit',
    })

    for (const pkg of packages) {
      console.log(`  publishing ${pkg}`)
      // pnpm publish (not npm publish) is required: it rewrites each
      // package's "workspace:*" cross-references to the resolved $snapshot
      // version at pack time — npm doesn't understand the workspace:
      // protocol and would ship the literal string.
      execFileSync(
        'pnpm',
        ['publish', '--registry', REGISTRY, '--tag', 'local', '--no-git-checks', '--loglevel', 'warn'],
        {
          cwd: join(cwd, 'packages', pkg),
          stdio: 'inherit',
        }
      )
    }

    console.log(`\n  Published to ${REGISTRY} as ${snapshot}:`)
    for (const pkg of packages) {
      console.log(`    ${packageName(cwd, pkg)}`)
    }

    console.log(`
  To consume from another repo, add to its .npmrc:

    @inditextech:registry=${REGISTRY}/

  Then install the snapshot, e.g.:

    npm install @inditextech/docouture-cli@${snapshot}

  package.json versions in this repo have already been reverted; the
  snapshot stays installable from Verdaccio until local-registry-start's
  storage directory is removed (Ctrl-C it).
`)
  } catch (err) {
    console.error(theme.error(err instanceof Error ? err.message : String(err)))
    status = 1
  } finally {
    console.log('\n  reverting package.json versions')
    for (const pkg of packages) {
      execFileSync('git', ['checkout', '--', `packages/${pkg}/package.json`], { cwd, stdio: 'ignore' })
    }
  }

  return status
}
