'use strict'

import { describe, expect, it, vi } from 'vitest'

const registerDuplicateLatestVersion = require('./duplicate-latest-version')

function createContext(logger = { warn: vi.fn(), info: vi.fn() }) {
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

function createFile(component, version, module_, relative, outPath, pubUrl, contents = 'CONTENTS') {
  return {
    src: { component, version, module: module_, family: 'page', relative },
    out: { path: outPath },
    pub: { url: pubUrl },
    contents,
  }
}

async function run(config, { components, files, logger } = {}) {
  const context = createContext(logger)
  registerDuplicateLatestVersion(context, config)

  const contentCatalog = {
    getComponents: () => components,
    getFiles: () => files,
  }
  const added = []
  const siteCatalog = { addFile: (f) => added.push(f) }

  await context.emit('pagesComposed', { contentCatalog, siteCatalog })
  return { added, logger: context.logger }
}

describe('registerDuplicateLatestVersion', () => {
  it('does nothing when duplicateLatestVersion is not set', async () => {
    const { added } = await run(undefined, {
      components: [{ name: 'weavejs', latest: { version: 'stable', prerelease: false } }],
      files: [
        createFile(
          'weavejs',
          'stable',
          'main',
          'quickstart.adoc',
          'weavejs/stable/main/quickstart/index.html',
          '/weavejs/stable/main/quickstart/'
        ),
      ],
    })
    expect(added).toHaveLength(0)
  })

  it('duplicates every real file of the latest (non-prerelease) version under /latest/…', async () => {
    const { added } = await run(
      { duplicateLatestVersion: true },
      {
        components: [{ name: 'weavejs', latest: { version: 'stable', prerelease: false } }],
        files: [
          createFile(
            'weavejs',
            'stable',
            'main',
            'quickstart.adoc',
            'weavejs/stable/main/quickstart/index.html',
            '/weavejs/stable/main/quickstart/'
          ),
          createFile(
            'weavejs',
            'stable',
            'main',
            'index.adoc',
            'weavejs/stable/main/index.html',
            '/weavejs/stable/main/'
          ),
          // a different version's own file must never be touched
          createFile(
            'weavejs',
            'prerelease',
            'main',
            'quickstart.adoc',
            'weavejs/prerelease/main/quickstart/index.html',
            '/weavejs/prerelease/main/quickstart/'
          ),
        ],
      }
    )

    expect(added).toHaveLength(2)
    expect(added.map((f) => f.out.path)).toEqual(
      expect.arrayContaining(['weavejs/latest/main/quickstart/index.html', 'weavejs/latest/main/index.html'])
    )
    expect(added.map((f) => f.pub.url)).toEqual(
      expect.arrayContaining(['/weavejs/latest/main/quickstart/', '/weavejs/latest/main/'])
    )
    // contents are carried over verbatim — no HTML rewriting needed, since
    // the UI's relativize helper computes hrefs from directory depth alone.
    expect(added.every((f) => f.contents === 'CONTENTS')).toBe(true)
  })

  it('handles the ROOT component (no component URL segment)', async () => {
    const { added } = await run(
      { duplicateLatestVersion: true },
      {
        components: [{ name: 'ROOT', latest: { version: 'stable', prerelease: false } }],
        files: [createFile('ROOT', 'stable', 'ROOT', 'index.adoc', 'stable/index.html', '/stable/')],
      }
    )

    expect(added).toHaveLength(1)
    expect(added[0].out.path).toBe('latest/index.html')
    expect(added[0].pub.url).toBe('/latest/')
  })

  it('does nothing for a component with no non-prerelease version yet', async () => {
    const { added, logger } = await run(
      { duplicateLatestVersion: true },
      {
        components: [{ name: 'weavejs', latest: { version: 'prerelease', prerelease: true } }],
        files: [
          createFile(
            'weavejs',
            'prerelease',
            'main',
            'quickstart.adoc',
            'weavejs/prerelease/main/quickstart/index.html',
            '/weavejs/prerelease/main/quickstart/'
          ),
        ],
      }
    )

    expect(added).toHaveLength(0)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('does nothing when the latest version already IS the alias segment', async () => {
    const { added } = await run(
      { duplicateLatestVersion: true },
      {
        components: [{ name: 'weavejs', latest: { version: 'latest', prerelease: false } }],
        files: [
          createFile(
            'weavejs',
            'latest',
            'main',
            'quickstart.adoc',
            'weavejs/latest/main/quickstart/index.html',
            '/weavejs/latest/main/quickstart/'
          ),
        ],
      }
    )

    expect(added).toHaveLength(0)
  })

  it('duplicates each component independently across a multi-component catalog', async () => {
    const { added } = await run(
      { duplicateLatestVersion: true },
      {
        components: [
          { name: 'weavejs', latest: { version: 'stable', prerelease: false } },
          { name: 'other-lib', latest: { version: '2.0.0', prerelease: false } },
        ],
        files: [
          createFile(
            'weavejs',
            'stable',
            'main',
            'quickstart.adoc',
            'weavejs/stable/main/quickstart/index.html',
            '/weavejs/stable/main/quickstart/'
          ),
          createFile(
            'other-lib',
            '2.0.0',
            'main',
            'quickstart.adoc',
            'other-lib/2.0.0/main/quickstart/index.html',
            '/other-lib/2.0.0/main/quickstart/'
          ),
        ],
      }
    )

    expect(added).toHaveLength(2)
    expect(added.map((f) => f.out.path)).toEqual(
      expect.arrayContaining([
        'weavejs/latest/main/quickstart/index.html',
        'other-lib/latest/main/quickstart/index.html',
      ])
    )
  })
})
