// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import icon from './icon'
import type { HelperOptions } from '../../types/ui'

function options(hash: Record<string, unknown> = {}, uiRootPath?: string): HelperOptions {
  return {
    hash,
    data: { root: { site: {}, page: { url: '/' }, uiRootPath } },
  } as unknown as HelperOptions
}

describe('icon', () => {
  it('renders a decorative (aria-hidden) svg referencing the vendored sprite', () => {
    const html = String(icon('triangle-alert', options()))
    expect(html).toContain('class="dt-icon"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('focusable="false"')
    expect(html).toContain('href="./img/icons.svg#icon-triangle-alert"')
    expect(html).not.toContain('role="img"')
    expect(html).not.toContain('<title>')
  })

  it('uses the site uiRootPath when given', () => {
    const html = String(icon('x', options({}, '/docs')))
    expect(html).toContain('href="/docs/img/icons.svg#icon-x"')
  })

  it('appends an extra class from hash.class', () => {
    const html = String(icon('x', options({ class: 'toolbar__icon' })))
    expect(html).toContain('class="dt-icon toolbar__icon"')
  })

  it('ignores a non-string hash.class', () => {
    const html = String(icon('x', options({ class: 42 })))
    expect(html).toContain('class="dt-icon"')
  })

  it('renders role=img and a <title> when hash.label is given, dropping aria-hidden', () => {
    const html = String(icon('panel-left', options({ label: 'On this page' })))
    expect(html).toContain('role="img"')
    expect(html).not.toContain('aria-hidden')
    expect(html).toContain('<title>On this page</title>')
  })

  it('escapes special characters in an attribute value', () => {
    const html = String(icon('x', options({ class: '"><script>' })))
    expect(html).toContain('&quot;&gt;&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('escapes special characters in a label used as text content', () => {
    const html = String(icon('x', options({ label: 'A & B <x>' })))
    expect(html).toContain('<title>A &amp; B &lt;x&gt;</title>')
  })

  it('throws for a name that is not lowercase hyphen-separated', () => {
    expect(() => icon('Not_Valid', options())).toThrow(/Invalid icon reference/)
  })

  it('returns a Handlebars-safe-string-shaped object (toHTML/toString both return the markup)', () => {
    const result = icon('x', options()) as unknown as { toHTML: () => string; toString: () => string }
    expect(result.toHTML()).toBe(result.toString())
  })
})
