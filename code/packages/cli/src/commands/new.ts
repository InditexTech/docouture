'use strict'

import { execFileSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

import { parseArgs } from '../lib/args.js'
import { copyTemplate, exists, isEmptyOrMissing, writeTemplateFile } from '../lib/copy-template.js'

// Matches the rule an npm package name (and, not coincidentally, an Antora
// component name — both end up as URL segments) can safely be: this is
// stricter than npm's own rule, which also allows dots and a leading `@scope/`
// that makes no sense for a directory name here.
const NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

// The only two versioning shapes `pdocs new` can generate today — see the
// docs-site-package skill's reference/versioning-modes.md. Mode 1 (Full
// History / versioned tags) is documented there but still guidance-only, not
// wired into any template, so it has no third value here yet.
const MODES = ['standalone', 'versioned'] as const
type Mode = (typeof MODES)[number]

// Filenames pdocs-publish.yml / pdocs-release.yml / pdocs-pr-verify.yml are
// templated under (see templates/workflows/) — kept as a literal list here so
// the pre-flight conflict check below can name exactly which ones would be
// overwritten without having to read the template directory to find out.
const WORKFLOW_NAMES = ['pdocs-publish.yml', 'pdocs-release.yml', 'pdocs-pr-verify.yml']

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

interface WizardAnswers {
  name: string
  title: string
  mode: Mode
}

// Fills in only whatever `initial` didn't already supply — a flag or
// positional argument always wins over a prompt, so scripting one piece
// (say, --mode) while leaving the rest to the wizard works as expected.
async function promptWizard(
  io: NewIO,
  initial: { name?: string; title?: string; mode?: Mode }
): Promise<WizardAnswers> {
  const rl = createInterface({ input: io.input, output: io.output })
  try {
    let name = initial.name
    while (!name || !NAME_PATTERN.test(name)) {
      if (name) {
        io.output.write(
          `invalid name: '${name}' — expected lowercase letters, digits and hyphens, e.g. my-project-docs\n`
        )
      }
      name = (await rl.question('Site / component name: ')).trim()
    }

    let title = initial.title
    if (!title) {
      const defaultTitle = titleCase(name)
      const answer = (await rl.question(`Site title [${defaultTitle}]: `)).trim()
      title = answer.length > 0 ? answer : defaultTitle
    }

    let mode = initial.mode
    if (!mode) {
      io.output.write('Versioning mode:\n')
      io.output.write('  1) Standalone / Unversioned (default)\n')
      io.output.write('  2) Versioned (Mode 2: Stable + Prerelease)\n')
      const answer = (await rl.question('Choice [1]: ')).trim()
      mode = answer === '2' ? 'versioned' : 'standalone'
    }

    return { name, title, mode }
  } finally {
    rl.close()
  }
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

  // build/commands/new.js -> build/templates/{starter,workflows} — see
  // scripts/copy-templates.mjs, which puts the templates/ directory here at
  // build time. Resolved from import.meta.url so this works regardless of
  // the directory pdocs is invoked from.
  const here = dirname(fileURLToPath(import.meta.url))
  const templatesRoot = join(here, '..', 'templates')
  const starterDir = join(templatesRoot, 'starter')
  const workflowsTemplateDir = join(templatesRoot, 'workflows')

  const values = { name, title }

  // The whole starter subtree — package.json, antora-playbook.yml, its own
  // nested docs/antora.yml — lands under <repo-root>/docs/ as one piece,
  // unchanged in shape. Only .github/workflows/ is peeled out to a second
  // copy at the true repo root, since GitHub Actions never discovers
  // workflows anywhere else.
  await copyTemplate(starterDir, docsDir, values)
  await copyTemplate(workflowsTemplateDir, workflowsDir, values)

  if (mode === 'versioned') {
    await writeTemplateFile(join(starterDir, 'docs', 'antora.mode2.yml'), join(docsDir, 'docs', 'antora.yml'), values)
    await writeTemplateFile(join(starterDir, 'antora-playbook.mode2.yml'), join(docsDir, 'antora-playbook.yml'), values)
  }

  console.log(`created ${relative(process.cwd(), docsDir) || 'docs'}`)
  console.log(`created ${relative(process.cwd(), workflowsDir)}`)
  console.log('')
  console.log('next steps:')
  console.log('  cd docs')
  console.log('  npm install')
  console.log('  npm run build')

  if (mode === 'versioned') {
    console.log('')
    console.log('this site is on Mode 2 (Stable + Prerelease) versioning — main is the prerelease channel.')
    console.log(
      'run the pdocs-release workflow (.github/workflows/pdocs-release.yml) to cut your first stable release.'
    )
    console.log("see the docs-site-package skill's reference/versioning-modes.md for the full mechanism.")
  }

  return 0
}
