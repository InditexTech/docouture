// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import detag from './detag'
import type { HelperOptions } from '../../types/ui'

function options(hash: Record<string, unknown> = {}): HelperOptions {
  return { hash } as HelperOptions
}

describe('detag', () => {
  it('returns the input unchanged for an empty/undefined value', () => {
    expect(detag(undefined, options())).toBeUndefined()
    expect(detag('', options())).toBe('')
  })

  it('strips a single well-formed tag', () => {
    expect(detag('<strong>bold</strong>', options())).toBe('bold')
  })

  it('strips every tag from a run of mixed inline markup', () => {
    expect(detag('<em>Link <strong>bold</strong> &amp; co</em>', options())).toBe('Link bold &amp; co')
  })

  it('loops to a fixed point rather than stopping after one pass', () => {
    // A single pass only ever removes the leftmost, greedy `<...>` match —
    // this locks in that stripTags keeps looping until nothing changes,
    // rather than assuming one pass is always enough.
    expect(detag('<scr<script>ipt>', options())).toBe('ipt>')
    expect(detag('<a><b><c>text</c></b></a>', options())).toBe('text')
  })

  it('does not escape the result when attribute is not requested', () => {
    expect(detag('<b>He said "hi"</b>', options())).toBe('He said "hi"')
  })

  it('escapes quotes in the stripped result when hash.attribute is set', () => {
    expect(detag('<b>He said "hi"</b>', options({ attribute: true }))).toBe('He said &quot;hi&quot;')
  })

  it('escapes every quote, not just the first, when hash.attribute is set', () => {
    expect(detag('"a" and "b"', options({ attribute: true }))).toBe('&quot;a&quot; and &quot;b&quot;')
  })
})
