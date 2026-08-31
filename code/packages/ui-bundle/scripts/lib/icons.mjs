// Shared plumbing for the icon pipeline: `build-sprite` and `search-icons`
// both speak in terms of the manifest (icons.yml) and Lucide's own installed
// package (node_modules/lucide-static).
//
// The pipeline has one stage, and it is entirely offline:
//
//   build-sprite   offline   src/img/icons.svg + src/css/icon-masks.css
//
// There is nothing to fetch: lucide-static is a public npm package, installed
// like any other devDependency, and already ships every icon this bundle
// could want — both as individual SVGs (icons/<name>.svg) and as one
// combined sprite (sprite.svg) using canonical names only (no deprecated
// aliases). This file reads from the latter: it is already exactly the
// `<symbol id="<name>" viewBox="...">...</symbol>` shape this bundle's own
// sprite needs, just for every icon Lucide ships instead of the ~34 this
// bundle actually uses.

import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import yaml from 'js-yaml'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const lucideRoot = resolve(packageRoot, 'node_modules/lucide-static')

export const paths = {
  packageRoot,
  manifest: join(packageRoot, 'src/img/icons.yml'),
  sprite: join(packageRoot, 'src/img/icons.svg'),
  /** Generated `--icon-mask-<name>` custom properties — see loadMasks(). */
  masks: join(packageRoot, 'src/css/icon-masks.css'),
  /** Lucide's own combined sprite — canonical names only, no deprecated aliases. */
  lucideSprite: join(lucideRoot, 'sprite.svg'),
  /** Lucide's own search-tag index, keyed by the same canonical names as lucideSprite. */
  lucideTags: join(lucideRoot, 'tags.json'),
}

// --------------------------------------------------------------- manifest -----

let manifestDoc

async function readManifestDoc() {
  if (!manifestDoc) manifestDoc = yaml.load(await readFile(paths.manifest, 'utf8'))
  return manifestDoc
}

function flatten(list, label) {
  if (!Array.isArray(list)) throw new Error(`${label} must be a list of icon names`)
  for (const name of list) {
    if (typeof name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
      throw new Error(`${label} entry "${name}" is not a lowercase, hyphen-separated icon name`)
    }
  }
  return list
}

/** Read `src/img/icons.yml`'s `icons:` list — the icons this bundle vendors. */
export async function loadManifest() {
  const doc = await readManifestDoc()
  return flatten(doc?.icons, '`icons:`')
}

/**
 * Read `src/img/icons.yml`'s `masks:` list — the subset of vendored icons
 * that also need a CSS-consumable `--icon-mask-<name>` custom property, for
 * markup Asciidoctor generates itself (admonitions, GH-13) or an extension
 * emits (GH-20), neither of which can address the sprite with `<use>`. Every
 * entry must also appear under `icons:`.
 */
export async function loadMasks() {
  const doc = await readManifestDoc()
  if (doc?.masks == null) return []
  const masks = flatten(doc.masks, '`masks:`')

  const vendored = new Set(await loadManifest())
  const notVendored = masks.filter((name) => !vendored.has(name))
  if (notVendored.length) {
    throw new Error(`\`masks:\` in ${paths.manifest} lists ${notVendored.join(', ')}, not present under \`icons:\` — add it there first`)
  }

  return masks
}

// ------------------------------------------------------------- lucide sprite -----

// Symbols never nest, so a non-greedy scan between the tags is enough and
// avoids pulling an XML parser in for a file we only ever slice.
const SYMBOL_RE = /<symbol\b[^>]*\bid="([^"]+)"[^>]*>[\s\S]*?<\/symbol>/g

let lucideIndex

/** Load every symbol Lucide ships, keyed by its canonical name — 1,791 entries as of writing. */
export async function loadLucideIndex() {
  if (!lucideIndex) {
    const svg = await readFile(paths.lucideSprite, 'utf8')
    lucideIndex = new Map()
    for (const [markup, id] of svg.matchAll(SYMBOL_RE)) lucideIndex.set(id, markup)
    if (!lucideIndex.size) throw new Error(`No <symbol> elements found in ${paths.lucideSprite}`)
  }
  return lucideIndex
}

let lucideTags

/** Load Lucide's own search-tag index: canonical name -> array of search terms. */
export async function loadLucideTags() {
  if (!lucideTags) lucideTags = JSON.parse(await readFile(paths.lucideTags, 'utf8'))
  return lucideTags
}

// ------------------------------------------------------------ suggestions -----

/**
 * Levenshtein distance, capped: we only ever compare short icon names and only
 * care whether they are close, so the classic two-row implementation is ample.
 */
function distance(a, b) {
  if (a === b) return 0
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = row
  }
  return prev[b.length]
}

/**
 * Suggest replacements for an icon name the manifest asked for that Lucide
 * does not ship under that exact (canonical) name — most often because it is
 * a deprecated alias (`home` instead of `house`, `alert-triangle` instead of
 * `triangle-alert`) or a typo.
 */
export function suggest(index, name, limit = 4) {
  const scored = []
  for (const candidate of index.keys()) {
    const exact = candidate === name
    const contains = candidate.includes(name) || name.includes(candidate)
    const d = distance(name, candidate)
    if (!exact && !contains && d > 4) continue
    scored.push({ ref: candidate, rank: exact ? -2 : contains ? -1 : d })
  }
  scored.sort((a, b) => a.rank - b.rank || a.ref.localeCompare(b.ref))
  return scored.slice(0, limit).map((s) => s.ref)
}

// ------------------------------------------------------------------- log -----

const colour = process.stdout.isTTY && !process.env.NO_COLOR
export const style = {
  dim: colour ? '\u001b[2m' : '',
  bold: colour ? '\u001b[1m' : '',
  red: colour ? '\u001b[31m' : '',
  green: colour ? '\u001b[32m' : '',
  yellow: colour ? '\u001b[33m' : '',
  off: colour ? '\u001b[0m' : '',
}

/** Report a thrown error the way a CLI should: message only, stack behind DEBUG. */
export function fail(err) {
  console.error(`${style.red}✗${style.off} ${err.message}`)
  if (process.env.DEBUG) console.error(err)
  process.exitCode = 1
}
