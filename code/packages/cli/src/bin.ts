#!/usr/bin/env node
'use strict'

import { runNew } from './commands/new.js'
import { runVersion } from './commands/version.js'

const USAGE = `pdocs — tools for pdocs documentation sites

Usage:
  pdocs new <name> [--dir <path>] [--title <title>] [--mode standalone|versioned]
      Scaffold an Antora documentation site into docs/ (and its workflows into
      .github/workflows/) of an existing git repository. Must be run from
      that repository's root, or --dir must point at one. Prompts
      interactively for anything not given as a flag when run in a terminal
      (pass --yes to always use defaults instead).

  pdocs version <value> [--dir <path>] [--file <path>] [--prerelease | --stable]
      Set the version recorded in docs/antora.yml.
`

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2)

  switch (command) {
    case undefined:
    case '--help':
    case '-h':
    case 'help':
      console.log(USAGE)
      return command === undefined ? 1 : 0
    case 'new':
      return runNew(rest)
    case 'version':
      return runVersion(rest)
    default:
      console.error(`unknown command: '${command}'\n`)
      console.error(USAGE)
      return 1
  }
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.stack : String(err))
    process.exitCode = 1
  })
