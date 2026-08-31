// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// GH-44: pre-renders every `[mermaid]`/`[plantuml]`/etc. block the raw
// content aggregate contains, via a self-hosted Kroki service, asynchronously,
// before any page is converted. Also starts that Kroki service itself, on
// demand, if nothing answers at its fixed URL yet — see kroki-docker.js's
// own header for that half.
//
// This is an ANTORA pipeline extension (`antora.extensions` in the
// playbook) — see index.js's own header for why this package's exports are
// that kind, and shiki-prewarm.js's own header for the identical shape this
// follows: `@asciidoctor/core ~2.2` converts every page through a fully
// synchronous (Opal) loop, but rendering a diagram means an HTTP round trip
// to Kroki, which is asynchronous. So that work happens ONCE, up front,
// outside the conversion loop entirely, and its result handed to the
// synchronous side (kroki.js, in the SIBLING
// @inditextech/docouture-asciidoc-extensions package) through a plain shared
// module, kroki-instance.js.
//
// Unlike Shiki, there is no single instance to build — every distinct
// diagram in the corpus needs its own render, and this listener does not yet
// know which pages actually have `[mermaid]` blocks (that's Asciidoctor's
// job, which hasn't run yet). So it works off RAW file text for finding the
// blocks themselves — `[type]\n....\n...\n....` isn't something Asciidoctor
// has parsed for us at this point either.
//
// `kroki-enabled` and `kroki-diagram-types` are read off the PLAYBOOK here
// (`playbook.asciidoc.attributes`), not off any one document — there is no
// AsciiDoc document yet at this point in the pipeline. kroki-config.js's
// `resolveEnabledTypes` is shared with kroki.js specifically so the two
// never disagree about what "enabled" means from two different attribute
// shapes (a raw playbook value here, `Document#getAttribute` there).
//
// GH-189: LISTENS ON `contentClassified`, NOT `contentAggregated`
//
// A diagram block's body is sometimes itself an `include::partial$....[]`
// directive rather than literal diagram source — a common pattern for
// reusing shared definitions (a sprites/icons partial across several
// PlantUML diagrams, say). At real conversion time, kroki.js's block
// processor runs AFTER Asciidoctor has already expanded that include::
// directive — `reader.getLines()` returns the real, resolved diagram
// source — and hashes THAT (kroki-instance.js's `keyFor`) to look the
// prewarmed render up. If this file computed its own key from the literal
// `include::partial$....[]` text instead — which is all `contentAggregated`
// has to work with, since files are still raw, unclassified Buffers with no
// `family`/`module`/`component`/`version` on `file.src` yet, and so no way
// to resolve a `partial$` target at all — the two keys would never agree
// for that block, and it would permanently miss the prewarm cache
// regardless of whether Kroki itself is reachable.
//
// `contentClassified` fires once `@antora/content-classifier` has built the
// real `ContentCatalog` — files are still their raw, unconverted selves
// (conversion happens only after, in `documentsConverted` — see
// `@antora/site-generator`'s own `generate-site.js`), but `file.src` now
// carries `family`/`module`/`component`/`version`/`relative`, and the
// catalog itself resolves resource IDs (`partial$foo.puml`,
// `component:module:family$relative`) — the same information and the same
// method Asciidoctor's own real include resolution uses during actual
// conversion. Both `contentCatalog` and `playbook` are available here
// because `GeneratorContext#notify` hands an arity-1 listener its own full
// variables object, not just this event's own payload — `contentCatalog` is
// already in there by the time `contentClassified` fires (see
// `@antora/site-generator`'s `generate-site.js`, `vars.contentCatalog = ...`
// runs before that particular `notify` call).
//
// `resolveIncludeFile` — the exact function Antora's own include processor
// uses to turn an `include::` target into the real file it resolves to — is
// a published subpath export of `@antora/asciidoc-loader`
// (`./include/resolve-include-file`), reused here as a normal npm
// dependency rather than reimplemented: same catalog, same resolution
// rules, so the two sides can no longer disagree about what a `partial$`
// target even means. `lines=`/`tag=`/`tags=` selection on top of a resolved
// include target, however, lives in that same package's
// lib/include/include-processor.js — NOT a published subpath, so getting
// that selection logic to agree with real conversion meant adapting it
// directly; see kroki-include-line-filters.js's own header for why that
// file, alone in this package, is licensed MPL-2.0 rather than Apache-2.0.
//
// WHAT STILL DOESN'T RESOLVE HERE — GRACEFUL, NOT WRONG
//
// An include target that needs attribute substitution (contains `{`) can't
// be resolved at this point in the pipeline at all — that requires a live
// Asciidoctor `Document` with its own attributes, which doesn't exist yet
// (real Asciidoctor conversion itself can't do this substitution before a
// Document exists either). An include directive with any attribute this
// file doesn't recognise (anything other than `lines=`/`tag=`/`tags=`/
// `leveloffset=`/`opts=`) is left alone too, rather than risk silently
// expanding it in a way real conversion wouldn't. Same for a target that
// simply doesn't resolve to any file in the catalog (a typo, a moved file).
// Every one of these degrades exactly the way an ordinary cache miss always
// has — kroki.js falls back to raw source with its own warning — rather
// than either crashing the build or, worse, prewarming the WRONG content
// under a key that then silently doesn't match anyway.
const path = require('node:path')
const {
  SUPPORTED_TYPES,
  ENABLED_ATTR,
  TYPES_ATTR,
  KROKI_URL,
  resolveEnabledTypes,
  resolveFormat,
} = require('@inditextech/docouture-asciidoc-extensions/lib/kroki-config')
const { applyDefaultMermaidTheme } = require('@inditextech/docouture-asciidoc-extensions/lib/kroki-mermaid-theme')
const kroki = require('@inditextech/docouture-asciidoc-extensions/lib/kroki-instance')
const { ensureKrokiRunning } = require('./kroki-docker')
const resolveIncludeFile = require('@antora/asciidoc-loader/include/resolve-include-file')
const { getLines, getTags, filterLinesByLineNumbers, filterLinesByTags } = require('./kroki-include-line-filters')

// Matches the shape kroki.js intercepts: a `[type]` style line — optionally
// followed by ANY further comma-separated attributes real Asciidoctor
// accepts on a block (a positional id, a bare format shorthand, `role=`,
// …) — immediately followed by a four-dot-delimited LITERAL block. Built
// from `SUPPORTED_TYPES` rather than a bare `\w+`, so a block styled with
// some other, unsupported name (or a coincidental four-dot block that
// isn't a diagram at all) is never sent to Kroki on a guess. Tolerant of
// `\r\n` line endings and of trailing whitespace on the delimiter lines —
// real-world authoring and git checkout settings both produce those.
//
// Follow-up to GH-189, found while reproducing that fix against a real
// hand-authored page (karatetools-oss's architecture.adoc): this used to
// require the WHOLE bracket content to be exactly `type` or
// `type,format=<anything>` — anything
// else on the style line (a block id, `role=`, a positional format
// shorthand — every one of these appears on real, hand-authored pages;
// see e.g. `[plantuml,architecture,png,role="no-border, zoom-in"]`) made
// the regex fail to match at all, so the block was invisible to this
// scan and permanently missed the prewarm cache even though real
// Asciidoctor conversion (a proper block extension, parsing the full
// attribute list) still recognised and rendered it — every single time,
// not just once. The attribute list (group 2 below, raw and unparsed) is
// now captured whole and handed to `extractFormatAttr` to pull out a
// `format=` value from wherever it appears, quote-aware, the same way
// `parseIncludeAttrlist` already does for `include::` directives.
function buildBlockPattern() {
  const typeAlternation = SUPPORTED_TYPES.map((type) => type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  return new RegExp(
    '^\\[(' +
      typeAlternation +
      ')(?:,([^\\]]*))?\\]\\r?\\n\\.\\.\\.\\.[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n\\.\\.\\.\\.[ \\t]*$',
    'gm'
  )
}

// A minimal, quote-aware attrlist scanner — same shape as
// `parseIncludeAttrlist` below, but permissive rather than strict: a
// block's style line may legitimately carry positional attributes
// (an id, a bare format shorthand) and named attributes this file has no
// reason to understand (`role=`, …) that real Asciidoctor still parses
// and applies just fine. This only needs to find `format=`, if any is
// present, wherever it falls in the list; everything else is simply
// skipped rather than rejected — unlike `parseIncludeAttrlist`, an
// unrecognised attribute here is not a reason to give up on the whole
// block.
function extractFormatAttr(attrlist) {
  if (!attrlist) return undefined
  let i = 0
  const len = attrlist.length
  while (i < len) {
    while (i < len && (attrlist[i] === ',' || attrlist[i] === ' ')) i++
    if (i >= len) break
    const start = i
    while (i < len && attrlist[i] !== '=' && attrlist[i] !== ',') i++
    if (i < len && attrlist[i] === '=') {
      const key = attrlist.slice(start, i).trim()
      i++ // skip '='
      let value
      if (attrlist[i] === '"' || attrlist[i] === "'") {
        const quote = attrlist[i]
        i++
        const valueStart = i
        while (i < len && attrlist[i] !== quote) i++
        value = attrlist.slice(valueStart, i)
        i++ // skip closing quote
        while (i < len && attrlist[i] !== ',') i++
      } else {
        const valueStart = i
        while (i < len && attrlist[i] !== ',') i++
        value = attrlist.slice(valueStart, i).trim()
      }
      if (key === 'format') return value
    }
    // positional attribute (no `=` before the next comma) — not `format=`,
    // skip to the next one.
  }
  return undefined
}

/** Every `(type, source, format)` triple found in one file's raw contents. */
function extractDiagrams(text, pattern) {
  const found = []
  pattern.lastIndex = 0
  let match
  while ((match = pattern.exec(text))) {
    found.push({ type: match[1], format: extractFormatAttr(match[2]), source: match[3] })
  }
  return found
}

// GH-189: Asciidoctor's own `include::` directive grammar (target + raw
// attrlist, group 1 an optional leading `\` meaning "don't process, render
// literal") — reproduced here because we're working off plain file text,
// not an Asciidoctor `Reader`, which is the only thing that exposes this as
// a constant (`IncludeDirectiveRx`, on an instantiated `@asciidoctor/core`
// object — not a static export, and not worth a whole extra dependency in
// this package just to read one property off it).
const INCLUDE_DIRECTIVE_RX = /^(\\)?include::([^\s[](?:[^[]*[^\s[])?)\[([^\n]*)?\]$/
const NEWLINE_RX = /\r\n?|\n/
// Asciidoctor's own default `max-include-depth` — matched here so a cyclic
// or absurdly deep chain of partials degrades (warn, leave the remaining
// include:: lines literal) rather than looping forever; it has no reader to
// track an actual include stack, so — like upstream — this is a depth
// counter, not cycle detection.
const MAX_INCLUDE_DEPTH = 64
// Every include-directive attribute this file understands well enough to
// still guarantee an identical result to real conversion. `leveloffset` and
// `opts` (`opts=optional`) are recognised but ignored: neither changes a
// literal block's own text content once the target has actually resolved,
// which is the only path this file ever expands. Anything else —
// `encoding=`, `indent=`, `tabsize=`, `depth=`, or a positional attribute —
// isn't understood well enough to promise parity, so its whole include::
// line is left alone instead of risking a silently-wrong expansion.
const SAFE_INCLUDE_ATTR_KEYS = new Set(['lines', 'tag', 'tags', 'leveloffset', 'opts'])

/**
 * A minimal include-directive attrlist parser — just enough to recognise
 * `lines=`/`tag=`/`tags=` (optionally quoted, so a comma inside a quoted
 * `lines="1..3,8"` isn't mistaken for the next attribute) and to notice
 * anything else this file doesn't safely understand.
 *
 * @returns {Object | null} a plain object of recognised attribute values, or
 *   `null` when the attrlist contains a positional attribute or any key
 *   outside `SAFE_INCLUDE_ATTR_KEYS` — the caller's signal to leave that
 *   include:: line untouched rather than guess.
 */
function parseIncludeAttrlist(attrlist) {
  const attrs = {}
  if (!attrlist) return attrs
  let i = 0
  const len = attrlist.length
  while (i < len) {
    while (i < len && (attrlist[i] === ',' || attrlist[i] === ' ')) i++
    if (i >= len) break
    const keyStart = i
    while (i < len && attrlist[i] !== '=' && attrlist[i] !== ',') i++
    if (i >= len || attrlist[i] !== '=') return null // positional attribute — not a form we support
    const key = attrlist.slice(keyStart, i).trim()
    i++ // skip '='
    let value
    if (attrlist[i] === '"' || attrlist[i] === "'") {
      const quote = attrlist[i]
      i++
      const valueStart = i
      while (i < len && attrlist[i] !== quote) i++
      value = attrlist.slice(valueStart, i)
      i++ // skip closing quote
      while (i < len && attrlist[i] !== ',') i++
    } else {
      const valueStart = i
      while (i < len && attrlist[i] !== ',') i++
      value = attrlist.slice(valueStart, i).trim()
    }
    if (!SAFE_INCLUDE_ATTR_KEYS.has(key)) return null
    attrs[key] = value
  }
  return attrs
}

/**
 * Expands every `include::` directive found in `source` — a diagram
 * block's own raw body — into the real content it resolves to, recursively,
 * the same way real Asciidoctor conversion would before kroki.js ever sees
 * it. See this file's own header for exactly what this can and can't
 * resolve.
 *
 * @param {string} source - the diagram block's raw body (may contain zero,
 *   one, or several `include::` lines mixed with literal diagram source).
 * @param {{ path: string, src: Object }} originFile - the `.adoc` file this
 *   source came from (or, on a recursive call, the partial it was found
 *   inside) — `include::` targets resolve relative to whichever file is
 *   CURRENTLY including them, not the original page (matches
 *   `resolve-include-file.js`'s own `cursor.file?.src || page.src` rule).
 * @param {Object} catalog - the real `ContentCatalog` `contentClassified`
 *   handed this listener.
 * @param {Object} logger - this listener's own logger.
 * @param {number} [depth] - recursion guard against `MAX_INCLUDE_DEPTH`.
 * @returns {string} `source` with every resolvable `include::` line
 *   replaced by its target's own (recursively expanded) content; anything
 *   this file can't safely resolve is left exactly as authored.
 */
function resolveIncludesInSource(source, originFile, catalog, logger, depth = 0) {
  if (depth > MAX_INCLUDE_DEPTH) {
    logger.warn(
      'A diagram block include:: chain exceeded the maximum include depth of %d; leaving the remaining include:: directive(s) as literal text — that diagram will miss the prewarm cache',
      MAX_INCLUDE_DEPTH
    )
    return source
  }
  const page = { src: originFile.src }
  const cursor = { dir: path.posix.dirname(originFile.path), file: undefined }
  const lines = source.split(NEWLINE_RX)
  const outLines = []
  for (const line of lines) {
    const m = INCLUDE_DIRECTIVE_RX.exec(line)
    if (!m || m[1]) {
      // not an include:: line at all, or an escaped `\include::` — Asciidoctor
      // itself renders the latter as literal text, unprocessed.
      outLines.push(line)
      continue
    }
    const target = m[2]
    const attrlist = m[3] || ''
    if (~target.indexOf('{')) {
      logger.warn(
        "Ignoring include::%s[%s] while prewarming a diagram — its target needs attribute substitution, which isn't possible this early in the build; that diagram will miss the prewarm cache",
        target,
        attrlist
      )
      outLines.push(line)
      continue
    }
    const attrs = parseIncludeAttrlist(attrlist)
    if (!attrs) {
      logger.warn(
        "Ignoring include::%s[%s] while prewarming a diagram — its attributes aren't all lines=/tag=/tags=/leveloffset=/opts=, so this couldn't safely mirror real conversion; that diagram will miss the prewarm cache",
        target,
        attrlist
      )
      outLines.push(line)
      continue
    }
    const resolved = resolveIncludeFile(target, page, cursor, catalog)
    if (!resolved) {
      logger.warn(
        'Could not resolve include::%s[%s] while prewarming a diagram (no such file in the content catalog); that diagram will miss the prewarm cache',
        target,
        attrlist
      )
      outLines.push(line)
      continue
    }
    let includeContent
    const linenums = getLines(attrs)
    if (linenums) {
      const [selected] = filterLinesByLineNumbers(resolved.contents, linenums.slice())
      includeContent = selected.join('\n')
    } else {
      const tags = getTags(attrs)
      if (tags) {
        const [selected] = filterLinesByTags(resolved.contents, new Map(tags), {
          onWarn: (msg) => logger.warn('%s (include::%s[%s])', msg, target, attrlist),
        })
        includeContent = selected.join('\n')
      } else {
        includeContent = resolved.contents
      }
    }
    // A resolved file's own trailing newline is a LINE TERMINATOR, not an
    // extra blank line — `resolved.contents` (or `selected.join('\n')` above,
    // when the last selected line happened to be the file's own final,
    // terminator-only artifact) ends in `\n` for virtually every real file
    // on disk. Left as-is, the recursive call below re-splits this same
    // string on NEWLINE_RX, which turns a trailing terminator into a
    // trailing EMPTY array element; that empty element then survives back
    // up as this whole include's own last "line" and gets its own `\n`
    // separator from the OUTER `outLines.join('\n')` below, on top of the
    // terminator this string already carries — doubling into a genuine
    // blank line at the include boundary that real Asciidoctor conversion
    // (which reads a file as its real lines, not as a blob with its own
    // trailing terminator to preserve) never produces. This bit real
    // sites immediately: two adjacent `include::` directives (or one
    // followed by more literal content) assembling a diagram from actual
    // files on disk — as opposed to this file's own unit tests' inline
    // string fixtures, none of which happened to carry a trailing
    // newline — permanently missed the prewarm cache for exactly that
    // shape. Stripping a single trailing terminator here, once, matches
    // real conversion instead of accumulating an extra one.
    includeContent = includeContent.replace(/\r\n?$|\n$/, '')
    outLines.push(
      resolveIncludesInSource(includeContent, { path: resolved.path, src: resolved.src }, catalog, logger, depth + 1)
    )
  }
  return outLines.join('\n')
}

async function fetchDiagram(type, source, format, logger) {
  try {
    const response = await fetch(KROKI_URL + '/' + type + '/' + format, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: source,
    })
    if (!response.ok) {
      logger.warn(
        'Kroki render failed for a %s diagram (%s): %s %s — falling back to raw source for it',
        type,
        format,
        response.status,
        response.statusText
      )
      return
    }
    if (format === 'png') {
      return Buffer.from(await response.arrayBuffer()).toString('base64')
    }
    return await response.text()
  } catch (err) {
    logger.warn(
      'Could not reach the Kroki service at %s to render a %s diagram (%s) — falling back to raw source for it',
      KROKI_URL,
      type,
      err.message
    )
  }
}

module.exports = function registerKrokiPrewarm(context, deps = {}) {
  const doEnsureKrokiRunning = deps.ensureKrokiRunning || ensureKrokiRunning
  context.on('contentClassified', async ({ contentCatalog, playbook }) => {
    const attributes = (playbook && playbook.asciidoc && playbook.asciidoc.attributes) || {}
    const logger = context.getLogger('docouture-kroki-prewarm')
    const enabledTypes = resolveEnabledTypes(attributes[ENABLED_ATTR], attributes[TYPES_ATTR], (unknown) =>
      logger.warn('Ignoring unknown %s entry "%s"; expected one of %s', TYPES_ATTR, unknown, SUPPORTED_TYPES.join(', '))
    )
    if (!enabledTypes.size) return

    // GH-44: no manual `docker compose up` step required — the first build
    // that actually needs Kroki starts it, on any of this feature's
    // invocation paths (CLI, justfile/nx, raw `antora`, a consumer's own
    // CI) equally, because this listener runs on all of them. See
    // kroki-docker.js's own header for why there's no matching teardown.
    await doEnsureKrokiRunning(KROKI_URL, playbook && playbook.dir, logger)

    const pattern = buildBlockPattern()
    // Deduplicated by kroki-instance.js's own key: the same diagram source
    // (and requested format) repeated across pages (or byte-identical after
    // a migration re-run) should cost one Kroki call, not one per
    // occurrence.
    const jobs = new Map()
    // `getFiles()` also yields `family: 'alias'` entries (redirects
    // registered by `registerPageAlias`/`addSplatAlias`) which have no
    // `.path` of their own at all — guard against those rather than just
    // the `.adoc` extension check.
    for (const file of contentCatalog.getFiles((candidate) => candidate.path && candidate.path.endsWith('.adoc'))) {
      const text = file.contents.toString('utf8')
      for (const { type, source: rawSource, format: requestedFormat } of extractDiagrams(text, pattern)) {
        if (!enabledTypes.has(type)) continue
        const format = resolveFormat(type, requestedFormat, (t, requested) =>
          logger.warn('Ignoring unsupported format "%s" for a %s diagram; falling back to svg', requested, t)
        )
        // GH-189: resolve any include:: directive in the block's own body
        // BEFORE anything else — this has to happen first, so the mermaid
        // theme transform and the cache key below are both computed from
        // the SAME real diagram source real conversion will hash.
        const source = resolveIncludesInSource(rawSource, { path: file.path, src: file.src }, contentCatalog, logger)
        // See kroki-mermaid-theme.js's own header: this has to be the
        // SAME transform kroki.js applies before computing its own
        // lookup key, or a prewarmed entry becomes unreachable from the
        // synchronous side.
        const effectiveSource = type === 'mermaid' ? applyDefaultMermaidTheme(source) : source
        const key = kroki.keyFor(type, effectiveSource, format)
        if (!jobs.has(key)) jobs.set(key, { type, source: effectiveSource, format })
      }
    }
    if (!jobs.size) return

    logger.info('Rendering %d diagram(s) via Kroki at %s', jobs.size, KROKI_URL)
    let rendered = 0
    await Promise.all(
      Array.from(jobs, async ([key, { type, source, format }]) => {
        const data = await fetchDiagram(type, source, format, logger)
        if (data) {
          kroki.set(key, { format, data })
          rendered++
        }
      })
    )
    if (rendered === jobs.size) {
      logger.info('Kroki rendered all %d diagram(s) successfully', jobs.size)
    } else {
      logger.warn(
        'Kroki rendered %d/%d diagram(s); %d fell back to raw source — see warnings above for why',
        rendered,
        jobs.size,
        jobs.size - rendered
      )
    }
  })
}
