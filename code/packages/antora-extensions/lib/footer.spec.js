// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it, vi } from 'vitest'

const registerFooter = require('./footer')

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

function componentVersion(name, version, overrides = {}) {
  return { name, version, ...overrides }
}

async function run(buckets, { pages = {}, logger } = {}) {
  const context = createContext(logger)
  registerFooter(context)

  const contentCatalog = {
    resolvePage: (target) => {
      const url = pages[target]
      return url ? { pub: { url } } : undefined
    },
  }

  const versions = buckets.map((bucket) => componentVersion(bucket.name, bucket.version))
  const contentCatalog2 = contentCatalog

  await context.emit('contentAggregated', { contentAggregate: buckets })
  await context.emit('navigationBuilt', {
    contentCatalog: {
      ...contentCatalog2,
      getComponents: () => [{ versions }],
    },
  })

  return { versions, logger: context.logger }
}

function warnedAbout(logger, text) {
  return logger.warn.mock.calls.some((call) => typeof call[0] === 'string' && call[0].includes(text))
}

describe('registerFooter', () => {
  it('attaches resolved footer groups to the matching component version', async () => {
    const { versions } = await run(
      [
        {
          name: 'weavejs',
          version: 'latest',
          footer: {
            groups: [
              {
                title: 'Resources',
                links: [
                  { text: 'Home', url: 'ROOT:index.adoc' },
                  { text: 'Repository', url: 'https://github.com/example/example' },
                ],
              },
            ],
          },
        },
      ],
      { pages: { 'ROOT:index.adoc': '/weavejs/latest/index.html' } }
    )

    expect(versions[0].footer).toEqual({
      groups: [
        {
          title: 'Resources',
          links: [
            { text: 'Home', url: '/weavejs/latest/index.html' },
            { text: 'Repository', url: 'https://github.com/example/example' },
          ],
        },
      ],
    })
  })

  it('does nothing to a component version whose bucket has no footer', async () => {
    const { versions } = await run([{ name: 'weavejs', version: 'latest' }])
    expect(versions[0].footer).toBeUndefined()
  })

  it('warns and drops a footer that is not a { groups: [...] } shape', async () => {
    const logger = { warn: vi.fn(), info: () => {} }
    const { versions } = await run([{ name: 'weavejs', version: 'latest', footer: { groups: 'not-a-list' } }], {
      logger,
    })
    expect(versions[0].footer).toBeUndefined()
    expect(warnedAbout(logger, 'expected a groups list')).toBe(true)
  })

  it('warns and skips a group with no links list, but keeps other groups', async () => {
    const logger = { warn: vi.fn(), info: () => {} }
    const { versions } = await run(
      [
        {
          name: 'weavejs',
          version: 'latest',
          footer: {
            groups: [{ title: 'Broken' }, { title: 'Fine', links: [{ text: 'Home', url: '/plain.html' }] }],
          },
        },
      ],
      { logger }
    )
    expect(versions[0].footer.groups).toEqual([{ title: 'Fine', links: [{ text: 'Home', url: '/plain.html' }] }])
    expect(warnedAbout(logger, 'every group needs a links list')).toBe(true)
  })

  it('warns and skips a link missing text or url', async () => {
    const logger = { warn: vi.fn(), info: () => {} }
    const { versions } = await run(
      [
        {
          name: 'weavejs',
          version: 'latest',
          footer: { groups: [{ links: [{ text: 'No url' }, { url: '/no-text.html' }] }] },
        },
      ],
      { logger }
    )
    expect(versions[0].footer).toBeUndefined()
    expect(warnedAbout(logger, 'every link needs a text and a url')).toBe(true)
  })

  it('drops a link whose page ID resolves to nothing, with a warning', async () => {
    const logger = { warn: vi.fn(), info: () => {} }
    const { versions } = await run(
      [
        {
          name: 'weavejs',
          version: 'latest',
          footer: { groups: [{ links: [{ text: 'Ghost', url: 'ROOT:missing.adoc' }] }] },
        },
      ],
      { logger }
    )
    expect(versions[0].footer).toBeUndefined()
    expect(warnedAbout(logger, 'resolves to no page')).toBe(true)
  })

  it('drops a group left with no links after filtering, without rendering an empty column', async () => {
    const { versions } = await run([
      {
        name: 'weavejs',
        version: 'latest',
        footer: { groups: [{ title: 'Empty', links: [{ text: 'Ghost', url: 'ROOT:missing.adoc' }] }] },
      },
    ])
    expect(versions[0].footer).toBeUndefined()
  })

  it('renders a group with no title (GH-77)', async () => {
    const { versions } = await run([
      {
        name: 'weavejs',
        version: 'latest',
        footer: { groups: [{ links: [{ text: 'Home', url: '/plain.html' }] }] },
      },
    ])
    expect(versions[0].footer.groups[0].title).toBeUndefined()
  })
})
