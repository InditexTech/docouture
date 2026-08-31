'use strict'

import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseArgs } from '../lib/args.js'
import { readCliInfo } from '../lib/cli-info.js'
import { copyTemplate, exists, renderTemplateFile } from '../lib/copy-template.js'
import { detectPackageManager, packageManagerPlan } from '../lib/detect-package-manager.js'
import { resolveConfig } from '../lib/config-resolver.js'
import { findRepoRoot } from '../lib/repo-root.js'
import { AGENTS_MD_FILENAME, mergeAgentsMd } from '../lib/agents-md.js'
import { cacheWarmBranchesYaml, detectBranches } from '../lib/branch-detect.js'

// Same check `new.ts` uses, duplicated rather than imported — it's three
// lines, and `doctor-checks.ts` already sets the precedent of duplicating a
// small piece of `new.ts`'s own logic instead of reaching across into a
// module built around the interactive wizard (see its own comment on
// AGENT_SUPPORT_CHECK_PATHS).
function isInsideGitWorkTree(dir: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dir, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function titleCase(name: string): string {
  return name
    .split('-')
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ')
}

// docs/antora.yml's `name:`/`title:` are read the same way antora-yml.ts
// reads `version:` — a plain top-of-line regex, not a full YAML parse, so
// comments and formatting a human added survive untouched (this file is
// only ever read here, never rewritten). Unlike antora-yml.ts, upgrade.ts
// never writes this file, so that module's write-side helpers don't apply
// here and this stays a small, local, read-only counterpart instead of
// growing antora-yml.ts's own scope to cover a field it doesn't otherwise
// need.
function readAntoraField(content: string, key: 'name' | 'title'): string | null {
  const match = new RegExp(`^${key}:.*$`, 'm').exec(content)
  if (!match) return null
  const value = match[0].slice(key.length + 1).trim()
  return value.length > 0 ? value : null
}

export async function runUpgrade(argv: string[]): Promise<number> {
  const { flags } = parseArgs(argv)

  const dryRun = flags['dry-run'] === true
  const startDir = typeof flags.dir === 'string' ? resolve(flags.dir) : resolve(process.cwd())

  if (!isInsideGitWorkTree(startDir)) {
    console.error(`'${startDir}' is not inside a git repository`)
    console.error(
      'docouture upgrade re-syncs an already-scaffolded repository — run it from your repo root, or pass --dir <path> to one'
    )
    return 1
  }

  // --dir/cwd can be anywhere inside the repository — findRepoRoot walks up
  // to the actual top-level, same as new.ts and the rest of the CLI.
  const target = await findRepoRoot(startDir)

  // build/commands/upgrade.js -> build/templates/{workflows,agent-support} —
  // same resolution new.ts uses, see its own comment.
  const here = dirname(fileURLToPath(import.meta.url))
  const templatesRoot = join(here, '..', 'templates')
  const workflowsTemplateDir = join(templatesRoot, 'workflows')
  const agentSupportDir = join(templatesRoot, 'agent-support')

  // build/commands/upgrade.js -> package root, 2 levels up — see
  // readCliInfo's own comment. Always re-read fresh: an upgrade run re-pins
  // whatever templates reference the CLI version to the one actually
  // installed now, which may well differ from whatever `docouture new`
  // originally stamped in.
  const { version: cliVersion } = await readCliInfo(import.meta.url, 2)

  // Re-detected fresh too, same reasoning — a site may have picked up a
  // lockfile (or a packageManager field) since it was first scaffolded.
  const pm = packageManagerPlan(detectPackageManager(target))

  // AGENTS.md's own __DOCOUTURE_TITLE__ placeholder (the only name/title token
  // used outside `new.ts`'s starter/docs templates — see copy-template.ts's
  // PLACEHOLDERS) needs a value from somewhere, but `upgrade` takes no
  // <name> argument: it re-syncs an existing site, so the value it already
  // recorded in docs/antora.yml at scaffold time is read back rather than
  // asked for again. --title still overrides it, and a site with no
  // docs/antora.yml (workflows/skills used standalone of the starter
  // subtree) falls back to a plain, title-cased directory name.
  const descriptorPath = join(target, 'docs', 'src', 'antora.yml')
  let name = 'docs'
  let fromYmlTitle: string | undefined
  if (await exists(descriptorPath)) {
    const content = await readFile(descriptorPath, 'utf8')
    name = readAntoraField(content, 'name') ?? name
    fromYmlTitle = readAntoraField(content, 'title') ?? undefined
  }
  // Same three-tier precedence publish.ts uses (see lib/config-resolver.ts):
  // --title flag > the value already recorded in docs/antora.yml > a plain
  // title-cased fallback computed from the name above.
  const { title } = resolveConfig(
    { title: titleCase(name) },
    { title: fromYmlTitle },
    { title: typeof flags.title === 'string' ? flags.title : undefined }
  )

  // Re-derived live too, same reasoning as name/title above — upgrade
  // re-copies every workflow template (unlike docs/), and those templates
  // now carry __DOCOUTURE_PRERELEASE_BRANCH__/__DOCOUTURE_RELEASE_BRANCH__
  // (GH #175) — real branch names are required here, not stubs, or an
  // upgrade would silently overwrite a git-flow site's workflows back to
  // whatever these placeholders' un-substituted default would be. See
  // lib/branch-detect.ts's own comment on why these are derived live
  // rather than read back from a stored config.
  const siteRoot = join(target, 'docs')
  const detected = await detectBranches(siteRoot, target)
  const prereleaseBranch = detected.prerelease ?? 'main'
  const releaseBranch = detected.release ?? 'main'

  const values = {
    name,
    title,
    // Same reasoning as repoIgnoreGlob below: __DOCOUTURE_COMPONENT_NAME__ only
    // appears in docs/antora.yml and antora-playbook.yml, neither of which
    // upgrade ever re-copies (see the comment above `name` itself) — this
    // value is structurally required by TemplateValues but never actually
    // substituted anywhere upgrade touches.
    componentName: 'unused-by-upgrade',
    cliVersion,
    pmName: pm.pm,
    pmCacheName: pm.cacheName,
    pmLockfile: pm.lockfile,
    pmCiCmd: pm.ciCmd,
    pmSetupStepYaml: pm.setupStepYaml,
    // Same reasoning as repoIgnoreGlob below: package.json (the only
    // template file this placeholder appears in) is never re-copied by
    // upgrade either, so there's nothing meaningful to compute it from.
    pmPackageManagerField: 'unused-by-upgrade',
    // upgrade never re-copies docs/ (see below) — package.json, the only
    // template file this placeholder appears in, is never touched here — so
    // there's nothing meaningful to compute it from. Not an empty string:
    // an empty glob (see check-links.mjs's globToRegExp) compiles to a
    // pattern matching every URL, which would be a silent, dangerous no-op
    // if this value were ever actually substituted somewhere.
    repoIgnoreGlob: 'unused-by-upgrade',
    prereleaseBranch,
    releaseBranch,
    // docs/package.json (the only template file this placeholder appears
    // in) is never re-copied by upgrade — same reasoning as
    // pmPackageManagerField/repoIgnoreGlob above.
    branching: 'unused-by-upgrade',
    cacheWarmBranchesYaml: cacheWarmBranchesYaml(prereleaseBranch, releaseBranch),
  }

  const workflowsDir = join(target, '.github', 'workflows')
  const agentsMdFile = join(target, AGENTS_MD_FILENAME)

  // Unlike `new.ts`, this command's whole purpose is to overwrite what's
  // already there — workflows are meant to be regenerable from the
  // template on every upgrade, not merged with local edits (there is no
  // content-hash/diff tracking anywhere in this CLI to tell a stock file
  // from a user-edited one). `docs/` itself — the starter content a site
  // has since written its own pages into — is never touched here. Skills
  // are never touched here either: `docouture upgrade` only re-syncs the
  // starter site and its GitHub workflows, same as `docouture new` only
  // scaffolds them — skills are a separate, self-serve install via
  // `npx skills add InditexTech/docouture`. AGENTS.md is the one exception:
  // copyTemplate's own SKIP_FILENAMES skip (see copy-template.ts) leaves it
  // untouched by the walk above, and it's merged instead — see
  // lib/agents-md.ts for why a blind overwrite here would silently destroy
  // the 'Documentation state' table the docouture-documenting-changes skill
  // maintains outside docouture' own managed section.
  if (dryRun) {
    const plannedWorkflows = await copyTemplate(workflowsTemplateDir, workflowsDir, values, { dryRun: true })

    console.log('would write:')
    for (const path of [...plannedWorkflows, agentsMdFile]) {
      console.log(`  ${relative(target, path)}`)
    }
    return 0
  }

  await copyTemplate(workflowsTemplateDir, workflowsDir, values)

  const existingAgentsMd = (await exists(agentsMdFile)) ? await readFile(agentsMdFile, 'utf8') : undefined
  const renderedAgentsMd = await renderTemplateFile(join(agentSupportDir, AGENTS_MD_FILENAME), values)
  await writeFile(agentsMdFile, mergeAgentsMd(existingAgentsMd, renderedAgentsMd), 'utf8')

  // Relative to `target` (the repo root), not process.cwd() — cwd may be a
  // nested subdirectory findRepoRoot walked up from, in which case
  // relative(cwd, ...) produces a useless '../../..' chain for paths that
  // are actually just '.github/workflows', 'AGENTS.md' etc. at the root.
  console.log(`updated ${relative(target, workflowsDir)}`)
  console.log(`updated ${relative(target, agentsMdFile)}`)

  return 0
}
