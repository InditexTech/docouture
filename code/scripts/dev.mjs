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
import { createReadStream, existsSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'

const siteDir = process.cwd()
const root = resolve(process.argv[2] ?? 'build/site')
const port = Number(process.argv[3] ?? process.env.PORT ?? 5000)

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

const CLIENT_SCRIPT = `// Injected by scripts/dev.mjs. Not part of the built site.
new EventSource(${JSON.stringify(RELOAD_PATH)}).addEventListener('message', () => location.reload())
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
  // Guard against path traversal via `..` segments.
  if (candidate !== root && !candidate.startsWith(root + sep)) return null
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
  for (const res of clients) res.write('data: reload\n\n')
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
    return
  }

  if (url === CLIENT_PATH) {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
    res.end(CLIENT_SCRIPT)
    return
  }

  const target = await resolveTarget(url)
  if (!target) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('404 Not Found')
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

// -------------------------------------------------------------- rebuild -----

let child = null

function run(command, args, cwd) {
  return new Promise((resolvePromise) => {
    child = spawn(command, args, { cwd, stdio: 'inherit' })
    child.on('close', (code) => {
      child = null
      resolvePromise(code === 0)
    })
    child.on('error', (err) => {
      child = null
      logError(`could not run ${command}: ${err.message}`)
      resolvePromise(false)
    })
  })
}

// `--fetch` belongs to the one-off build: on a watch loop it would re-fetch
// every remote content source on every keystroke.
const buildSite = () => run(antoraBin, ['antora-playbook.yml'], siteDir)
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

  running = false
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
  log(`  http://localhost:${port}`)
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
