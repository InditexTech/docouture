#!/usr/bin/env node
//
// One-off converter: Weave.js's Fumadocs MDX content -> AsciiDoc, writing
// into code/packages/example/docs/modules/. See this package's own
// package.json description and code/packages/example's package description
// for the wider migration this serves.
//
// Usage:
//   node migrate.mjs --pilot              convert the 6 agreed pilot pages
//   node migrate.mjs --all                convert every page in the corpus
//                                          (Phase 3), skipping EXCLUDED below
//   node migrate.mjs <root>/<rest>.mdx ... convert specific pages (path is
//                                          relative to content/docs/)
//
// Both modes read from WEAVEJS_DOCS_ROOT below and write into
// EXAMPLE_DOCS_ROOT's modules/. Re-run any time upstream content changes —
// nothing here is hand-edited output.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import yaml from 'js-yaml'
import { renderBlocks } from './lib/emit.mjs'
import { warn, printSummary } from './lib/warnings.mjs'
import { MODULES } from './lib/links.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEAVEJS_DOCS_ROOT = '/Users/jesusmpc/inditex/weavejs/docs'
const CONTENT_DOCS = join(WEAVEJS_DOCS_ROOT, 'content', 'docs')
const EXAMPLE_MODULES = join(HERE, '..', '..', 'packages', 'example', 'docs', 'modules')

const processor = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkMdx).use(remarkGfm)

// The 6 pages agreed for the Phase 1 pilot — chosen to exercise every
// component the converter has to handle: steps (fd-steps divs), cards,
// TypeTable, an <include>, Mermaid, and plain Callouts/lists.
const PILOT = [
  'main/build/actions/rectangle-tool.mdx',
  'main/build/nodes/rectangle.mdx',
  'sdk/api-reference/actions/index.mdx',
  'store-websockets/index.mdx',
  'sdk/api-reference/actions/action.mdx',
  'main/manual-installation/index.mdx',
]

// Phase 3 excludes, both decided during migration planning:
//   - main/index.mdx: the Weave.js home page, explicitly out of scope for
//     this migration (marketing layout, not documentation) — has its own
//     follow-up issue.
//   - main/build/plugins/index.old.mdx: a stale duplicate of index.mdx,
//     referenced by no meta.json anywhere in the corpus.
//   - sdk/api-reference/weave.mdx: found during Phase 4 nav generation — a
//     second stale duplicate. `sdk/api-reference/weave/` (a same-named
//     FOLDER, with its own index.mdx/events.mdx/meta.json) collides with
//     this flat file on the same route; every actual `/docs/sdk/api-
//     reference/weave` link in the corpus resolves content matching the
//     folder version, which is also the more complete of the two (confirmed
//     by diffing them — the folder has fields/behaviour the flat file
//     doesn't), so the flat file is the orphan here, same as index.old.mdx.
const EXCLUDE = new Set(['main/index.mdx', 'main/build/plugins/index.old.mdx', 'sdk/api-reference/weave.mdx'])

function discoverAll() {
  return readdirSync(CONTENT_DOCS, { recursive: true })
    .filter((p) => p.endsWith('.mdx'))
    .map((p) => p.split(sep).join('/'))
    .filter((p) => !EXCLUDE.has(p))
    .sort()
}

// Fumadocs' own heading levels are inconsistent in ways a single per-page
// depth offset can't fix: some pages mix depths non-monotonically (an `###`
// section followed later by a sibling `##` one — main/build/index.mdx), and
// some skip a level entirely partway through (`## Methods` then `#### connect`
// with no `###` between — store-azure-web-pubsub's client page). Both
// produced real "section title out of sequence" Antora build errors that an
// earlier, simpler fix (a single per-page depth offset) didn't catch, since
// that only handles a page that's uniformly shifted, not one that's locally
// irregular.
//
// A stack tracks the current heading's mdast depth against its AsciiDoc
// output level as headings are walked in document order: a deeper mdast
// heading is always exactly parent-level + 1 in the output (however big the
// real depth jump was), a shallower one pops back to its nearest matching
// ancestor (or level 1 if none), and equal depth repeats the same level —
// i.e. this rebuilds a valid, gap-free outline from a source one that isn't
// guaranteed to have one, using relative nesting as the only real signal
// (absolute mdast depth carries no reliable meaning across this corpus).
function computeHeadingLevels(node, stack = [], map = new Map()) {
  if (node.type === 'heading') {
    while (stack.length && node.depth <= stack[stack.length - 1].depth) stack.pop()
    const level = stack.length === 0 ? 1 : stack[stack.length - 1].level + 1
    map.set(node, level)
    stack.push({ depth: node.depth, level })
  }
  for (const child of node.children || []) computeHeadingLevels(child, stack, map)
  return map
}

function convertFile(relPath) {
  const absPath = join(CONTENT_DOCS, relPath)
  const src = readFileSync(absPath, 'utf8')
  const tree = processor.parse(src)

  const [module, ...rest] = relPath.replace(/\.mdx$/, '').split('/')
  const pagePath = `${rest.join('/')}.adoc`

  let frontmatter = {}
  const children = tree.children.slice()
  if (children[0]?.type === 'yaml') {
    frontmatter = yaml.load(children.shift().value) || {}
  }

  // The shallowest heading actually used becomes AsciiDoc level 1 (`==`,
  // Asciidoctor's required first-body-section level); every other heading's
  // level is derived from its position relative to its neighbours, not its
  // raw mdast depth — see computeHeadingLevels' own comment for why a flat
  // offset isn't enough.
  const headingLevels = computeHeadingLevels({ children })

  const ctx = {
    file: absPath,
    docsRoot: WEAVEJS_DOCS_ROOT,
    moduleName: module,
    exampleDir: join(EXAMPLE_MODULES, module, 'examples'),
    imagesDir: join(EXAMPLE_MODULES, 'main', 'images'),
    headingLevels,
    pendingCallouts: false,
    warn: (message) => warn(relPath, message),
  }

  const body = renderBlocks(children, ctx)
  const titleLine = frontmatter.title ? `= ${frontmatter.title}\n` : '= Untitled\n'
  const descLine = frontmatter.description ? `:description: ${frontmatter.description}\n` : ''
  const out = `${titleLine}${descLine}\n${body}\n`

  const destPath = join(EXAMPLE_MODULES, module, 'pages', pagePath)
  mkdirSync(dirname(destPath), { recursive: true })
  writeFileSync(destPath, out)
  console.log(`  ${relPath} -> modules/${module}/pages/${pagePath}`)
}

const args = process.argv.slice(2)
const targets = args.includes('--pilot') ? PILOT : args.includes('--all') ? discoverAll() : args

if (targets.length === 0) {
  console.error('Usage: node migrate.mjs --pilot | --all | <root>/<rest>.mdx ...')
  process.exit(1)
}

// `--all` is a full regeneration, so `examples/` and `images/` (100%
// converter-managed — no hand-written content ever lives there, unlike
// `pages/`, which keeps Phase 0's hand-placed main/index.adoc placeholder)
// are wiped first. Without this, a converter change that alters an asset's
// output path (e.g. the `[roomId]` bracket-stripping fix) leaves the OLD
// path's copy behind forever — caught by finding literal stale
// `[roomId]`-bracketed files still sitting next to their fixed replacements
// after a re-run.
if (args.includes('--all')) {
  for (const mod of MODULES) {
    rmSync(join(EXAMPLE_MODULES, mod, 'examples'), { recursive: true, force: true })
    rmSync(join(EXAMPLE_MODULES, mod, 'images'), { recursive: true, force: true })
  }
}

console.log(`Converting ${targets.length} page(s):`)
let failed = 0
for (const t of targets) {
  try {
    convertFile(t)
  } catch (error) {
    failed += 1
    warn(t, `conversion threw, page NOT written: ${error.stack || error.message}`)
  }
}
if (failed > 0) console.log(`\n${failed} page(s) failed to convert entirely — see warnings below.`)

printSummary()
