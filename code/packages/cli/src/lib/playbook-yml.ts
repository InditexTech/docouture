// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// Regex-based reader for the handful of `antora-playbook.yml` fields `docouture
// dev` and `docouture doctor` need — deliberately not a YAML parser, matching
// the style of antora-yml.ts (this package) and scripts/dev.mjs's own
// readSiteBasePath (the monorepo dev server this reasoning was lifted from).
// Every value here is only ever read, never rewritten, so a full parse/dump
// round trip buys nothing and would cost the file's comments.
//
// Values live at different nesting depths — `site.start_page` is a direct
// child of a top-level key, `content.sources[0].start_path` is a field on
// the first item of a list nested under one — but both are found the same
// way: narrow to the top-level key's own line range first (stopping at the
// next top-level key, so a same-named field belonging to a different block
// is never picked up by accident), then take the first indented line
// matching the field, whatever its exact depth.

function topLevelBlock(content: string, key: string): string[] {
  const lines = content.split('\n')
  const out: string[] = []
  let inBlock = false

  for (const line of lines) {
    if (/^\s*(?:#.*)?$/.test(line)) {
      if (inBlock) out.push(line)
      continue
    }
    if (/^\S/.test(line)) {
      if (inBlock) break
      inBlock = new RegExp(`^${key}:`).test(line)
      continue
    }
    if (inBlock) out.push(line)
  }

  return out
}

function firstField(lines: string[], key: string): string | null {
  // The optional `-\s*` accounts for a YAML list item's first field, e.g.
  // `content.sources[0].url` is written `    - url: ..` — every other field
  // on that same item (start_path, branches, ...) is indented the same but
  // without the dash, which the `?` also covers.
  const re = new RegExp(String.raw`^\s*(?:-\s*)?${key}:\s*(.+?)\s*$`)
  for (const line of lines) {
    const match = re.exec(line)
    if (match?.[1]) return match[1].replace(/^['"]|['"]$/g, '')
  }
  return null
}

/** `site.url` — unset while developing locally, so this is commonly null. */
export function readSiteUrl(content: string): string | null {
  return firstField(topLevelBlock(content, 'site'), 'url')
}

/** `site.start_page`, e.g. `my-site::index.adoc`. */
export function readStartPage(content: string): string | null {
  return firstField(topLevelBlock(content, 'site'), 'start_page')
}

/** The component-name prefix of `site.start_page`, before its `::`. */
export function readStartPageComponent(content: string): string | null {
  const startPage = readStartPage(content)
  if (!startPage) return null
  const separator = startPage.indexOf('::')
  return separator === -1 ? null : startPage.slice(0, separator)
}

/**
 * `content.sources[0].start_path` — repository-root relative directory
 * holding `docs/antora.yml`. Only the first source is read: every shape
 * `docouture new` generates has exactly one, and doctor only needs to catch the
 * common single-source misconfiguration, not aggregate every source in a
 * hand-authored multi-source playbook.
 */
export function readStartPath(content: string): string | null {
  return firstField(topLevelBlock(content, 'content'), 'start_path')
}

/** `content.sources[0].url` — see this package's own comment on why it must
 * be `..`, not `.`, when the playbook does not sit at the repository root. */
export function readSourceUrl(content: string): string | null {
  return firstField(topLevelBlock(content, 'content'), 'url')
}

/**
 * `output.dir` — where `antora build` writes the built site. Unset in every
 * playbook `docouture new` scaffolds (Antora's own default, `build/site`,
 * applies), so `docouture publish` falls back to that same default rather than
 * treating a missing value as an error.
 */
export function readOutputDir(content: string): string | null {
  return firstField(topLevelBlock(content, 'output'), 'dir')
}

/**
 * `content.sources[0].branches` — an inline YAML array (e.g. `[main]`), not
 * a scalar, so this reads it as one and splits it, unlike every other
 * reader above. Used by lib/branch-detect.ts to derive the *prerelease*
 * branch role (GH #175) — see that module's own comment on why this is
 * derived live rather than stored anywhere.
 */
export function readBranches(content: string): string[] | null {
  const raw = firstField(topLevelBlock(content, 'content'), 'branches')
  if (!raw) return null
  const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '')
  const values = inner
    .split(',')
    .map((value) => value.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
  return values.length > 0 ? values : null
}

/**
 * Rewrites `content.sources[0].branches`'s inline array to a single new
 * branch name — the one write this module performs, used by `docouture
 * branch-model` (GH #175) to update an existing site's playbook without a
 * full re-scaffold. Mirrors topLevelBlock's own line-classification (blank/
 * comment lines skipped, a non-indented line either continues or ends the
 * block) so the same top-level-key scoping applies here as everywhere else
 * in this file; returns `content` unchanged if no `branches:` line is found
 * within `content:`'s block.
 */
export function writeBranches(content: string, branch: string): string {
  const lines = content.split('\n')
  let inBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (/^\s*(?:#.*)?$/.test(line)) continue
    if (/^\S/.test(line)) {
      if (inBlock) break
      inBlock = line.startsWith('content:')
      continue
    }
    if (inBlock) {
      const match = /^(\s*(?:-\s*)?branches:\s*)\[[^\]]*\](.*)$/.exec(line)
      if (match) {
        lines[i] = `${match[1]}[${branch}]${match[2]}`
        return lines.join('\n')
      }
    }
  }

  return content
}

export interface FailureLevelResult {
  content: string
  /** The value before the rewrite, or null when the key (or its block) was absent. */
  previous: string | null
  changed: boolean
}

/**
 * Sets `runtime.log.failure_level`, used by `docouture upgrade` to move an
 * existing site to the strict-build default new scaffolds already get. Same
 * line-based, comment-preserving idiom as writeBranches. Handles the key
 * present (value replaced), `log:` present without the key, `runtime:`
 * present without `log:`, and no `runtime:` at all (block appended). Returns
 * null when the shape isn't safe to edit (flow-style `runtime: {...}` or
 * `log: {...}`).
 */
export function setFailureLevel(content: string, level: string): FailureLevelResult | null {
  const lines = content.split('\n')
  let runtimeIdx = -1
  let runtimeEnd = lines.length

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (/^\s*(?:#.*)?$/.test(line)) continue
    if (/^\S/.test(line)) {
      if (runtimeIdx !== -1) {
        runtimeEnd = i
        break
      }
      if (/^runtime:/.test(line)) {
        if (!/^runtime:\s*(?:#.*)?$/.test(line)) return null
        runtimeIdx = i
      }
    }
  }

  if (runtimeIdx === -1) {
    const base = content.endsWith('\n') ? content : `${content}\n`
    return {
      content: `${base}\nruntime:\n  log:\n    failure_level: ${level}\n`,
      previous: null,
      changed: true,
    }
  }

  let logIdx = -1
  for (let i = runtimeIdx + 1; i < runtimeEnd; i++) {
    const line = lines[i]!
    const log = /^(\s+)log:(.*)$/.exec(line)
    if (log) {
      if (!/^\s*(?:#.*)?$/.test(log[2]!)) return null
      logIdx = i
      break
    }
  }

  if (logIdx === -1) {
    lines.splice(runtimeIdx + 1, 0, '  log:', `    failure_level: ${level}`)
    return { content: lines.join('\n'), previous: null, changed: true }
  }

  const logIndent = /^(\s*)/.exec(lines[logIdx]!)![1]!.length
  for (let i = logIdx + 1; i < runtimeEnd; i++) {
    const line = lines[i]!
    if (/^\s*(?:#.*)?$/.test(line)) continue
    const indent = /^(\s*)/.exec(line)![1]!.length
    if (indent <= logIndent) break
    const match = /^(\s*failure_level:\s*)([^\s#]+)(.*)$/.exec(line)
    if (match) {
      const previous = match[2]!.replace(/^['"]|['"]$/g, '')
      if (previous === level) return { content, previous, changed: false }
      lines[i] = `${match[1]}${level}${match[3]}`
      return { content: lines.join('\n'), previous, changed: true }
    }
  }

  lines.splice(logIdx + 1, 0, `${' '.repeat(logIndent + 2)}failure_level: ${level}`)
  return { content: lines.join('\n'), previous: null, changed: true }
}
