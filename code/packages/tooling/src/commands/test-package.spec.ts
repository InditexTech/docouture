'use strict'

import { describe, expect, it, vi } from 'vitest'

import { runTestPackage } from './test-package.js'

describe('runTestPackage', () => {
  it('rejects a missing package name argument', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const code = await runTestPackage([])
    expect(code).toBe(2)
    errorSpy.mockRestore()
  })

  it('rejects a names argument that is only whitespace/commas', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const code = await runTestPackage([' , ,'])
    expect(code).toBe(2)
    errorSpy.mockRestore()
  })
})
