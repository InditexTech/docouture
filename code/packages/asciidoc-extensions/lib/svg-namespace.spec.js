// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it } from 'vitest'
const namespaceSvgIds = require('./svg-namespace')

describe('namespaceSvgIds', () => {
  it('returns the markup unchanged when it carries no ids', () => {
    const svg = '<svg><rect width="10" height="10"/></svg>'
    expect(namespaceSvgIds(svg, 'prefix')).toBe(svg)
  })

  it('rewrites a single id declaration and its reference', () => {
    const svg = '<svg id="container"><use href="#container"/></svg>'
    const result = namespaceSvgIds(svg, 'diagram-1')
    expect(result).toBe('<svg id="diagram-1-container"><use href="#diagram-1-container"/></svg>')
  })

  it('rewrites both single- and double-quoted id declarations', () => {
    const svg = `<svg id='container'><g id="node1"></g></svg>`
    const result = namespaceSvgIds(svg, 'p')
    expect(result).toContain(`id='p-container'`)
    expect(result).toContain(`id="p-node1"`)
  })

  it('rewrites a url(#id) reference inside a fill/stroke/clip-path/mask/filter attribute', () => {
    const svg = '<svg id="graph0"><path fill="url(#graph0)"/></svg>'
    const result = namespaceSvgIds(svg, 'x')
    expect(result).toBe('<svg id="x-graph0"><path fill="url(#x-graph0)"/></svg>')
  })

  it('rewrites a CSS id-selector inside an embedded <style> block', () => {
    const svg = '<svg id="container"><style>#container{fill:red}</style></svg>'
    const result = namespaceSvgIds(svg, 'y')
    expect(result).toBe('<svg id="y-container"><style>#y-container{fill:red}</style></svg>')
  })

  it('rewrites longer ids before shorter ones so node1 does not eat into node10', () => {
    const svg = '<svg><g id="node1"></g><g id="node10"></g><use href="#node1"/><use href="#node10"/></svg>'
    const result = namespaceSvgIds(svg, 'p')
    expect(result).toBe(
      '<svg><g id="p-node1"></g><g id="p-node10"></g><use href="#p-node1"/><use href="#p-node10"/></svg>'
    )
  })

  it('does not let a reference bleed into a longer word-character run', () => {
    // #node1 followed by more id-safe characters must not be treated as a
    // reference to "node1" — the (?![\w-]) guard in referenceRx.
    const svg = '<svg id="node1"><a href="#node1x">not a reference to node1</a></svg>'
    const result = namespaceSvgIds(svg, 'p')
    expect(result).toBe('<svg id="p-node1"><a href="#node1x">not a reference to node1</a></svg>')
  })

  it('escapes ids that contain regex-special characters', () => {
    const svg = '<svg id="a.b+c"><use href="#a.b+c"/></svg>'
    const result = namespaceSvgIds(svg, 'p')
    expect(result).toBe('<svg id="p-a.b+c"><use href="#p-a.b+c"/></svg>')
  })
})
