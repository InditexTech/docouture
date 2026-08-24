'use strict'

// Development server for a scaffolded Antora site — ported from the
// monorepo's code/scripts/dev.mjs, trimmed to what a standalone site (no
// sibling ui-bundle package, ever) actually needs: this package builds and
// ships the server so a bugfix reaches already-scaffolded sites on their
// next `npm update @inditextech/pdocs-cli`, rather than being frozen at
// whatever `pdocs new` copied at scaffold time.
//
// Antora is a batch generator with no incremental mode, so "live reload"
// here means re-running the whole build on every change and reloading the
// browser once it lands. A failed rebuild leaves the previous output in
// place — the browser keeps showing the last version that worked rather
// than a half-written site.

import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { execFile } from 'node:child_process'
import { readFile, stat, watch as watchDir } from 'node:fs/promises'
import { createReadStream, existsSync } from 'node:fs'
import { extname, isAbsolute, join, normalize, relative, resolve } from 'node:path'

import { readSiteUrl } from './playbook-yml.js'

const RELOAD_PATH = '/__dev/reload'
const CLIENT_PATH = '/__dev/client.js'
const DEBOUNCE_MS = 150
const BUILD_TIMEOUT_MS = 120_000

const CLIENT_SCRIPT = `// Injected by pdocs dev. Not part of the built site.
const es = new EventSource(${JSON.stringify(RELOAD_PATH)})
es.addEventListener('message', () => location.reload())
// Chrome (and other browsers) can freeze a navigated-away-from page in the
// back/forward cache instead of tearing it down — keeping its EventSource
// open indefinitely. Without this, every navigation leaks one open SSE
// connection; after enough of them the browser's per-origin connection
// limit is exhausted and the current page's own requests stop completing.
// 'pagehide' fires on both a normal unload and a bfcache freeze, so this
// closes the connection either way.
window.addEventListener('pagehide', () => es.close())
`

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

const IGNORED = /(?:^|[\\/])(?:\.|.*~$)|\.swp$/

export interface DevServerOptions {
  /** The site root: contains antora-playbook.local.yml and package.json. */
  siteRoot: string
  /** 0 picks any free port — used by tests. Defaults to 5000. */
  port?: number
  /**
   * Runs one build, returning whether it succeeded. Defaults to spawning
   * the site's own local `antora` against `antora-playbook.local.yml`.
   * Overridable so a caller (a test, or a future non-Antora build) doesn't
   * need a real Antora install just to exercise the server/watch/reload
   * plumbing.
   */
  runBuild?: () => Promise<boolean>
  log?: (msg: string) => void
  logError?: (msg: string) => void
}

export interface DevServer {
  /** The port actually bound — resolves the real value when 0 was requested. */
  port: number
  /** The base path the site is served under, from the playbook's site.url. */
  basePath: string
  url: string
  close(): Promise<void>
}

function defaultRunBuild(siteRoot: string): () => Promise<boolean> {
  const antoraBin = resolve(siteRoot, 'node_modules', '.bin', 'antora')
  return () =>
    new Promise((resolvePromise) => {
      // No --fetch here: that belongs to the one-off build only — on a
      // watch loop it would re-fetch the content source on every keystroke.
      // A timeout guards against a wedged/hung antora child process: with
      // none, a single stuck build would permanently block every future
      // rebuild for the rest of the dev session (drain()'s `running` flag
      // never clears because runBuild() never resolves).
      execFile(
        antoraBin,
        ['antora-playbook.local.yml'],
        { cwd: siteRoot, timeout: BUILD_TIMEOUT_MS },
        (err, stdout, stderr) => {
          if (err) {
            if (stdout) process.stdout.write(stdout)
            if (stderr) process.stderr.write(stderr)
          }
          resolvePromise(!err)
        }
      )
    })
}

async function readBasePath(siteRoot: string): Promise<string> {
  let source: string
  try {
    source = await readFile(join(siteRoot, 'antora-playbook.local.yml'), 'utf8')
  } catch {
    return ''
  }
  const url = readSiteUrl(source)
  if (!url || url === '/') return ''
  const path = url.startsWith('/') ? url : URL.parse(url)?.pathname
  if (!path || path === '/') return ''
  return path.replace(/\/+$/, '')
}

export async function startDevServer(options: DevServerOptions): Promise<DevServer> {
  const { siteRoot } = options
  const log = options.log ?? ((msg: string) => console.log(`dev ${msg}`))
  const logError = options.logError ?? ((msg: string) => console.error(`dev ${msg}`))
  const runBuild = options.runBuild ?? defaultRunBuild(siteRoot)

  const root = resolve(siteRoot, 'build', 'site')
  const basePath = await readBasePath(siteRoot)

  async function resolveTarget(urlPath: string): Promise<string | null> {
    const decoded = decodeURIComponent(urlPath.split('?')[0] ?? '')
    const candidate = resolve(join(root, normalize(decoded)))
    // Containment check against `root`, expressed as a relative-path test —
    // the form static analysis (CodeQL's js/path-injection) recognises as a
    // real sanitizer, not just `startsWith` on two strings. A `candidate`
    // outside `root` resolves to a relative path that either escapes
    // upwards (`..`) or is itself absolute (no common prefix at all).
    const rel = relative(root, candidate)
    if (rel.startsWith('..') || isAbsolute(rel)) return null
    try {
      const info = await stat(candidate)
      if (!info.isDirectory()) return candidate
      const index = join(candidate, 'index.html')
      await stat(index)
      return index
    } catch {
      return null
    }
  }

  const clients = new Set<import('node:http').ServerResponse>()
  function notifyReload(): void {
    for (const res of clients) {
      try {
        res.write('data: reload\n\n')
      } catch {
        // Client's socket already gone (e.g. torn down mid-navigation) —
        // drop it rather than let an unhandled write error crash the
        // server; the 'error'/'close' listeners below also reap it.
        clients.delete(res)
      }
    }
  }

  /**
   * A path that isn't in the site. Antora only writes `404.html` at the
   * site root when `site.url` is set (@antora/page-composer
   * create404Page) — when it does, serve it (rewritten for reload, like
   * any other HTML response) so the dev server's 404 matches the deployed
   * one instead of a bare plain-text stand-in.
   */
  async function respondNotFound(res: import('node:http').ServerResponse): Promise<void> {
    try {
      const html = await readFile(join(root, '404.html'), 'utf8')
      const snippet = `<script src="${CLIENT_PATH}"></script>`
      const body = html.includes('</body>') ? html.replace('</body>', `${snippet}</body>`) : html + snippet
      res.writeHead(404, { 'content-type': CONTENT_TYPES['.html']!, 'cache-control': 'no-store' })
      res.end(body)
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('404 Not Found')
    }
  }

  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = req.url ?? '/'

      if (url === RELOAD_PATH) {
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        })
        res.write(': connected\n\n')
        clients.add(res)
        req.on('close', () => clients.delete(res))
        // A page navigation can drop the underlying socket before the
        // 'close' event above fires; without an 'error' listener here
        // Node's default behaviour for an unhandled stream error is to
        // throw, taking the whole dev server down mid-navigation.
        res.on('error', () => clients.delete(res))
        return
      }

      if (url === CLIENT_PATH) {
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
        res.end(CLIENT_SCRIPT)
        return
      }

      let sitePath = url
      if (basePath) {
        if (url === '/' || url === basePath) {
          res.writeHead(302, { location: `${basePath}/` })
          res.end()
          return
        }
        if (!url.startsWith(`${basePath}/`)) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
          res.end(`404 Not Found — this site is served under ${basePath}/`)
          return
        }
        sitePath = url.slice(basePath.length)
      }

      const target = await resolveTarget(sitePath)
      if (!target) {
        await respondNotFound(res)
        return
      }

      const contentType = CONTENT_TYPES[extname(target)] ?? 'application/octet-stream'

      if (contentType === CONTENT_TYPES['.html']) {
        const html = await readFile(target, 'utf8')
        const snippet = `<script src="${CLIENT_PATH}"></script>`
        const body = html.includes('</body>') ? html.replace('</body>', `${snippet}</body>`) : html + snippet
        res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' })
        res.end(body)
        return
      }

      res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' })
      createReadStream(target).pipe(res)
    })()
  })

  let running = false
  let queued = false
  let timer: NodeJS.Timeout | null = null

  function schedule(): void {
    queued = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void drain(), DEBOUNCE_MS)
  }

  async function drain(): Promise<void> {
    timer = null
    if (running || !queued) return
    running = true

    try {
      while (queued) {
        queued = false
        const started = Date.now()
        log('content changed, rebuilding site')
        const ok = await runBuild()
        if (ok) {
          log(`rebuilt in ${((Date.now() - started) / 1000).toFixed(1)}s`)
          notifyReload()
        } else {
          logError('rebuild failed, serving the previous build')
        }
      }
    } catch (err) {
      // A build that throws instead of resolving false must not leave
      // `running` stuck true forever — that would silently disable every
      // future rebuild for the rest of the dev session.
      logError(`rebuild crashed, serving the previous build: ${(err as Error).message}`)
    } finally {
      running = false
    }
  }

  const watchAbort = new AbortController()

  async function watchPath(path: string, watchOptions: { recursive?: boolean } = {}): Promise<void> {
    try {
      for await (const event of watchDir(path, {
        recursive: watchOptions.recursive ?? true,
        signal: watchAbort.signal,
      })) {
        if (event.filename && IGNORED.test(event.filename)) continue
        schedule()
      }
    } catch (err) {
      if ((err as { name?: string }).name !== 'AbortError') {
        logError(`stopped watching ${path}: ${(err as Error).message}`)
      }
    }
  }

  if (!existsSync(root)) {
    log('no build output yet, building the site')
    if (!(await runBuild())) {
      throw new Error('initial build failed')
    }
  }

  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 5000, () => {
      server.off('error', reject)
      resolvePromise()
    })
  })

  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : (options.port ?? 5000)

  log(`serving ${root}`)
  log(`  http://localhost:${port}${basePath}/`)

  const watchers = [
    watchPath(join(siteRoot, 'docs')),
    watchPath(join(siteRoot, 'antora-playbook.local.yml'), { recursive: false }),
  ]
  void Promise.all(watchers)

  return {
    port,
    basePath,
    url: `http://localhost:${port}${basePath}/`,
    async close() {
      watchAbort.abort()
      if (timer) clearTimeout(timer)
      for (const res of clients) res.end()
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()))
    },
  }
}
