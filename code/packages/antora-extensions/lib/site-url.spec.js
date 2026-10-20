// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it } from 'vitest'

const siteUrlParts = require('./site-url')

describe('siteUrlParts', () => {
  it('full URL with path', () => {
    expect(siteUrlParts('https://inditextech.github.io/docouture')).toEqual({
      pathPrefix: '/docouture',
      baseUrl: 'https://inditextech.github.io/docouture',
    })
  })
  it('strips trailing slash', () => {
    expect(siteUrlParts('https://h.io/a/b/')).toEqual({ pathPrefix: '/a/b', baseUrl: 'https://h.io/a/b' })
  })
  it('root URL', () => {
    expect(siteUrlParts('https://docs.example.com/')).toEqual({ pathPrefix: '', baseUrl: 'https://docs.example.com' })
  })
  it('path-only', () => {
    expect(siteUrlParts('/docs/')).toEqual({ pathPrefix: '/docs', baseUrl: '' })
    expect(siteUrlParts('/')).toEqual({ pathPrefix: '', baseUrl: '' })
  })
  it('absent or invalid', () => {
    expect(siteUrlParts(undefined)).toEqual({ pathPrefix: '', baseUrl: '' })
    expect(siteUrlParts('nonsense')).toEqual({ pathPrefix: '', baseUrl: '' })
  })
})
