'use strict'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Prints the not-yet-released entries in CHANGELOG.md — ported from the
 * justfile's own `changelog` recipe (GH-140), an inline awk one-liner.
 */
export async function runChangelog(argv: string[]): Promise<number> {
  void argv // no command-specific flags today
  const cwd = process.cwd()
  const content = readFileSync(join(cwd, 'CHANGELOG.md'), 'utf8')
  const lines = content.split('\n')

  const startIdx = lines.findIndex((line) => line.startsWith('## [Unreleased]'))
  if (startIdx === -1) {
    console.error("no '## [Unreleased]' section found in CHANGELOG.md")
    return 1
  }

  const body: string[] = []
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i]!
    if (line.startsWith('## [')) break
    body.push(line)
  }

  process.stdout.write(`${body.join('\n').trim()}\n`)
  return 0
}
