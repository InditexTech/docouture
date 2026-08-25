'use strict'

import { describe, expect, it } from 'vitest'

const registerLifecycleLog = require('./lifecycle-log')

function createContext() {
  const listeners = {}
  const logs = []
  return {
    getLogger: () => ({ info: (...args) => logs.push(args) }),
    on(event, fn) {
      ;(listeners[event] ||= []).push(fn)
    },
    async emit(event) {
      for (const fn of listeners[event] || []) await fn()
    },
    logs,
  }
}

describe('registerLifecycleLog', () => {
  it('registers a listener for every documented generate-site.js event', async () => {
    const context = createContext()
    let tick = 0
    registerLifecycleLog(context, { now: () => tick })

    for (const event of registerLifecycleLog.EVENTS) {
      tick += 1
      await context.emit(event)
    }

    expect(context.logs).toHaveLength(registerLifecycleLog.EVENTS.length)
    expect(context.logs.map(([, event]) => event)).toEqual(registerLifecycleLog.EVENTS)
  })

  it('logs elapsed time since the previous event and since the start', async () => {
    const context = createContext()
    let tick = 1000
    registerLifecycleLog(context, { now: () => tick })

    tick = 1050 // +50ms since registration
    await context.emit('contentAggregated')
    tick = 1230 // +180ms since the previous event, +230ms total
    await context.emit('contentClassified')

    expect(context.logs[0]).toEqual(['Antora: %s (+%dms, %dms total)', 'contentAggregated', 50, 50])
    expect(context.logs[1]).toEqual(['Antora: %s (+%dms, %dms total)', 'contentClassified', 180, 230])
  })

  it('does not throw when an event Antora never fires for this build (e.g. siteMapped without site.url) is simply never emitted', async () => {
    const context = createContext()
    registerLifecycleLog(context, { now: () => 0 })

    await context.emit('contentAggregated')

    expect(context.logs).toHaveLength(1)
  })
})
