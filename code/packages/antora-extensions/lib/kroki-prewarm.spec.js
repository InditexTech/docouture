'use strict'

import { afterEach, describe, expect, it, vi } from 'vitest'

const registerKrokiPrewarm = require('./kroki-prewarm')
const kroki = require('@inditextech/pdocs-asciidoc-extensions/lib/kroki-instance')

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

function block(type, source) {
  return `[${type}]\n....\n${source}\n....\n`
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
    expect(kroki.get(kroki.keyFor('mermaid', source))).toBeUndefined()
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
    expect(kroki.get(kroki.keyFor('mermaid', source))).toBe(svg)
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

    expect(kroki.get(kroki.keyFor('mermaid', source))).toBeUndefined()
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

    expect(kroki.get(kroki.keyFor('mermaid', source))).toBe(svg)
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
})
