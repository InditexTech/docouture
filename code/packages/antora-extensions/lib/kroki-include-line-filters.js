// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
// SPDX-FileCopyrightText: OpenDevise Inc. and individual contributors to Antora
//
// SPDX-License-Identifier: MPL-2.0

'use strict'

// GH-189: `lines=`/`tag=`/`tags=` selection for an `include::` directive
// found inside a `[mermaid]`/`[plantuml]`/etc. diagram block, so
// kroki-prewarm.js can hash the SAME diagram source real conversion will
// (see that file's own header for why it needs this at all).
//
// This file is a Modification, per MPL-2.0 §1.10(a), of
// `@antora/asciidoc-loader@3.2.0`'s `lib/include/include-processor.js`
// (https://gitlab.com/antora/antora/-/blob/v3.2.0/packages/asciidoc-loader/lib/include/include-processor.js,
// MPL-2.0, Copyright (C) OpenDevise Inc. and individual contributors to
// Antora) — specifically its `getLines`, `filterLinesByLineNumbers`,
// `getTags` and `filterLinesByTags` functions, which implement Asciidoctor's
// own `lines=1..5,8` / `tag=name` / `tags=a;!b` include-selection grammar.
// Per that clause, a Modification of Covered Software remains MPL-2.0
// regardless of how much of it has changed — see this package's own NOTICE
// and LICENSE, and README.md's "with two exceptions" for the project-wide
// policy this establishes alongside `code/packages/ui-bundle`'s own,
// separate exception.
//
// WHAT CHANGED FROM THE UPSTREAM FILE
//
// The upstream functions are Opal/Asciidoctor-internal: `attrs` is a Ruby
// Hash (`attrs['$key?'](...)`, `attrs['$[]'](...)`), and the file/line data
// they filter comes off a `resolvedFile` object built from a live
// `PreprocessorReader`, with warnings logged through that reader's own
// `$logger()`. kroki-prewarm.js has neither — at `contentClassified` there
// is no Asciidoctor `Document`/`Reader` yet (see that file's header), only a
// plain string (the diagram block's already-include-target-resolved raw
// text) and a plain JS object of the include directive's own parsed
// attributes. So, here:
//
//   - `attrs` is a plain object (e.g. `{ lines: '1..5,8' }`), not an Opal
//     Hash — `getLines`/`getTags` below check plain-object membership
//     instead of calling `$key?`/`$[]`.
//   - `filterLinesByLineNumbers`/`filterLinesByTags` take the raw content
//     STRING directly (not a `resolvedFile` with its own `.contents`/`.file`
//     for diagnostics), and report problems (mismatched/unclosed/missing
//     tags) via an optional `onWarn(message)` callback instead of Antora's
//     own `reader.$logger()` plumbing — kroki-prewarm.js passes its own
//     `logger.warn`.
//   - The line-number-selection algorithm in `getLines`/
//     `filterLinesByLineNumbers`, and the tag-stack/wildcard algorithm in
//     `getTags`/`filterLinesByTags`, are otherwise unchanged from upstream —
//     this is what makes `lines=`/`tag=`/`tags=` behave identically to real
//     Asciidoctor conversion for the diagrams this filters.

const NEWLINE_RX = /\r\n?|\n/
const TAG_DIRECTIVE_RX = /\b(?:tag|(e)nd)::(\S+?)\[\](?=$|[ \r])/m
const DBL_COLON = '::'
const DBL_SQUARE = '[]'

/**
 * Parses an include directive's `lines=` attribute (already split out of its
 * attrlist by the caller) into a sorted, deduplicated list of 1-based line
 * numbers to select — an `Infinity` entry means "and every line after it".
 *
 * @param {Object} attrs - plain object of the include directive's own
 *   attributes, e.g. `{ lines: '1..5,8' }`.
 * @returns {number[] | undefined} the selected line numbers, or `undefined`
 *   when `lines` isn't present at all (as opposed to present-but-empty,
 *   which selects nothing — an empty array, not `undefined`).
 */
function getLines(attrs) {
  if ('lines' in attrs) {
    const lines = attrs.lines
    if (lines) {
      const linenums = []
      let filtered
      ;(~lines.indexOf(',') ? lines.split(',') : lines.split(';')).filter(Boolean).forEach((linedef) => {
        filtered = true
        let delim
        let from
        delim = linedef.indexOf('..')
        if (~delim) {
          from = linedef.substring(0, delim)
          let to = linedef.substring(delim + 2)
          if ((to = Number.parseInt(to, 10) || -1) > 0) {
            if ((from = Number.parseInt(from, 10) || -1) > 0) {
              for (let i = from; i <= to; i++) linenums.push(i)
            }
          } else if (to === -1 && (from = Number.parseInt(from, 10) || -1) > 0) {
            linenums.push(from, Infinity)
          }
        } else if ((from = Number.parseInt(linedef, 10) || -1) > 0) {
          linenums.push(from)
        }
      })
      if (linenums.length) {
        linenums.sort((a, b) => a - b)
        return [...new Set(linenums)]
      }
      if (filtered) return []
    }
  }
}

/**
 * Parses an include directive's `tag=`/`tags=` attribute into a Map of tag
 * name -> `true` (select) / `false` (exclude), the same shape
 * `filterLinesByTags` consumes.
 *
 * @param {Object} attrs - plain object of the include directive's own
 *   attributes, e.g. `{ tags: 'a;!b' }`.
 * @returns {Map<string, boolean> | undefined}
 */
function getTags(attrs) {
  if ('tag' in attrs) return getSingleTag(attrs.tag)
  if ('tags' in attrs) return getMultipleTags(attrs.tags)
}

function getSingleTag(tag) {
  if (!tag || tag === '!') return undefined
  return tag.charAt() === '!' ? new Map().set(tag.substring(1), false) : new Map().set(tag, true)
}

function getMultipleTags(tags) {
  if (!tags) return undefined
  const result = new Map()
  let any = false
  tags.split(~tags.indexOf(',') ? ',' : ';').forEach((tag) => {
    if (tag && tag !== '!') {
      any = true
      if (tag.charAt() === '!') result.set(tag.substring(1), false)
      else result.set(tag, true)
    }
  })
  return any ? result : undefined
}

/**
 * Selects only the given 1-based line numbers (and ranges) out of `content`.
 *
 * @param {string} content - the full, already include::-resolved file
 *   contents to filter.
 * @param {number[]} linenums - `getLines`'s own return value; mutated (the
 *   upstream algorithm consumes it as a queue) — pass a copy if the caller
 *   still needs the original.
 * @returns {[string[], number]} the selected lines, and the 1-based line
 *   number the first selected line was found at (`reader.pushInclude`'s own
 *   `startLineNum` upstream — kroki-prewarm.js doesn't need it for anything
 *   but keeps it for parity with the upstream return shape).
 */
function filterLinesByLineNumbers(content, linenums) {
  let lineNum = 0
  let startLineNum
  let selectRest
  const lines = []
  content.split(NEWLINE_RX).some((line) => {
    lineNum++
    if (selectRest || (selectRest = linenums[0] === Infinity)) {
      if (!startLineNum) startLineNum = lineNum
      lines.push(line)
    } else {
      if (linenums[0] === lineNum) {
        if (!startLineNum) startLineNum = lineNum
        linenums.shift()
        lines.push(line)
      }
      if (!linenums.length) return true
    }
    return false
  })
  return [lines, startLineNum || 1]
}

function mapContainsValue(map, value) {
  for (const v of map.values()) {
    if (v === value) return true
  }
}

/**
 * Selects only the lines between matching `tag::name[]`/`end::name[]`
 * markers named in `tags`, out of `content` — including nested tags, the
 * `*`/`**` wildcards, and negated (`!name`) exclusions, exactly as
 * Asciidoctor's own `tag=`/`tags=` include selection does.
 *
 * @param {string} content - the full, already include::-resolved file
 *   contents to filter.
 * @param {Map<string, boolean>} tags - `getTags`'s own return value;
 *   mutated (entries are deleted as they're matched) — pass a copy if the
 *   caller still needs the original.
 * @param {{ onWarn?: (message: string) => void }} [opts] - `onWarn`, if
 *   given, is called once per mismatched end tag, unclosed tag left open at
 *   EOF, or a requested tag never found — the same three conditions
 *   upstream logs through `reader.$logger()`.
 * @returns {[string[], number]} the selected lines, and the 1-based line
 *   number the first selected line was found at.
 */
// The `globstar === undefined` half of `resolveTagSelectionDefaults`, split
// out so neither half counts against the other's complexity budget —
// unchanged decision table from upstream's own `filterLinesByTags`.
function resolveTagSelectionDefaultsWithoutGlobstar(tags, star) {
  if (star === undefined) {
    const selectingDefault = !mapContainsValue(tags, true)
    return { selectingDefault, selecting: selectingDefault, wildcard: undefined }
  }
  const wildcard = star
  const selectingDefault = wildcard || tags.keys().next().value !== '*' ? false : !wildcard
  tags.delete('*')
  return { selectingDefault, selecting: selectingDefault, wildcard }
}

// The `globstar !== undefined` half of `resolveTagSelectionDefaults` — see
// that function and its sibling half above for the split rationale.
function resolveTagSelectionDefaultsWithGlobstar(tags, globstar, star) {
  tags.delete('**')
  const selectingDefault = globstar
  let wildcard
  if (star === undefined) {
    if (!globstar && tags.values().next().value === false) wildcard = true
  } else {
    tags.delete('*')
    wildcard = star
  }
  return { selectingDefault, selecting: selectingDefault, wildcard }
}

// The three pieces of running state every tag-directive decision in
// `applyTagDirective` reads from but never changes: `selectingDefault`
// (what to fall back to once every tag closes), the initial `selecting`
// value before any directive is seen, and `wildcard` (the `*`/`**`
// wildcard's own select/exclude value, if either was declared).
function resolveTagSelectionDefaults(tags) {
  const globstar = tags.get('**')
  const star = tags.get('*')
  return globstar === undefined
    ? resolveTagSelectionDefaultsWithoutGlobstar(tags, star)
    : resolveTagSelectionDefaultsWithGlobstar(tags, globstar, star)
}

// Applies one recognised `end::name[]` directive — the `m[1]` half of
// `applyTagDirective`'s decision table, split out so neither half counts
// against the other's complexity budget. `tagStack`/`state.selecting`/
// `state.activeTag` are mutated in place, matching upstream.
function applyEndTagDirective(thisTag, lineNum, state) {
  const { tags, tagStack, onWarn, selectingDefault } = state
  if (thisTag === state.activeTag) {
    tagStack.shift()
    ;[state.activeTag, state.selecting] = tagStack.length ? tagStack[0] : [undefined, selectingDefault]
    return
  }
  if (!tags.has(thisTag)) return
  const idx = tagStack.findIndex(([name]) => name === thisTag)
  if (~idx) {
    tagStack.splice(idx, 1)
    onWarn(`mismatched end tag (expected '${state.activeTag}' but found '${thisTag}') at line ${lineNum}`)
  } else {
    onWarn(`unexpected end tag '${thisTag}' at line ${lineNum}`)
  }
}

// Applies one recognised `tag::name[]` directive — the `!m[1]` half of
// `applyTagDirective`'s decision table. Only pushes onto `tagStack` when the
// tag is actually recognised (a known tag, or a wildcard is in play);
// anything else leaves `state` untouched, matching upstream.
function applyStartTagDirective(thisTag, lineNum, state) {
  const { tags, wildcard, tagStack, tagsSelected } = state
  if (tags.has(thisTag)) {
    state.selecting = tags.get(thisTag)
    if (state.selecting) tagsSelected.push(thisTag)
  } else if (wildcard !== undefined) {
    state.selecting = state.activeTag && !state.selecting ? false : wildcard
  } else {
    return
  }
  state.activeTag = thisTag
  tagStack.unshift([state.activeTag, state.selecting, lineNum])
}

// Applies one recognised `tag::name[]`/`end::name[]` directive to the
// running tag-selection state — same decision table as upstream's
// `filterLinesByTags`, split into its two halves above so the per-line loop
// below stays readable. `state.tagStack`/`state.tagsSelected` are mutated in
// place (upstream mutates its own closure variables the same way);
// `state.tags`/`state.wildcard`/`state.selectingDefault`/`state.onWarn` are
// read-only.
function applyTagDirective(m, lineNum, state) {
  const thisTag = m[2]
  if (m[1]) {
    applyEndTagDirective(thisTag, lineNum, state)
  } else {
    applyStartTagDirective(thisTag, lineNum, state)
  }
}

// One line of `content`: either a recognised tag directive (handled by
// `applyTagDirective`) or, while `selecting`, a line to keep.
function processTagLine(line, lineNum, state) {
  const m = ~line.indexOf(DBL_COLON) && ~line.indexOf(DBL_SQUARE) && TAG_DIRECTIVE_RX.exec(line)
  if (m) {
    applyTagDirective(m, lineNum, state)
    return
  }
  if (state.selecting) {
    if (!state.startLineNum) state.startLineNum = lineNum
    state.lines.push(line)
  }
}

// Post-processing after every line has been scanned: warns about any tag
// left open at EOF, drops the tags that WERE matched from the `tags` map
// (upstream mutates it as a matched-set as it goes), and warns once about
// any explicitly-requested tag that was never found at all.
function finalizeTagSelection(tagStack, tags, tagsSelected, onWarn) {
  if (tagStack.length) {
    tagStack.forEach(([tagName, , tagLineNum]) =>
      onWarn(`detected unclosed tag '${tagName}' starting at line ${tagLineNum}`)
    )
  }
  if (tagsSelected.length) tagsSelected.forEach((name) => tags.delete(name))
  const missingTags = []
  tags.forEach((select, name) => select && missingTags.push(name))
  if (missingTags.length) {
    onWarn(`tag${missingTags.length > 1 ? 's' : ''} '${missingTags.join(', ')}' not found in include file`)
  }
}

function filterLinesByTags(content, tags, opts = {}) {
  const onWarn = opts.onWarn || (() => {})
  const { selectingDefault, selecting, wildcard } = resolveTagSelectionDefaults(tags)

  const state = {
    tags,
    wildcard,
    selectingDefault,
    onWarn,
    selecting,
    activeTag: undefined,
    tagStack: [],
    tagsSelected: [],
    lines: [],
    startLineNum: undefined,
  }

  let lineNum = 0
  content.split(NEWLINE_RX).forEach((line) => {
    lineNum++
    processTagLine(line, lineNum, state)
  })

  finalizeTagSelection(state.tagStack, tags, state.tagsSelected, onWarn)
  return [state.lines, state.startLineNum || 1]
}

module.exports = { getLines, getTags, filterLinesByLineNumbers, filterLinesByTags }
