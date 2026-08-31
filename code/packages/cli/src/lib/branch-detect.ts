'use strict'

// Branch-name derivation for git-flow support (GH #175) — deliberately not
// persisted anywhere as its own config, the same way `docouture-release.yml`'s
// "Detect mode" step derives standalone-vs-versioned live from
// antora-playbook.yml's own `tags:` line rather than reading it back from a
// stored value. Here the two branch *roles* are re-derived live from the
// two files that actually carry them:
//
//   - prerelease branch: antora-playbook.yml's content.sources[0].branches
//     (see lib/playbook-yml.ts's readBranches)
//   - release branch: docouture-release.yml's checkout `ref:` (the same
//     literal value it also pushes bump commits to, see that workflow's own
//     "Checkout"/"Bump release descriptor" steps)
//
// `docs/package.json`'s `docouture.branching` field ('trunk-based' |
// 'git-flow') is a cheap, redundant-by-design fast-path signal on top of
// this — never the source of truth for the names themselves, only for
// `docouture doctor`'s advisory check to compare this derivation against.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { readBranches } from './playbook-yml.js'

/**
 * `docouture-release.yml`'s checkout target — the one literal `ref:` key this
 * template file has (its "Checkout" step). Same regex-over-text idiom as
 * playbook-yml.ts, not a real YAML parse: this file is only ever read here,
 * matching how upgrade.ts already treats docs/antora.yml.
 */
export function readReleaseBranchFromWorkflow(workflowContent: string): string | null {
  const match = /^\s*ref:\s*(\S+?)\s*$/m.exec(workflowContent)
  if (!match?.[1]) return null
  return match[1].replace(/^['"]|['"]$/g, '')
}

export interface DetectedBranches {
  prerelease: string | null
  release: string | null
}

/**
 * Reads both branch roles back from whatever is actually on disk right now
 * — `antora-playbook.yml` under the site root, `docouture-release.yml` under
 * the repository's `.github/workflows/`. Either side resolves to `null` if
 * its file is missing or the expected line isn't found (a site scaffolded
 * before this feature existed still resolves fine here, since both files'
 * shapes predate GH #175 unchanged — this is not a "legacy fallback", it is
 * the only path).
 */
export async function detectBranches(siteRoot: string, repoRoot: string): Promise<DetectedBranches> {
  const playbookFile = join(siteRoot, 'antora-playbook.yml')
  const releaseWorkflowFile = join(repoRoot, '.github', 'workflows', 'docouture-release.yml')

  let prerelease: string | null = null
  try {
    const content = await readFile(playbookFile, 'utf8')
    prerelease = readBranches(content)?.[0] ?? null
  } catch {
    // No antora-playbook.yml at siteRoot — prerelease stays null.
  }

  let release: string | null = null
  try {
    const content = await readFile(releaseWorkflowFile, 'utf8')
    release = readReleaseBranchFromWorkflow(content)
  } catch {
    // No docouture-release.yml under .github/workflows/ — release stays null.
  }

  return { prerelease, release }
}

export type Branching = 'trunk-based' | 'git-flow'

/**
 * Trunk-based is definitionally the degenerate case where both roles are
 * the same branch (see the issue's own design note) — so this is a plain
 * equality check, not a third independently-stored value. Returns `null`
 * when either side couldn't be read, so callers can distinguish "genuinely
 * ambiguous/unreadable" from a real answer.
 */
export function inferBranching(branches: DetectedBranches): Branching | null {
  if (!branches.prerelease || !branches.release) return null
  return branches.prerelease === branches.release ? 'trunk-based' : 'git-flow'
}

/**
 * docouture-kroki-cache-warm.yml's `on.push.branches` array content — see
 * TemplateValues.cacheWarmBranchesYaml's own comment on why this workflow
 * triggers on both roles unconditionally rather than just one. Collapses to
 * a single glob when both roles are the same branch (trunk-based) instead
 * of a literal, pointless duplicate.
 */
export function cacheWarmBranchesYaml(prereleaseBranch: string, releaseBranch: string): string {
  const branches = prereleaseBranch === releaseBranch ? [releaseBranch] : [releaseBranch, prereleaseBranch]
  return branches.map((branch) => `'${branch}*'`).join(', ')
}
