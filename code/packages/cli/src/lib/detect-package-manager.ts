// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export type PackageManager = 'npm' | 'pnpm'

export interface PackageManagerPlan {
  pm: PackageManager
  /** e.g. 'npm install' / 'pnpm install' — printed in the scaffold's next-steps. */
  installCmd: string
  /** e.g. 'npm run dev' / 'pnpm run dev' — printed in the scaffold's next-steps. */
  devCmd: string
  /** CI install step, honouring a committed lockfile: 'npm ci' / 'pnpm install --frozen-lockfile'. */
  ciCmd: string
  /** The lockfile actions/setup-node's cache-dependency-path should point at. */
  lockfile: string
  /** actions/setup-node's own `cache:` input — only 'npm' and 'pnpm' are supported there. */
  cacheName: PackageManager
  /**
   * A `pnpm/action-setup` step (pinned), or '' for npm — setup-node's `cache: pnpm`
   * has nothing to restore from until pnpm itself is on PATH, which only this
   * action (not setup-node) provides.
   */
  setupStepYaml: string
  /**
   * The scaffolded package.json's own `packageManager` field (corepack
   * convention, e.g. 'pnpm@10.24.0') — `pnpm/action-setup`'s
   * `package_json_file` input (pointed at docs/package.json in
   * setupStepYaml above) reads exactly this field to know which pnpm to
   * install; without it present, that step fails outright with "No pnpm
   * version is specified" rather than degrading to some default.
   */
  packageManagerField: string
}

const PNPM_ACTION_SETUP_STEP =
  '      - name: Setup pnpm\n' +
  '        uses: pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320 # v4\n' +
  '        with:\n' +
  // `package_json_file` "must be relative to the repository root
  // (GITHUB_WORKSPACE)" per the action's own action.yml — its default
  // ('package.json') looks at the true repo root, not this site's own
  // docs/package.json, even though `defaults.run.working-directory: docs`
  // applies everywhere else in this workflow. Same gotcha, same fix as
  // setup-node's `cache-dependency-path` a few lines below.
  '          package_json_file: docs/package.json\n' +
  '\n'

// The exact pnpm/npm version actually available wherever `docouture new` is
// running — queried directly rather than guessed, so the `packageManager`
// field this writes into the scaffolded package.json (see
// packageManagerPlan below) is always a real, installable version. Falls
// back to a pinned last-known-good version only if the binary can't be
// queried at all (e.g. a test sandbox with neither on PATH) — degrading
// gracefully rather than leaving the scaffold without a value that
// `pnpm/action-setup` (CI) and corepack (locally) both need.
function detectPackageManagerVersion(pm: PackageManager): string {
  try {
    return execFileSync(pm, ['--version'], { encoding: 'utf8' }).trim()
  } catch {
    return pm === 'pnpm' ? '10.24.0' : '10.9.2'
  }
}

// Reads the invoking package manager off npm's own user-agent env var — set
// by npm, pnpm and yarn alike on every script/exec they run, e.g.
// 'pnpm/9.1.0 npm/? node/v20.11.0 darwin x64'. This is how `docouture new` was
// actually invoked (`npx @inditextech/docouture-cli` vs `pnpm dlx
// @inditextech/docouture-cli`) — the best signal available for a brand-new
// repository with no lockfile of its own yet.
function fromUserAgent(): PackageManager | null {
  const ua = process.env.npm_config_user_agent
  if (!ua) return null
  if (ua.startsWith('pnpm/')) return 'pnpm'
  if (ua.startsWith('yarn/')) return 'npm' // yarn isn't a supported output here — fall through to npm.
  return 'npm'
}

// Best-effort: an existing repository's own package.json#packageManager
// field (the corepack convention, e.g. "pnpm@9.1.0") wins over anything
// inferred, since it's an explicit declaration rather than a guess.
function fromPackageManagerField(targetDir: string): PackageManager | null {
  try {
    const raw = readFileSync(join(targetDir, 'package.json'), 'utf8')
    const pkg = JSON.parse(raw) as { packageManager?: string }
    if (typeof pkg.packageManager === 'string' && pkg.packageManager.startsWith('pnpm@')) return 'pnpm'
    if (typeof pkg.packageManager === 'string' && pkg.packageManager.startsWith('npm@')) return 'npm'
  } catch {
    // No package.json, unreadable, or no such field — fall through.
  }
  return null
}

function fromLockfile(targetDir: string): PackageManager | null {
  if (existsSync(join(targetDir, 'pnpm-lock.yaml')) || existsSync(join(targetDir, 'pnpm-workspace.yaml'))) {
    return 'pnpm'
  }
  return null
}

/**
 * Which package manager `docouture new`'s printed next-steps (and the
 * package-manager-aware bits of the scaffolded workflow templates) should
 * assume for this repository. Checked in order of how much it's worth
 * trusting: an explicit `packageManager` field first, then a lockfile
 * already committed at the repo root, then how `docouture new` itself was
 * invoked, defaulting to npm when none of those say otherwise.
 */
export function detectPackageManager(targetDir: string): PackageManager {
  return fromPackageManagerField(targetDir) ?? fromLockfile(targetDir) ?? fromUserAgent() ?? 'npm'
}

export function packageManagerPlan(pm: PackageManager): PackageManagerPlan {
  if (pm === 'pnpm') {
    return {
      pm,
      installCmd: 'pnpm install',
      devCmd: 'pnpm run dev',
      ciCmd: 'pnpm install --frozen-lockfile',
      lockfile: 'pnpm-lock.yaml',
      cacheName: 'pnpm',
      setupStepYaml: PNPM_ACTION_SETUP_STEP,
      packageManagerField: `pnpm@${detectPackageManagerVersion('pnpm')}`,
    }
  }
  return {
    pm,
    installCmd: 'npm install',
    devCmd: 'npm run dev',
    ciCmd: 'npm ci',
    lockfile: 'package-lock.json',
    cacheName: 'npm',
    setupStepYaml: '',
    packageManagerField: `npm@${detectPackageManagerVersion('npm')}`,
  }
}
