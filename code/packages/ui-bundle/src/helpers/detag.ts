// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: MPL-2.0

import type { HelperOptions } from '../../types/ui'

const TAG_ALL_RX = /<[^>]+>/g
const QUOT_RX = /"/g

// A single non-recursive `.replace(TAG_ALL_RX, '')` pass can be bypassed by
// overlapping/nested angle brackets — e.g. stripping the inner tag out of
// `<scr<script>ipt>` can leave a well-formed `<script>` behind, since the
// first pass only ever removes the leftmost, shortest match. Looping to a
// fixed point (stop once a pass changes nothing) is what CodeQL's
// js/incomplete-multi-character-sanitization expects here.
//
// Capped rather than unbounded: each pass removes at least one tag, so
// nesting depth (not input length) bounds how many passes a real page ever
// needs — legitimate content never comes close to this cap. Bounding it
// anyway turns adversarially-deep nesting from O(n) passes over an
// already-large string (quadratic overall) into a fixed, constant amount of
// extra work, rather than relying on realistic content alone to keep this
// fast.
const MAX_STRIP_PASSES = 100

function stripTags(html: string): string {
  let previous: string
  let current = html
  let passes = 0
  do {
    previous = current
    current = previous.replace(TAG_ALL_RX, '')
    passes += 1
  } while (current !== previous && passes < MAX_STRIP_PASSES)
  return current
}

/**
 * `{{detag html}}` — strip every HTML tag from a string.
 *
 * With `attribute=true` the result is additionally escaped so it is safe to
 * interpolate into an HTML attribute value.
 */
const detag = (html: string | undefined, options: HelperOptions): string | undefined => {
  if (!html) return html
  const stripped = stripTags(html)
  return options.hash.attribute ? stripped.replaceAll(QUOT_RX, '&quot;') : stripped
}

export = detag
