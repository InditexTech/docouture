'use strict'

import { describe, expect, it } from 'vitest'

import { resolveConfig } from './config-resolver.js'

describe('resolveConfig', () => {
  it('falls back to defaults when nothing else is provided', () => {
    expect(resolveConfig({ branch: 'main', message: 'deploy' })).toEqual({ branch: 'main', message: 'deploy' })
  })

  it('configured values win over defaults', () => {
    expect(resolveConfig({ branch: 'main' }, { branch: 'gh-pages' })).toEqual({ branch: 'gh-pages' })
  })

  it('flags win over configured values, which win over defaults', () => {
    expect(
      resolveConfig({ branch: 'main', message: 'a' }, { branch: 'gh-pages', message: 'b' }, { message: 'c' })
    ).toEqual({
      branch: 'gh-pages',
      message: 'c',
    })
  })

  it('never lets an explicit undefined in a higher-precedence layer erase a lower one', () => {
    expect(resolveConfig({ branch: 'main' }, { branch: undefined }, { branch: undefined })).toEqual({
      branch: 'main',
    })
  })
})
