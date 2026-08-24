#!/usr/bin/env node
'use strict'

// Checks the built site (build/site) for broken links, but only ever FAILS
// on a broken EXTERNAL (http/https) link — a raw link in content Antora
// itself can't see, which is the whole reason this check exists (Antora's
// own strict mode, runtime.log.failure_level: warn, already fails the build
// on a broken xref before this script ever runs).
//
// A broken LOCAL link is reported as a warning, never a failure. Two
// reasons a local link can legitimately show up BROKEN here even though
// nothing is actually wrong:
//
//   1. pdocs-pr-verify.yml and pdocs-release.yml both build with
//      antora-playbook.local.yml (branches: HEAD only) rather than the real,
//      multi-source antora-playbook.yml — content generated from config
//      rather than an xref (the module switcher, the footer, a
//      urls.latest_version_segment alias) can point at another version or
//      component that simply isn't part of this reduced, single-source
//      build. Antora doesn't fail on these (they're not xrefs it resolves),
//      but linkinator, crawling the actual rendered HTML, will.
//   2. Any other local-link false positive linkinator produces against
//      content Antora itself is satisfied with.
//
// Uses linkinator's own JS API (see @inditextech/pdocs-*'s own
// devDependency on it in package.json) rather than shelling out to its CLI:
// the CLI's own --skip flag can only exclude a link from being checked
// altogether (see linkinator's own source, LinkChecker#crawl: a skipped URL
// is never fetched, so it can neither be validated NOR recursed into) — it
// cannot express "fetch and recurse through this page, just don't fail the
// whole job over IT specifically". Classifying results after the fact, via
// the API, is the only way to get both: a full recursive crawl of every
// generated page (so a raw external link buried three pages deep still gets
// found), and a pass/fail decision that only external links get to make.
import { check } from 'linkinator'

const SKIP = ['^(mailto:|tel:)']

// linkinator's own mapUrl() (see its src/index.ts) strips the local static
// server's http://127.0.0.1:<port> prefix from every local result before
// it's reported — the port is random per run, so this is the only stable
// way to tell a local link from an external one after the fact: whatever's
// left over either still starts with http(s):// (a real external URL) or
// doesn't (a local one, already rewritten to a bare path).
const isExternal = (url) => /^https?:\/\//.test(url)

const result = await check({
  path: 'build/site',
  recurse: true,
  linksToSkip: SKIP,
})

const broken = result.links.filter((link) => link.state === 'BROKEN')
const external = broken.filter((link) => isExternal(link.url))
const local = broken.filter((link) => !isExternal(link.url))

for (const link of local) {
  console.log(`::warning::local link reported broken (ignored): ${link.url} (parent: ${link.parent ?? 'unknown'})`)
}

if (external.length > 0) {
  for (const link of external) {
    console.log(`::error::broken external link: ${link.url} (parent: ${link.parent ?? 'unknown'})`)
  }
  console.error(`\n${external.length} broken external link(s) found.`)
  process.exit(1)
}

console.log(
  `Checked ${result.links.length} link(s): 0 broken external link(s)` +
    (local.length > 0 ? `, ${local.length} local link(s) ignored (see warnings above).` : '.')
)
