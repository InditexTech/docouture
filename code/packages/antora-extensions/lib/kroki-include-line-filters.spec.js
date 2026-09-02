// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it } from 'vitest'

const { getLines, getTags, filterLinesByLineNumbers, filterLinesByTags } = require('./kroki-include-line-filters')

describe('getLines', () => {
  it('returns undefined when lines is not present at all', () => {
    expect(getLines({})).toBeUndefined()
  })

  it('returns undefined when lines is present but an empty string (no entries to filter at all)', () => {
    expect(getLines({ lines: '' })).toBeUndefined()
  })

  it('returns an empty array when every entry parses to nothing selectable (line 0 is never valid)', () => {
    expect(getLines({ lines: '0' })).toEqual([])
  })

  it('parses a mix of single numbers, comma-separated lists and ranges', () => {
    expect(getLines({ lines: '1..3,8,5..6' })).toEqual([1, 2, 3, 5, 6, 8])
  })

  it('parses a semicolon-separated list', () => {
    expect(getLines({ lines: '1;3;5' })).toEqual([1, 3, 5])
  })

  it('dedupes and sorts overlapping ranges', () => {
    expect(getLines({ lines: '1..3,2..4' })).toEqual([1, 2, 3, 4])
  })

  it('treats an open-ended range (N..-1) as N and Infinity', () => {
    expect(getLines({ lines: '3..-1' })).toEqual([3, Infinity])
  })
})

describe('filterLinesByLineNumbers', () => {
  const content = ['one', 'two', 'three', 'four', 'five'].join('\n')

  it('selects only the requested line numbers', () => {
    const [lines, startLineNum] = filterLinesByLineNumbers(content, getLines({ lines: '1,3' }))
    expect(lines).toEqual(['one', 'three'])
    expect(startLineNum).toBe(1)
  })

  it('selects a contiguous range', () => {
    const [lines] = filterLinesByLineNumbers(content, getLines({ lines: '2..4' }))
    expect(lines).toEqual(['two', 'three', 'four'])
  })

  it('selects everything from an open-ended range to EOF', () => {
    const [lines, startLineNum] = filterLinesByLineNumbers(content, getLines({ lines: '3..-1' }))
    expect(lines).toEqual(['three', 'four', 'five'])
    expect(startLineNum).toBe(3)
  })
})

describe('getTags', () => {
  it('returns undefined when neither tag nor tags is present', () => {
    expect(getTags({})).toBeUndefined()
  })

  it('parses a single positive tag', () => {
    expect(getTags({ tag: 'foo' })).toEqual(new Map([['foo', true]]))
  })

  it('parses a single negated tag', () => {
    expect(getTags({ tag: '!foo' })).toEqual(new Map([['foo', false]]))
  })

  it('parses a semicolon-separated tags list with a negated entry', () => {
    expect(getTags({ tags: 'a;!b' })).toEqual(
      new Map([
        ['a', true],
        ['b', false],
      ])
    )
  })
})

describe('filterLinesByTags', () => {
  function fixture() {
    return [
      'intro line',
      'tag::keep[]',
      'kept line',
      'end::keep[]',
      'tag::drop[]',
      'dropped line',
      'end::drop[]',
      'outro line',
    ].join('\n')
  }

  it('selects only the lines inside a requested tag region', () => {
    const [lines] = filterLinesByTags(fixture(), getTags({ tag: 'keep' }))
    expect(lines).toEqual(['kept line'])
  })

  it('selects everything outside an excluded (negated) tag when no positive tag is given', () => {
    // GH-189: the default when only negated tags are requested is to select
    // everything NOT inside one of them — matches Asciidoctor's own
    // tags=!drop semantics.
    const [lines] = filterLinesByTags(fixture(), getTags({ tags: '!drop' }))
    expect(lines).toEqual(['intro line', 'kept line', 'outro line'])
  })

  it('supports nested tag regions', () => {
    const content = [
      'tag::outer[]',
      'outer start',
      'tag::inner[]',
      'inner content',
      'end::inner[]',
      'outer end',
      'end::outer[]',
    ].join('\n')
    const [outerOnly] = filterLinesByTags(content, getTags({ tag: 'outer' }))
    expect(outerOnly).toEqual(['outer start', 'inner content', 'outer end'])
    const [innerOnly] = filterLinesByTags(content, getTags({ tag: 'inner' }))
    expect(innerOnly).toEqual(['inner content'])
  })

  it('warns once for a requested tag never found in the content, via onWarn', () => {
    const warnings = []
    filterLinesByTags(fixture(), getTags({ tag: 'nope' }), { onWarn: (msg) => warnings.push(msg) })
    expect(warnings.some((msg) => msg.includes("tag 'nope' not found"))).toBe(true)
  })

  it('warns for an unclosed tag left open at EOF, via onWarn', () => {
    const warnings = []
    const content = ['tag::keep[]', 'kept line'].join('\n')
    filterLinesByTags(content, getTags({ tag: 'keep' }), { onWarn: (msg) => warnings.push(msg) })
    expect(warnings.some((msg) => msg.includes("unclosed tag 'keep'"))).toBe(true)
  })

  it('warns for a mismatched end tag, via onWarn', () => {
    const warnings = []
    const content = ['tag::a[]', 'tag::b[]', 'end::a[]', 'end::b[]'].join('\n')
    filterLinesByTags(content, getTags({ tags: 'a;b' }), { onWarn: (msg) => warnings.push(msg) })
    expect(warnings.some((msg) => msg.includes('mismatched end tag'))).toBe(true)
  })

  it('defaults to excluding everything when a wildcard (*) is not the sole/first requested tag', () => {
    // globstar (**) is absent, star (*) is present, and the first key
    // inserted into the tags map is not '*' itself ('a' was named first) —
    // both are independently sufficient to force selectingDefault = false.
    const content = ['tag::a[]', 'kept', 'end::a[]', 'tag::c[]', 'unlisted-tag line', 'end::c[]', 'outro'].join('\n')
    const [lines] = filterLinesByTags(content, getTags({ tags: 'a,*' }))
    // 'outro' (outside every tag) is excluded — the false selectingDefault —
    // while 'c', an unlisted tag, still falls through to the wildcard (true).
    expect(lines).toEqual(['kept', 'unlisted-tag line'])
  })

  it('applies the wildcard to a tag directive that names neither a listed tag nor */**', () => {
    const content = ['tag::unlisted[]', 'wildcard-selected line', 'end::unlisted[]'].join('\n')
    const [selected] = filterLinesByTags(content, getTags({ tags: 'keep,*' }))
    expect(selected).toEqual(['wildcard-selected line'])
    const [excluded] = filterLinesByTags(content, getTags({ tags: 'keep,!*' }))
    expect(excluded).toEqual([])
  })
})
