// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// GH-15 (A9) follow-up: `video::target[youtube,640,360]`'s own `width`/
// `height` land as plain HTML attributes on the `<iframe>`/`<video>` tag
// (@asciidoctor/core's html5 converter, convert_video — verified against
// its own source: `width="${node.getAttribute('width')}"`, no unit, no
// clamping unlike a table's `width=` percentage). A browser does NOT derive
// `aspect-ratio` from an iframe's `width`/`height` attributes the way it
// does for `<img>`, so a CSS `max-width` alone would leave the element's
// height fixed in pixels regardless of the viewport, distorting the embed
// at any width narrower than its own attribute. There is no CSS-only fix —
// `aspect-ratio: attr(width) / attr(height)` is real syntax but Chrome-only
// (133+) and unsupported everywhere else as of writing — so this moves both
// numbers into an inline `style` as custom properties doc.css consumes,
// same mechanism as `table-width.js` + `table-container.js` one file over:
// a postprocessor scanning the ALREADY-CONVERTED html5 output, since the
// converter (hard-set by Antora, @antora/asciidoc-loader/lib/load-asciidoc.js)
// has no passthrough for an arbitrary attribute into an inline style.
//
// No separate tree processor needed here, unlike the table case: a table's
// own `width=` attribute gets CLAMPED by Asciidoctor's Table constructor
// before a postprocessor ever runs, so table-width.js has to read the RAW
// value at tree-processor time, before that happens. A video block's
// `width`/`height` are never touched by any such constructor — `doc`
// (handed to every postprocessor by @asciidoctor/core) is still fully
// queryable then, so `doc.findBy({ context: 'video' })` at postprocess time
// already returns the same un-clamped values a tree processor would.
//
// Author-facing effect: `video::x[youtube]` (no size) gets neither custom
// property, so doc.css's own fallback applies (full width, 16:9).
// `video::x[youtube,640,360]` caps the block at 640px and locks it to a
// correct 640:360 ratio at any narrower viewport; `video::x[youtube,640]`
// (width only) caps the width and leaves the ratio at doc.css's 16:9
// fallback.
const VIDEO_OPEN_RX = /<div((?:\s+id="[^"]*")?\s+class="videoblock\b[^"]*")>/g
const VALID_RX = /^\d+(?:\.\d+)?$/

function parseDimension(raw) {
  const trimmed = raw == null ? '' : String(raw).trim()
  return VALID_RX.test(trimmed) ? trimmed : null
}

function sizeVideos(html, sizes = []) {
  let result = ''
  let cursor = 0
  let match
  let videoIndex = -1
  while ((match = VIDEO_OPEN_RX.exec(html))) {
    videoIndex += 1
    const size = sizes[videoIndex]
    if (!size || (!size.width && !size.height)) continue

    const declarations = []
    if (size.width) declarations.push(`--video-max-width:${size.width}px`)
    if (size.width && size.height) {
      declarations.push(`--video-aspect-ratio:${size.width}/${size.height}`)
    }
    if (!declarations.length) continue

    result += html.slice(cursor, match.index)
    // Capture group 1 is not optional in VIDEO_OPEN_RX, so a match always
    // carries it — but `noUncheckedIndexedAccess` types every group past 0 as
    // possibly undefined, since it cannot know that. Cast rather than add a
    // runtime guard for a branch that cannot be reached.
    const attrs = /** @type {string} */ (match[1])
    const styledAttrs = /\sstyle="/.test(attrs)
      ? attrs.replace(/\sstyle="/, ` style="${declarations.join(';')};`)
      : `${attrs} style="${declarations.join(';')}"`
    result += `<div${styledAttrs}>`
    cursor = match.index + match[0].length
    VIDEO_OPEN_RX.lastIndex = cursor
  }
  result += html.slice(cursor)
  return result
}

module.exports = function registerVideoSize(registry) {
  registry.postprocessor(function () {
    this.process(function (doc, output) {
      const sizes = doc.findBy({ context: 'video' }).map((video) => ({
        width: parseDimension(video.getAttribute('width')),
        height: parseDimension(video.getAttribute('height')),
      }))
      return sizeVideos(output, sizes)
    })
  })
}

module.exports.sizeVideos = sizeVideos
