// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it } from 'vitest'

const registerSearchIndex = require('./search-index')

function createContext() {
  const listeners = {}
  const logs = { info: [], warn: [] }
  return {
    logs,
    getLogger: () => ({
      info: (...args) => logs.info.push(args),
      warn: (...args) => logs.warn.push(args),
    }),
    on(event, fn) {
      ;(listeners[event] ||= []).push(fn)
    },
    async emit(event, payload) {
      for (const fn of listeners[event] || []) await fn(payload)
    },
  }
}

function createPage({ component = 'test-docs', version = '', module: mod = 'ROOT', url, title, html }) {
  return {
    out: true,
    src: { component, version, module: mod },
    pub: { url },
    asciidoc: { doctitle: title, attributes: {} },
    contents: Buffer.from(html || `<h2 id="x">Section</h2><p>Body text.</p>`),
  }
}

function createContentCatalog(components, pages) {
  return {
    getComponents: () => components,
    getPages: (filterFn) => pages.filter(filterFn),
  }
}

async function run({ components, pages, siteUrl }) {
  const context = createContext()
  registerSearchIndex(context)

  const contentCatalog = createContentCatalog(components, pages)
  const files = []
  const siteCatalog = { addFile: (f) => files.push(f) }
  const playbook = { ui: {}, ...(siteUrl ? { site: { url: siteUrl } } : {}) }

  await context.emit('navigationBuilt', { contentCatalog, siteCatalog, playbook })

  return { files, logs: context.logs }
}

describe('registerSearchIndex feedback', () => {
  it('logs a per-component-version summary and a site-wide total', async () => {
    const componentVersion = { name: 'test-docs', version: '', title: 'Test Docs', navigation: [] }
    const component = { versions: [componentVersion] }
    const pages = [createPage({ url: '/test-docs/index.html', title: 'Home' })]

    const { files, logs } = await run({ components: [component], pages })

    expect(files).toHaveLength(1)
    expect(logs.info).toContainEqual([
      '%s: %s pages, %s search records -> %s',
      'test-docs@default',
      1,
      1,
      '_/search/test-docs.json',
    ])
    expect(logs.info).toContainEqual(['search index totals: %s pages, %s records, %s index file(s) written', 1, 1, 1])
    expect(logs.warn).toHaveLength(0)
  })

  it('warns, instead of silently skipping, when a component version produces no search records', async () => {
    const componentVersion = { name: 'empty-docs', version: '', title: 'Empty Docs', navigation: [] }
    const component = { versions: [componentVersion] }

    const { files, logs } = await run({ components: [component], pages: [] })

    expect(files).toHaveLength(0)
    expect(logs.warn).toHaveLength(1)
    expect(logs.warn[0].join(' ')).toContain('empty-docs@default')
    expect(logs.warn[0].join(' ')).toContain('no search index written')
  })

  it('accumulates totals across multiple component versions', async () => {
    const versionA = { name: 'a', version: '', title: 'A', navigation: [] }
    const versionB = { name: 'b', version: '', title: 'B', navigation: [] }
    const components = [{ versions: [versionA] }, { versions: [versionB] }]
    const pages = [
      createPage({ component: 'a', url: '/a/index.html', title: 'A Home' }),
      createPage({ component: 'b', url: '/b/index.html', title: 'B Home' }),
    ]

    const { files, logs } = await run({ components, pages })

    expect(files).toHaveLength(2)
    const totalsLine = logs.info.find((args) => args[0].startsWith('search index totals'))
    expect(totalsLine).toEqual(['search index totals: %s pages, %s records, %s index file(s) written', 2, 2, 2])
    expect(logs.warn).toHaveLength(0)
  })
})

describe('registerSearchIndex site.url path', () => {
  const setup = () => {
    const componentVersion = { name: 'd', version: '', title: 'D', navigation: [] }
    return {
      components: [{ versions: [componentVersion] }],
      pages: [createPage({ component: 'd', url: '/d/faq/', title: 'FAQ' })],
    }
  }
  const urls = (files) => JSON.parse(files[0].contents.toString()).records.map((r) => r.url)

  it('prefixes the site path', async () => {
    const { files } = await run({ ...setup(), siteUrl: 'https://o.github.io/repo' })
    expect(urls(files)).toEqual(['/repo/d/faq/#x'])
  })
  it('adds no prefix for a root site.url', async () => {
    const { files } = await run({ ...setup(), siteUrl: 'https://docs.example.com/' })
    expect(urls(files)).toEqual(['/d/faq/#x'])
  })
  it('adds no prefix without site.url', async () => {
    const { files } = await run(setup())
    expect(urls(files)).toEqual(['/d/faq/#x'])
  })
})
