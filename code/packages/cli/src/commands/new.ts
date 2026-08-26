'use strict'

import { input, select, confirm } from '@inquirer/prompts'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { theme } from '../lib/theme.js'
import { parseArgs } from '../lib/args.js'
import { readCliInfo } from '../lib/cli-info.js'
import { copyTemplate, exists, isEmptyOrMissing, renderTemplateFile, writeTemplateFile } from '../lib/copy-template.js'
import {
  detectPackageManager,
  packageManagerPlan,
  type PackageManager,
  type PackageManagerPlan,
} from '../lib/detect-package-manager.js'
import { findRepoRoot } from '../lib/repo-root.js'
import { AGENTS_MD_FILENAME, hasManagedSection, mergeAgentsMd } from '../lib/agents-md.js'

// Matches the rule an npm package name (and, not coincidentally, an Antora
// component name — both end up as URL segments) can safely be: this is
// stricter than npm's own rule, which also allows dots and a leading `@scope/`
// that makes no sense for a directory name here.
const NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

// The only two versioning shapes `docouture new` scaffolds — both real,
// releasable configurations handled by the templated docouture-release.yml — see
// the docs-site-package skill's reference/versioning-modes.md. 'standalone'
// (the default): `main` always builds as the prerelease/preview version, and
// a release just force-moves a rolling `stable` tag — no historical archive,
// appropriate for a product where only "now" and "what's next" matter.
// 'versioned': `main` builds as the prerelease version too — docs/antora.yml
// is identical to the standalone shape on main, for both modes — but every
// release is instead its own immutable `vX.Y.Z` git tag, kept forever —
// appropriate for a library/SDK whose consumers pin an old version. (A bare,
// unversioned checkout — no prerelease/stable split at all — is not offered
// here: it only ever comes up as an ad-hoc `docouture dev` preview before a mode
// is chosen, never as something worth releasing.)
const MODES = ['standalone', 'versioned'] as const
type Mode = (typeof MODES)[number]

const PACKAGE_MANAGERS = ['npm', 'pnpm'] as const

// Filenames docouture-publish.yml / docouture-publish-prerelease.yml /
// docouture-release.yml / docouture-release-preview.yml / docouture-pr-verify.yml /
// docouture-kroki-cache-warm.yml are templated under (see templates/workflows/)
// — kept as a literal list here so the pre-flight conflict check below can
// name exactly which ones would be overwritten without having to read the
// template directory to find out.
const WORKFLOW_NAMES = [
  'docouture-publish.yml',
  'docouture-publish-prerelease.yml',
  'docouture-release.yml',
  'docouture-release-preview.yml',
  'docouture-pr-verify.yml',
  'docouture-kroki-cache-warm.yml',
]

// Repo-root-relative paths `templates/agent-support/` lands under (see
// new.ts's own copyTemplate call below) — kept as a literal list, same
// reasoning as WORKFLOW_NAMES above, so the pre-flight conflict check can
// name exactly what would be overwritten. `docs-versioning` is deliberately
// absent here: it is scaffolded only under `--mode versioned` (see the
// `.versioned`-marker copy further down), so an existing standalone-mode
// site with no such directory yet is never blocked by this check on it.
const AGENT_SUPPORT_PATHS = [
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

// origin's remote URL as git reports it, or undefined if there isn't one
// configured yet (a fresh `git init` with no remote added) — the shared
// starting point for both repoWebUrl and githubPagesUrl below, so there's
// only one execFileSync call to fail/mock, not two.
function originRemoteUrl(dir: string): string | undefined {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return undefined
  }
}

// The web (https) form of this repo's `origin` remote, or undefined if
// there isn't one configured yet. Baked into the scaffolded package.json's
// `docouture.checkLinks.ignore` (see TemplateValues.repoIgnoreGlob, and
// scripts/check-links.mjs's own comment on that key) so the repo-link.hbs
// header/nav link — which 404s to an anonymous crawler whenever this repo
// is private, indistinguishable from one that doesn't exist — doesn't fail
// docouture-pr-verify.yml/docouture-release.yml out of the box. Converts an SSH
// remote (`git@host:owner/repo.git`) to its https equivalent the same way
// an https remote is just stripped of its trailing `.git`; anything else
// unparseable is treated the same as "no remote yet".
function repoWebUrl(dir: string): string | undefined {
  const remote = originRemoteUrl(dir)
  if (remote === undefined) return undefined
  const ssh = /^git@([^:]+):(.+?)(\.git)?$/.exec(remote)
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`
  if (/^https?:\/\//.test(remote)) return remote.replace(/\.git$/, '')
  return undefined
}

// The GitHub Pages project-site URL 'docouture publish gh-pages' will produce
// once published — GitHub's own convention is
// https://<owner>.github.io/<repo>/, derived here from origin's remote
// rather than asked for, so printNextSteps can tell a first-time user what
// to expect before they've published anything. Only predictable when
// origin is actually hosted on github.com (not an enterprise host, and not
// "no remote configured yet"), same restriction repoWebUrl operates under.
// The owner is lower-cased: GitHub Pages hostnames are always served
// lower-case (hostnames are case-insensitive, and GitHub canonicalizes to
// lower-case) regardless of the org/user's actual display case — e.g.
// 'InditexTech' the GitHub org still serves from inditextech.github.io.
// The repo path segment is left exactly as the remote spells it, since
// that part of the URL is case-sensitive and this is already the
// spelling the remote itself uses.
function githubPagesUrl(dir: string): string | undefined {
  const remote = originRemoteUrl(dir)
  if (remote === undefined) return undefined
  const ssh = /^git@github\.com:([^/]+)\/(.+?)(\.git)?$/.exec(remote)
  if (ssh) return `https://${ssh[1]!.toLowerCase()}.github.io/${ssh[2]}/`
  const https = /^https:\/\/github\.com\/([^/]+)\/(.+?)(\.git)?$/.exec(remote)
  if (https) return `https://${https[1]!.toLowerCase()}.github.io/${https[2]}/`
  return undefined
}

// TemplateValues.repoIgnoreGlob is always present as its own array element
// in the scaffolded package.json (see copy-template.ts's own comment on why
// that array can't ever shrink an element away) — when there's no `origin`
// remote yet to derive a real glob from, this sentinel fills the same slot
// instead of an empty string. It has no `*`/`?`, so globToRegExp
// (check-links.mjs) compiles it to a literal-substring match that will
// never occur inside a real URL, rather than an empty pattern (which would
// match — and silently ignore — every single link).
const NO_REPO_REMOTE_GLOB = 'docouture-new:no-origin-remote-configured'

function repoIgnoreGlob(dir: string): string {
  const url = repoWebUrl(dir)
  return url !== undefined ? `${url}*` : NO_REPO_REMOTE_GLOB
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
  urlSegment: boolean
  mode: Mode
  pm: PackageManager
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
  initial: { name?: string; title?: string; urlSegment?: boolean; mode?: Mode; pm?: PackageManager },
  defaults: { pm: PackageManager }
): Promise<WizardAnswers> {
  const context = { input: io.input, output: keepOutputOpen(io.output) }

  // Each message ends with its own '\n' — @inquirer/prompts joins
  // [prefix, message, ...] with plain spaces, and a message that itself
  // ends in a newline pushes the typed/selected answer onto its own line
  // below the question instead of trailing it inline (confirmed against
  // @inquirer/input's and @inquirer/select's own render functions, which
  // both just re-join on every keystroke — a literal '\n' inside the
  // message survives that untouched).
  const name = (
    await input(
      {
        message:
          'Site slug (lowercase, hyphenated — names package.json and, unless opted in below, the Antora component too):\n',
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
        message: 'Site title (shown in the page title and the nav header):\n',
        default: initial.title ?? defaultTitle,
      },
      context
    )
  ).trim()

  // Off by default: GitHub Pages project sites already publish under
  // https://<org>.github.io/<repo>/, and Antora adds a second /<name>/
  // segment per documentation component on top of that — most repos
  // scaffold exactly one site/component, so that second segment is pure
  // depth most users don't want. Answering yes here keeps the historical
  // behaviour (docs/antora.yml's `name` is the site name, a real URL
  // segment); answering no (the default) sets it to Antora's reserved
  // `ROOT` component name instead, which Antora special-cases to
  // contribute no segment at all — see the docs-site-package skill's
  // reference/playbook.md for the mechanism. Either way the site title
  // (already asked above) is unaffected — it's a separate, always-present
  // value.
  const urlSegment =
    initial.urlSegment ??
    (await confirm(
      {
        message:
          'Add the site name as an extra URL path segment when published?\n' +
          'GitHub Pages project sites already publish under https://<org>.github.io/<repo>/ — ' +
          'Antora would add a further /<name>/ segment per documentation component on top of ' +
          'that. Off by default; turn it on only if this site will host more than one component later.\n',
        default: false,
      },
      context
    ))

  const mode =
    initial.mode ??
    (await select<Mode>(
      {
        message: 'Versioning mode:\n',
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

  const pm =
    initial.pm ??
    (await select<PackageManager>(
      {
        message: 'Package manager:\n',
        default: defaults.pm,
        choices: [
          { name: 'npm', value: 'npm' },
          { name: 'pnpm', value: 'pnpm' },
        ],
      },
      context
    ))

  return { name, title: title.length > 0 ? title : defaultTitle, urlSegment, mode, pm }
}

export async function runNew(argv: string[], io: NewIO = defaultIO()): Promise<number> {
  const { positional, flags } = parseArgs(argv)

  let name = positional[0]
  let title = typeof flags.title === 'string' ? flags.title : undefined
  // Boolean-only flag (no --no-url-segment counterpart): the default is
  // already "off", so the only thing worth scripting is turning it on.
  let urlSegment: boolean | undefined = flags['url-segment'] === true ? true : undefined
  let mode: Mode | undefined
  let pmChoice: PackageManager | undefined

  if (typeof flags.mode === 'string') {
    if (!(MODES as readonly string[]).includes(flags.mode)) {
      console.error(`invalid --mode: '${flags.mode}' — expected 'standalone' or 'versioned'`)
      return 1
    }
    mode = flags.mode as Mode
  }

  if (typeof flags.pm === 'string') {
    if (!(PACKAGE_MANAGERS as readonly string[]).includes(flags.pm)) {
      console.error(`invalid --pm: '${flags.pm}' — expected 'npm' or 'pnpm'`)
      return 1
    }
    pmChoice = flags.pm as PackageManager
  }

  // Best-effort guess for the wizard's own default (an existing
  // packageManager field/lockfile at --dir/cwd, or how docouture itself was
  // invoked) — see lib/detect-package-manager.ts. Computed against
  // --dir/cwd directly rather than the eventual repo root (not resolved
  // until after the wizard runs, see below): a reasonable guess either way,
  // and the user can always override it in the prompt or with --pm.
  const pmGuess = detectPackageManager(typeof flags.dir === 'string' ? resolve(flags.dir) : resolve(process.cwd()))

  // Wizard runs only in an interactive terminal, and only when not
  // explicitly skipped with --yes — a script or CI pipe (io.isTTY false)
  // gets exactly today's non-interactive behaviour, defaults and all.
  const skipWizard = flags.yes === true || !io.isTTY

  if (!skipWizard) {
    const answers = await promptWizard(io, { name, title, urlSegment, mode, pm: pmChoice }, { pm: pmGuess })
    name = answers.name
    title = answers.title
    urlSegment = answers.urlSegment
    mode = answers.mode
    pmChoice = answers.pm
    io.output.write('\n')
  }

  mode = mode ?? 'standalone'
  pmChoice = pmChoice ?? pmGuess
  urlSegment = urlSegment ?? false

  if (!name) {
    console.error(
      'usage: docouture new <name> [--dir <path>] [--title <title>] [--url-segment] [--mode standalone|versioned] [--pm npm|pnpm]'
    )
    return 1
  }

  if (!NAME_PATTERN.test(name)) {
    console.error(`invalid name: '${name}'`)
    console.error('expected lowercase letters, digits and hyphens, e.g. my-project-docs')
    return 1
  }

  title = title ?? titleCase(name)

  // The target is always an EXISTING repository's root, not a fresh
  // directory `docouture new` creates. --dir/cwd can be anywhere inside that
  // repository — findRepoRoot walks up to the actual top-level, same as
  // every other command that operates on a whole repo (dev/build/doctor/
  // eject/teardown/publish) — rather than requiring --dir/cwd to already
  // be the root itself.
  const startDir = typeof flags.dir === 'string' ? resolve(flags.dir) : resolve(process.cwd())

  if (!isInsideGitWorkTree(startDir)) {
    console.error(`'${startDir}' is not inside a git repository`)
    console.error(
      'docouture new scaffolds into an existing repository — run it from your repo root (after git init), or pass --dir <path> to one'
    )
    return 1
  }

  const target = await findRepoRoot(startDir)

  const docsDir = join(target, 'docs')
  const workflowsDir = join(target, '.github', 'workflows')
  const agentsMdFile = join(target, AGENTS_MD_FILENAME)

  if ((await exists(docsDir)) && !(await isEmptyOrMissing(docsDir))) {
    console.error(`'${docsDir}' already exists and is not empty`)
    return 1
  }

  const existingWorkflows: string[] = []
  for (const workflowName of WORKFLOW_NAMES) {
    if (await exists(join(workflowsDir, workflowName))) {
      existingWorkflows.push(join('.github', 'workflows', workflowName))
    }
  }

  const existingSkills: string[] = []
  for (const relativePath of AGENT_SUPPORT_PATHS) {
    const absolutePath = join(target, relativePath)
    if ((await exists(absolutePath)) && !(await isEmptyOrMissing(absolutePath))) existingSkills.push(relativePath)
  }

  // AGENTS.md is never an all-or-nothing conflict the way a workflow file or
  // a skill directory is: a foreign/human-written file (no docouture-managed
  // block yet — see lib/agents-md.ts) is always safe to append docouture' own
  // section to without asking. Only a file that already HAS a managed
  // block counts as something this run would actually overwrite.
  let existingAgentsMd: string | undefined
  let agentsMdConflict = false
  if (await exists(agentsMdFile)) {
    existingAgentsMd = await readFile(agentsMdFile, 'utf8')
    agentsMdConflict = hasManagedSection(existingAgentsMd)
  }

  const conflicts = [...existingWorkflows, ...existingSkills, ...(agentsMdConflict ? [AGENTS_MD_FILENAME] : [])]

  if (conflicts.length > 0) {
    if (skipWizard) {
      // Non-interactive (--yes, or no TTY) — nobody to confirm with, so this
      // stays a hard refusal, same as every other pre-flight check above,
      // rather than silently overwriting something already there.
      console.error(`refusing to overwrite existing file(s)/dir(s) under '${target}':`)
      console.error(`  ${conflicts.join(', ')}`)
      console.error("run 'docouture upgrade' instead if you want to re-sync them")
      return 1
    }

    console.log(theme.bold('Already exist and would be overwritten:'))
    for (const path of conflicts) console.log(`  ${path}`)
    console.log('')
    const proceed = await confirm(
      { message: 'Overwrite them?', default: false },
      { input: io.input, output: keepOutputOpen(io.output) }
    )
    if (!proceed) {
      console.log('aborted — nothing written')
      return 1
    }
    io.output.write('\n')
  }

  // build/commands/new.js -> build/templates/{starter,workflows,agent-support}
  // — see scripts/copy-templates.mjs, which puts the templates/ directory
  // here at build time. Resolved from import.meta.url so this works
  // regardless of the directory docouture is invoked from.
  const here = dirname(fileURLToPath(import.meta.url))
  const templatesRoot = join(here, '..', 'templates')
  const starterDir = join(templatesRoot, 'starter')
  const workflowsTemplateDir = join(templatesRoot, 'workflows')
  const agentSupportDir = join(templatesRoot, 'agent-support')

  // build/commands/new.js -> build/ -> package root, 2 levels up — see
  // readCliInfo's own comment. This is the exact version a scaffolded
  // site's devDependency on @inditextech/docouture-cli gets pinned to below, so
  // it always matches whatever CLI actually generated it, snapshot/local
  // releases included.
  const { version: cliVersion } = await readCliInfo(import.meta.url, 2)

  // The user's own choice (--pm, wizard answer, or the auto-guess computed
  // above if neither was given) — never re-detected against `target`, so
  // whatever was actually chosen/confirmed is what the workflows and
  // printed next-steps agree on.
  const pm = packageManagerPlan(pmChoice)

  const values = {
    name,
    title,
    // Antora's own component `name` — deliberately a separate value from
    // the site name above once `urlSegment` is false (the default):
    // `ROOT` is Antora's reserved component name, special-cased to
    // contribute no segment to a page's published URL at all (see
    // how-antora-builds-urls's "Component segment" section) — which is
    // exactly what dropping the extra GitHub Pages path segment requires.
    // package.json's own `name` stays `name` above either way; `docouture
    // doctor`'s checkNamesAgree knows to skip the package-name-matches-
    // component-name check when this is the literal 'ROOT'.
    componentName: urlSegment ? name : 'ROOT',
    cliVersion,
    pmName: pm.pm,
    pmCacheName: pm.cacheName,
    pmLockfile: pm.lockfile,
    pmCiCmd: pm.ciCmd,
    pmSetupStepYaml: pm.setupStepYaml,
    repoIgnoreGlob: repoIgnoreGlob(target),
  }

  // The whole starter subtree — package.json, antora-playbook.yml, its own
  // nested src/antora.yml — lands under <repo-root>/docs/ as one piece,
  // unchanged in shape. Only .github/workflows/ is peeled out to a second
  // copy at the true repo root, since GitHub Actions never discovers
  // workflows anywhere else.
  await copyTemplate(starterDir, docsDir, values)
  await copyTemplate(workflowsTemplateDir, workflowsDir, values)

  // AGENTS.md and both platforms' skill directories also land at the true
  // repo root, same as workflows — an agent reads them from there, not from
  // inside docs/. copyTemplate's own VERSIONED_MARKER/SKIP_FILENAMES skips
  // (see copy-template.ts) leave docs-versioning.versioned and AGENTS.md
  // untouched here; docs-versioning is copied under its real name below,
  // only in versioned mode, and AGENTS.md is merged separately next — see
  // lib/agents-md.ts for why it can't go through the generic overwrite walk
  // every other file here does.
  await copyTemplate(agentSupportDir, target, values)

  const renderedAgentsMd = await renderTemplateFile(join(agentSupportDir, AGENTS_MD_FILENAME), values)
  await writeFile(agentsMdFile, mergeAgentsMd(existingAgentsMd, renderedAgentsMd), 'utf8')

  if (mode === 'versioned') {
    await writeTemplateFile(
      join(starterDir, 'antora-playbook.versioned.yml'),
      join(docsDir, 'antora-playbook.yml'),
      values
    )
    await writeTemplateFile(
      join(starterDir, 'src', 'release-version.versioned'),
      join(docsDir, '.release-version'),
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

  printNextSteps({ mode, pm, target, docsDir, workflowsDir, ghPagesUrl: githubPagesUrl(target) })

  return 0
}

// Everything printed after scaffolding finishes, grouped into labeled
// sections so it reads as a short runbook rather than a flat log of
// "created X" lines. Headers use the shared theme's bold, matching bin.ts's
// own banner — see lib/theme.ts for why that's not picocolors directly.
function printNextSteps(args: {
  mode: Mode
  pm: PackageManagerPlan
  target: string
  docsDir: string
  workflowsDir: string
  ghPagesUrl: string | undefined
}): void {
  const { mode, pm, target, docsDir, workflowsDir, ghPagesUrl } = args
  const created = (path: string): string => `  ${theme.success('✓')} ${path}`

  // Relative to `target` (the repo root), not process.cwd() — cwd may be a
  // nested subdirectory findRepoRoot walked up from (see runNew), in which
  // case relative(cwd, ...) produces a useless, alarming-looking chain of
  // '../../..' for paths that are actually just 'docs', '.github/workflows'
  // etc. at the repo root.
  const writtenAt = (path: string): string => relative(target, path) || '.'

  // 'Written' rather than 'Created': a conflict confirmed above (see
  // runNew) means some of these were overwritten or merged into, not
  // created fresh — this header stays accurate either way.
  console.log(theme.bold('Written:'))
  console.log(created(writtenAt(docsDir)))
  console.log(created(writtenAt(workflowsDir)))
  console.log(created(writtenAt(join(target, 'AGENTS.md'))))
  console.log(created(writtenAt(join(target, '.opencode', 'skills'))))
  console.log(created(writtenAt(join(target, '.claude', 'skills'))))

  console.log('')
  console.log(theme.bold('Next steps:'))
  console.log('  cd docs')
  console.log(`  ${pm.installCmd}`)
  console.log(`  ${pm.devCmd}`)

  console.log('')
  if (mode === 'versioned') {
    console.log(theme.bold('Versioning: Versioned (Full History)'))
    console.log('  main is the prerelease channel.')
    console.log('')
    console.log('  To cut your first release:')
    console.log("    1. Create the 'docs/release' label (once): gh label create docs/release")
    console.log('    2. Open a PR that sets the target version in docs/.release-version (e.g. "1.0.0")')
    console.log("    3. Label the PR 'docs/release'")
    console.log('    4. Merge it — docouture-release.yml runs automatically and tags vX.Y.Z')
    console.log('')
    console.log('  (or skip the label/PR entirely: run docouture-release.yml manually via workflow_dispatch')
    console.log('  and type the version)')
    console.log('')
    console.log('  See the docs-versioning skill (.opencode/skills, .claude/skills) for the full mechanism.')
  } else {
    console.log(theme.bold('Versioning: Standalone (Stable + Prerelease)'))
    console.log('  main is the prerelease channel.')
    console.log('')
    console.log('  To cut your first stable release:')
    console.log("    1. Create the 'docs/release' label (once): gh label create docs/release")
    console.log("    2. Merge any PR labeled 'docs/release' into main — docouture-release.yml runs automatically")
    console.log('')
    console.log('  (or skip the label/PR entirely: run docouture-release.yml manually via workflow_dispatch,')
    console.log('  default input is fine)')
  }

  console.log('')
  console.log(theme.bold('Before your first publish:'))
  console.log('  See docs/src/modules/main/pages/prerequisites.adoc for what a public GitHub Pages site')
  console.log('  needs before its first publish.')
  if (ghPagesUrl !== undefined) {
    console.log('')
    console.log('  Once you cut your first release, the site publishes automatically to the')
    console.log(`  \`gh-pages\` branch — once public, it will be live at ${ghPagesUrl}`)
  }
}
