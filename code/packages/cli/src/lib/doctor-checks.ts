'use strict'

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

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
 * Compares the Node version actually running `pdocs` (the same one `npm
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
    detail: `install Node ${wantMajor} or newer — this is what 'npm run build'/'pdocs dev' will actually run under`,
  }
}

export interface NamesInput {
  /** `docs/antora.yml` -> `name`. */
  antoraYmlName: string | null
  /** The `<component>::` prefix of the playbook's `site.start_page`. */
  startPageComponent: string | null
  /** The playbook's `content.sources[0].start_path`. */
  startPath: string | null
  /** Where `docs/antora.yml` actually is, repo-root relative (e.g. `docs/docs`). */
  descriptorPath: string | null
  /** `package.json` -> `name`. */
  packageName: string | null
}

/**
 * The four names the docs-site-package skill documents as having to agree,
 * or a site builds to zero pages, or dies on "start page not found" — see
 * SKILL.md's "The four names that must agree" table. Returns one result per
 * pair so a failure names exactly which two values drifted, not just that
 * something, somewhere, did.
 */
export function checkNamesAgree(input: NamesInput): CheckResult[] {
  const results: CheckResult[] = []

  if (input.antoraYmlName && input.startPageComponent) {
    results.push(
      input.antoraYmlName === input.startPageComponent
        ? { ok: true, label: 'component name', message: `'${input.antoraYmlName}' matches site.start_page` }
        : {
            ok: false,
            label: 'component name',
            message: `docs/antora.yml name '${input.antoraYmlName}' != site.start_page component '${input.startPageComponent}'`,
            detail: "site.start_page must be '<name>::index.adoc' using docs/antora.yml's own name",
          }
    )
  }

  if (input.startPath && input.descriptorPath) {
    results.push(
      input.startPath === input.descriptorPath
        ? {
            ok: true,
            label: 'content path',
            message: `start_path '${input.startPath}' matches docs/antora.yml's location`,
          }
        : {
            ok: false,
            label: 'content path',
            message: `playbook start_path '${input.startPath}' != actual docs/antora.yml location '${input.descriptorPath}' (both repo-root relative)`,
            detail:
              'content.sources[0].start_path must be the repository-root-relative directory that directly contains antora.yml',
          }
    )
  }

  if (input.packageName && input.antoraYmlName) {
    results.push(
      input.packageName === input.antoraYmlName
        ? {
            ok: true,
            label: 'package name',
            message: `package.json name '${input.packageName}' matches component name`,
          }
        : {
            ok: false,
            label: 'package name',
            message: `package.json name '${input.packageName}' != docs/antora.yml name '${input.antoraYmlName}'`,
            detail: 'pdocs new sets both from the same value — if one was renamed by hand, rename the other to match',
          }
    )
  }

  return results
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
    execFile('git', ['rev-parse', 'HEAD'], { cwd: dir }, (err) => {
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

// Repo-root-relative paths `pdocs new` scaffolds AGENTS.md/the skill
// directories under — see new.ts's own AGENT_SUPPORT_PATHS, which this
// mirrors. Kept as a separate literal here rather than imported: doctor-
// checks.ts is a plain library module with fixture-driven unit tests (see
// its own spec) and importing from commands/new.ts would pull the wizard
// (@inquirer/prompts) into that dependency graph for no reason.
const AGENT_SUPPORT_CHECK_PATHS = [
  { path: 'AGENTS.md', label: 'AGENTS.md' },
  { path: join('.opencode', 'skills', 'writing-docs-pages'), label: '.opencode/skills/writing-docs-pages' },
  { path: join('.opencode', 'skills', 'site-structure'), label: '.opencode/skills/site-structure' },
  { path: join('.claude', 'skills', 'writing-docs-pages'), label: '.claude/skills/writing-docs-pages' },
  { path: join('.claude', 'skills', 'site-structure'), label: '.claude/skills/site-structure' },
]

/**
 * Whether AGENTS.md and the two platform-mirrored skill directories `pdocs
 * new` scaffolds are still present at the repository root — advisory only,
 * this is presence, not a content/drift diff (a site legitimately edits its
 * own skills after scaffolding), so `commands/doctor.ts` reports these
 * without folding them into the overall exit code the way the checks above
 * do. `docs-versioning` is intentionally not checked here: it exists only
 * under `--mode versioned`, and doctor has no reliable, cheap way to tell
 * which mode a site is on from this function alone (see
 * `commands/doctor.ts`'s own mode-detection comment, which reads the
 * playbook — a concern this function deliberately stays out of).
 */
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
          detail: 'run pdocs new again in this repository to regenerate it, or restore it from version control',
        }
  })
}
