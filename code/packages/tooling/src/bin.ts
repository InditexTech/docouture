#!/usr/bin/env node
'use strict'

import { runDoctor } from './commands/doctor.js'
import { runBump } from './commands/bump.js'
import { runChangelog } from './commands/changelog.js'
import { runRegistry } from './commands/registry.js'
import { runReleaseLocal } from './commands/release-local.js'
import { runTestPackage } from './commands/test-package.js'
import { setContext } from './lib/cli-context.js'
import { theme } from './lib/theme.js'
import { extractGlobalFlags } from './lib/global-flags.js'

// Internal-only CLI behind the justfile's non-trivial recipes (GH-140) —
// never published, no scaffolding/site concerns, no audience beyond
// contributors to this monorepo. Structured the same way as
// packages/cli/src/bin.ts (per-command dispatch table, global
// --json/--verbose/--no-color, per-command --help) so the two don't
// diverge in shape even though they solve different problems.
//
// Deliberately does NOT own the `_hdr` recipe banner: that renders before
// `pnpm install`/build has necessarily happened yet (see `just bootstrap`,
// which prints one before either) — a genuine zero-dependency requirement
// this package, needing its own build output on disk, structurally can't
// meet. `_hdr` stays inline bash in the justfile for that reason.

interface CommandInfo {
  usageLine: string
  summary: string
  help: string
}

const COMMAND_ORDER = ['doctor', 'bump', 'changelog', 'registry', 'release-local', 'test-package'] as const

const COMMAND_INFO: Record<(typeof COMMAND_ORDER)[number], CommandInfo> = {
  doctor: {
    usageLine: 'doctor',
    summary: 'Check that this workspace is in a state where builds will succeed',
    help: `Usage:
  docouture-tooling doctor [--json]

Checks toolchain versions against .tool-versions, that dependencies are
installed, that the default npm registry is pinned, and that the
repository has at least one commit.

Options:
  --json  Print a machine-readable report to stdout instead
`,
  },
  bump: {
    usageLine: 'bump <level>',
    summary: 'Set the version of every package',
    help: `Usage:
  docouture-tooling bump <level>

<level> is one of major, minor, patch, premajor, preminor, prepatch,
prerelease, or an explicit X.Y.Z. The workspace root is bumped first;
every other package is then set to the exact resulting version.
`,
  },
  changelog: {
    usageLine: 'changelog',
    summary: 'Show the not-yet-released entries in CHANGELOG.md',
    help: `Usage:
  docouture-tooling changelog
`,
  },
  registry: {
    usageLine: 'registry <start>',
    summary: 'Manage the local Verdaccio registry used by release-local',
    help: `Usage:
  docouture-tooling registry start

Starts an ephemeral local npm registry (Verdaccio) on :4873, foreground,
until Ctrl-C, then removes its storage directory.
`,
  },
  'release-local': {
    usageLine: 'release-local',
    summary: 'Snapshot-publish every publishable package to the local registry',
    help: `Usage:
  docouture-tooling release-local

Snapshot-versions, builds and publishes every non-private packages/*
package to whatever is listening on :4873 (see 'registry start'), then
reverts the version bump. Requires no uncommitted changes to any
publishable package's package.json.
`,
  },
  'test-package': {
    usageLine: 'test-package <names>',
    summary: 'Run tests for one or more packages',
    help: `Usage:
  docouture-tooling test-package <name>[,<name>...] [-- <nx args>]

<names> is a comma-separated list of short package names (e.g. 'cli' or
'cli,ui-bundle'), expanded to '@inditextech/docouture-<name>'.
`,
  },
}

const CLI_SUMMARY = "Internal CLI behind this repo's own justfile recipes"

const COMMAND_COLUMN_WIDTH = 24

const USAGE = `Usage: docouture-tooling <command> [options]

Commands:
${COMMAND_ORDER.map((cmd) => {
  const info = COMMAND_INFO[cmd]
  return `  ${info.usageLine}`.padEnd(COMMAND_COLUMN_WIDTH) + info.summary
}).join('\n')}

Global options:
  -h, --help     Show help (pass after a command for command-specific help)
  --json         Machine-readable output where supported (currently: doctor)
  --no-color     Disable coloured output regardless of TTY detection

Run 'docouture-tooling <command> --help' for command-specific usage and options.
`

type Runner = (argv: string[]) => Promise<number>

const RUNNERS: Record<string, Runner> = {
  doctor: runDoctor,
  bump: runBump,
  changelog: runChangelog,
  registry: runRegistry,
  'release-local': runReleaseLocal,
  'test-package': runTestPackage,
}

async function main(): Promise<number> {
  const { json, verbose, noColor, rest: argv } = extractGlobalFlags(process.argv.slice(2))
  setContext({ json, verbose, noColor })

  const [command, ...rest] = argv

  if (command === undefined || command === '--help' || command === '-h' || command === 'help') {
    console.log(theme.bold(`docouture-tooling — ${CLI_SUMMARY}`))
    console.log('')
    console.log(USAGE)
    return 0
  }

  if (command in COMMAND_INFO && (rest[0] === '--help' || rest[0] === '-h')) {
    const info = COMMAND_INFO[command as (typeof COMMAND_ORDER)[number]]
    console.log(theme.bold(`docouture-tooling ${command} — ${info.summary}`))
    console.log('')
    console.log(info.help)
    return 0
  }

  if (!(command in RUNNERS)) {
    console.error(`unknown command: '${command}'\n`)
    console.error(theme.bold(`docouture-tooling — ${CLI_SUMMARY}`))
    console.error('')
    console.error(USAGE)
    return 1
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
