'use strict'

import { describe, expect, it, vi } from 'vitest'

import { runBump } from './bump.js'

describe('runBump', () => {
  it('rejects a level that is neither a known keyword nor an X.Y.Z version', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const code = await runBump(['not-a-level'])
    expect(code).toBe(2)
    expect(errorSpy.mock.calls.join('\n')).toContain("not a bump level or version: 'not-a-level'")
    errorSpy.mockRestore()
  })
})
