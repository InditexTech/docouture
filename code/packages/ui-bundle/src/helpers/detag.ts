import type { HelperOptions } from '../../types/ui'

const TAG_ALL_RX = /<[^>]+>/g
const QUOT_RX = /"/g

/**
 * `{{detag html}}` — strip every HTML tag from a string.
 *
 * With `attribute=true` the result is additionally escaped so it is safe to
 * interpolate into an HTML attribute value.
 */
const detag = (html: string | undefined, options: HelperOptions): string | undefined => {
  if (!html) return html
  const stripped = html.replace(TAG_ALL_RX, '')
  return options.hash.attribute ? stripped.replace(QUOT_RX, '&quot;') : stripped
}

export = detag
