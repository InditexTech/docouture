#!/usr/bin/env node
//
// Minimal static file server for previewing a generated Antora site.
//
// Deliberately dependency-free: this only ever serves local build output during
// development and is not intended for anything else.
//
// Usage: node scripts/serve.mjs <dir> [port]

import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'

const root = resolve(process.argv[2] ?? 'build/site')
const port = Number(process.argv[3] ?? process.env.PORT ?? 5000)

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

/** Resolve a request path to a file inside `root`, or null if it escapes it. */
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

const server = createServer(async (req, res) => {
  const target = await resolveTarget(req.url ?? '/')
  if (!target) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('404 Not Found')
    return
  }
  res.writeHead(200, { 'content-type': CONTENT_TYPES[extname(target)] ?? 'application/octet-stream' })
  createReadStream(target).pipe(res)
})

try {
  await stat(root)
} catch {
  console.error(`No such directory: ${root}\nBuild the site first.`)
  process.exit(1)
}

server.listen(port, () => console.log(`Serving ${root}\n  http://localhost:${port}`))
