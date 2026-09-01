// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import type { Server } from 'node:http'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { startDevServer, type DevServer } from './dev-server.js'

let siteRoot: string
let server: DevServer | undefined
let blocker: Server | undefined

/** Binds an OS-assigned free port and resolves it — used to occupy a port
 * ahead of `startDevServer` so its EADDRINUSE handling has something real
 * to react to. */
function listenOnFreePort(): Promise<{ server: Server; port: number }> {
  return new Promise((resolvePromise, reject) => {
    const s = createServer()
    s.once('error', reject)
    s.listen(0, () => {
      const address = s.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolvePromise({ server: s, port })
    })
  })
}

async function writeFixtureSite(root: string, opts: { siteUrl?: string } = {}): Promise<void> {
  await mkdir(join(root, 'build', 'site'), { recursive: true })
  await writeFile(join(root, 'build', 'site', 'index.html'), '<html><body><h1>hi</h1></body></html>', 'utf8')
  await mkdir(join(root, 'src'), { recursive: true })
  const siteBlock = opts.siteUrl ? `site:\n  url: ${opts.siteUrl}\n` : 'site:\n  title: Fixture\n'
  await writeFile(
    join(root, 'antora-playbook.local.yml'),
    `${siteBlock}\ncontent:\n  sources:\n    - url: ..\n      start_path: docs/src\n`,
    'utf8'
  )
}

beforeEach(async () => {
  siteRoot = await mkdtemp(join(tmpdir(), 'docouture-cli-dev-server-'))
})

afterEach(async () => {
  await server?.close()
  server = undefined
  blocker?.close()
  blocker = undefined
})

describe('startDevServer', () => {
  it('always rebuilds up front, even when a prior build/site already exists on disk', async () => {
    await writeFixtureSite(siteRoot)
    const runBuild = vi.fn(async () => {
      await writeFile(join(siteRoot, 'build', 'site', 'index.html'), '<html><body>rebuilt</body></html>', 'utf8')
      return true
    })

    server = await startDevServer({ siteRoot, port: 0, runBuild, log: () => {}, logError: () => {} })

    expect(runBuild).toHaveBeenCalledTimes(1)
    const res = await fetch(`http://localhost:${server.port}/`)
    const body = await res.text()
    // The prior fixture's <h1>hi</h1> is gone — this is the freshly built
    // output, not the stale one left over on disk.
    expect(body).not.toContain('<h1>hi</h1>')
    expect(body).toContain('rebuilt')
  })

  it('builds once up front when there is no build output yet', async () => {
    await mkdir(join(siteRoot, 'src'), { recursive: true })
    await writeFile(join(siteRoot, 'antora-playbook.local.yml'), 'site:\n  title: Fixture\n', 'utf8')
    const runBuild = vi.fn(async () => {
      await mkdir(join(siteRoot, 'build', 'site'), { recursive: true })
      await writeFile(join(siteRoot, 'build', 'site', 'index.html'), '<html><body>built</body></html>', 'utf8')
      return true
    })

    server = await startDevServer({ siteRoot, port: 0, runBuild, log: () => {}, logError: () => {} })

    expect(runBuild).toHaveBeenCalledTimes(1)
    const res = await fetch(`http://localhost:${server.port}/`)
    expect(await res.text()).toContain('built')
  })

  it('throws when the initial build fails and there is no prior output', async () => {
    await mkdir(join(siteRoot, 'src'), { recursive: true })
    await writeFile(join(siteRoot, 'antora-playbook.local.yml'), 'site:\n  title: Fixture\n', 'utf8')
    const runBuild = vi.fn(async () => false)

    await expect(startDevServer({ siteRoot, port: 0, runBuild, log: () => {}, logError: () => {} })).rejects.toThrow(
      'initial build failed'
    )
  })

  it('falls back to serving the stale build when the initial rebuild fails but prior output exists', async () => {
    await writeFixtureSite(siteRoot)
    const runBuild = vi.fn(async () => false)
    const logError = vi.fn()

    server = await startDevServer({ siteRoot, port: 0, runBuild, log: () => {}, logError })

    expect(runBuild).toHaveBeenCalledTimes(1)
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('initial rebuild failed'))
    const res = await fetch(`http://localhost:${server.port}/`)
    // Stale fixture content, still served rather than a crashed server.
    expect(await res.text()).toContain('<h1>hi</h1>')
  })

  it('404s outside the site root, including path traversal attempts', async () => {
    await writeFixtureSite(siteRoot)
    server = await startDevServer({ siteRoot, port: 0, runBuild: async () => true, log: () => {}, logError: () => {} })

    const res = await fetch(`http://localhost:${server.port}/../../etc/passwd`)
    expect(res.status).toBe(404)
  })

  it('redirects `/` and 404s outside the base path when site.url has a path', async () => {
    await writeFixtureSite(siteRoot, { siteUrl: 'https://docs.example.com/weavejs' })
    server = await startDevServer({ siteRoot, port: 0, runBuild: async () => true, log: () => {}, logError: () => {} })

    expect(server.basePath).toBe('/weavejs')

    const rootRes = await fetch(`http://localhost:${server.port}/`, { redirect: 'manual' })
    expect(rootRes.status).toBe(302)
    expect(rootRes.headers.get('location')).toBe('/weavejs/')

    const outsideRes = await fetch(`http://localhost:${server.port}/somewhere-else`)
    expect(outsideRes.status).toBe(404)

    const insideRes = await fetch(`http://localhost:${server.port}/weavejs/`)
    expect(insideRes.status).toBe(200)
  })

  it('rebuilds and notifies reload when a watched file changes', async () => {
    await writeFixtureSite(siteRoot)
    let built = false
    const runBuild = vi.fn(async () => {
      built = true
      await writeFile(join(siteRoot, 'build', 'site', 'index.html'), '<html><body>rebuilt</body></html>', 'utf8')
      return true
    })

    server = await startDevServer({ siteRoot, port: 0, runBuild, log: () => {}, logError: () => {} })

    const events: string[] = []
    const controller = new AbortController()
    const streamPromise = (async () => {
      const res = await fetch(`http://localhost:${server!.port}/__dev/reload`, { signal: controller.signal })
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        events.push(decoder.decode(value))
        if (events.some((e) => e.includes('reload'))) break
      }
    })()

    // Give the SSE connection a moment to register before triggering a change.
    await new Promise((r) => setTimeout(r, 100))
    await writeFile(join(siteRoot, 'src', 'touched.adoc'), 'x', 'utf8')

    await Promise.race([
      streamPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ])
    controller.abort()

    expect(built).toBe(true)
    expect(events.join('')).toContain('reload')
  })

  it('rejects when an explicitly-requested port is already in use', async () => {
    await writeFixtureSite(siteRoot)
    const { server: busyServer, port } = await listenOnFreePort()
    blocker = busyServer

    await expect(
      startDevServer({ siteRoot, port, runBuild: async () => true, log: () => {}, logError: () => {} })
    ).rejects.toThrow(/EADDRINUSE/)
  })

  it('falls back to a random free port when the default port is busy', async () => {
    await writeFixtureSite(siteRoot)
    const { server: busyServer, port: busyPort } = await listenOnFreePort()
    blocker = busyServer
    const logError = vi.fn()

    // `port` left unset (the "default port" case) and `defaultPort` pointed
    // at the port already occupied above — startDevServer must not throw,
    // and must come up listening on some other, OS-assigned port instead.
    server = await startDevServer({
      siteRoot,
      defaultPort: busyPort,
      runBuild: async () => true,
      log: () => {},
      logError,
    })

    expect(server.port).not.toBe(busyPort)
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('falling back to a random free port'))
    const res = await fetch(`http://localhost:${server.port}/`)
    expect(res.status).toBe(200)
  })
})
