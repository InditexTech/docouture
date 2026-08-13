#!/usr/bin/env node
//
// Mirror the IOP Design System icon sprites.
//
// Fetches all 25 group sprites into the gitignored `.icons/` mirror and records
// what was fetched in `icons.lock.json`. This is the only stage of the icon
// pipeline that touches the network, and it is run by hand — at a design system
// version bump, or when an icon is needed that the mirror predates. The build
// never calls it, so CI stays offline and Nx caching stays honest.
//
// The whole catalogue is mirrored, not just the icons the manifest uses. That
// is what lets `build-sprite` say "you meant others/home-outlined" instead of
// "not found", and what makes `search-icons` possible at all. The mirror is
// ~1.5 MB of proprietary artwork, which is why it is gitignored: the repository
// carries the 20-odd icons the site ships, not the other 1300.
//
// The CDN publishes no version in the URL and the sprites can change under us,
// so the lock records an ETag, a last-modified date and a SHA-256 per group.
// `--check` re-fetches and diffs against the lock without writing anything,
// which is how a design system update announces itself.
//
// Usage:
//   node scripts/fetch-icons.mjs            refresh the mirror and the lock
//   node scripts/fetch-icons.mjs --check    report drift, write nothing

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { GROUPS, fail, parseSymbols, paths, sha256, sourceUrl, style, SOURCE_TEMPLATE } from './lib/icons.mjs'

const REQUEST_TIMEOUT_MS = 30_000

async function fetchGroup(group) {
  const url = sourceUrl(group)
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`GET ${url} returned ${res.status} ${res.statusText}`)

  const svg = await res.text()
  // Parse before writing: a redirect to an HTML error page is a 200 with the
  // wrong body, and a mirror of error pages is worse than no mirror.
  const { symbols, duplicates } = parseSymbols(svg, group)

  return {
    svg,
    entry: {
      etag: res.headers.get('etag') ?? null,
      lastModified: res.headers.get('last-modified') ?? null,
      sha256: sha256(svg),
      bytes: Buffer.byteLength(svg),
      symbols: symbols.size,
      // Repeated ids upstream. Recorded so the count is reviewable rather than
      // quietly absorbed; see parseSymbols.
      ...(duplicates ? { duplicateIds: duplicates } : {}),
    },
  }
}

async function readLock() {
  try {
    return JSON.parse(await readFile(paths.lock, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

async function main() {
  const check = process.argv.includes('--check')
  const previous = await readLock()

  if (check && !previous) throw new Error(`No ${paths.lock} to check against. Run \`just icons-fetch\` first.`)
  if (!check) await mkdir(paths.mirror, { recursive: true })

  const groups = {}
  const changed = []
  let totalBytes = 0
  let totalSymbols = 0
  let totalDuplicates = 0

  // Sequential on purpose: 25 small requests against an internal CDN, and a
  // readable progress log beats a marginally faster burst.
  for (const group of GROUPS) {
    const { svg, entry } = await fetchGroup(group)
    groups[group] = entry
    totalBytes += entry.bytes
    totalSymbols += entry.symbols
    totalDuplicates += entry.duplicateIds ?? 0

    const before = previous?.groups?.[group]
    const state = !before ? 'new' : before.sha256 === entry.sha256 ? 'same' : 'changed'
    if (state !== 'same') changed.push({ group, before, after: entry, state })

    if (!check) await writeFile(join(paths.mirror, `sw-icons-${group}.symbol.svg`), svg)

    const mark = state === 'same' ? `${style.dim}=${style.off}` : `${style.yellow}~${style.off}`
    const dup = entry.duplicateIds ? `${style.dim} +${entry.duplicateIds} dup${style.off}` : ''
    console.log(
      `${mark} ${group.padEnd(15)} ${String(entry.symbols).padStart(4)} symbols  ${style.dim}${entry.bytes} B${style.off}${dup}`
    )
  }

  console.log(
    `\n${GROUPS.length} groups, ${totalSymbols} symbols, ${(totalBytes / 1024).toFixed(0)} KB ${style.dim}(mirror is gitignored)${style.off}`
  )
  if (totalDuplicates) {
    console.log(`${style.dim}${totalDuplicates} repeated id(s) upstream, deduplicated${style.off}`)
  }

  if (check) {
    if (!changed.length) {
      console.log(`${style.green}✓${style.off} mirror matches ${paths.lock}`)
      return
    }
    console.error(`\n${style.yellow}!${style.off} ${changed.length} group(s) differ from the lock:`)
    for (const { group, before, after, state } of changed) {
      const delta = before ? after.symbols - before.symbols : after.symbols
      const sign = delta > 0 ? `+${delta}` : String(delta)
      console.error(`    ${group} ${style.dim}(${state}, ${sign} symbols)${style.off}`)
    }
    console.error('\nRun `just icons-fetch` to accept, then `just icons-build` and review the sprite diff.')
    process.exitCode = 1
    return
  }

  await writeFile(
    paths.lock,
    JSON.stringify({ source: SOURCE_TEMPLATE, fetchedAt: new Date().toISOString(), groups }, null, 2) + '\n'
  )
  console.log(`${style.green}✓${style.off} wrote ${paths.lock}`)
  console.log(`${style.dim}next:${style.off} just icons-build`)
}

main().catch(fail)
