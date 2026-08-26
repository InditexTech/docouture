'use strict'

import { afterEach, describe, expect, it, vi } from 'vitest'

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

function file(path, contents) {
  return { path, contents: Buffer.from(contents, 'utf8') }
}

function block(type, source, format) {
  const style = format ? `${type},format=${format}` : type
  return `[${style}]\n....\n${source}\n....\n`
}

async function run({ attributes, files }) {
  const context = createContext()
  // GH-44: `ensureKrokiRunning` (auto-start) is exercised on its own, in
  // kroki-docker.spec.js — stubbed out here via the same dependency-
  // injection seam publish.ts's own `loadDriver` deps param uses, so these
  // tests are only about the raw-content scanning and per-diagram fetch/
  // cache logic. Without this, its own reachability probe would consume the
  // `fetch` mock these tests set up for the DIAGRAM fetch, throwing off
  // every call-count assertion below.
  registerKrokiPrewarm(context, { ensureKrokiRunning: async () => undefined })
  await context.emit('contentAggregated', {
    playbook: { asciidoc: { attributes } },
    contentAggregate: [{ files }],
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
})
