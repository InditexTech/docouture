// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it, vi } from 'vitest'

const registerNotFoundPage = require('./not-found-page')

function setup(trees, notFoundModule) {
  const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
  const listeners = {}
  const context = {
    getLogger: () => logger,
    on(event, fn) {
      listeners[event] = fn
    },
  }
  registerNotFoundPage(context)
  const version = 'v1'
  listeners.contentAggregated({ contentAggregate: [{ name: 'site', version, notFoundModule }] })
  listeners.navigationBuilt({ navigationCatalog: { getNavigation: () => trees } })
  const page = { out: true, contents: Buffer.from('<html></html>'), src: {}, pub: {} }
  const payload = {
    playbook: { site: { url: 'https://example.com' } },
    contentCatalog: {
      getComponents: () => [{ name: 'site', latest: { version } }],
      getPages: () => [],
      getFiles: () => [],
    },
    uiCatalog: { getFiles: () => [] },
    siteCatalog: { getFiles: () => [page], addFile: () => {} },
    siteAsciiDocConfig: {},
  }
  try {
    listeners.pagesComposed(payload)
  } catch {
    // only the logging is under test; downstream page composition needs real Antora catalogs
  }
  return logger
}

describe('not-found-page severities', () => {
  it('errors when several modules exist and no not_found_module is configured', () => {
    const logger = setup([{ module: 'a' }, { module: 'b' }], undefined)
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('no not_found_module configured'), 'site@v1', 2)
  })

  it('errors when not_found_module matches no navigation file', () => {
    const logger = setup([{ module: 'a' }, { module: 'b' }], 'ghost')
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('matches no navigation file'), 'ghost', 'site@v1')
  })
})
