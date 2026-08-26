'use strict'

import { describe, expect, it } from 'vitest'

import { filterObservableAntoraLog } from './antora-log.js'

describe('filterObservableAntoraLog', () => {
  it('keeps warn and error lines regardless of logger name', () => {
    const input = [
      '{"level":"info","name":"antora","msg":"loading content"}',
      '{"level":"warn","name":"asciidoctor","msg":"broken xref"}',
      '{"level":"error","name":"antora","msg":"boom"}',
    ].join('\n')

    expect(filterObservableAntoraLog(input)).toBe(
      [
        '{"level":"warn","name":"asciidoctor","msg":"broken xref"}',
        '{"level":"error","name":"antora","msg":"boom"}',
      ].join('\n')
    )
  })

  it('keeps any docouture-* named logger line regardless of level', () => {
    const input = [
      '{"level":"info","name":"antora","msg":"unrelated Antora chatter"}',
      '{"level":"info","name":"docouture-search-index","msg":"weavejs: 451 pages, 2025 records"}',
      '{"level":"info","name":"docouture-kroki-prewarm","msg":"Kroki service already reachable"}',
    ].join('\n')

    const result = filterObservableAntoraLog(input)
    expect(result).toContain('docouture-search-index')
    expect(result).toContain('docouture-kroki-prewarm')
    expect(result).not.toContain('unrelated Antora chatter')
  })

  it('returns an empty string when nothing qualifies', () => {
    const input = [
      '{"level":"info","name":"antora","msg":"loading content"}',
      '{"level":"debug","name":"antora","msg":"x"}',
    ].join('\n')

    expect(filterObservableAntoraLog(input)).toBe('')
  })
})
