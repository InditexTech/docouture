// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { afterEach, describe, expect, it, vi } from 'vitest'

const path = require('node:path')
const classifyContent = require('@antora/content-classifier')
const registerKrokiPrewarm = require('./kroki-prewarm')
const kroki = require('@inditextech/docouture-asciidoc-extensions/lib/kroki-instance')
const { applyDefaultMermaidTheme } = require('@inditextech/docouture-asciidoc-extensions/lib/kroki-mermaid-theme')

function createContext() {
  const listeners = {}
  const warnings = []
  const infos = []
  return {
    getLogger: () => ({ warn: (...args) => warnings.push(args), info: (...args) => infos.push(args) }),
    on(event, fn) {
      ;(listeners[event] ||= []).push(fn)
    },
    async emit(event, payload) {
      for (const fn of listeners[event] || []) await fn(payload)
    },
    warnings,
    infos,
  }
}

/**
 * A raw-aggregate-shaped file, pre-populated with the `src` fields
 * `@antora/content-aggregator`'s own `assignFileProperties` would set
 * (`path`/`basename`/`stem`/`extname`) — `classifyContent` (real
 * `@antora/content-classifier`, not a hand-mocked stand-in) needs those
 * present to allocate `family`/`module`/`component`/`version`/`relative`
 * onto each file the same way a real build does.
 */
function file(relPath, contents) {
  const extname = path.extname(relPath)
  const f = { path: relPath, contents: Buffer.from(contents, 'utf8') }
  f.basename = path.basename(relPath)
  f.extname = extname
  f.stem = path.basename(relPath, extname)
  f.src = { path: relPath, basename: f.basename, stem: f.stem, extname }
  return f
}

function block(type, source, format) {
  const style = format ? `${type},format=${format}` : type
  return `[${style}]\n....\n${source}\n....\n`
}

/** A real `ContentCatalog`, built by the real `@antora/content-classifier`. */
function buildCatalog(files) {
  return classifyContent({ site: {} }, [{ name: 'test', version: '1.0', files }])
}

async function run({ attributes, files, extraFiles = [] }) {
  const context = createContext()
  // GH-44: `ensureKrokiRunning` (auto-start) is exercised on its own, in
  // kroki-docker.spec.js — stubbed out here via the same dependency-
  // injection seam publish.ts's own `loadDriver` deps param uses, so these
  // tests are only about the raw-content scanning and per-diagram fetch/
  // cache logic. Without this, its own reachability probe would consume the
  // `fetch` mock these tests set up for the DIAGRAM fetch, throwing off
  // every call-count assertion below.
  registerKrokiPrewarm(context, { ensureKrokiRunning: async () => undefined })
  const contentCatalog = buildCatalog([...files, ...extraFiles])
  await context.emit('contentClassified', {
    playbook: { asciidoc: { attributes } },
    contentCatalog,
  })
  return context
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('registerKrokiPrewarm', () => {
  it('does nothing when kroki-enabled is not set', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const source = 'stateDiagram-v2\nA --> B (disabled case)'
    await run({ attributes: {}, files: [file('modules/main/pages/a.adoc', block('mermaid', source))] })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(kroki.get(kroki.keyFor('mermaid', applyDefaultMermaidTheme(source), 'svg'))).toBeUndefined()
  })

  it('fetches and caches every requested diagram type found in the raw content', async () => {
    const svg = '<svg>rendered</svg>'
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => svg })
    vi.stubGlobal('fetch', fetchMock)

    const source = 'stateDiagram-v2\nA --> B (cached case)'
    await run({
      attributes: { 'kroki-enabled': true, 'kroki-diagram-types': 'mermaid' },
      files: [file('modules/main/pages/a.adoc', block('mermaid', source))],
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8500/mermaid/svg')
    // The body actually POSTed is the theme-injected source (kroki-mermaid-
    // theme.js), not the author's raw one — this is the one place that's
    // observable from outside kroki-prewarm.js itself.
    expect(fetchMock.mock.calls[0][1].body).toBe(applyDefaultMermaidTheme(source))
    expect(kroki.get(kroki.keyFor('mermaid', applyDefaultMermaidTheme(source), 'svg'))).toEqual({
      format: 'svg',
      data: svg,
    })
  })

  it('logs a success summary when every requested diagram renders', async () => {
    const svg = '<svg>rendered</svg>'
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => svg })
    vi.stubGlobal('fetch', fetchMock)

    const source = 'stateDiagram-v2\nA --> B (summary case)'
    const context = await run({
      attributes: { 'kroki-enabled': true, 'kroki-diagram-types': 'mermaid' },
      files: [file('modules/main/pages/a.adoc', block('mermaid', source))],
    })

    expect(context.infos.some(([msg]) => msg.includes('rendered all'))).toBe(true)
  })

  it('warns with a fallback summary when some diagrams fail to render', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'))
    vi.stubGlobal('fetch', fetchMock)

    const source = 'stateDiagram-v2\nA --> B (summary failure case)'
    const context = await run({
      attributes: { 'kroki-enabled': true, 'kroki-diagram-types': 'mermaid' },
      files: [file('modules/main/pages/a.adoc', block('mermaid', source))],
    })

    expect(context.warnings.some(([msg]) => msg.includes('fell back to raw source'))).toBe(true)
  })

  it('ignores a block whose type is not in kroki-diagram-types', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const source = 'A -> B (not requested case)'
    await run({
      attributes: { 'kroki-enabled': true, 'kroki-diagram-types': 'plantuml' },
      files: [file('modules/main/pages/a.adoc', block('graphviz', source))],
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(kroki.get(kroki.keyFor('graphviz', source))).toBeUndefined()
  })

  it('warns and leaves the cache empty when Kroki is unreachable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'))
    vi.stubGlobal('fetch', fetchMock)

    const source = 'stateDiagram-v2\nA --> B (unreachable case)'
    const context = await run({
      attributes: { 'kroki-enabled': true },
      files: [file('modules/main/pages/a.adoc', block('mermaid', source))],
    })

    expect(kroki.get(kroki.keyFor('mermaid', applyDefaultMermaidTheme(source), 'svg'))).toBeUndefined()
    expect(context.warnings.some(([msg]) => msg.includes('Could not reach the Kroki service'))).toBe(true)
  })

  it('warns once per unknown kroki-diagram-types entry and still processes the known ones', async () => {
    const svg = '<svg>known</svg>'
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => svg })
    vi.stubGlobal('fetch', fetchMock)

    const source = 'stateDiagram-v2\nA --> B (unknown-type case)'
    const context = await run({
      attributes: { 'kroki-enabled': true, 'kroki-diagram-types': 'mermaid,not-a-real-type' },
      files: [file('modules/main/pages/a.adoc', block('mermaid', source))],
    })

    expect(kroki.get(kroki.keyFor('mermaid', applyDefaultMermaidTheme(source), 'svg'))).toEqual({
      format: 'svg',
      data: svg,
    })
    expect(context.warnings.some(([msg]) => msg.includes('unknown %s entry'))).toBe(true)
  })

  it('ignores non-.adoc files', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await run({
      attributes: { 'kroki-enabled': true },
      files: [file('modules/main/pages/a.png', block('mermaid', 'A --> B (non-adoc case)'))],
    })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not crash on a catalog alias entry, which has no .path of its own', async () => {
    // GH-189 regression: ContentCatalog#getFiles() also yields `family:
    // 'alias'` entries (redirects registered via registerPageAlias/
    // addSplatAlias) that have no `.path` at all — a naive
    // `candidate.path.endsWith('.adoc')` filter throws on one of these the
    // moment a real site registers any page alias (e.g. every site with a
    // `startPage`, or any renamed page).
    const svg = '<svg>alias-safe</svg>'
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => svg })
    vi.stubGlobal('fetch', fetchMock)

    const context = createContext()
    registerKrokiPrewarm(context, { ensureKrokiRunning: async () => undefined })
    const source = 'stateDiagram-v2\nA --> B (alias case)'
    const contentCatalog = buildCatalog([file('modules/main/pages/a.adoc', block('mermaid', source))])
    const page = contentCatalog.getById({
      component: 'test',
      version: '1.0',
      module: 'main',
      family: 'page',
      relative: 'a.adoc',
    })
    contentCatalog.registerPageAlias('old-a.adoc', page)

    await context.emit('contentClassified', {
      playbook: { asciidoc: { attributes: { 'kroki-enabled': true, 'kroki-diagram-types': 'mermaid' } } },
      contentCatalog,
    })

    expect(kroki.get(kroki.keyFor('mermaid', applyDefaultMermaidTheme(source), 'svg'))).toEqual({
      format: 'svg',
      data: svg,
    })
  })

  it('requests and base64-caches a png diagram for a type that supports it', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]) // a PNG magic-number prefix is enough for this test
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => bytes.buffer })
    vi.stubGlobal('fetch', fetchMock)

    const source = 'stateDiagram-v2\nA --> B (png case)'
    await run({
      attributes: { 'kroki-enabled': true, 'kroki-diagram-types': 'mermaid' },
      files: [file('modules/main/pages/a.adoc', block('mermaid', source, 'png'))],
    })

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8500/mermaid/png')
    expect(kroki.get(kroki.keyFor('mermaid', applyDefaultMermaidTheme(source), 'png'))).toEqual({
      format: 'png',
      data: Buffer.from(bytes).toString('base64'),
    })
  })

  it('falls back to svg and warns when png is requested for a type Kroki does not support', async () => {
    const svg = '<svg>bpmn fallback</svg>'
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => svg })
    vi.stubGlobal('fetch', fetchMock)

    const source = '<definitions>(bpmn png-unsupported case)</definitions>'
    const context = await run({
      attributes: { 'kroki-enabled': true, 'kroki-diagram-types': 'bpmn' },
      files: [file('modules/main/pages/a.adoc', block('bpmn', source, 'png'))],
    })

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8500/bpmn/svg')
    expect(kroki.get(kroki.keyFor('bpmn', source, 'svg'))).toEqual({ format: 'svg', data: svg })
    expect(context.warnings.some(([msg]) => msg.includes('unsupported format'))).toBe(true)
  })

  describe('GH-189: include:: resolution inside a diagram block', () => {
    it('resolves a whole-file include::partial$...[] to the same source real conversion would hash', async () => {
      const svg = '<svg>partial</svg>'
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => svg })
      vi.stubGlobal('fetch', fetchMock)

      const partialSource = 'skinparam shape1\nA -> B'
      await run({
        attributes: { 'kroki-enabled': true, 'kroki-diagram-types': 'plantuml' },
        files: [file('modules/main/pages/a.adoc', block('plantuml', 'include::partial$shapes.puml[]'))],
        extraFiles: [file('modules/main/partials/shapes.puml', partialSource)],
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0][1].body).toBe(partialSource)
      expect(kroki.get(kroki.keyFor('plantuml', partialSource, 'svg'))).toEqual({ format: 'svg', data: svg })
    })

    it("resolves the issue's own repro shape: two concatenated includes forming one diagram", async () => {
      const svg = '<svg>concatenated</svg>'
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => svg })
      vi.stubGlobal('fetch', fetchMock)

      const shapes = 'skinparam shape1'
      const diagramA = 'A -> B'
      await run({
        attributes: { 'kroki-enabled': true, 'kroki-diagram-types': 'plantuml' },
        files: [
          file(
            'modules/main/pages/a.adoc',
            block('plantuml', 'include::partial$shapes.puml[]\ninclude::partial$diagram-a.puml[]')
          ),
        ],
        extraFiles: [
          file('modules/main/partials/shapes.puml', shapes),
          file('modules/main/partials/diagram-a.puml', diagramA),
        ],
      })

      const expectedSource = `${shapes}\n${diagramA}`
      expect(fetchMock.mock.calls[0][1].body).toBe(expectedSource)
      expect(kroki.get(kroki.keyFor('plantuml', expectedSource, 'svg'))).toEqual({ format: 'svg', data: svg })
    })

    it('resolves a partial that itself includes another partial (nested)', async () => {
      const svg = '<svg>nested</svg>'
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => svg })
      vi.stubGlobal('fetch', fetchMock)

      const icons = 'sprite $icon'
      await run({
        attributes: { 'kroki-enabled': true, 'kroki-diagram-types': 'plantuml' },
        files: [file('modules/main/pages/a.adoc', block('plantuml', 'include::partial$shapes.puml[]'))],
        extraFiles: [
          file('modules/main/partials/shapes.puml', 'include::partial$icons.puml[]\nskinparam shape1'),
          file('modules/main/partials/icons.puml', icons),
        ],
      })

      const expectedSource = `${icons}\nskinparam shape1`
      expect(fetchMock.mock.calls[0][1].body).toBe(expectedSource)
      expect(kroki.get(kroki.keyFor('plantuml', expectedSource, 'svg'))).toEqual({ format: 'svg', data: svg })
    })

    it('applies lines= filtering to the resolved include target', async () => {
      const svg = '<svg>lines</svg>'
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => svg })
      vi.stubGlobal('fetch', fetchMock)

      const partialSource = ['one', 'two', 'three', 'four'].join('\n')
      await run({
        attributes: { 'kroki-enabled': true, 'kroki-diagram-types': 'plantuml' },
        files: [file('modules/main/pages/a.adoc', block('plantuml', 'include::partial$shapes.puml[lines=2..3]'))],
        extraFiles: [file('modules/main/partials/shapes.puml', partialSource)],
      })

      expect(fetchMock.mock.calls[0][1].body).toBe('two\nthree')
    })

    it('applies tag= filtering to the resolved include target', async () => {
      const svg = '<svg>tags</svg>'
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => svg })
      vi.stubGlobal('fetch', fetchMock)

      const partialSource = ['intro', 'tag::keep[]', 'kept', 'end::keep[]', 'outro'].join('\n')
      await run({
        attributes: { 'kroki-enabled': true, 'kroki-diagram-types': 'plantuml' },
        files: [file('modules/main/pages/a.adoc', block('plantuml', 'include::partial$shapes.puml[tag=keep]'))],
        extraFiles: [file('modules/main/partials/shapes.puml', partialSource)],
      })

      expect(fetchMock.mock.calls[0][1].body).toBe('kept')
    })

    it('leaves an include:: with an unsupported attribute unexpanded and warns', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '<svg/>' })
      vi.stubGlobal('fetch', fetchMock)

      const rawBody = 'include::partial$shapes.puml[indent=0]'
      const context = await run({
        attributes: { 'kroki-enabled': true, 'kroki-diagram-types': 'plantuml' },
        files: [file('modules/main/pages/a.adoc', block('plantuml', rawBody))],
        extraFiles: [file('modules/main/partials/shapes.puml', 'skinparam shape1')],
      })

      expect(fetchMock.mock.calls[0][1].body).toBe(rawBody)
      expect(context.warnings.some(([msg]) => msg.includes("aren't all lines=/tag=/tags=/leveloffset=/opts="))).toBe(
        true
      )
    })

    it('leaves an include:: target needing attribute substitution unexpanded and warns', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '<svg/>' })
      vi.stubGlobal('fetch', fetchMock)

      const rawBody = 'include::partial${diagram-name}.puml[]'
      const context = await run({
        attributes: { 'kroki-enabled': true, 'kroki-diagram-types': 'plantuml' },
        files: [file('modules/main/pages/a.adoc', block('plantuml', rawBody))],
      })

      expect(fetchMock.mock.calls[0][1].body).toBe(rawBody)
      expect(context.warnings.some(([msg]) => msg.includes('attribute substitution'))).toBe(true)
    })

    it('leaves an unresolvable include:: target unexpanded and warns, without throwing', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '<svg/>' })
      vi.stubGlobal('fetch', fetchMock)

      const rawBody = 'include::partial$does-not-exist.puml[]'
      const context = await run({
        attributes: { 'kroki-enabled': true, 'kroki-diagram-types': 'plantuml' },
        files: [file('modules/main/pages/a.adoc', block('plantuml', rawBody))],
      })

      expect(fetchMock.mock.calls[0][1].body).toBe(rawBody)
      expect(context.warnings.some(([msg]) => msg.includes('Could not resolve include::'))).toBe(true)
    })

    it('leaves an escaped \\include:: line as literal text', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '<svg/>' })
      vi.stubGlobal('fetch', fetchMock)

      const rawBody = '\\include::partial$shapes.puml[]'
      await run({
        attributes: { 'kroki-enabled': true, 'kroki-diagram-types': 'plantuml' },
        files: [file('modules/main/pages/a.adoc', block('plantuml', rawBody))],
        extraFiles: [file('modules/main/partials/shapes.puml', 'skinparam shape1')],
      })

      expect(fetchMock.mock.calls[0][1].body).toBe(rawBody)
    })
  })
})
