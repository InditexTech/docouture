'use strict'

import { input, select } from '@inquirer/prompts'
import { execFileSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseArgs } from '../lib/args.js'
import { readCliInfo } from '../lib/cli-info.js'
import { copyTemplate, exists, isEmptyOrMissing, writeTemplateFile } from '../lib/copy-template.js'

// Matches the rule an npm package name (and, not coincidentally, an Antora
// component name — both end up as URL segments) can safely be: this is
// stricter than npm's own rule, which also allows dots and a leading `@scope/`
// that makes no sense for a directory name here.
const NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

// The only two versioning shapes `pdocs new` scaffolds — both real,
// releasable configurations handled by the templated pdocs-release.yml — see
// the docs-site-package skill's reference/versioning-modes.md. 'standalone'
// (the default): `main` always builds as the prerelease/preview version, and
// a release just force-moves a rolling `stable` tag — no historical archive,
// appropriate for a product where only "now" and "what's next" matter.
// 'versioned': `main` builds as the prerelease version too — docs/antora.yml
// is identical to the standalone shape on main, for both modes — but every
// release is instead its own immutable `vX.Y.Z` git tag, kept forever —
// appropriate for a library/SDK whose consumers pin an old version. (A bare,
// unversioned checkout — no prerelease/stable split at all — is not offered
// here: it only ever comes up as an ad-hoc `pdocs dev` preview before a mode
// is chosen, never as something worth releasing.)
const MODES = ['standalone', 'versioned'] as const
type Mode = (typeof MODES)[number]

// Filenames pdocs-publish.yml / pdocs-release.yml / pdocs-pr-verify.yml are
// templated under (see templates/workflows/) — kept as a literal list here so
// the pre-flight conflict check below can name exactly which ones would be
// overwritten without having to read the template directory to find out.
const WORKFLOW_NAMES = ['pdocs-publish.yml', 'pdocs-release.yml', 'pdocs-pr-verify.yml']

// Repo-root-relative paths `templates/agent-support/` lands under (see
// new.ts's own copyTemplate call below) — kept as a literal list, same
// reasoning as WORKFLOW_NAMES above, so the pre-flight conflict check can
// name exactly what would be overwritten. `docs-versioning` is deliberately
// absent here: it is scaffolded only under `--mode versioned` (see the
// `.versioned`-marker copy further down), so an existing standalone-mode
// site with no such directory yet is never blocked by this check on it.
const AGENT_SUPPORT_PATHS = [
  'AGENTS.md',
  join('.opencode', 'skills', 'documenting-your-repo'),
  join('.opencode', 'skills', 'writing-docs-pages'),
  join('.opencode', 'skills', 'docs-internals'),
  join('.claude', 'skills', 'documenting-your-repo'),
  join('.claude', 'skills', 'writing-docs-pages'),
  join('.claude', 'skills', 'docs-internals'),
]

function titleCase(name: string): string {
  return name
    .split('-')
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ')
}

function isInsideGitWorkTree(dir: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dir, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// The bits of stdin/stdout the interactive wizard needs, pulled behind an
// interface so tests can hand it a scripted stream pair instead of a real
// TTY. `isTTY` decides whether the wizard runs at all — defaults to
// process.stdin/stdout's own flags, which are false under a test runner or a
// CI pipe, so non-interactive callers get exactly today's flag-driven
// behaviour with no prompting.
export interface NewIO {
  input: NodeJS.ReadableStream
  output: NodeJS.WritableStream
  isTTY: boolean
}

function defaultIO(): NewIO {
  return {
    input: process.stdin,
    output: process.stdout,
    isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  }
}

// @inquirer/prompts pipes its own internal stream into whatever output it's
// given and calls .end() on ours when each individual prompt finishes —
// harmless against process.stdout (Node refuses to let that be ended,
// which is why chaining prompts against a real terminal works fine) but
// fatal against a plain custom stream like a test's PassThrough: it would
// go dark after the very first of promptWizard's three sequential prompts.
// Wrapping every method through except a no-op .end() makes any writable
// stream survive being reused across multiple prompts, the same as stdout
// already does.
function keepOutputOpen(output: NodeJS.WritableStream): NodeJS.WritableStream {
  return new Proxy(output, {
    get(target, prop, receiver) {
      if (prop === 'end') {
        return (...args: unknown[]) => {
          const cb = typeof args[args.length - 1] === 'function' ? (args.pop() as () => void) : undefined
          cb?.()
          return receiver
        }
      }
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

interface WizardAnswers {
  name: string
  title: string
  mode: Mode
}

// Fills in only whatever `initial` didn't already supply — a flag or
// positional argument always wins over a prompt, so scripting one piece
// (say, --mode) while leaving the rest to the wizard works as expected.
// Each @inquirer/prompts call gets io's streams via its `context` argument
// rather than touching process.stdin/stdout directly, so tests can hand it
// a scripted stream pair instead of a real TTY — same substitution point
// the old hand-rolled readline wizard used.
async function promptWizard(
  io: NewIO,
  initial: { name?: string; title?: string; mode?: Mode }
): Promise<WizardAnswers> {
  const context = { input: io.input, output: keepOutputOpen(io.output) }

  const name = (
    await input(
      {
        message: 'Site / component name:',
        default: initial.name,
        validate: (value) =>
          NAME_PATTERN.test(value.trim()) || "expected lowercase letters, digits and hyphens, e.g. 'my-project-docs'",
      },
      context
    )
  ).trim()

  const defaultTitle = titleCase(name)
  const title = (
    await input(
      {
        message: 'Site title:',
        default: initial.title ?? defaultTitle,
      },
      context
    )
  ).trim()

  const mode =
    initial.mode ??
    (await select<Mode>(
      {
        message: 'Versioning mode:',
        default: 'standalone' as Mode,
        choices: [
          {
            name: 'Standalone (Stable + Prerelease)',
            value: 'standalone',
            description:
              "main always builds as the prerelease/preview version; a release moves a rolling 'stable' tag — no historical archive kept.",
          },
          {
            name: 'Versioned (Full History)',
            value: 'versioned',
            description:
              'main always builds as the prerelease/preview version; every release is an immutable vX.Y.Z git tag.',
          },
        ],
      },
      context
    ))

  return { name, title: title.length > 0 ? title : defaultTitle, mode }
}

export async function runNew(argv: string[], io: NewIO = defaultIO()): Promise<number> {
  const { positional, flags } = parseArgs(argv)

  let name = positional[0]
  let title = typeof flags.title === 'string' ? flags.title : undefined
  let mode: Mode | undefined

  if (typeof flags.mode === 'string') {
    if (!(MODES as readonly string[]).includes(flags.mode)) {
      console.error(`invalid --mode: '${flags.mode}' — expected 'standalone' or 'versioned'`)
      return 1
    }
    mode = flags.mode as Mode
  }

  // Wizard runs only in an interactive terminal, and only when not
  // explicitly skipped with --yes — a script or CI pipe (io.isTTY false)
  // gets exactly today's non-interactive behaviour, defaults and all.
  const skipWizard = flags.yes === true || !io.isTTY

  if (!skipWizard) {
    const answers = await promptWizard(io, { name, title, mode })
    name = answers.name
    title = answers.title
    mode = answers.mode
  }

  mode = mode ?? 'standalone'

  if (!name) {
    console.error('usage: pdocs new <name> [--dir <path>] [--title <title>] [--mode standalone|versioned]')
    return 1
  }

  if (!NAME_PATTERN.test(name)) {
    console.error(`invalid name: '${name}'`)
    console.error('expected lowercase letters, digits and hyphens, e.g. my-project-docs')
    return 1
  }

  title = title ?? titleCase(name)

  // The target is always an EXISTING repository's root, not a fresh
  // directory `pdocs new` creates — --dir overrides which repo root that is
  // (handy for testing, or scaffolding into something other than cwd),
  // defaulting to wherever the command is actually run from.
  const target = typeof flags.dir === 'string' ? resolve(flags.dir) : resolve(process.cwd())

  if (!isInsideGitWorkTree(target)) {
    console.error(`'${target}' is not inside a git repository`)
    console.error(
      'pdocs new scaffolds into an existing repository — run it from your repo root (after git init), or pass --dir <path> to one'
    )
    return 1
  }

  const docsDir = join(target, 'docs')
  const workflowsDir = join(target, '.github', 'workflows')

  if ((await exists(docsDir)) && !(await isEmptyOrMissing(docsDir))) {
    console.error(`'${docsDir}' already exists and is not empty`)
    return 1
  }

  const existingWorkflows: string[] = []
  for (const workflowName of WORKFLOW_NAMES) {
    if (await exists(join(workflowsDir, workflowName))) existingWorkflows.push(workflowName)
  }
  if (existingWorkflows.length > 0) {
    console.error(`refusing to overwrite existing workflow(s) under '${workflowsDir}':`)
    console.error(`  ${existingWorkflows.join(', ')}`)
    return 1
  }

  // AGENTS.md and the skill directories land at the repository root, same as
  // .github/workflows/ above — a non-empty skill directory (or an existing
  // AGENTS.md) is refused for the same reason a workflow file is: this
  // command only ever writes into empty space, never merges into whatever a
  // repository already has.
  const existingAgentSupport: string[] = []
  for (const relativePath of AGENT_SUPPORT_PATHS) {
    const absolutePath = join(target, relativePath)
    if (relativePath.endsWith('.md')) {
      if (await exists(absolutePath)) existingAgentSupport.push(relativePath)
    } else if ((await exists(absolutePath)) && !(await isEmptyOrMissing(absolutePath))) {
      existingAgentSupport.push(relativePath)
    }
  }
  if (existingAgentSupport.length > 0) {
    console.error(`refusing to overwrite existing agent file(s)/dir(s) under '${target}':`)
    console.error(`  ${existingAgentSupport.join(', ')}`)
    return 1
  }

  // build/commands/new.js -> build/templates/{starter,workflows,agent-support}
  // — see scripts/copy-templates.mjs, which puts the templates/ directory
  // here at build time. Resolved from import.meta.url so this works
  // regardless of the directory pdocs is invoked from.
  const here = dirname(fileURLToPath(import.meta.url))
  const templatesRoot = join(here, '..', 'templates')
  const starterDir = join(templatesRoot, 'starter')
  const workflowsTemplateDir = join(templatesRoot, 'workflows')
  const agentSupportDir = join(templatesRoot, 'agent-support')

  // build/commands/new.js -> build/ -> package root, 2 levels up — see
  // readCliInfo's own comment. This is the exact version a scaffolded
  // site's devDependency on @inditextech/pdocs-cli gets pinned to below, so
  // it always matches whatever CLI actually generated it, snapshot/local
  // releases included.
  const { version: cliVersion } = await readCliInfo(import.meta.url, 2)

  const values = { name, title, cliVersion }

  // The whole starter subtree — package.json, antora-playbook.yml, its own
  // nested docs/antora.yml — lands under <repo-root>/docs/ as one piece,
  // unchanged in shape. Only .github/workflows/ is peeled out to a second
  // copy at the true repo root, since GitHub Actions never discovers
  // workflows anywhere else.
  await copyTemplate(starterDir, docsDir, values)
  await copyTemplate(workflowsTemplateDir, workflowsDir, values)

  // AGENTS.md and both platforms' skill directories also land at the true
  // repo root, same as workflows — an agent reads them from there, not from
  // inside docs/. copyTemplate's own VERSIONED_MARKER skip (see
  // copy-template.ts) leaves docs-versioning.versioned untouched here; it is
  // copied under its real name below, only in versioned mode.
  await copyTemplate(agentSupportDir, target, values)

  if (mode === 'versioned') {
    await writeTemplateFile(
      join(starterDir, 'antora-playbook.versioned.yml'),
      join(docsDir, 'antora-playbook.yml'),
      values
    )
    await writeTemplateFile(
      join(starterDir, 'docs', 'release-version.versioned'),
      join(docsDir, 'docs', '.release-version'),
      values
    )

    for (const platform of ['.opencode', '.claude']) {
      await copyTemplate(
        join(agentSupportDir, platform, 'skills', 'docs-versioning.versioned'),
        join(target, platform, 'skills', 'docs-versioning'),
        values
      )
    }
  }

  console.log(`created ${relative(process.cwd(), docsDir) || 'docs'}`)
  console.log(`created ${relative(process.cwd(), workflowsDir)}`)
  console.log(`created ${relative(process.cwd(), join(target, 'AGENTS.md'))}`)
  console.log(`created ${relative(process.cwd(), join(target, '.opencode', 'skills'))}`)
  console.log(`created ${relative(process.cwd(), join(target, '.claude', 'skills'))}`)
  console.log('')
  console.log('next steps:')
  console.log('  cd docs')
  console.log('  npm install')
  console.log('  npm run build')

  console.log('')
  if (mode === 'versioned') {
    console.log('this site is on Versioned (Full History) versioning — main is the prerelease channel.')
    console.log(
      'run the pdocs-release workflow (.github/workflows/pdocs-release.yml) to cut your first vX.Y.Z release.'
    )
    console.log('see the docs-versioning skill (.opencode/skills, .claude/skills) for the full mechanism.')
  } else {
    console.log('this site is on Standalone (Stable + Prerelease) versioning — main is the prerelease channel.')
    console.log(
      'run the pdocs-release workflow (.github/workflows/pdocs-release.yml) to cut your first stable release.'
    )
  }
  console.log('see the documenting-your-repo skill (.opencode/skills, .claude/skills) to get started —')
  console.log('it plans what to document and pulls in docs-internals/writing-docs-pages as needed.')

  console.log('')
  console.log(
    "pdocs-release.yml also runs automatically on a PR merge carrying a 'docs/release' label — GitHub does not"
  )
  console.log(
    "create that label for you: run 'gh label create docs/release' in this repository, or use workflow_dispatch"
  )
  console.log(
    'instead until it exists. See docs/docs/modules/main/pages/getting-started.adoc\'s own "Create the docs/release label" section.'
  )

  return 0
}
