// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Handlebars from 'handlebars'
import { beforeAll, describe, expect, it } from 'vitest'
import and from '../helpers/and'
import detag from '../helpers/detag'
import eq from '../helpers/eq'
import icon from '../helpers/icon'
import increment from '../helpers/increment'
import or from '../helpers/or'
import split from '../helpers/split'

// Renders the real partials through the real helpers: the escaping contract
// (Antora-supplied text is already escaped, playbook/descriptor text is raw)
// lives in the templates' `{{ }}` vs `{{{ }}}` choice, which no helper spec sees.

const PARTIALS = join(__dirname)
const hbs = Handlebars.create()

const read = (name: string): string => readFileSync(join(PARTIALS, `${name}.hbs`), 'utf8')

function render(partial: string, context: Record<string, unknown>): string {
  const template = hbs.compile(`{{> ${partial}}}`)
  return template({ site: {}, ...context })
}

beforeAll(() => {
  hbs.registerHelper({
    and,
    detag,
    eq,
    icon,
    increment,
    or,
    split,
    relativize: (to: string) => to,
    resolvePageURL: () => undefined,
    resolveResourceURL: (to: string) => to,
  })
  for (const name of ['hero', 'home-hero', 'nav-tree', 'search-dialog']) hbs.registerPartial(name, read(name))
  hbs.registerPartial('breadcrumbs', '')
})

const noDoubleEscape = (html: string): void => {
  expect(html).not.toContain('&amp;amp;')
  expect(html).not.toContain('&amp;lt;')
  expect(html).not.toContain('&amp;gt;')
}

describe('hero', () => {
  const page = {
    title: 'Title',
    description: 'Draw &amp; edit text on the canvas',
    attributes: {
      tags: 'R&amp;D, Beta',
      action: 'Q&amp;A',
      'action-url': 'https://example.org',
      'action-secondary': 'Fish &amp; Chips',
      'action-secondary-url': 'https://example.org/2',
    },
  }

  it('renders the excerpt escaped once', () => {
    const html = render('hero', { page })
    expect(html).toContain('>Draw &amp; edit text on the canvas</p>')
    noDoubleEscape(html)
  })

  it('strips tags from the excerpt', () => {
    const html = render('hero', { page: { ...page, description: '<strong>bold</strong> text' } })
    expect(html).toContain('>bold text</p>')
    expect(html).not.toContain('<strong>')
  })

  it('renders tags and both action labels escaped once', () => {
    const html = render('hero', { page })
    expect(html).toContain('<span class="dt-label__content">R&amp;D</span>')
    expect(html).toContain('>Q&amp;A</span>')
    expect(html).toContain('>Fish &amp; Chips</span>')
    noDoubleEscape(html)
  })

  it('keeps escaped angle brackets from the description as entities', () => {
    const html = render('hero', { page: { ...page, description: 'a &lt;b&gt; c' } })
    expect(html).toContain('>a &lt;b&gt; c</p>')
    noDoubleEscape(html)
  })
})

describe('home-hero', () => {
  const page = {
    title: 'Home',
    attributes: {
      tags: 'R&amp;D',
      action: 'Q&amp;A',
      'action-url': 'https://example.org',
      'action-secondary': 'Fish &amp; Chips',
      'action-secondary-url': 'https://example.org/2',
    },
  }

  it('renders tags and action labels escaped once', () => {
    const html = render('home-hero', { page, site: { title: 'Site' } })
    expect(html).toContain('<span class="dt-label__content">R&amp;D</span>')
    expect(html).toContain('>Q&amp;A')
    expect(html).toContain('>Fish &amp; Chips')
    noDoubleEscape(html)
  })

  it('escapes the raw site title once', () => {
    const html = render('home-hero', { page, site: { title: 'R&D <Docs>' } })
    expect(html).toContain('<h1 class="home-hero__title">R&amp;D &lt;Docs&gt;</h1>')
  })
})

describe('nav-tree', () => {
  it('escapes the toggle aria-label once and strips markup', () => {
    const navigation = [
      { content: 'R&amp;D <em>&quot;x&quot;</em>', url: '/a', urlType: 'internal', items: [{ content: 'Child', url: '/b', urlType: 'internal' }] },
    ]
    const html = render('nav-tree', { navigation, page: { url: '/' } })
    expect(html).toContain('aria-label="Toggle R&amp;D &quot;x&quot;"')
    noDoubleEscape(html)
  })
})

describe('search-dialog', () => {
  it('escapes a raw module title once in the chip label', () => {
    const page = {
      componentVersion: { searchIndex: '/search/index.json' },
      navigation: [
        { module: 'a', title: 'A <B> & C', startUrl: '/a' },
        { module: 'b', title: 'Plain', startUrl: '/b' },
      ],
    }
    const html = render('search-dialog', { page })
    expect(html).toContain('<span class="dt-tag__label">A &lt;B&gt; &amp; C</span>')
    noDoubleEscape(html)
  })
})
