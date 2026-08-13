#!/usr/bin/env node
//
// Search the mirrored IOP Design System icon catalogue.
//
// The group taxonomy does not mean what it looks like it means. `sections` is
// Zara's womenswear/menswear/kids sections, not page furniture. `controls` is
// media transport only, so the grid and menu icons live in `design`, and the
// home icon lives in `others`. Guessing a group/name pair from its English
// sense is reliably wrong, and Figma is a slow way to find out.
//
// This searches all 1370 icons offline and marks which are already vendored,
// so picking an icon is a shell command rather than a design tool round-trip.
//
// Usage:
//   node scripts/search-icons.mjs sidebar          names containing "sidebar"
//   node scripts/search-icons.mjs home --group others
//   node scripts/search-icons.mjs --group alerts   list a whole group

import { GROUPS, fail, loadManifest, readMirror, style, suggest } from './lib/icons.mjs'

function parseArgs(argv) {
  const terms = []
  let group = null
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--group' || argv[i] === '-g') group = argv[++i]
    else terms.push(argv[i])
  }
  if (group && !GROUPS.includes(group)) {
    throw new Error(`Unknown group "${group}". Known groups:\n  ${GROUPS.join(', ')}`)
  }
  return { term: terms.join(' ').trim().toLowerCase(), group }
}

async function main() {
  const { term, group } = parseArgs(process.argv.slice(2))
  if (!term && !group) {
    throw new Error('Nothing to search for. Usage: just icons-search <term> [--group <group>]')
  }

  const index = await readMirror()
  // Vendored icons are flagged rather than filtered out: the useful answer to
  // "which icon do I use" is often "that one, and it is already in the sprite".
  const vendored = new Set((await loadManifest()).map(({ group: g, name }) => `${g}/${name}`))

  const matches = []
  for (const [candidateGroup, symbols] of index) {
    if (group && candidateGroup !== group) continue
    for (const name of symbols.keys()) {
      if (term && !name.toLowerCase().includes(term) && !`${candidateGroup}/${name}`.toLowerCase().includes(term))
        continue
      matches.push({ group: candidateGroup, name })
    }
  }

  if (!matches.length) {
    console.log(`${style.yellow}no match${style.off} for "${term}"${group ? ` in group "${group}"` : ''}`)
    const near = suggest(index, group ?? '', term, 8)
    if (near.length) console.log(`${style.dim}closest names:${style.off} ${near.join(', ')}`)
    process.exitCode = 1
    return
  }

  let currentGroup = null
  for (const { group: g, name } of matches) {
    if (g !== currentGroup) {
      console.log(`${currentGroup ? '\n' : ''}${style.bold}${g}${style.off}`)
      currentGroup = g
    }
    const mark = vendored.has(`${g}/${name}`) ? `${style.green}●${style.off}` : ' '
    console.log(`  ${mark} ${name}`)
  }

  console.log(
    `\n${matches.length} icon(s). ${style.green}●${style.off} ${style.dim}= already in src/img/icons.yml.` +
      ` Add one by listing it there, then \`just icons-build\`.${style.off}`
  )
}

main().catch(fail)
