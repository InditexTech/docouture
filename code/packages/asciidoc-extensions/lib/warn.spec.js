// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it, vi } from 'vitest'
const warn = require('./warn')

describe('warn', () => {
  it('logs through node.getDocument().getLogger() when a document is reachable', () => {
    const warnFn = vi.fn()
    const node = { getDocument: () => ({ getLogger: () => ({ warn: warnFn }) }) }
    warn(node, '[cards]', 'a cards block with no cards in it')
    expect(warnFn).toHaveBeenCalledWith('[cards] — a cards block with no cards in it')
  })

  it('logs through node.getLogger() directly when node is itself a document', () => {
    const warnFn = vi.fn()
    const node = { getLogger: () => ({ warn: warnFn }) }
    warn(node, '[cards]', 'no cards in it')
    expect(warnFn).toHaveBeenCalledWith('[cards] — no cards in it')
  })

  it('appends the expected values when given a closed set', () => {
    const warnFn = vi.fn()
    const node = { getLogger: () => ({ warn: warnFn }) }
    warn(node, 'label:mauve[]', 'unknown IDS Label variant "mauve"', ['white', 'grey'])
    expect(warnFn).toHaveBeenCalledWith(
      'label:mauve[] — unknown IDS Label variant "mauve"; expected one of white, grey'
    )
  })

  it('appends nothing when expected is omitted or empty', () => {
    const warnFn = vi.fn()
    const node = { getLogger: () => ({ warn: warnFn }) }
    warn(node, '[cta]', 'no primary action', [])
    expect(warnFn).toHaveBeenCalledWith('[cta] — no primary action')
  })

  it('tolerates a node with no getDocument and no getLogger at all', () => {
    expect(() => warn({}, '[cta]', 'problem')).not.toThrow()
  })

  it('tolerates getDocument() returning an object with no getLogger', () => {
    const node = { getDocument: () => ({}) }
    expect(() => warn(node, '[cta]', 'problem')).not.toThrow()
  })

  it('tolerates a logger object whose warn is not a function', () => {
    // Intentionally not a real Logger shape — proves the `typeof
    // logger.warn !== 'function'` guard, not something a real caller
    // would ever construct.
    const node = /** @type {any} */ ({ getLogger: () => ({ warn: 'not-a-function' }) })
    expect(() => warn(node, '[cta]', 'problem')).not.toThrow()
  })
})
