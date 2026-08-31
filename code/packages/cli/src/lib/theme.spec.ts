// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { isColourEnabled, theme } from './theme.js'
import { resetContext, setContext } from './cli-context.js'

let originalNoColor: string | undefined
let originalForceColor: string | undefined
let originalIsTTY: boolean | undefined

beforeEach(() => {
  originalNoColor = process.env.NO_COLOR
  originalForceColor = process.env.FORCE_COLOR
  originalIsTTY = process.stdout.isTTY
  delete process.env.NO_COLOR
  delete process.env.FORCE_COLOR
})

afterEach(() => {
  if (originalNoColor === undefined) delete process.env.NO_COLOR
  else process.env.NO_COLOR = originalNoColor
  if (originalForceColor === undefined) delete process.env.FORCE_COLOR
  else process.env.FORCE_COLOR = originalForceColor
  process.stdout.isTTY = originalIsTTY
  resetContext()
})

describe('theme', () => {
  it('is disabled by default under a non-TTY stdout with no env overrides', () => {
    process.stdout.isTTY = undefined
    expect(isColourEnabled()).toBe(false)
    expect(theme.bold('hi')).toBe('hi')
  })

  it('is enabled when stdout is a TTY', () => {
    process.stdout.isTTY = true
    expect(isColourEnabled()).toBe(true)
    expect(theme.success('ok')).toContain('ok')
    expect(theme.success('ok')).not.toBe('ok')
  })

  it('FORCE_COLOR forces colour on even without a TTY', () => {
    process.stdout.isTTY = undefined
    process.env.FORCE_COLOR = '1'
    expect(isColourEnabled()).toBe(true)
  })

  it('NO_COLOR forces colour off even on a TTY', () => {
    process.stdout.isTTY = true
    process.env.NO_COLOR = '1'
    expect(isColourEnabled()).toBe(false)
  })

  it('the --no-color context flag forces colour off regardless of everything else', () => {
    process.stdout.isTTY = true
    process.env.FORCE_COLOR = '1'
    setContext({ noColor: true })
    expect(isColourEnabled()).toBe(false)
    expect(theme.error('x')).toBe('x')
  })
})
