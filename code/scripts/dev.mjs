#!/usr/bin/env node
//
// Development server for an Antora site: serve the built site, rebuild it when
// its sources change, and reload the browser when the rebuild lands.
//
// Antora is a batch generator with no incremental mode, so "live reload" here
// means re-running the whole build. That is cheap for a small site and honest
// about what it costs for a large one.
//
// Editing the UI goes through the bundle: the UI is rebuilt, zipped, and then
// the site is regenerated against it. That is several times slower than the
// standalone UI preview (`just preview-ui`), which is the right tool when the
// content is not what you are changing.
//
// Deliberately dependency-free: this only ever serves local build output during
// development and is not intended for anything else. The reload channel is a
// server-sent-event stream plus a snippet injected into each HTML response as
// it is served; nothing is written into the built site itself.
//
// Usage: node scripts/dev.mjs [dir] [port]
//   Run from a site package directory. `dir` defaults to build/site.

import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFile, stat, watch as watchDir } from 'node:fs/promises'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { extname, isAbsolute, join, normalize, relative, resolve } from 'node:path'

const siteDir = process.cwd()
const root = resolve(process.argv[2] ?? 'build/site')
const port = Number(process.argv[3] ?? process.env.PORT ?? 5000)

// Antora's `site.url` may carry a path (`/weavejs`, or an absolute URL ending
// in one). That path is the site's public root: Antora records it as
// `site.path` and uses it as the root path for pages that have no relative one
// of their own — the 404 page — while every other page links relatively, so
// nothing is written into a `weavejs/` directory on disk. Serving `build/site`
// at `/` would therefore work, and lie: the URLs would not be the deployed
// ones, and the 404 page's own asset links would point at a prefix this server
// doesn't answer on. So the prefix is honoured here instead, the way the
// reverse proxy in front of the deployed site does.
const basePath = readSiteBasePath()

// Deliberately not a YAML parser — this script has no dependencies (see the
// header) and needs exactly one scalar. Scans the top-level `site:` block for
// its `url:` key and stops at the next top-level key, so a `url:` belonging to
// a content source or the UI bundle can never be picked up by mistake.
function readSiteBasePath() {
  let source
  try {
    source = readFileSync(join(siteDir, 'antora-playbook.yml'), 'utf8')
  } catch {
    return ''
  }
  let inSite = false
  let url
  for (const line of source.split('\n')) {
    if (/^\s*(?:#|$)/.test(line)) continue
    if (/^\S/.test(line)) {
      if (inSite) break
      inSite = /^site:/.test(line)
      continue
    }
    if (!inSite) continue
    const match = /^\s+url:\s*(.+?)\s*$/.exec(line)
    if (match) {
      url = match[1].replace(/^['"]|['"]$/g, '')
      break
    }
  }
  if (!url || url === '/') return ''
  const path = url.startsWith('/') ? url : URL.parse(url)?.pathname
  if (!path || path === '/') return ''
  return path.replace(/\/+$/, '')
}

const uiDir = resolve(siteDir, '../ui-bundle')
const antoraBin = resolve(siteDir, 'node_modules/.bin/antora')
const gulpBin = resolve(uiDir, 'node_modules/.bin/gulp')

// A sibling ui-bundle is a monorepo convenience. Once this package is copied
// into a repository of its own the UI arrives as a published bundle, and there
// is nothing local to watch.
const hasLocalUi = existsSync(gulpBin) && existsSync(join(uiDir, 'src'))

const RELOAD_PATH = '/__dev/reload'
const CLIENT_PATH = '/__dev/client.js'
const DEBOUNCE_MS = 150
const BUILD_TIMEOUT_MS = 120_000

const CLIENT_SCRIPT = `// Injected by scripts/dev.mjs. Not part of the built site.
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

// ------------------------------------------------------------------ log -----

const colour = process.stdout.isTTY && !process.env.NO_COLOR
const dim = colour ? '\u001b[2m' : ''
const red = colour ? '\u001b[31m' : ''
const off = colour ? '\u001b[0m' : ''

const log = (msg) => console.log(`${dim}dev${off} ${msg}`)
const logError = (msg) => console.error(`${red}dev${off} ${msg}`)

// --------------------------------------------------------------- server -----

const CONTENT_TYPES = {
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

/**
 * Map a request path to a file inside `root`, or null.
 *
 * Null covers both "escapes the site" and "not in the site", because both are
 * a 404 to the caller.
 */
async function resolveTarget(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
  const candidate = resolve(join(root, normalize(decoded)))
  // Containment check against `root`, expressed as a relative-path test —
  // the form static analysis (CodeQL's js/path-injection) recognises as a
  // real sanitizer, not just `startsWith` on two strings. A `candidate`
  // outside `root` resolves to a relative path that either escapes upwards
  // (`..`) or is itself absolute (no common prefix at all).
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

/** Open SSE responses. A reload is a write to every one of them. */
const clients = new Set()

function notifyReload() {
  for (const res of clients) {
    try {
      res.write('data: reload\n\n')
    } catch {
      // Client's socket already gone (e.g. torn down mid-navigation) — drop
      // it rather than let an unhandled write error crash the server; the
      // 'error'/'close' listeners below also reap it.
      clients.delete(res)
    }
  }
}

const server = createServer(async (req, res) => {
  const url = req.url ?? '/'

  if (url === RELOAD_PATH) {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    // An initial comment flushes headers, so the browser settles into the
    // stream instead of waiting on the first rebuild.
    res.write(': connected\n\n')
    clients.add(res)
    req.on('close', () => clients.delete(res))
    // A page navigation can drop the underlying socket before the 'close'
    // event above fires; without an 'error' listener here Node's default
    // behaviour for an unhandled stream error is to throw, taking the whole
    // dev server down mid-navigation.
    res.on('error', () => clients.delete(res))
    return
  }

  if (url === CLIENT_PATH) {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
    res.end(CLIENT_SCRIPT)
    return
  }

  // The reload channel above stays at the server root, not under `basePath`:
  // the snippet injected into each page references it absolutely, and it is
  // this script's own endpoint rather than part of the site being served.
  //
  // Everything else lives under the prefix. `/` redirects into it rather than
  // 404ing, so `http://localhost:5000` still opens the site.
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

  // HTML is rewritten rather than streamed so the reload snippet can be added.
  // Everything else is streamed untouched. `no-store` throughout: a cached
  // response would survive the rebuild the reload exists to reveal.
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
})

/**
 * A path that isn't in the site. Antora only writes `404.html` at the site
 * root when `site.url` is set (@antora/page-composer create404Page) — when
 * it does, serve it (rewritten for reload, like any other HTML response) so
 * the dev server's 404 matches the deployed one instead of a bare plain-text
 * stand-in.
 */
async function respondNotFound(res) {
  const notFoundPage = join(root, '404.html')
  try {
    const html = await readFile(notFoundPage, 'utf8')
    const snippet = `<script src="${CLIENT_PATH}"></script>`
    const body = html.includes('</body>') ? html.replace('</body>', `${snippet}</body>`) : html + snippet
    res.writeHead(404, { 'content-type': CONTENT_TYPES['.html'], 'cache-control': 'no-store' })
    res.end(body)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('404 Not Found')
  }
}

// -------------------------------------------------------------- rebuild -----

let child = null

function run(command, args, cwd) {
  return new Promise((resolvePromise) => {
    child = spawn(command, args, { cwd, stdio: 'inherit' })
    // A wedged/hung build (antora or gulp) must not block every future
    // rebuild for the rest of the dev session — without this, drain()'s
    // `running` flag would never clear because the child never exits.
    const killTimer = setTimeout(() => {
      logError(`${command} timed out after ${BUILD_TIMEOUT_MS / 1000}s, killing it`)
      child?.kill()
    }, BUILD_TIMEOUT_MS)
    child.on('close', (code) => {
      clearTimeout(killTimer)
      child = null
      resolvePromise(code === 0)
    })
    child.on('error', (err) => {
      clearTimeout(killTimer)
      child = null
      logError(`could not run ${command}: ${err.message}`)
      resolvePromise(false)
    })
  })
}

// Some site packages (e.g. `example`, GH-80 Mode 2 versioning) ship a second,
// dev-only playbook alongside the publish one: `antora-playbook.local.yml`
// points its content source at `branches: HEAD` instead of a hardcoded
// `branches: [main]`, so aggregation reads the actual worktree — whatever
// branch is checked out — instead of requiring `main` to already have the
// commit. That file's own header explains why: the publish playbook's
// `branches: [main]` resolves nothing on a feature branch or PR checkout.
// `package.json`'s own `build` script already prefers it per-package; this
// picks the same file so the live-reload rebuild loop below doesn't
// contradict the initial Nx-driven build that served the very first
// response — without this, editing a page that only exists on the current
// branch would build fine once, then 404 on the very next autosave-triggered
// rebuild, silently falling back to `main`'s content instead.
const LOCAL_PLAYBOOK = 'antora-playbook.local.yml'
const PUBLISH_PLAYBOOK = 'antora-playbook.yml'
const playbook = existsSync(join(siteDir, LOCAL_PLAYBOOK)) ? LOCAL_PLAYBOOK : PUBLISH_PLAYBOOK

// `--fetch` belongs to the one-off build: on a watch loop it would re-fetch
// every remote content source on every keystroke.
const buildSite = () => run(antoraBin, [playbook], siteDir)
const buildUi = () => run(gulpBin, ['bundle'], uiDir)

let running = false
/** At most one pending rebuild. 'ui' outranks 'content' because it implies it. */
let queued = null
let timer = null

function schedule(kind) {
  queued = queued === 'ui' ? 'ui' : kind
  if (timer) clearTimeout(timer)
  timer = setTimeout(drain, DEBOUNCE_MS)
}

async function drain() {
  timer = null
  if (running || !queued) return
  running = true

  try {
    while (queued) {
      const kind = queued
      queued = null

      const started = Date.now()
      log(kind === 'ui' ? 'ui changed, rebuilding bundle and site' : 'content changed, rebuilding site')

      // A failed build leaves the previous output in place: the browser keeps
      // showing the last version that worked rather than a half-written site.
      const ok = (kind !== 'ui' || (await buildUi())) && (await buildSite())

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
    logError(`rebuild crashed, serving the previous build: ${err.message}`)
  } finally {
    running = false
  }
}

// ---------------------------------------------------------------- watch -----

const IGNORED = /(?:^|[\\/])(?:\.|.*~$)|\.swp$/

async function watchPath(path, kind, { recursive = true } = {}) {
  try {
    for await (const event of watchDir(path, { recursive })) {
      if (event.filename && IGNORED.test(event.filename)) continue
      schedule(kind)
    }
  } catch (err) {
    if (err.name !== 'AbortError') logError(`stopped watching ${path}: ${err.message}`)
  }
}

// -------------------------------------------------------------- startup -----

// Normally `just dev` has already built the site through Nx and this is a
// no-op. Building here anyway means the script is also usable on its own, and
// that a stale `clean` does not turn into a confusing 404.
if (!existsSync(root)) {
  log('no build output yet, building the site')
  if (!(await buildSite())) {
    logError('initial build failed')
    process.exit(1)
  }
}

// A busy port is the ordinary failure here — a dev server left running in
// another terminal, or, on macOS, the AirPlay receiver squatting on 5000.
// Node's default is an unhandled 'error' event and a stack trace, which says
// none of that.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logError(`port ${port} is already in use`)
    logError('  stop whatever is listening on it, or pick another: just dev <site> <port>')
    process.exit(1)
  }
  throw err
})

server.listen(port, () => {
  log(`serving ${root}`)
  log(`  http://localhost:${port}${basePath}/`)
})

watchPath(join(siteDir, 'docs'), 'content')
watchPath(join(siteDir, 'antora-playbook.yml'), 'content', { recursive: false })
if (hasLocalUi) {
  watchPath(join(uiDir, 'src'), 'ui')
} else {
  log('no sibling ui-bundle package, watching content only')
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (child) child.kill(signal)
    server.close()
    process.exit(0)
  })
}
