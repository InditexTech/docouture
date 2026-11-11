#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { runNew } from './commands/new.js'
import { runRelease } from './commands/release.js'
import { runVersion } from './commands/version.js'
import { runVersionSource } from './commands/version-source.js'
import { runDev } from './commands/dev.js'
import { runBuild } from './commands/build.js'
import { runDoctor } from './commands/doctor.js'
import { runPublish } from './commands/publish.js'
import { runUpgrade } from './commands/upgrade.js'
import { runBranchModel } from './commands/branch-model.js'
import { runEject } from './commands/eject.js'
import { runTeardown } from './commands/teardown.js'
import { runCompletion } from './commands/completion.js'
import { readCliInfo } from './lib/cli-info.js'
import { setContext } from './lib/cli-context.js'
import { theme } from './lib/theme.js'
import { extractGlobalFlags } from './lib/global-flags.js'

// Single source of truth per command: usageLine is the left column of the
// top-level command table (bare name, or with its positional arg spelled
// out, e.g. 'eject <target>'); summary is the one-line description shown
// both there and as the title of 'docouture <command> --help'; help is the
// full usage/options body for that per-command help screen.
interface CommandInfo {
  usageLine: string
  summary: string
  help: string
}

const COMMAND_ORDER = [
  'new',
  'version',
  'dev',
  'build',
  'publish',
  'doctor',
  'upgrade',
  'branch-model',
  'version-source',
  'release',
  'eject',
  'teardown',
  'completion',
] as const

const COMMAND_INFO: Record<(typeof COMMAND_ORDER)[number], CommandInfo> = {
  new: {
    usageLine: 'new <name>',
    summary: 'Scaffold a new documentation site',
    help: `Usage:
  docouture new <name> [--dir <path>] [--title <title>] [--site-url <url>]
    [--url-segment] [--mode standalone|versioned] [--flow trunk-based|git-flow] [--branch <name>] [--integration-branch <name>]
    [--release-branch <name>] [--pm npm|pnpm] [--yes]

Scaffold an Antora documentation site into docs/ (and its workflows into
.github/workflows/), plus AGENTS.md and agent skills (.opencode/skills/,
.claude/skills/) into the root of an existing git repository. --dir/cwd
can be anywhere inside that repository — the actual top-level is found
automatically. If any workflows, skills or a docouture-managed AGENTS.md
section already exist, prompts to overwrite them (refuses outright when
not running interactively). Prompts interactively for anything not given
as a flag when run in a terminal (pass --yes to always use defaults, and
to never prompt to overwrite, instead).

Options:
  --dir <path>     Repository root to scaffold into (default: cwd, or its enclosing repo)
  --title <title>  Site title (default: title-cased from <name>)
  --site-url <url> Public site URL, written as site.url (default: derived from a github.com
                   origin remote; skips the prompt)
  --url-segment    Name the Antora component after the site, adding an extra /<name>/ URL segment
                   (default: off, component is the reserved ROOT; GitHub Pages already adds the
                   repo name, so a named component would repeat it)
  --mode <mode>    'standalone' (default) or 'versioned'
  --flow <flow>    'trunk-based' (default) or 'git-flow' — see 'docouture branch-model --help'
  --branch <name>  Trunk-based only: the one branch (default: main)
  --integration-branch <name>  Git-flow only: the prerelease branch (default: develop)
  --release-branch <name>      Git-flow only: the release branch (default: main)
  --pm <pm>        'npm' or 'pnpm' (default: auto-detected from a lockfile/packageManager
                   field, or how docouture itself was invoked)
  --yes            Skip the interactive wizard, use defaults for anything unset
`,
  },
  version: {
    usageLine: 'version <value>',
    summary: 'Set the version recorded in docs/antora.yml',
    help: `Usage:
  docouture version <value> [--dir <path>] [--file <path>] [--prerelease | --stable]

Set the version recorded in docs/antora.yml.

Options:
  --dir <path>   Repository root (default: cwd, or its enclosing repo)
  --file <path>  antora.yml path directly, overrides --dir
  --prerelease   Mark this version as a prerelease
  --stable       Mark this version as stable (mutually exclusive with --prerelease)
`,
  },
  dev: {
    usageLine: 'dev',
    summary: 'Build and serve the site with live reload',
    help: `Usage:
  docouture dev [--port <port>] [--dir <path>]

Build the site and serve it with live reload, rebuilding on every
change to docs/ or antora-playbook.yml. --dir is the repository root
(the parent of docs/), same as new/version — not the site directory.

Options:
  --port <port>  Port to listen on (default: 5000, falls back to a random
                 free port if 5000 is busy — an explicit --port that's busy
                 is still a hard error)
  --dir <path>   Repository root (default: cwd, or its enclosing repo)
`,
  },
  build: {
    usageLine: 'build',
    summary: 'Build the site once',
    help: `Usage:
  docouture build [--dir <path>]

Build the site once: a thin wrapper around the site's own 'npm run
build' (antora --fetch antora-playbook.yml).

Options:
  --dir <path>  Repository root (default: cwd, or its enclosing repo)
`,
  },
  publish: {
    usageLine: 'publish <target>',
    summary: 'Publish the already-built site',
    help: `Usage:
  docouture publish <target> [--dir <path>] [--<option> <value> ...]

Publish the already-built site (output.dir in antora-playbook.yml,
default build/site — run 'docouture build' first) using the
'@inditextech/docouture-publish-<target>' driver, e.g. 'gh-pages'. That
package must be a devDependency of the site itself. Options come
from docs/package.json's own "docouture".publish.<target> object,
overridden by any --flags given here.

Options:
  --dir <path>          Repository root (default: cwd, or its enclosing repo)
  --<option> <value>    Forwarded to the publish driver as one of its own options
  --user-name/--user-email  Combined into a nested {user:{name,email}} option

Example:
  docouture publish gh-pages --branch gh-pages
`,
  },
  doctor: {
    usageLine: 'doctor',
    summary: 'Check environment and site health',
    help: `Usage:
  docouture doctor [--dir <path>] [--json]

Check that the environment and site configuration are healthy: Node
version, that the declared package manager (package.json's packageManager
field) is installed, the four names that must agree (component name, start
page, content path, package name), git history, that antora is installed,
and (advisory only) whether AGENTS.md and the scaffolded skills are
still present, whether the docs/release label exists, and whether the
declared branching model (docs/package.json's docouture.branching, and
docouture.prereleaseBranch under git-flow) agrees with what
antora-playbook.yml/docouture-release.yml actually say.

Options:
  --dir <path>  Repository root (default: cwd, or its enclosing repo)
  --json        Print a machine-readable report to stdout instead
`,
  },
  upgrade: {
    usageLine: 'upgrade',
    summary: 'Re-sync workflows and agent support files',
    help: `Usage:
  docouture upgrade [--dir <path>] [--title <title>] [--dry-run]

Re-sync an already-scaffolded repository's .github/workflows/ and
agent support files (AGENTS.md, .opencode/skills/, .claude/skills/)
from the CLI's current templates — --dir/cwd can be anywhere inside
that repository, the actual top-level is found automatically.
Workflows and skills are fully overwritten; AGENTS.md is merged
instead — only docouture' own managed section is replaced, anything a
human added around it survives. Does not touch docs/ content; the one
exception is a git-flow site's docs/package.json, where docouture.branching
and docouture.prereleaseBranch (read by docouture-release.yml to open the
prerelease sync PR) are written or corrected, derived from
antora-playbook.yml. It also sets runtime.log.failure_level to error in
docs/antora-playbook*.yml (replacing any other value, and reporting each
file it changed) so builds fail on a broken xref or missing include.
--dry-run lists what would be written without changing anything.

Options:
  --dir <path>   Repository root (default: cwd, or its enclosing repo)
  --title <title>  Override the title read back from docs/antora.yml
  --dry-run      List what would be written without changing anything
`,
  },
  'branch-model': {
    usageLine: 'branch-model <model>',
    summary: 'Switch between trunk-based and git-flow branching',
    help: `Usage:
  docouture branch-model <trunk-based|git-flow> [--branch <name>]
    [--integration-branch <name>] [--release-branch <name>] [--dir <path>] [--dry-run]

Switch an already-scaffolded repository between the trunk-based and
git-flow branching models — see docs/src/modules/main/pages/
guides-branching-model.adoc for the full mechanism. Direction is
inferred from the site's current branch names (read live from
antora-playbook.yml/docouture-release.yml, never from a stored config)
versus the <model> argument given here — the same command handles
both directions.

trunk-based -> git-flow: the current single branch becomes the release
branch by default (least disruption to anything already tagged off
it) — --integration-branch <name> (the new prerelease branch) is
required, since there is nothing on disk to infer that name from.

git-flow -> trunk-based: lossy — --branch <name> is required and must
match one of the two current branches exactly; a third, invented name
is refused.

Re-renders .github/workflows/ (same machinery 'docouture upgrade' uses)
and patches antora-playbook.yml's content.sources[0].branches and
docs/package.json's docouture.branching field (adding
docouture.prereleaseBranch for git-flow, removing it for trunk-based).
Does NOT rename actual
git branches, touch branch-protection/ruleset rules, or change GitHub's
configured default branch — these stay manual steps, printed as a
reminder after every real run.

Options:
  --branch <name>              Trunk-based target only
  --integration-branch <name>  Git-flow target only: the prerelease branch
  --release-branch <name>      Git-flow target only: the release branch
  --dir <path>                 Repository root (default: cwd, or its enclosing repo)
  --dry-run                    List what would be written without changing anything
`,
  },
  'version-source': {
    usageLine: 'version-source [source]',
    summary: 'Choose where the docs release version comes from',
    help: `Usage:
  docouture version-source [descriptor|github-release|tag-bump] [--prefix <p>]
    [--version <X.Y.Z>] [--dir <path>] [--dry-run]

Show or change where a versioned site's docs release version comes from
(docs/package.json's docouture.versionSource). With no argument it prints
the current source.

  descriptor      docs/.release-version, committed by the release PR (the
                  default). Creates the file, seeded with the next patch of
                  the latest docs/v* tag (or --version), if it is missing.
  github-release  the tag of the published GitHub Release (--prefix strips a
                  tag prefix such as docs-site@). Removes docs/.release-version.
  tag-bump        the latest docs/v* tag plus a bump chosen by the PR's
                  docs/release, docs/release-minor or docs/release-major
                  label. Removes docs/.release-version and prints the
                  'gh label create' commands for the two extra labels.

Refuses a standalone site (it always releases docs/stable). Removing
docs/.release-version warns when it held a pending version. Idempotent.
Workflows read the source at run time, so none are re-rendered — but they
run the project's installed CLI, so install a version with 'release resolve'
first.

Options:
  --prefix <p>     github-release only: strip this prefix from the release tag
  --version <v>    descriptor only: write this version to docs/.release-version
  --dir <path>     Repository root (default: cwd, or its enclosing repo)
  --dry-run        List what would change without changing anything
`,
  },
  release: {
    usageLine: 'release resolve',
    summary: 'Resolve the docs version a release targets',
    help: `Usage:
  docouture release resolve --mode <versioned|standalone> [--version <v>]
    [--event <name>] [--release-tag <tag>] [--labels <a,b>] [--tags <a,b>]
    [--report] [--dir <path>]

Resolve the docs version and tag a release run targets. Used by the
docouture-release and docouture-release-preview workflows. Where the
version comes from depends on docs/package.json's docouture.versionSource
(default 'descriptor'):

  descriptor      --version when given (the workflow_dispatch input), else
                  docs/.release-version
  github-release  the published release tag (--release-tag), minus
                  docouture.versionSourcePrefix when set; a docs/release
                  pull request fails
  tag-bump        the highest docs/v* tag plus a bump chosen by --labels:
                  docs/release patch, docs/release-minor minor,
                  docs/release-major major (highest wins); the first
                  release needs --version

--version always wins. Standalone sites always target 'stable'.

Prints key=value lines (version, tag, source, version_source,
uses_descriptor) to stdout, ready to append to $GITHUB_OUTPUT.
uses_descriptor is true only when the descriptor bump and prerelease sync
apply. A missing or non-SemVer version fails with exit 1. With --report
the failure is printed as error=<missing|invalid|reserved|prefix|
unsupported> and error_value=<value> instead, and the exit code stays 0.

Options:
  --mode <mode>       'versioned' or 'standalone' (required)
  --version <v>       Explicit version; takes precedence over every source
  --event <name>      GitHub event name (workflow_dispatch, pull_request, release)
  --release-tag <t>   Tag of the published GitHub Release (github-release)
  --labels <a,b>      Pull request labels, comma-separated (tag-bump)
  --tags <a,b>        Existing tag names instead of listing git tags (tag-bump)
  --report            Report a version error as output instead of failing
  --dir <path>        Repository root (default: cwd, or its enclosing repo)
`,
  },
  eject: {
    usageLine: 'eject <target>',
    summary: 'Copy a bundled default file out for customization',
    help: `Usage:
  docouture eject <target> [--dir <path>]

Copy a bundled default file out into docs/ for local customization.
'kroki': docs/kroki-compose.yml, the docker compose definition
@inditextech/docouture-antora-extensions' kroki-prewarm.js starts
automatically when a build needs Kroki (kroki-enabled: true) and finds
nothing already running — auto-detected and preferred over the
bundled default once it exists. Refuses to overwrite an existing file.

Options:
  --dir <path>  Repository root (default: cwd, or its enclosing repo)
`,
  },
  teardown: {
    usageLine: 'teardown <target>',
    summary: 'Stop a service docouture started for you',
    help: `Usage:
  docouture teardown <target> [--dir <path>]

Stop a service docouture started for you. 'kroki': runs 'docker compose
down' against whichever kroki-compose.yml is actually in effect (an
ejected docs/kroki-compose.yml if you have one, else the bundled
default) — the manual counterpart to kroki-prewarm.js's own auto-start,
which never stops it itself.

Options:
  --dir <path>  Repository root (default: cwd, or its enclosing repo)
`,
  },
  completion: {
    usageLine: 'completion <shell>',
    summary: 'Print a shell completion script (bash|zsh)',
    help: `Usage:
  docouture completion <bash|zsh>

Print a shell completion script for docouture to stdout.

Examples:
  eval "$(docouture completion bash)"
  docouture completion zsh > "\${fpath[1]}/_docouture"
`,
  },
}

// Top-level equivalent of each COMMAND_INFO entry's `summary` — printed as
// the title of the bare/--help screen, same 'docouture — <summary>' shape as
// 'docouture <command> --help' uses for a single command.
const CLI_SUMMARY = 'Scaffold, build, and publish Antora documentation sites'

// Left column width of the command table below, including the 2-space
// indent — wide enough for the longest usageLine ('version-source [source]').
const COMMAND_COLUMN_WIDTH = 28

const USAGE = `Usage: docouture <command> [options]

Commands:
${COMMAND_ORDER.map((cmd) => {
  const info = COMMAND_INFO[cmd]
  return `  ${info.usageLine}`.padEnd(COMMAND_COLUMN_WIDTH) + info.summary
}).join('\n')}

Global options:
  -h, --help     Show help (pass after a command for command-specific help)
  -v, --version  Print the installed @inditextech/docouture-cli version and exit
  --json         Machine-readable output where supported (currently: doctor)
  --verbose      Print extra diagnostic detail to stderr (same as DEBUG=docouture)
  --no-color     Disable coloured output regardless of TTY detection

Run 'docouture <command> --help' for command-specific usage and options.
`

type Runner = (argv: string[]) => Promise<number>

const RUNNERS: Record<string, Runner> = {
  new: runNew,
  version: runVersion,
  dev: runDev,
  build: runBuild,
  publish: runPublish,
  doctor: runDoctor,
  upgrade: runUpgrade,
  'branch-model': runBranchModel,
  'version-source': runVersionSource,
  release: runRelease,
  eject: runEject,
  teardown: runTeardown,
  completion: async (argv) => runCompletion(argv),
}

// completion's whole output must be shell-consumable on stdout (piped to a
// file, or `eval`'d directly on every shell startup if a user wires it into
// their rc file) — the banner is harmless there too, since it only ever
// goes to stderr, but printing it on every single new shell would still be
// needless noise for something meant to be sourced silently.
const QUIET_COMMANDS = new Set(['completion'])

// build/bin.js -> package root, 1 level up — see readCliInfo's own comment.
async function banner(): Promise<string> {
  const { name, version } = await readCliInfo(import.meta.url, 1)
  const versionLabel = `v${version}`
  return `${theme.bold(theme.info(name))} ${theme.dim(versionLabel)}`
}

// Recognises the three global flags anywhere in argv (before or after the
// command name — `docouture --verbose dev` and `docouture dev --verbose` both
// work), strips them out, and returns what's left for command dispatch —
// see lib/global-flags.ts.

async function main(): Promise<number> {
  const { json, verbose, noColor, rest: argv } = extractGlobalFlags(process.argv.slice(2))
  setContext({ json, verbose, noColor })

  const [command, ...rest] = argv

  if (command === '--version' || command === '-v') {
    console.log(await banner())
    return 0
  }

  // Bare invocation prints help and succeeds — mirrors git/npm's own
  // convention of treating "show me what you can do" as a legitimate,
  // successful outcome rather than an error, unlike a genuinely unknown
  // command below.
  if (command === undefined || command === '--help' || command === '-h' || command === 'help') {
    console.log(await banner())
    console.log('')
    console.log(theme.bold(`docouture — ${CLI_SUMMARY}`))
    console.log('')
    console.log(USAGE)
    return 0
  }

  if (command in COMMAND_INFO && (rest[0] === '--help' || rest[0] === '-h')) {
    const info = COMMAND_INFO[command as (typeof COMMAND_ORDER)[number]]
    console.log(await banner())
    console.log('')
    console.log(theme.bold(`docouture ${command} — ${info.summary}`))
    console.log('')
    console.log(info.help)
    return 0
  }

  if (!(command in RUNNERS)) {
    console.error(`unknown command: '${command}'\n`)
    console.error(await banner())
    console.error('')
    console.error(theme.bold(`docouture — ${CLI_SUMMARY}`))
    console.error('')
    console.error(USAGE)
    return 1
  }

  // Printed once per invocation, to stderr — so it never lands in piped or
  // parsed stdout — right before the command actually runs, rather than
  // only on --version/--help/error paths as before. Suppressed under
  // --json (stdout is promised clean there; a stray stderr banner is still
  // needless noise for a script capturing combined output) and for
  // completion (see QUIET_COMMANDS' own comment). The title line repeats
  // the same '<command> — <summary>' shown on --help, so a plain run gives
  // just as much "what is this" context as asking for help would — followed
  // by a blank line so the command's own output never runs straight on
  // from the banner/title.
  if (!json && !QUIET_COMMANDS.has(command)) {
    const info = COMMAND_INFO[command as (typeof COMMAND_ORDER)[number]]
    console.error(await banner())
    console.error('')
    console.error(theme.bold(`docouture ${command} — ${info.summary}`))
    console.error('')
  }

  return RUNNERS[command]!(rest)
}

try {
  process.exitCode = await main()
} catch (err) {
  console.error(err instanceof Error ? err.stack : String(err))
  process.exitCode = 1
}
