import type { HelperOptions } from '../../types/ui'

const TAG_ALL_RX = /<[^>]+>/g
const QUOT_RX = /"/g

// A single non-recursive `.replace(TAG_ALL_RX, '')` pass can be bypassed by
// overlapping/nested angle brackets — e.g. stripping the inner tag out of
// `<scr<script>ipt>` can leave a well-formed `<script>` behind, since the
// first pass only ever removes the leftmost, shortest match. Looping to a
// fixed point (stop once a pass changes nothing) is what CodeQL's
// js/incomplete-multi-character-sanitization expects here.
function stripTags(html: string): string {
  let previous: string
  let current = html
  do {
    previous = current
    current = previous.replace(TAG_ALL_RX, '')
  } while (current !== previous)
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
  return options.hash.attribute ? stripped.replace(QUOT_RX, '&quot;') : stripped
}

export = detag
