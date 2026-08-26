'use strict'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { debugLog } from './debug-log.js'
import { resetContext, setContext } from './cli-context.js'

let errorSpy: ReturnType<typeof vi.spyOn>
let originalDebug: string | undefined

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  originalDebug = process.env.DEBUG
  delete process.env.DEBUG
})

afterEach(() => {
  errorSpy.mockRestore()
  if (originalDebug === undefined) delete process.env.DEBUG
  else process.env.DEBUG = originalDebug
  resetContext()
})

describe('debugLog', () => {
  it('is silent by default', () => {
    debugLog('hello')
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('prints to stderr when --verbose is set via cli-context', () => {
    setContext({ verbose: true })
    debugLog('hello')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('hello'))
  })

  it('prints when DEBUG=docouture', () => {
    process.env.DEBUG = 'docouture'
    debugLog('hello')
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('prints when DEBUG=* alongside other namespaces', () => {
    process.env.DEBUG = 'other,*'
    debugLog('hello')
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('stays silent for an unrelated DEBUG namespace', () => {
    process.env.DEBUG = 'something-else'
    debugLog('hello')
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
