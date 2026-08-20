#!/usr/bin/env node
'use strict'

import pc from 'picocolors'

import { runNew } from './commands/new.js'
import { runVersion } from './commands/version.js'
import { runDev } from './commands/dev.js'
import { runBuild } from './commands/build.js'
import { runDoctor } from './commands/doctor.js'
import { readCliInfo } from './lib/cli-info.js'

const USAGE = `Usage:
  pdocs new <name> [--dir <path>] [--title <title>] [--mode standalone|versioned]
      Scaffold an Antora documentation site into docs/ (and its workflows into
      .github/workflows/) of an existing git repository. Must be run from
      that repository's root, or --dir must point at one. Prompts
      interactively for anything not given as a flag when run in a terminal
      (pass --yes to always use defaults instead).

  pdocs version <value> [--dir <path>] [--file <path>] [--prerelease | --stable]
      Set the version recorded in docs/antora.yml.

  pdocs dev [--port <port>] [--dir <path>]
      Build the site and serve it with live reload, rebuilding on every
      change to docs/ or antora-playbook.yml. --dir is the repository root
      (the parent of docs/), same as new/version — not the site directory.

  pdocs build [--dir <path>]
      Build the site once: a thin wrapper around the site's own 'npm run
      build' (antora --fetch antora-playbook.yml).

  pdocs doctor [--dir <path>]
      Check that the environment and site configuration are healthy: Node
      version, the four names that must agree (component name, start page,
      content path, package name), git history, and that antora is
      installed.

  pdocs --version, -v
      Print the installed @inditextech/pdocs-cli version and exit.
`

// build/bin.js -> package root, 1 level up — see readCliInfo's own comment.
async function banner(): Promise<string> {
  const { name, version } = await readCliInfo(import.meta.url, 1)
  return `${pc.bold(pc.cyan(name))} ${pc.dim(`v${version}`)}`
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2)

  switch (command) {
    case '--version':
    case '-v':
      console.log(await banner())
      return 0
    case undefined:
    case '--help':
    case '-h':
    case 'help':
      console.log(await banner())
      console.log('')
      console.log(USAGE)
      return command === undefined ? 1 : 0
    case 'new':
      return runNew(rest)
    case 'version':
      return runVersion(rest)
    case 'dev':
      return runDev(rest)
    case 'build':
      return runBuild(rest)
    case 'doctor':
      return runDoctor(rest)
    default:
      console.error(`unknown command: '${command}'\n`)
      console.log(await banner())
      console.log('')
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
