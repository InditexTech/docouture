// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { afterEach, describe, expect, it } from 'vitest'

import { getContext, resetContext, setContext } from './cli-context.js'

describe('cli-context', () => {
  afterEach(() => {
    resetContext()
  })

  it('defaults to everything off', () => {
    expect(getContext()).toEqual({ json: false, verbose: false, noColor: false })
  })

  it('merges partial updates instead of replacing the whole context', () => {
    setContext({ json: true })
    setContext({ verbose: true })
    expect(getContext()).toEqual({ json: true, verbose: true, noColor: false })
  })

  it('resetContext restores every field to its default', () => {
    setContext({ json: true, verbose: true, noColor: true })
    resetContext()
    expect(getContext()).toEqual({ json: false, verbose: false, noColor: false })
  })
})
