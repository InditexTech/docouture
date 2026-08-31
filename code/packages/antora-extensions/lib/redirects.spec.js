// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it, vi } from 'vitest'

const registerRedirects = require('./redirects')

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

function createPage(url) {
  return { out: true, pub: { url } }
}

function warnedAbout(logger, text) {
  return logger.warn.mock.calls.some((call) => typeof call[0] === 'string' && call[0].includes(text))
}

async function run(rules, { pages, htmlExtensionStyle = 'indexify', logger } = {}) {
  const context = createContext(logger)
  registerRedirects(context, rules)

  const contentCatalog = { getPages: (filterFn) => pages.filter(filterFn) }
  const files = []
  const siteCatalog = { addFile: (f) => files.push(f) }
  const playbook = { site: {}, urls: { htmlExtensionStyle, redirectFacility: 'static' } }

  await context.emit('navigationBuilt', { contentCatalog, siteCatalog, playbook })
  return { files, logger: context.logger }
}

describe('registerRedirects', () => {
  it('redirects an exact legacy URL to the real page it now lives at', async () => {
    const { files } = await run([{ from: '/weavejs/docs/main', to: '/weavejs/latest/main' }], {
      pages: [createPage('/weavejs/latest/main')],
    })

    expect(files).toHaveLength(1)
    const [file] = files
    expect(file.pub.url).toBe('/weavejs/docs/main/')
    expect(file.out.path).toBe('weavejs/docs/main/index.html')
    expect(file.contents.toString()).toContain('location="../../latest/main"')
  })

  it('carries a single-segment wildcard through from `to` into `from`', async () => {
    const { files } = await run([{ from: '/weavejs/docs/main/*', to: '/weavejs/latest/main/*' }], {
      pages: [createPage('/weavejs/latest/main/quickstart'), createPage('/weavejs/latest/sdk/index')],
    })

    expect(files).toHaveLength(1)
    expect(files[0].pub.url).toBe('/weavejs/docs/main/quickstart/')
  })

  it('carries a multi-segment ** wildcard through unchanged', async () => {
    const { files } = await run([{ from: '/weavejs/docs/**', to: '/weavejs/latest/**' }], {
      pages: [
        createPage('/weavejs/latest/main/build/nodes/comment/'),
        createPage('/weavejs/prerelease/main/build/nodes/comment/'), // different version, should not match
      ],
    })

    expect(files).toHaveLength(1)
    expect(files[0].pub.url).toBe('/weavejs/docs/main/build/nodes/comment/')
  })

  it('applies an exact override ahead of a broader ** catch-all, first-match-wins', async () => {
    const { files } = await run(
      [
        { from: '/weavejs/docs/main/build/node/comment', to: '/weavejs/latest/main/build/nodes/comment' },
        { from: '/weavejs/docs/**', to: '/weavejs/latest/**' },
      ],
      { pages: [createPage('/weavejs/latest/main/build/nodes/comment')] }
    )

    // Both rules match the same real page; only the first rule's computed
    // legacy URL should win — the catch-all's own (different) legacy URL
    // for the same page must not also be emitted.
    expect(files).toHaveLength(1)
    expect(files[0].pub.url).toBe('/weavejs/docs/main/build/node/comment/')
  })

  it('warns and skips a rule whose from/to wildcard counts do not match', async () => {
    const logger = { warn: vi.fn(), info: () => {} }
    const { files } = await run([{ from: '/weavejs/docs/*/*', to: '/weavejs/latest/**' }], {
      pages: [createPage('/weavejs/latest/main/quickstart/')],
      logger,
    })

    expect(files).toHaveLength(0)
    expect(warnedAbout(logger, 'wildcard count mismatch')).toBe(true)
  })

  it('warns when a rule matches no real pages', async () => {
    const logger = { warn: vi.fn(), info: () => {} }
    const { files } = await run([{ from: '/weavejs/docs/main', to: '/weavejs/stable/main' }], {
      pages: [createPage('/weavejs/latest/main/')],
      logger,
    })

    expect(files).toHaveLength(0)
    expect(warnedAbout(logger, 'matched no real pages')).toBe(true)
  })

  it('warns and skips when a computed legacy URL collides with a real page', async () => {
    const logger = { warn: vi.fn(), info: () => {} }
    const { files } = await run([{ from: '/weavejs/latest/main', to: '/weavejs/docs/main' }], {
      pages: [createPage('/weavejs/docs/main'), createPage('/weavejs/latest/main')],
      logger,
    })

    expect(files).toHaveLength(0)
    expect(warnedAbout(logger, 'collides with a real page')).toBe(true)
  })

  it('does nothing when no redirects config is provided', async () => {
    const { files } = await run(undefined, { pages: [] })
    expect(files).toHaveLength(0)
  })
})
