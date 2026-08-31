// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it } from 'vitest'

const registerVersionReport = require('./version-report')

function createContext(logs) {
  const listeners = {}
  return {
    getLogger: () => ({
      warn: () => {},
      info: (...args) => logs.push(args),
    }),
    on(event, fn) {
      ;(listeners[event] ||= []).push(fn)
    },
    async emit(event, payload) {
      for (const fn of listeners[event] || []) await fn(payload)
    },
  }
}

function componentVersion({ version, prerelease }) {
  return { version, prerelease }
}

async function run(components) {
  const logs = []
  const context = createContext(logs)
  registerVersionReport(context)

  const contentCatalog = {
    getComponents: () => components,
  }

  await context.emit('contentClassified', { contentCatalog })
  return logs.map(([, ...args]) => args.join(': '))
}

describe('registerVersionReport', () => {
  it('flags the version Antora picked as latest', async () => {
    const stable = componentVersion({ version: 'stable' })
    const prerelease = componentVersion({ version: 'prerelease', prerelease: true })
    const component = { name: 'test-docs', versions: [stable, prerelease], latest: stable }

    const rows = await run([component])

    expect(rows).toEqual(['test-docs: stable (latest), prerelease (prerelease)'])
  })

  it('reports a single-version component with no latest/prerelease flags implied incorrectly', async () => {
    const onlyVersion = componentVersion({ version: 'prerelease', prerelease: true })
    const component = { name: 'test-docs', versions: [onlyVersion], latest: onlyVersion }

    const rows = await run([component])

    // A component with only a prerelease version still has SOME latest
    // (Antora's own fallback — there's no "no latest" state) — both flags
    // legitimately apply to the same single entry.
    expect(rows).toEqual(['test-docs: prerelease (latest, prerelease)'])
  })

  it('reports every component in the catalog', async () => {
    const v1 = componentVersion({ version: '1.0' })
    const v2 = componentVersion({ version: '2.0' })
    const componentA = { name: 'a', versions: [v1], latest: v1 }
    const componentB = { name: 'b', versions: [v2], latest: v2 }

    const rows = await run([componentA, componentB])

    expect(rows).toEqual(['a: 1.0 (latest)', 'b: 2.0 (latest)'])
  })

  it('reports a non-latest, non-prerelease version plainly', async () => {
    const older = componentVersion({ version: '1.0' })
    const newer = componentVersion({ version: '2.0' })
    const component = { name: 'test-docs', versions: [older, newer], latest: newer }

    const rows = await run([component])

    expect(rows).toEqual(['test-docs: 1.0, 2.0 (latest)'])
  })
})
