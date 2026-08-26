#!/usr/bin/env node
'use strict'

import { runNew } from './commands/new.js'
import { runVersion } from './commands/version.js'
import { runDev } from './commands/dev.js'
import { runBuild } from './commands/build.js'
import { runDoctor } from './commands/doctor.js'
import { runPublish } from './commands/publish.js'
import { runUpgrade } from './commands/upgrade.js'
import { runEject } from './commands/eject.js'
import { runTeardown } from './commands/teardown.js'
import { runCompletion } from './commands/completion.js'
import { readCliInfo } from './lib/cli-info.js'
import { setContext } from './lib/cli-context.js'
import { theme } from './lib/theme.js'
import { extractGlobalFlags } from './lib/global-flags.js'

const COMMAND_HELP: Record<string, string> = {
  new: `Usage:
  pdocs new <name> [--dir <path>] [--title <title>] [--mode standalone|versioned] [--yes]

Scaffold an Antora documentation site into docs/ (and its workflows into
.github/workflows/), plus AGENTS.md and agent skills (.opencode/skills/,
.claude/skills/) into the root of an existing git repository. Must be
run from that repository's root, or --dir must point at one. Prompts
interactively for anything not given as a flag when run in a terminal
(pass --yes to always use defaults instead).

Options:
  --dir <path>     Repository root to scaffold into (default: cwd)
  --title <title>  Site title (default: title-cased from <name>)
  --mode <mode>    'standalone' (default) or 'versioned'
  --yes            Skip the interactive wizard, use defaults for anything unset
`,
  version: `Usage:
  pdocs version <value> [--dir <path>] [--file <path>] [--prerelease | --stable]

Set the version recorded in docs/antora.yml.

Options:
  --dir <path>   Component root (parent of src/) — default: cwd
  --file <path>  antora.yml path directly, overrides --dir
  --prerelease   Mark this version as a prerelease
  --stable       Mark this version as stable (mutually exclusive with --prerelease)
`,
  dev: `Usage:
  pdocs dev [--port <port>] [--dir <path>]

Build the site and serve it with live reload, rebuilding on every
change to docs/ or antora-playbook.yml. --dir is the repository root
(the parent of docs/), same as new/version — not the site directory.

Options:
  --port <port>  Port to listen on (default: 5000)
  --dir <path>   Repository root (default: cwd, or its enclosing repo)
`,
  build: `Usage:
  pdocs build [--dir <path>]

Build the site once: a thin wrapper around the site's own 'npm run
build' (antora --fetch antora-playbook.yml).

Options:
  --dir <path>  Repository root (default: cwd, or its enclosing repo)
`,
  publish: `Usage:
  pdocs publish <target> [--dir <path>] [--<option> <value> ...]

Publish the already-built site (output.dir in antora-playbook.yml,
default build/site — run 'pdocs build' first) using the
'@inditextech/pdocs-publish-<target>' driver, e.g. 'gh-pages'. That
package must be a devDependency of the site itself. Options come
from docs/package.json's own "pdocs".publish.<target> object,
overridden by any --flags given here.

Options:
  --dir <path>          Repository root (default: cwd, or its enclosing repo)
  --<option> <value>    Forwarded to the publish driver as one of its own options
  --user-name/--user-email  Combined into a nested {user:{name,email}} option

Example:
  pdocs publish gh-pages --branch gh-pages
`,
  doctor: `Usage:
  pdocs doctor [--dir <path>] [--json]

Check that the environment and site configuration are healthy: Node
version, the four names that must agree (component name, start page,
content path, package name), git history, that antora is installed,
and (advisory only) whether AGENTS.md and the scaffolded skills are
still present.

Options:
  --dir <path>  Repository root (default: cwd, or its enclosing repo)
  --json        Print a machine-readable report to stdout instead
`,
  upgrade: `Usage:
  pdocs upgrade [--dir <path>] [--title <title>] [--dry-run]

Re-sync an already-scaffolded repository's .github/workflows/ and
agent support files (AGENTS.md, .opencode/skills/, .claude/skills/)
from the CLI's current templates, overwriting whatever is there —
unlike 'new', this never refuses on an existing file. Does not touch
docs/. --dry-run lists what would be written without changing
anything.

Options:
  --dir <path>   Repository root (default: cwd)
  --title <title>  Override the title read back from docs/antora.yml
  --dry-run      List what would be written without changing anything
`,
  eject: `Usage:
  pdocs eject <target> [--dir <path>]

Copy a bundled default file out into docs/ for local customization.
'kroki': docs/kroki-compose.yml, the docker compose definition
@inditextech/pdocs-antora-extensions' kroki-prewarm.js starts
automatically when a build needs Kroki (kroki-enabled: true) and finds
nothing already running — auto-detected and preferred over the
bundled default once it exists. Refuses to overwrite an existing file.

Options:
  --dir <path>  Repository root (default: cwd, or its enclosing repo)
`,
  teardown: `Usage:
  pdocs teardown <target> [--dir <path>]

Stop a service pdocs started for you. 'kroki': runs 'docker compose
down' against whichever kroki-compose.yml is actually in effect (an
ejected docs/kroki-compose.yml if you have one, else the bundled
default) — the manual counterpart to kroki-prewarm.js's own auto-start,
which never stops it itself.

Options:
  --dir <path>  Repository root (default: cwd, or its enclosing repo)
`,
  completion: `Usage:
  pdocs completion <bash|zsh>

Print a shell completion script for pdocs to stdout.

Examples:
  eval "$(pdocs completion bash)"
  pdocs completion zsh > "\${fpath[1]}/_pdocs"
`,
}

const USAGE = `Usage: pdocs <command> [options]

Commands:
  new <name>          Scaffold a new documentation site
  version <value>     Set the version recorded in docs/antora.yml
  dev                 Build and serve the site with live reload
  build               Build the site once
  publish <target>    Publish the already-built site
  doctor              Check environment and site health
  upgrade             Re-sync workflows and agent support files
  eject <target>      Copy a bundled default file out for customization
  teardown <target>   Stop a service pdocs started for you
  completion <shell>  Print a shell completion script (bash|zsh)

Global options:
  -h, --help     Show help (pass after a command for command-specific help)
  -v, --version  Print the installed @inditextech/pdocs-cli version and exit
  --json         Machine-readable output where supported (currently: doctor)
  --verbose      Print extra diagnostic detail to stderr (same as DEBUG=pdocs)
  --no-color     Disable coloured output regardless of TTY detection

Run 'pdocs <command> --help' for command-specific usage and options.
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
  return `${theme.bold(theme.info(name))} ${theme.dim(`v${version}`)}`
}

// Recognises the three global flags anywhere in argv (before or after the
// command name — `pdocs --verbose dev` and `pdocs dev --verbose` both
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
    console.log(USAGE)
    return 0
  }

  if (command in COMMAND_HELP && (rest[0] === '--help' || rest[0] === '-h')) {
    console.log(await banner())
    console.log('')
    console.log(COMMAND_HELP[command])
    return 0
  }

  if (!(command in RUNNERS)) {
    console.error(`unknown command: '${command}'\n`)
    console.error(await banner())
    console.error('')
    console.error(USAGE)
    return 1
  }

  // Printed once per invocation, to stderr — so it never lands in piped or
  // parsed stdout — right before the command actually runs, rather than
  // only on --version/--help/error paths as before. Suppressed under
  // --json (stdout is promised clean there; a stray stderr banner is still
  // needless noise for a script capturing combined output) and for
  // completion (see QUIET_COMMANDS' own comment).
  if (!json && !QUIET_COMMANDS.has(command)) {
    console.error(await banner())
  }

  return RUNNERS[command]!(rest)
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.stack : String(err))
    process.exitCode = 1
  })
