#!/usr/bin/env node
//
// Search Lucide's icon catalogue (offline, from the installed lucide-static
// devDependency — nothing to fetch).
//
// Matches against both the icon's name and its search tags (lucide-static's
// own tags.json — the same terms lucide.dev's own icon search uses), so
// `just icons-search hamburger` finds `menu` even though "hamburger" never
// appears in a Lucide icon name.
//
// Usage:
//   node scripts/search-icons.mjs sidebar          names/tags containing "sidebar"

import { fail, loadLucideIndex, loadLucideTags, loadManifest, style, suggest } from './lib/icons.mjs'

function parseArgs(argv) {
  return argv.join(' ').trim().toLowerCase()
}

async function main() {
  const term = parseArgs(process.argv.slice(2))
  if (!term) {
    throw new Error('Nothing to search for. Usage: just icons-search <term>')
  }

  const index = await loadLucideIndex()
  const tags = await loadLucideTags()
  // Vendored icons are flagged rather than filtered out: the useful answer to
  // "which icon do I use" is often "that one, and it is already in the sprite".
  const vendored = new Set(await loadManifest())

  const matches = []
  for (const name of index.keys()) {
    const nameHit = name.includes(term)
    const tagHit = (tags[name] ?? []).some((tag) => tag.toLowerCase().includes(term))
    if (nameHit || tagHit) matches.push(name)
  }
  matches.sort()

  if (!matches.length) {
    console.log(`${style.yellow}no match${style.off} for "${term}"`)
    const near = suggest(index, term, 8)
    if (near.length) console.log(`${style.dim}closest names:${style.off} ${near.join(', ')}`)
    process.exitCode = 1
    return
  }

  for (const name of matches) {
    const mark = vendored.has(name) ? `${style.green}●${style.off}` : ' '
    const matchedTags = (tags[name] ?? []).filter((tag) => tag.toLowerCase().includes(term))
    const tagNote =
      matchedTags.length && !name.includes(term) ? ` ${style.dim}(${matchedTags.join(', ')})${style.off}` : ''
    console.log(`  ${mark} ${name}${tagNote}`)
  }

  console.log(
    `\n${matches.length} icon(s). ${style.green}●${style.off} ${style.dim}= already in src/img/icons.yml.` +
      ` Add one by listing it there, then \`just icons-build\`. Full details at lucide.dev/icons/<name>.${style.off}`
  )
}

main().catch(fail)
