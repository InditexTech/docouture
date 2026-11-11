// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it } from 'vitest'

import { detectModeFromPlaybook } from './site-mode.js'

describe('detectModeFromPlaybook', () => {
  it('detects versioned from docs/v*', () => {
    expect(detectModeFromPlaybook("content:\n  sources:\n    - tags: ['docs/v*']\n")).toBe('versioned')
  })

  it('detects standalone from docs/stable', () => {
    expect(detectModeFromPlaybook("    tags: ['docs/stable']\n")).toBe('standalone')
  })

  it('returns null for anything else', () => {
    expect(detectModeFromPlaybook("    tags: ['other']\n")).toBeNull()
    expect(detectModeFromPlaybook('no tags here')).toBeNull()
  })
})
