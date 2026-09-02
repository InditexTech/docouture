// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it, vi } from 'vitest'

const registerNavModules = require('./nav-modules')

function createContext(logger = { warn: vi.fn(), info: () => {} }) {
  const listeners = {}
  return {
    logger,
    getLogger: () => logger,
    on(event, fn) {
      ;(listeners[event] ||= []).push(fn)
    },
    async emit(event, payload) {
      for (const fn of listeners[event] || []) await fn(payload)
    },
  }
}

function tree(order, items = []) {
  return { order, items }
}

async function run(bucket, trees, { pages = {}, logger } = {}) {
  const context = createContext(logger)
  registerNavModules(context)

  const componentVersion = { name: 'weavejs', version: 'latest', navigation: trees }
  const contentCatalog = {
    resolvePage: (target) => {
      const url = pages[target]
      return url ? { pub: { url } } : undefined
    },
    getComponents: () => [{ versions: [componentVersion] }],
  }

  await context.emit('contentAggregated', { contentAggregate: [bucket] })
  await context.emit('navigationBuilt', { contentCatalog })

  return { componentVersion, logger: context.logger }
}

function warnedAbout(logger, text) {
  return logger.warn.mock.calls.some((call) => typeof call[0] === 'string' && call[0].includes(text))
}

describe('registerNavModules', () => {
  it('stamps a matched tree with module/title and finds its first internal page as startUrl', async () => {
    const item = { urlType: 'internal', url: '/weavejs/latest/main/index.html', items: [] }
    const { componentVersion } = await run(
      {
        name: 'weavejs',
        version: 'latest',
        nav: ['modules/main/nav.adoc'],
        navModules: [{ module: 'main', title: 'Framework', description: 'Desc', icon: 'menu' }],
      },
      [tree(0, [item])]
    )

    const t = componentVersion.navigation[0]
    expect(t.module).toBe('main')
    expect(t.title).toBe('Framework')
    expect(t.description).toBe('Desc')
    expect(t.icon).toBe('menu')
    expect(t.startUrl).toBe('/weavejs/latest/main/index.html')
    expect(item.module).toBe('main')
  })

  it('stamps items depth-first, all the way down the tree', async () => {
    const grandchild = { urlType: 'internal', url: '/weavejs/latest/main/deep.html', items: [] }
    const child = { items: [grandchild] } // an unlinked category heading, no url of its own
    const { componentVersion } = await run(
      { name: 'weavejs', version: 'latest', nav: ['modules/main/nav.adoc'], navModules: [{ module: 'main' }] },
      [tree(0, [child])]
    )
    expect(child.module).toBe('main')
    expect(grandchild.module).toBe('main')
    expect(componentVersion.navigation[0].startUrl).toBe('/weavejs/latest/main/deep.html')
  })

  it('falls back to the module slug as the title when none is declared', async () => {
    const { componentVersion } = await run(
      { name: 'weavejs', version: 'latest', nav: ['modules/main/nav.adoc'], navModules: [{ module: 'main' }] },
      [tree(0, [{ urlType: 'internal', url: '/x.html', items: [] }])]
    )
    expect(componentVersion.navigation[0].title).toBe('main')
  })

  it('resolves an authored start_page in preference to the first internal item', async () => {
    const { componentVersion } = await run(
      {
        name: 'weavejs',
        version: 'latest',
        nav: ['modules/main/nav.adoc'],
        navModules: [{ module: 'main', startPage: 'main:quickstart.adoc' }],
      },
      [tree(0, [{ urlType: 'internal', url: '/x.html', items: [] }])],
      { pages: { 'main:quickstart.adoc': '/weavejs/latest/main/quickstart.html' } }
    )
    expect(componentVersion.navigation[0].startUrl).toBe('/weavejs/latest/main/quickstart.html')
  })

  it('warns and falls back to the navigation when start_page resolves to nothing', async () => {
    const logger = { warn: vi.fn(), info: () => {} }
    const { componentVersion } = await run(
      {
        name: 'weavejs',
        version: 'latest',
        nav: ['modules/main/nav.adoc'],
        navModules: [{ module: 'main', startPage: 'main:missing.adoc' }],
      },
      [tree(0, [{ urlType: 'internal', url: '/x.html', items: [] }])],
      { logger }
    )
    expect(componentVersion.navigation[0].startUrl).toBe('/x.html')
    expect(warnedAbout(logger, 'resolves to no page; falling back')).toBe(true)
  })

  it('warns when a module has no internal page to link to at all', async () => {
    const logger = { warn: vi.fn(), info: () => {} }
    const { componentVersion } = await run(
      { name: 'weavejs', version: 'latest', nav: ['modules/main/nav.adoc'], navModules: [{ module: 'main' }] },
      [tree(0, [])],
      { logger }
    )
    expect(componentVersion.navigation[0].startUrl).toBeUndefined()
    expect(warnedAbout(logger, 'has no internal page to link to')).toBe(true)
  })

  it('marks switcher:false without warning about a missing start page', async () => {
    const logger = { warn: vi.fn(), info: () => {} }
    const { componentVersion } = await run(
      {
        name: 'weavejs',
        version: 'latest',
        nav: ['modules/ROOT/nav.adoc'],
        navModules: [{ module: 'ROOT', switcher: false }],
      },
      [tree(0, [])],
      { logger }
    )
    expect(componentVersion.navigation[0].switcher).toBe(false)
    expect(componentVersion.navigation[0].startUrl).toBeUndefined()
    expect(warnedAbout(logger, 'has no internal page to link to')).toBe(false)
  })

  it('floors a fractional tree.order to find the owning nav file (one file, multiple lists)', async () => {
    const { componentVersion } = await run(
      { name: 'weavejs', version: 'latest', nav: ['modules/main/nav.adoc'], navModules: [{ module: 'main' }] },
      [tree(0.5, [{ urlType: 'internal', url: '/x.html', items: [] }])]
    )
    expect(componentVersion.navigation[0].module).toBe('main')
  })

  it('leaves a tree untouched when its nav path is outside modules/', async () => {
    const { componentVersion } = await run(
      { name: 'weavejs', version: 'latest', nav: ['some-other-file.adoc'], navModules: [{ module: 'main' }] },
      [tree(0, [])]
    )
    expect(componentVersion.navigation[0].module).toBeUndefined()
  })

  it('warns when navModules is not a list', async () => {
    const logger = { warn: vi.fn(), info: () => {} }
    await run({ name: 'weavejs', version: 'latest', nav: [], navModules: 'not-a-list' }, [], { logger })
    expect(warnedAbout(logger, 'expected a list of entries')).toBe(true)
  })

  it('warns and skips an entry missing a module key', async () => {
    const logger = { warn: vi.fn(), info: () => {} }
    await run({ name: 'weavejs', version: 'latest', nav: [], navModules: [{ title: 'No module key' }] }, [], {
      logger,
    })
    expect(warnedAbout(logger, 'every entry needs a module key')).toBe(true)
  })

  it('warns and ignores a duplicate nav_modules entry for the same module', async () => {
    const logger = { warn: vi.fn(), info: () => {} }
    await run(
      {
        name: 'weavejs',
        version: 'latest',
        nav: ['modules/main/nav.adoc'],
        navModules: [
          { module: 'main', title: 'First' },
          { module: 'main', title: 'Second' },
        ],
      },
      [tree(0, [{ urlType: 'internal', url: '/x.html', items: [] }])],
      { logger }
    )
    expect(warnedAbout(logger, 'Ignoring duplicate nav_modules entry')).toBe(true)
  })

  it('warns about a tree matching no nav_modules entry, without failing', async () => {
    const logger = { warn: vi.fn(), info: () => {} }
    const { componentVersion } = await run(
      { name: 'weavejs', version: 'latest', nav: ['modules/other/nav.adoc'], navModules: [{ module: 'main' }] },
      [tree(0, [{ urlType: 'internal', url: '/x.html', items: [] }])],
      { logger }
    )
    expect(componentVersion.navigation[0].module).toBe('other')
    expect(warnedAbout(logger, 'No nav_modules entry for module')).toBe(true)
  })

  it('warns about a declared nav_modules entry that matches no navigation file', async () => {
    const logger = { warn: vi.fn(), info: () => {} }
    await run({ name: 'weavejs', version: 'latest', nav: [], navModules: [{ module: 'ghost' }] }, [], { logger })
    expect(warnedAbout(logger, 'matches no navigation file')).toBe(true)
  })

  it('does nothing for a bucket with no navModules declared', async () => {
    const { componentVersion } = await run({ name: 'weavejs', version: 'latest', nav: [] }, [
      tree(0, [{ urlType: 'internal', url: '/x.html', items: [] }]),
    ])
    expect(componentVersion.navigation[0].module).toBeUndefined()
  })
})
