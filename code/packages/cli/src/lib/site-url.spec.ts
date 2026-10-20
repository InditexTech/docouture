// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'

import { normalizeSiteUrl, siteUrlLine } from './site-url.js'

describe('normalizeSiteUrl', () => {
  it('accepts an https URL unchanged', () => {
    expect(normalizeSiteUrl('https://docs.example.com')).toEqual({ ok: true, value: 'https://docs.example.com' })
  })
  it('strips trailing slashes and whitespace', () => {
    expect(normalizeSiteUrl(' https://a.github.io/repo/ ')).toEqual({ ok: true, value: 'https://a.github.io/repo' })
  })
  it('treats empty as skip', () => {
    expect(normalizeSiteUrl('  ')).toEqual({ ok: true, value: undefined })
  })
  it.each(['docs.example.com', 'ftp://x', 'https://'])('rejects %s', (raw) => {
    expect(normalizeSiteUrl(raw).ok).toBe(false)
  })
})

describe('siteUrlLine', () => {
  it('renders an active url line', () => {
    expect(siteUrlLine('https://x.io/r')).toBe('  url: https://x.io/r\n')
  })
  it('renders the commented hint when unknown', () => {
    expect(siteUrlLine(undefined)).toBe('  # url: https://<org>.github.io/<repo>\n')
  })
})
