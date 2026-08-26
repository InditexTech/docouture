'use strict'

import { describe, expect, it } from 'vitest'

import { parseArgs } from './args.js'

describe('parseArgs', () => {
  it('collects positionals', () => {
    expect(parseArgs(['a', 'b']).positional).toEqual(['a', 'b'])
  })

  it('reads a value flag', () => {
    expect(parseArgs(['--dir', '/tmp']).flags).toEqual({ dir: '/tmp' })
  })

  it('treats a flag with no following value as boolean true', () => {
    expect(parseArgs(['--dry-run']).flags).toEqual({ 'dry-run': true })
  })

  it('does not swallow the next flag as a value', () => {
    expect(parseArgs(['--dry-run', '--json']).flags).toEqual({ 'dry-run': true, json: true })
  })
})
