'use strict'

import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseArgs } from '../lib/args.js'
import { readCliInfo } from '../lib/cli-info.js'
import { copyTemplate, exists } from '../lib/copy-template.js'
import { detectPackageManager, packageManagerPlan } from '../lib/detect-package-manager.js'

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
  const target = typeof flags.dir === 'string' ? resolve(flags.dir) : resolve(process.cwd())

  if (!isInsideGitWorkTree(target)) {
    console.error(`'${target}' is not inside a git repository`)
    console.error(
      'pdocs upgrade re-syncs an already-scaffolded repository — run it from your repo root, or pass --dir <path> to one'
    )
    return 1
  }

  // build/commands/upgrade.js -> build/templates/{workflows,agent-support} —
  // same resolution new.ts uses, see its own comment.
  const here = dirname(fileURLToPath(import.meta.url))
  const templatesRoot = join(here, '..', 'templates')
  const workflowsTemplateDir = join(templatesRoot, 'workflows')
  const agentSupportDir = join(templatesRoot, 'agent-support')

  // build/commands/upgrade.js -> package root, 2 levels up — see
  // readCliInfo's own comment. Always re-read fresh: an upgrade run re-pins
  // whatever templates reference the CLI version to the one actually
  // installed now, which may well differ from whatever `pdocs new`
  // originally stamped in.
  const { version: cliVersion } = await readCliInfo(import.meta.url, 2)

  // Re-detected fresh too, same reasoning — a site may have picked up a
  // lockfile (or a packageManager field) since it was first scaffolded.
  const pm = packageManagerPlan(detectPackageManager(target))

  // AGENTS.md's own __PDOCS_TITLE__ placeholder (the only name/title token
  // used outside `new.ts`'s starter/docs templates — see copy-template.ts's
  // PLACEHOLDERS) needs a value from somewhere, but `upgrade` takes no
  // <name> argument: it re-syncs an existing site, so the value it already
  // recorded in docs/antora.yml at scaffold time is read back rather than
  // asked for again. --title still overrides it, and a site with no
  // docs/antora.yml (workflows/skills used standalone of the starter
  // subtree) falls back to a plain, title-cased directory name.
  const descriptorPath = join(target, 'docs', 'docs', 'antora.yml')
  let name = 'docs'
  let title = titleCase(name)
  if (await exists(descriptorPath)) {
    const content = await readFile(descriptorPath, 'utf8')
    name = readAntoraField(content, 'name') ?? name
    title = readAntoraField(content, 'title') ?? titleCase(name)
  }
  if (typeof flags.title === 'string') title = flags.title

  const values = {
    name,
    title,
    cliVersion,
    pmName: pm.pm,
    pmCacheName: pm.cacheName,
    pmLockfile: pm.lockfile,
    pmCiCmd: pm.ciCmd,
    pmSetupStepYaml: pm.setupStepYaml,
  }

  const workflowsDir = join(target, '.github', 'workflows')

  // Unlike `new.ts`, this command's whole purpose is to overwrite what's
  // already there — workflows and agent skills are meant to be regenerable
  // from the template on every upgrade, not merged with local edits (there
  // is no content-hash/diff tracking anywhere in this CLI to tell a stock
  // file from a user-edited one). `docs/` itself — the starter content a
  // site has since written its own pages into — is never touched here.
  if (dryRun) {
    const plannedWorkflows = await copyTemplate(workflowsTemplateDir, workflowsDir, values, { dryRun: true })
    const plannedAgentSupport = await copyTemplate(agentSupportDir, target, values, { dryRun: true })

    console.log('would write:')
    for (const path of [...plannedWorkflows, ...plannedAgentSupport]) {
      console.log(`  ${relative(target, path)}`)
    }
    return 0
  }

  await copyTemplate(workflowsTemplateDir, workflowsDir, values)
  await copyTemplate(agentSupportDir, target, values)

  console.log(`updated ${relative(process.cwd(), workflowsDir)}`)
  console.log(`updated ${relative(process.cwd(), join(target, 'AGENTS.md'))}`)
  console.log(`updated ${relative(process.cwd(), join(target, '.opencode', 'skills'))}`)
  console.log(`updated ${relative(process.cwd(), join(target, '.claude', 'skills'))}`)

  return 0
}
