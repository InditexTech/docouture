'use strict'

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { startDevServer, type DevServer } from './dev-server.js'

let siteRoot: string
let server: DevServer | undefined

async function writeFixtureSite(root: string, opts: { siteUrl?: string } = {}): Promise<void> {
  await mkdir(join(root, 'build', 'site'), { recursive: true })
  await writeFile(join(root, 'build', 'site', 'index.html'), '<html><body><h1>hi</h1></body></html>', 'utf8')
  await mkdir(join(root, 'docs'), { recursive: true })
  const siteBlock = opts.siteUrl ? `site:\n  url: ${opts.siteUrl}\n` : 'site:\n  title: Fixture\n'
  await writeFile(
    join(root, 'antora-playbook.local.yml'),
    `${siteBlock}\ncontent:\n  sources:\n    - url: ..\n      start_path: docs/src\n`,
    'utf8'
  )
}

beforeEach(async () => {
  siteRoot = await mkdtemp(join(tmpdir(), 'pdocs-cli-dev-server-'))
})

afterEach(async () => {
  await server?.close()
  server = undefined
})

describe('startDevServer', () => {
  it('serves the existing build output without rebuilding', async () => {
    await writeFixtureSite(siteRoot)
    const runBuild = vi.fn(async () => true)

    server = await startDevServer({ siteRoot, port: 0, runBuild, log: () => {}, logError: () => {} })

    const res = await fetch(`http://localhost:${server.port}/`)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('<h1>hi</h1>')
    expect(body).toContain('/__dev/client.js')
    expect(runBuild).not.toHaveBeenCalled()
  })

  it('builds once up front when there is no build output yet', async () => {
    await mkdir(join(siteRoot, 'docs'), { recursive: true })
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
    await mkdir(join(siteRoot, 'docs'), { recursive: true })
    await writeFile(join(siteRoot, 'antora-playbook.local.yml'), 'site:\n  title: Fixture\n', 'utf8')
    const runBuild = vi.fn(async () => false)

    await expect(startDevServer({ siteRoot, port: 0, runBuild, log: () => {}, logError: () => {} })).rejects.toThrow(
      'initial build failed'
    )
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
    await writeFile(join(siteRoot, 'docs', 'touched.adoc'), 'x', 'utf8')

    await Promise.race([
      streamPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ])
    controller.abort()

    expect(built).toBe(true)
    expect(events.join('')).toContain('reload')
  })
})
