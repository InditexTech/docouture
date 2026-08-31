// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// Patches the two fields `docouture version` cares about — `version:` and
// `prerelease:` — by line, rather than parsing the file into a YAML document
// and re-serialising it. A full parse/dump round-trip would lose the comments
// antora.yml carries (see docs-site-package's own antora.yml for an example),
// and this file's whole reason to be readable is that a human edits it too.
//
// This only ever touches top-level keys, matched at the start of a line
// (column 0), which is where Antora requires `name`/`title`/`version` to live
// in a component descriptor.

const VERSION_LINE = /^version:.*$/m
const PRERELEASE_LINE = /^prerelease:.*$/m

export interface AntoraYmlPatch {
  version: string
  prerelease: boolean
}

export function readVersion(content: string): string | null {
  const match = VERSION_LINE.exec(content)
  if (!match) return null
  const value = match[0].slice('version:'.length).trim()
  return value.length > 0 ? value : null
}

export function hasVersionLine(content: string): boolean {
  return VERSION_LINE.test(content)
}

export function patchVersion(content: string, patch: AntoraYmlPatch): string {
  if (!VERSION_LINE.test(content)) {
    throw new Error("no top-level 'version:' line found")
  }

  let next = content.replace(VERSION_LINE, `version: ${patch.version}`)

  if (patch.prerelease) {
    if (PRERELEASE_LINE.test(next)) {
      next = next.replace(PRERELEASE_LINE, 'prerelease: true')
    } else {
      // Insert directly after the version line, so a reader sees the two
      // together rather than prerelease landing wherever the regex first
      // matched something else.
      next = next.replace(VERSION_LINE, (line) => `${line}\nprerelease: true`)
    }
  } else if (PRERELEASE_LINE.test(next)) {
    next = next.replace(`${PRERELEASE_LINE.exec(next)![0]}\n`, '')
    // The line may be the last one in the file, with no trailing newline to
    // consume in the replacement above — handle that case too.
    next = next.replace(PRERELEASE_LINE, '').replace(/\n{3,}/g, '\n\n')
  }

  return next
}
