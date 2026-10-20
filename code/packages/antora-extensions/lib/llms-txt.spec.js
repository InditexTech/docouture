// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it, vi } from 'vitest'

const registerLlmsTxt = require('./llms-txt')

function createContext(logger = { warn: () => {}, error: () => {}, info: () => {} }) {
  const listeners = {}
  return {
    getLogger: () => logger,
    on(event, fn) {
      ;(listeners[event] ||= []).push(fn)
    },
    async emit(event, payload) {
      for (const fn of listeners[event] || []) await fn(payload)
    },
  }
}

function createPage({ module: mod, relative, url, title, description, html, layout }) {
  return {
    out: true,
    src: { component: 'weavejs', version: '', module: mod, relative },
    pub: { url },
    asciidoc: {
      doctitle: title,
      attributes: { description, ...(layout ? { 'page-layout': layout } : {}) },
    },
    contents: Buffer.from(html || '<p>Body</p>'),
  }
}

function createContentCatalog(componentVersion, pages) {
  return {
    getComponents: () => [{ versions: [componentVersion] }],
    getPages: (filterFn) => pages.filter(filterFn),
    resolvePage(spec, context) {
      const parts = spec.split(':')
      const relative = parts.pop()
      const mod = parts.pop() || context.module
      const page = pages.find(
        (p) =>
          p.src.component === context.component &&
          p.src.version === context.version &&
          p.src.module === mod &&
          p.src.relative === relative
      )
      return page ? { pub: page.pub } : undefined
    },
  }
}

async function run({ llms, navigation, pages, logger, siteUrl }) {
  const context = createContext(logger)
  registerLlmsTxt(context)

  const componentVersion = {
    name: 'weavejs',
    version: '',
    title: 'Weave.js',
    navigation: navigation || [],
  }
  const contentCatalog = createContentCatalog(componentVersion, pages)
  const files = []
  const siteCatalog = { addFile: (f) => files.push(f) }
  const playbook = { site: { title: 'Weave.js', url: siteUrl }, ui: {} }

  await context.emit('contentAggregated', {
    contentAggregate: llms ? [{ name: 'weavejs', version: '', llms }] : [],
  })
  await context.emit('navigationBuilt', { contentCatalog, siteCatalog, playbook })

  const llmsTxt = files.find((f) => f.out.path === 'llms.txt').contents.toString()
  const llmsFullTxt = files.find((f) => f.out.path === 'llms-full.txt').contents.toString()
  return { llmsTxt, llmsFullTxt, files }
}

describe('registerLlmsTxt', () => {
  it('builds an index grouped by nav module, with the summary as a blockquote', async () => {
    const pages = [
      createPage({
        module: 'main',
        relative: 'index.adoc',
        url: '/weavejs/main/index.html',
        title: 'Getting Started',
        description: 'How to start',
        html: '<h2 id="x">Sub</h2><p>Hello world</p>',
      }),
    ]
    const { llmsTxt, llmsFullTxt } = await run({
      llms: { summary: 'The visual collaborative apps framework.' },
      navigation: [{ module: 'main', title: 'Framework' }],
      pages,
    })

    expect(llmsTxt).toContain('# Weave.js')
    expect(llmsTxt).toContain('> The visual collaborative apps framework.')
    expect(llmsTxt).toContain('## Framework')
    expect(llmsTxt).toContain('- [Getting Started](/weavejs/main/index.html): How to start')

    expect(llmsFullTxt).toContain('# Getting Started')
    expect(llmsFullTxt).toContain('Source: /weavejs/main/index.html')
    expect(llmsFullTxt).toContain('## Sub')
    expect(llmsFullTxt).toContain('Hello world')
  })

  it('falls back to the component title when no nav_modules metadata is present', async () => {
    const pages = [createPage({ module: 'ROOT', relative: 'index.adoc', url: '/weavejs/index.html', title: 'Home' })]
    const { llmsTxt } = await run({ pages })

    expect(llmsTxt).toContain('## Weave.js')
    expect(llmsTxt).not.toContain('>') // no summary declared, no blockquote line
  })

  it('drops excluded pages from both files', async () => {
    const pages = [
      createPage({
        module: 'main',
        relative: 'index.adoc',
        url: '/weavejs/main/index.html',
        title: 'Getting Started',
      }),
      createPage({
        module: 'main',
        relative: 'secret.adoc',
        url: '/weavejs/main/secret.html',
        title: 'Secret',
      }),
    ]
    const { llmsTxt, llmsFullTxt } = await run({
      llms: { exclude: ['main:secret.adoc'] },
      navigation: [{ module: 'main', title: 'Framework' }],
      pages,
    })

    expect(llmsTxt).toContain('Getting Started')
    expect(llmsTxt).not.toContain('Secret')
    expect(llmsFullTxt).not.toContain('# Secret')
  })

  it('excludes pages using the home layout', async () => {
    const pages = [
      createPage({
        module: 'ROOT',
        relative: 'index.adoc',
        url: '/weavejs/index.html',
        title: 'Landing',
        layout: 'home',
      }),
      createPage({
        module: 'main',
        relative: 'index.adoc',
        url: '/weavejs/main/index.html',
        title: 'Getting Started',
      }),
    ]
    const { llmsTxt } = await run({ navigation: [{ module: 'main', title: 'Framework' }], pages })

    expect(llmsTxt).not.toContain('Landing')
    expect(llmsTxt).toContain('Getting Started')
  })

  it('skips pages with no AsciiDoc title', async () => {
    const pages = [
      createPage({ module: 'main', relative: 'index.adoc', url: '/weavejs/main/index.html', title: undefined }),
    ]
    const { llmsTxt, llmsFullTxt } = await run({ pages })

    expect(llmsTxt.trim()).toBe('# Weave.js')
    expect(llmsFullTxt.trim()).toBe('')
  })

  it('logs an error when llms.exclude is not a list', async () => {
    const logger = { warn: vi.fn(), error: vi.fn(), info: () => {} }
    await run({ llms: { exclude: 'secret.adoc' }, pages: [], logger })
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('expected a list of page IDs'),
      expect.anything(),
      'string'
    )
  })

  it('logs an error when an llms.exclude entry resolves to no page', async () => {
    const logger = { warn: vi.fn(), error: vi.fn(), info: () => {} }
    await run({ llms: { exclude: ['main:ghost.adoc'] }, pages: [], logger })
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('resolves to no page'),
      'main:ghost.adoc',
      expect.anything()
    )
  })
})

describe('registerLlmsTxt site.url', () => {
  const pages = () => [
    createPage({ module: 'main', relative: 'index.adoc', url: '/weavejs/main/', title: 'Start', html: '<p>Hi</p>' }),
  ]
  it('emits absolute links when site.url is set', async () => {
    const { llmsTxt, llmsFullTxt } = await run({ pages: pages(), siteUrl: 'https://o.github.io/repo/' })
    expect(llmsTxt).toContain('- [Start](https://o.github.io/repo/weavejs/main/)')
    expect(llmsFullTxt).toContain('Source: https://o.github.io/repo/weavejs/main/')
  })
  it('keeps root-relative links without site.url', async () => {
    const { llmsTxt, llmsFullTxt } = await run({ pages: pages() })
    expect(llmsTxt).toContain('- [Start](/weavejs/main/)')
    expect(llmsFullTxt).toContain('Source: /weavejs/main/')
  })
})
