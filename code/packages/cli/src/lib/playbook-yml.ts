'use strict'

// Regex-based reader for the handful of `antora-playbook.yml` fields `pdocs
// dev` and `pdocs doctor` need — deliberately not a YAML parser, matching
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
  const re = new RegExp(`^\\s*(?:-\\s*)?${key}:\\s*(.+?)\\s*$`)
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
 * `pdocs new` generates has exactly one, and doctor only needs to catch the
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
 * playbook `pdocs new` scaffolds (Antora's own default, `build/site`,
 * applies), so `pdocs publish` falls back to that same default rather than
 * treating a missing value as an error.
 */
export function readOutputDir(content: string): string | null {
  return firstField(topLevelBlock(content, 'output'), 'dir')
}
