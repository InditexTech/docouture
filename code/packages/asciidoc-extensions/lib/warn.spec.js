// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it, vi } from 'vitest'
const { error, notice } = require('./warn')

describe('error', () => {
  it('logs through node.getDocument().getLogger() when a document is reachable', () => {
    const logFn = vi.fn()
    const node = { getDocument: () => ({ getLogger: () => ({ error: logFn }) }) }
    error(node, '[cards]', 'a cards block with no cards in it')
    expect(logFn).toHaveBeenCalledWith('[cards] — a cards block with no cards in it')
  })

  it('logs through node.getLogger() directly when node is itself a document', () => {
    const logFn = vi.fn()
    const node = { getLogger: () => ({ error: logFn }) }
    error(node, '[cards]', 'no cards in it')
    expect(logFn).toHaveBeenCalledWith('[cards] — no cards in it')
  })

  it('appends the expected values when given a closed set', () => {
    const logFn = vi.fn()
    const node = { getLogger: () => ({ error: logFn }) }
    error(node, 'label:mauve[]', 'unknown IDS Label variant "mauve"', ['white', 'grey'])
    expect(logFn).toHaveBeenCalledWith('label:mauve[] — unknown IDS Label variant "mauve"; expected one of white, grey')
  })

  it('appends nothing when expected is omitted or empty', () => {
    const logFn = vi.fn()
    const node = { getLogger: () => ({ error: logFn }) }
    error(node, '[cta]', 'no primary action', [])
    expect(logFn).toHaveBeenCalledWith('[cta] — no primary action')
  })

  it('tolerates a node with no getDocument and no getLogger at all', () => {
    expect(() => error({}, '[cta]', 'problem')).not.toThrow()
  })

  it('tolerates getDocument() returning an object with no getLogger', () => {
    const node = { getDocument: () => ({}) }
    expect(() => error(node, '[cta]', 'problem')).not.toThrow()
  })

  it('tolerates a logger object whose error is not a function', () => {
    // Intentionally not a real Logger shape — proves the `typeof
    // logger.error !== 'function'` guard, not something a real caller
    // would ever construct.
    const node = /** @type {any} */ ({ getLogger: () => ({ error: 'not-a-function' }) })
    expect(() => error(node, '[cta]', 'problem')).not.toThrow()
  })
})

describe('notice', () => {
  it('logs at warn severity, not error', () => {
    const warnFn = vi.fn()
    const errorFn = vi.fn()
    const node = { getLogger: () => ({ warn: warnFn, error: errorFn }) }
    notice(node, '[cards]', 'a card has 2 images; only the first is rendered')
    expect(warnFn).toHaveBeenCalledWith('[cards] — a card has 2 images; only the first is rendered')
    expect(errorFn).not.toHaveBeenCalled()
  })

  it('error() never logs at warn severity', () => {
    const warnFn = vi.fn()
    const errorFn = vi.fn()
    const node = { getLogger: () => ({ warn: warnFn, error: errorFn }) }
    error(node, '[cards]', 'no cards')
    expect(errorFn).toHaveBeenCalledTimes(1)
    expect(warnFn).not.toHaveBeenCalled()
  })
})
