'use strict'

import { describe, expect, it } from 'vitest'

const registerLlmsTxt = require('./llms-txt')

function createContext() {
  const listeners = {}
  return {
    getLogger: () => ({ warn: () => {}, info: () => {} }),
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

async function run({ llms, navigation, pages }) {
  const context = createContext()
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
  const playbook = { site: { title: 'Weave.js' }, ui: {} }

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
})
