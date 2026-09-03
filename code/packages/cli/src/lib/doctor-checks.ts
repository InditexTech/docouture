// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { Branching } from './branch-detect.js'

// Each check here is a plain function returning a result rather than
// printing directly — `commands/doctor.ts` owns all output formatting, so
// these are unit-testable against fixture directories without capturing
// console output.

export interface CheckResult {
  ok: boolean
  label: string
  message: string
  /** Extra guidance shown only on failure. */
  detail?: string
}

function parseMajor(value: string): number | null {
  const match = /(\d+)/.exec(value)
  return match ? Number(match[1]) : null
}

/**
 * Compares the Node version actually running `docouture` (the same one `npm
 * run build`/`dev` will use) against the site's own `engines.node` — a
 * range like `>=24.0.0`. Only the major version is compared: this package
 * has no semver dependency (see antora-yml.ts's own comment on a similar
 * tradeoff) and a major-version floor is what `engines.node` communicates
 * in practice.
 */
export function checkNodeVersion(engineRange: string | null | undefined, actualVersion: string): CheckResult {
  const label = 'node version'
  if (!engineRange) {
    return { ok: true, label, message: `${actualVersion} (no engines.node requirement declared)` }
  }
  const wantMajor = parseMajor(engineRange)
  const haveMajor = parseMajor(actualVersion)
  if (wantMajor === null || haveMajor === null) {
    return { ok: true, label, message: `${actualVersion} (could not parse '${engineRange}', skipping)` }
  }
  if (haveMajor >= wantMajor) {
    return { ok: true, label, message: `${actualVersion} satisfies ${engineRange}` }
  }
  return {
    ok: false,
    label,
    message: `${actualVersion} does not satisfy ${engineRange}`,
    detail: `install Node ${wantMajor} or newer — this is what 'npm run build'/'docouture dev' will actually run under`,
  }
}

/**
 * Confirms the package manager a site actually declares (`package.json`'s
 * own `packageManager` field, corepack convention, e.g. `pnpm@10.24.0`) is
 * installed and reachable — `checkNodeVersion` above gets a shortcut
 * (`docouture` *is* a Node process, so Node's presence is proof positive,
 * only its version is an open question), but `docouture` doesn't run *as*
 * npm or pnpm, so their presence has to be checked by actually spawning the
 * binary. Presence only — no version-match against the declared field is
 * required, the field just says which binary to look for.
 *
 * The `<name>` before `@` is read as-is rather than restricted to a
 * hardcoded `npm`/`pnpm` allow-list — this is what `docouture new` ever
 * writes there in practice, but nothing here depends on that being true.
 */
export function checkPackageManagerAvailable(packageManagerField: string | null | undefined): Promise<CheckResult> {
  const label = 'package manager'

  if (!packageManagerField) {
    return Promise.resolve({
      ok: true,
      label,
      message: 'no packageManager field declared in package.json — skipping',
    })
  }

  const match = /^([^@\s]+)@/.exec(packageManagerField)
  const pm = match?.[1]
  if (!pm) {
    return Promise.resolve({
      ok: true,
      label,
      message: `could not parse packageManager '${packageManagerField}' — skipping`,
    })
  }

  return new Promise((resolvePromise) => {
    execFile(pm, ['--version'], { timeout: 10_000 }, (err, stdout) => {
      resolvePromise(
        err
          ? {
              ok: false,
              label,
              message: `'${pm}' is not available on PATH`,
              detail: `package.json declares packageManager: '${packageManagerField}' — install ${pm} (or run via corepack)`,
            }
          : { ok: true, label, message: `${pm} ${stdout.trim()} is available` }
      )
    })
  })
}

export interface NamesInput {
  /** `docs/antora.yml` -> `name`. */
  antoraYmlName: string | null
  /** The `<component>::` prefix of the playbook's `site.start_page`. */
  startPageComponent: string | null
  /** The playbook's `content.sources[0].start_path`. */
  startPath: string | null
  /** Where `docs/antora.yml` actually is, repo-root relative (e.g. `docs/src`). */
  descriptorPath: string | null
  /** `package.json` -> `name`. */
  packageName: string | null
}

function checkComponentNameAgrees(antoraYmlName: string | null, startPageComponent: string | null): CheckResult | null {
  if (!antoraYmlName || !startPageComponent) return null
  if (antoraYmlName === startPageComponent) {
    return { ok: true, label: 'component name', message: `'${antoraYmlName}' matches site.start_page` }
  }
  return {
    ok: false,
    label: 'component name',
    message: `docs/antora.yml name '${antoraYmlName}' != site.start_page component '${startPageComponent}'`,
    detail: "site.start_page must be '<name>::index.adoc' using docs/antora.yml's own name",
  }
}

function checkContentPathAgrees(startPath: string | null, descriptorPath: string | null): CheckResult | null {
  if (!startPath || !descriptorPath) return null
  if (startPath === descriptorPath) {
    return {
      ok: true,
      label: 'content path',
      message: `start_path '${startPath}' matches docs/antora.yml's location`,
    }
  }
  return {
    ok: false,
    label: 'content path',
    message: `playbook start_path '${startPath}' != actual docs/antora.yml location '${descriptorPath}' (both repo-root relative)`,
    detail:
      'content.sources[0].start_path must be the repository-root-relative directory that directly contains antora.yml',
  }
}

// `ROOT` is Antora's own reserved component name (dropped from every
// published URL — see how-antora-builds-urls's "Component segment"), set by
// `docouture new` when the "extra URL path segment" question/`--url-segment`
// flag is declined (the default) — see new.ts's own comment on
// TemplateValues.componentName. It is never derived from package.json's
// name, so the two are expected to differ in that case; only a real, chosen
// component name must still match package.json's own name.
function checkPackageNameAgrees(packageName: string | null, antoraYmlName: string | null): CheckResult | null {
  if (!packageName || !antoraYmlName) return null
  if (antoraYmlName === 'ROOT') {
    return {
      ok: true,
      label: 'package name',
      message: `docs/antora.yml name is 'ROOT' (no URL segment) — package.json name '${packageName}' is independent`,
    }
  }
  if (packageName === antoraYmlName) {
    return { ok: true, label: 'package name', message: `package.json name '${packageName}' matches component name` }
  }
  return {
    ok: false,
    label: 'package name',
    message: `package.json name '${packageName}' != docs/antora.yml name '${antoraYmlName}'`,
    detail: 'docouture new sets both from the same value — if one was renamed by hand, rename the other to match',
  }
}

/**
 * The four names the docs-site-package skill documents as having to agree,
 * or a site builds to zero pages, or dies on "start page not found" — see
 * SKILL.md's "The four names that must agree" table. Returns one result per
 * pair so a failure names exactly which two values drifted, not just that
 * something, somewhere, did.
 */
export function checkNamesAgree(input: NamesInput): CheckResult[] {
  const results = [
    checkComponentNameAgrees(input.antoraYmlName, input.startPageComponent),
    checkContentPathAgrees(input.startPath, input.descriptorPath),
    checkPackageNameAgrees(input.packageName, input.antoraYmlName),
  ]
  return results.filter((result): result is CheckResult => result !== null)
}

/**
 * Antora reads content from git — a repository with no commits resolves the
 * content source to nothing and the site builds with zero pages, reported
 * only as "Start page specified for site not found". Mirrors `just doctor`'s
 * own check in the monorepo justfile.
 */
export function checkGitHasCommit(dir: string): Promise<CheckResult> {
  const label = 'git history'
  return new Promise((resolvePromise) => {
    // Resolves 'git' off PATH, same as any shell script would — `docouture
    // doctor` runs on a maintainer's own machine/CI and has no way to check
    // "does this repo have a commit" other than asking whichever `git` is
    // already on that PATH; hardcoding a path would break on any setup that
    // doesn't match the one this was written on, for no real gain against a
    // threat model this tool has no way to defend against differently than
    // any other script already doesn't.
    execFile('git', ['rev-parse', 'HEAD'], { cwd: dir, timeout: 10_000 }, (err) => {
      // NOSONAR
      resolvePromise(
        err
          ? {
              ok: false,
              label,
              message: 'repository has no commits',
              detail:
                'Antora reads content from git; with no commits the content source resolves to nothing and the site builds with zero pages — make an initial commit',
            }
          : { ok: true, label, message: 'repository has at least one commit' }
      )
    })
  })
}

/**
 * Confirms the two things a build actually needs are installed locally —
 * `npm install` was run, in other words — rather than letting Antora's own
 * `MODULE_NOT_FOUND` be the first sign of it.
 */
export function checkAntoraAvailable(siteRoot: string): CheckResult {
  const label = 'antora CLI'
  const bin = join(siteRoot, 'node_modules', '.bin', 'antora')
  const pkg = join(siteRoot, 'node_modules', 'antora')
  if (existsSync(bin) && existsSync(pkg)) {
    return { ok: true, label, message: 'antora is installed in node_modules' }
  }
  return {
    ok: false,
    label,
    message: 'antora is not installed',
    detail: "run 'npm install' in the site directory",
  }
}

// Repo-root-relative paths `docouture new` scaffolds under — see new.ts's own
// AGENT_SUPPORT_PATHS, which this mirrors. Kept as a separate literal here
// rather than imported: doctor-checks.ts is a plain library module with
// fixture-driven unit tests (see its own spec) and importing from
// commands/new.ts would pull the wizard (@inquirer/prompts) into that
// dependency graph for no reason. Skills are deliberately absent here: the
// CLI never scaffolds them (see new.ts's own comment) — a user installs
// them independently via `npx skills add InditexTech/docouture`, which is
// outside anything `docouture doctor` can or should check for.
const AGENT_SUPPORT_CHECK_PATHS = [{ path: 'AGENTS.md', label: 'AGENTS.md' }]

/**
 * Whether AGENTS.md is still present at the repository root — advisory
 * only, this is presence, not a content/drift diff (a repository
 * legitimately edits AGENTS.md's own free-form notes), so
 * `commands/doctor.ts` reports this without folding it into the overall
 * exit code the way the checks above do.
 */
/** The label `docouture-release.yml`'s `pull_request.closed` trigger requires — see that workflow's own `if:` condition. */
const RELEASE_LABEL = 'docs/release'

/**
 * Whether the `docs/release` GitHub label exists on this repository —
 * best-effort, via the `gh` CLI, since there is no other way to ask GitHub
 * this from a local checkout. `docouture new` never creates this label (GitHub
 * does not create labels referenced by a workflow's `if:` condition on its
 * own, and scaffolding is not a GitHub API call), so a repository fresh out
 * of `docouture new` is missing it until someone runs `gh label create
 * docs/release` — see main's own prerequisites.adoc, which covers this
 * alongside the repository-public/GitHub-Pages-enablement steps a fresh
 * site also needs. Without it, `docouture-release.yml`'s automatic
 * merge-triggers-a-release path is a silent no-op; only its
 * `workflow_dispatch` path still works.
 *
 * Advisory only, same as checkAgentFilesPresent above: `gh` may not be
 * installed, not authenticated, or this may not be a GitHub-hosted
 * repository at all, none of which this function treats as a real failure —
 * only an actual label list that is missing the label is reported as
 * `ok: false`.
 */
export function checkReleaseLabelExists(repoRoot: string): Promise<CheckResult> {
  const label = 'docs/release label'
  return new Promise((resolvePromise) => {
    // Resolves 'gh' off PATH, same reasoning as checkGitHasCommit's own
    // comment above — this only ever runs locally/in CI for whoever's
    // already using the GitHub CLI, never against untrusted input.
    execFile('gh', ['label', 'list', '--json', 'name'], { cwd: repoRoot, timeout: 10_000 }, (err, stdout) => {
      // NOSONAR
      if (err) {
        resolvePromise({
          ok: true,
          label,
          message: 'could not check (gh CLI unavailable, unauthenticated, or not a GitHub repo) — skipping',
        })
        return
      }
      let names: string[]
      try {
        const parsed = JSON.parse(stdout) as { name: string }[]
        names = parsed.map((entry) => entry.name)
      } catch {
        resolvePromise({ ok: true, label, message: "could not parse 'gh label list' output — skipping" })
        return
      }
      if (names.includes(RELEASE_LABEL)) {
        resolvePromise({ ok: true, label, message: `'${RELEASE_LABEL}' exists` })
        return
      }
      resolvePromise({
        ok: false,
        label,
        message: `'${RELEASE_LABEL}' does not exist`,
        detail:
          "docouture-release.yml's merge-triggers-a-release path is a no-op without it — run " +
          `'gh label create ${RELEASE_LABEL}', or use workflow_dispatch instead`,
      })
    })
  })
}

export function checkAgentFilesPresent(repoRoot: string): CheckResult[] {
  return AGENT_SUPPORT_CHECK_PATHS.map(({ path: relativePath, label }) => {
    const absolutePath = join(repoRoot, relativePath)
    const present = existsSync(absolutePath)
    return present
      ? { ok: true, label, message: 'present' }
      : {
          ok: false,
          label,
          message: 'missing',
          detail: "run 'docouture upgrade' in this repository to regenerate it, or restore it from version control",
        }
  })
}

export interface BranchingInput {
  /** `docs/package.json` -> `docouture.branching`, or null if absent (predates GH #175, or hand-removed). */
  declaredBranching: string | null
  /**
   * Derived live from antora-playbook.yml's content.sources[0].branches and
   * docouture-release.yml's checkout ref — see lib/branch-detect.ts's
   * detectBranches/inferBranching, which this is never itself a
   * replacement for: `declaredBranching` is a cheap, redundant-by-design
   * signal, this is the actual state it's compared against.
   */
  actualBranching: Branching | null
}

/**
 * Whether `docs/package.json`'s declared `docouture.branching` still agrees
 * with what antora-playbook.yml/docouture-release.yml actually say — the
 * same "names must agree" idiom as checkNamesAgree above, just for a single
 * pair instead of four. Advisory only, same reasoning as
 * checkReleaseLabelExists: a site predating GH #175 (no declared value yet)
 * or one where the derivation itself failed (malformed/hand-edited
 * templates) is reported as `ok: true` rather than a failure — only an
 * actual, confident disagreement between the two is `ok: false`.
 */
export function checkBranchingAgrees(input: BranchingInput): CheckResult {
  const label = 'branching model'

  if (!input.declaredBranching) {
    return {
      ok: true,
      label,
      message: 'no docouture.branching declared in docs/package.json — skipping',
    }
  }

  if (!input.actualBranching) {
    return {
      ok: true,
      label,
      message: 'could not derive the current branch names from antora-playbook.yml/docouture-release.yml — skipping',
    }
  }

  if (input.declaredBranching === input.actualBranching) {
    return {
      ok: true,
      label,
      message: `docouture.branching '${input.declaredBranching}' matches what antora-playbook.yml/docouture-release.yml actually say`,
    }
  }

  return {
    ok: false,
    label,
    message: `docouture.branching '${input.declaredBranching}' != actual '${input.actualBranching}' (derived from antora-playbook.yml/docouture-release.yml)`,
    detail:
      "run 'docouture branch-model <trunk-based|git-flow>' to re-sync everything, or fix docs/package.json's docouture.branching by hand if it's simply stale",
  }
}
