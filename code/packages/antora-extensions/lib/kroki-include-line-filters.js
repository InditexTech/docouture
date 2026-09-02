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
      if (linenums.length) return [...new Set(linenums.sort((a, b) => a - b))]
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
  if ('tag' in attrs) {
    const tag = attrs.tag
    if (tag && tag !== '!') {
      return tag.charAt() === '!' ? new Map().set(tag.substring(1), false) : new Map().set(tag, true)
    }
  } else if ('tags' in attrs) {
    const tags = attrs.tags
    if (tags) {
      const result = new Map()
      let any = false
      tags.split(~tags.indexOf(',') ? ',' : ';').forEach((tag) => {
        if (tag && tag !== '!') {
          any = true
          if (tag.charAt() === '!') result.set(tag.substring(1), false)
          else result.set(tag, true)
        }
      })
      if (any) return result
    }
  }
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
function filterLinesByTags(content, tags, opts = {}) {
  const onWarn = opts.onWarn || (() => {})
  let selectingDefault, selecting, wildcard
  const globstar = tags.get('**')
  const star = tags.get('*')
  if (globstar === undefined) {
    if (star === undefined) {
      selectingDefault = selecting = !mapContainsValue(tags, true)
    } else {
      wildcard = star
      if (wildcard || tags.keys().next().value !== '*') {
        selectingDefault = selecting = false
      } else {
        selectingDefault = selecting = !wildcard
      }
      tags.delete('*')
    }
  } else {
    tags.delete('**')
    selectingDefault = selecting = globstar
    if (star === undefined) {
      if (!globstar && tags.values().next().value === false) wildcard = true
    } else {
      tags.delete('*')
      wildcard = star
    }
  }

  const lines = []
  const tagStack = []
  const tagsSelected = []
  let activeTag
  let lineNum = 0
  let startLineNum
  content.split(NEWLINE_RX).forEach((line) => {
    lineNum++
    let m
    if (~line.indexOf(DBL_COLON) && ~line.indexOf(DBL_SQUARE) && (m = line.match(TAG_DIRECTIVE_RX))) {
      const thisTag = m[2]
      if (m[1]) {
        if (thisTag === activeTag) {
          tagStack.shift()
          ;[activeTag, selecting] = tagStack.length ? tagStack[0] : [undefined, selectingDefault]
        } else if (tags.has(thisTag)) {
          const idx = tagStack.findIndex(([name]) => name === thisTag)
          if (~idx) {
            tagStack.splice(idx, 1)
            onWarn(`mismatched end tag (expected '${activeTag}' but found '${thisTag}') at line ${lineNum}`)
          } else {
            onWarn(`unexpected end tag '${thisTag}' at line ${lineNum}`)
          }
        }
      } else if (tags.has(thisTag)) {
        selecting = tags.get(thisTag)
        if (selecting) tagsSelected.push(thisTag)
        activeTag = thisTag
        tagStack.unshift([activeTag, selecting, lineNum])
      } else if (wildcard !== undefined) {
        selecting = activeTag && !selecting ? false : wildcard
        activeTag = thisTag
        tagStack.unshift([activeTag, selecting, lineNum])
      }
    } else if (selecting) {
      if (!startLineNum) startLineNum = lineNum
      lines.push(line)
    }
  })
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
  return [lines, startLineNum || 1]
}

module.exports = { getLines, getTags, filterLinesByLineNumbers, filterLinesByTags }
