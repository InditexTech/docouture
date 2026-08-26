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
// job, which hasn't run yet). So it works off the RAW content instead:
// `contentAggregated` fires with every source file's contents still a plain
// Buffer, before Antora classifies anything into pages — the same point
// nav-modules.js reads a component descriptor's own unknown keys before
// classification discards them (see that file's header for the citation on
// event ordering).
//
// `kroki-enabled` and `kroki-diagram-types` are read off the PLAYBOOK here
// (`playbook.asciidoc.attributes`), not off any one document — there is no
// AsciiDoc document yet at this point in the pipeline. kroki-config.js's
// `resolveEnabledTypes` is shared with kroki.js specifically so the two
// never disagree about what "enabled" means from two different attribute
// shapes (a raw playbook value here, `Document#getAttribute` there).
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

// Matches the exact shape kroki.js intercepts: a `[type]` (optionally
// `,format=<anything>` — deliberately not restricted to `svg|png` here;
// `resolveFormat` is the one place both this file and kroki.js validate the
// value, so a typo (`format=jpeg`) is caught and warned about the same way
// on both sides, rather than this regex silently failing to match the
// whole block and this file treating it as not a diagram at all while
// kroki.js's own Asciidoctor-parsed `attrs.format` still sees it) style
// line immediately followed by a four-dot-delimited LITERAL block. Built
// from `SUPPORTED_TYPES` rather than a bare `\w+`, so a block styled with
// some other, unsupported name (or a coincidental four-dot block that
// isn't a diagram at all) is never sent to Kroki on a guess. Tolerant of
// `\r\n` line endings and of trailing whitespace on the delimiter lines —
// real-world authoring and git checkout settings both produce those — but
// otherwise matches `tools/fumadocs-migrate/lib/emit.mjs`'s own emitted
// shape verbatim, since that's the one real caller of this today (which
// never emits `format=`).
function buildBlockPattern() {
  const typeAlternation = SUPPORTED_TYPES.map((type) => type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  return new RegExp(
    '^\\[(' +
      typeAlternation +
      ')(?:,\\s*format\\s*=\\s*([a-zA-Z0-9_-]*)\\s*)?\\]\\r?\\n\\.\\.\\.\\.[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n\\.\\.\\.\\.[ \\t]*$',
    'gm'
  )
}

/** Every `(type, source, format)` triple found in one file's raw contents. */
function extractDiagrams(text, pattern) {
  const found = []
  pattern.lastIndex = 0
  let match
  while ((match = pattern.exec(text))) {
    found.push({ type: match[1], format: match[2], source: match[3] })
  }
  return found
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
  context.on('contentAggregated', async ({ contentAggregate, playbook }) => {
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
    for (const bucket of contentAggregate) {
      for (const file of bucket.files || []) {
        if (!file.path || !file.path.endsWith('.adoc')) continue
        const text = file.contents.toString('utf8')
        for (const { type, source, format: requestedFormat } of extractDiagrams(text, pattern)) {
          if (!enabledTypes.has(type)) continue
          const format = resolveFormat(type, requestedFormat, (t, requested) =>
            logger.warn('Ignoring unsupported format "%s" for a %s diagram; falling back to svg', requested, t)
          )
          // See kroki-mermaid-theme.js's own header: this has to be the
          // SAME transform kroki.js applies before computing its own
          // lookup key, or a prewarmed entry becomes unreachable from the
          // synchronous side.
          const effectiveSource = type === 'mermaid' ? applyDefaultMermaidTheme(source) : source
          const key = kroki.keyFor(type, effectiveSource, format)
          if (!jobs.has(key)) jobs.set(key, { type, source: effectiveSource, format })
        }
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
