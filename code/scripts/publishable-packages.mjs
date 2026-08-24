#!/usr/bin/env node
//
// Single source of truth for "which packages under code/packages/* get
// published". Derived from each package's own `private` field rather than
// hand-maintained, so adding or removing a publishable package can't
// silently drift out of sync with the release workflow or justfile.
//
// Usage:
//   node scripts/publishable-packages.mjs            # newline-separated dir names
//   node scripts/publishable-packages.mjs --json      # JSON array of dir names
//   node scripts/publishable-packages.mjs --verify    # exit 1 if any packages/*
//                                                      # dir with private:false
//                                                      # is missing package.json,
//                                                      # or is unreadable

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packagesDir = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'packages')

const dirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

const publishable = []
const errors = []

for (const dir of dirs) {
  const pkgPath = join(packagesDir, dir, 'package.json')
  let pkg
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  } catch (err) {
    errors.push(`${dir}: cannot read/parse package.json (${err.message})`)
    continue
  }
  if (pkg.private !== true) publishable.push(dir)
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}

const mode = process.argv[2]

if (mode === '--verify') {
  // Nothing further to check today beyond "every packages/* dir parses" above
  // — this flag exists so CI/justfile can assert the list is derivable at
  // all without printing it, and is a hook for future invariants.
  process.exit(0)
} else if (mode === '--json') {
  console.log(JSON.stringify(publishable))
} else {
  console.log(publishable.join('\n'))
}
