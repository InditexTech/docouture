// Shared plumbing for the icon pipeline: `fetch-icons`, `build-sprite` and
// `search-icons` all speak in terms of the mirror, the manifest and the symbol
// index defined here.
//
// The pipeline has three stages and only the first one touches the network:
//
//   fetch-icons   network   .icons/ + icons.lock.json
//   build-sprite  offline   src/img/ids-icons.svg
//   gulp bundle   offline   ships it
//
// The mirror is a full copy of every IOP DS group sprite and is gitignored. It
// is scratch: large, proprietary and reproducible from the lock. What gets
// committed is the manifest (intent), the lock (provenance) and the generated
// sprite (the artifact the bundle actually ships).

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import yaml from 'js-yaml'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export const paths = {
  packageRoot,
  /** Gitignored mirror of every group sprite. Outside src/ so the bundle never ships it. */
  mirror: join(packageRoot, '.icons'),
  manifest: join(packageRoot, 'src/img/icons.yml'),
  lock: join(packageRoot, 'icons.lock.json'),
  sprite: join(packageRoot, 'src/img/ids-icons.svg'),
  /** Generated `--icon-mask-<group>-<name>` custom properties — see loadMasks(). */
  masks: join(packageRoot, 'src/css/icon-masks.css'),
}

/** Where the design system publishes its sprites. There is no version in the path. */
export const SOURCE_TEMPLATE = 'https://amgassets.inditex.com/amigaweb/icons/sw-icons-{group}.symbol.svg'

export const sourceUrl = (group) => SOURCE_TEMPLATE.replace('{group}', group)

/**
 * The 25 sprite groups, matching the `Icons` canvas of the Figma Foundations
 * file (node `217486:9`) one for one. Hardcoded because the CDN publishes no
 * index: a group that disappears has to fail loudly rather than be skipped.
 */
export const GROUPS = [
  'accessibility',
  'actions',
  'alerts',
  'arrows',
  'business',
  'care',
  'communication',
  'connectivity',
  'controls',
  'cursors',
  'design',
  'graphics',
  'others',
  'packaging',
  'payments',
  'products',
  'sections',
  'shapes',
  'shopping',
  'social-media',
  'spaces',
  'sustainability',
  'time',
  'transport',
  'weather',
]

// --------------------------------------------------------------- symbols -----

// Symbols never nest, so a non-greedy scan between the tags is enough and
// avoids pulling an XML parser in for a file we only ever slice.
const SYMBOL_RE = /<symbol\b[^>]*\bid="([^"]+)"[^>]*>[\s\S]*?<\/symbol>/g

/**
 * Extract every `<symbol>` of a group sprite, keyed by its leaf name — the id
 * with the `sw-icons-<group>-` prefix removed. The leaf carries the variant
 * suffix (`-outlined` / `-filled`); the design system ships no bare names.
 *
 * Some published sprites repeat an id: as of the 2026-05-12 catalogue, 14 ids
 * across six groups appear twice with byte-identical bodies. That is harmless
 * upstream duplication, so the repeat is dropped and counted rather than
 * treated as an error — but two symbols sharing an id with *different* bodies
 * would mean the sprite is genuinely ambiguous, and that does throw.
 */
export function parseSymbols(svg, group) {
  const prefix = `sw-icons-${group}-`
  const symbols = new Map()
  let duplicates = 0

  for (const [markup, id] of svg.matchAll(SYMBOL_RE)) {
    if (!id.startsWith(prefix)) {
      throw new Error(`Symbol id "${id}" in group "${group}" does not start with "${prefix}"`)
    }
    const name = id.slice(prefix.length)
    const seen = symbols.get(name)
    if (seen === undefined) {
      symbols.set(name, markup)
    } else if (seen === markup) {
      duplicates++
    } else {
      throw new Error(`Symbol id "${id}" appears twice in group "${group}" with different definitions`)
    }
  }

  if (!symbols.size) throw new Error(`No <symbol> elements found in the sprite for group "${group}"`)
  return { symbols, duplicates }
}

export const sha256 = (text) => createHash('sha256').update(text).digest('hex')

// -------------------------------------------------------------- manifest -----

/** Read one `group -> [name, ...]` mapping into a flat, ordered `{ group, name, id }` list. */
function flatten(mapping, label) {
  const entries = []
  for (const [group, names] of Object.entries(mapping)) {
    if (!GROUPS.includes(group)) {
      throw new Error(`Unknown icon group "${group}" in ${label}. Known groups: ${GROUPS.join(', ')}`)
    }
    if (!Array.isArray(names)) {
      throw new Error(`${label} entry for group "${group}" must be a list of icon names`)
    }
    for (const name of names) entries.push({ group, name, id: `sw-icons-${group}-${name}` })
  }
  return entries
}

let manifestDoc

async function readManifestDoc() {
  if (!manifestDoc) manifestDoc = yaml.load(await readFile(paths.manifest, 'utf8'))
  return manifestDoc
}

/**
 * Read `src/img/icons.yml`'s `icons:` mapping into a flat, ordered list of
 * `{ group, name, id }`. Order follows the manifest so the generated sprite
 * has a stable, reviewable diff rather than one that reshuffles on every run.
 */
export async function loadManifest() {
  const doc = await readManifestDoc()
  const icons = doc?.icons
  if (!icons || typeof icons !== 'object') {
    throw new Error(`${paths.manifest} has no \`icons\` mapping`)
  }
  return flatten(icons, '`icons:`')
}

/**
 * Read `src/img/icons.yml`'s `masks:` mapping — the subset of vendored icons
 * that also need a CSS-consumable `--icon-mask-<group>-<name>` custom
 * property, for markup Asciidoctor generates itself (admonitions, GH-13) where
 * the `{{icon}}` helper's `<svg><use>` has no way in. Every entry must also
 * appear under `icons:`; that's what makes it safe to resolve against the
 * same sprite mirror rather than a second index.
 */
export async function loadMasks() {
  const doc = await readManifestDoc()
  const masks = doc?.masks
  if (!masks) return []
  if (typeof masks !== 'object') {
    throw new Error(`${paths.manifest}'s \`masks\` must be a mapping, like \`icons:\``)
  }
  const entries = flatten(masks, '`masks:`')

  const vendored = new Set((await loadManifest()).map(({ group, name }) => `${group}/${name}`))
  const notVendored = entries.filter(({ group, name }) => !vendored.has(`${group}/${name}`))
  if (notVendored.length) {
    const refs = notVendored.map(({ group, name }) => `${group}/${name}`).join(', ')
    throw new Error(`\`masks:\` in ${paths.manifest} lists ${refs}, not present under \`icons:\` — add it there first`)
  }

  return entries
}

// ---------------------------------------------------------------- mirror -----

/** Read one group sprite out of the mirror, with a pointer to the fix when it is absent. */
export async function readMirroredGroup(group) {
  const file = join(paths.mirror, `sw-icons-${group}.symbol.svg`)
  try {
    return await readFile(file, 'utf8')
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    throw new Error(`No mirror for group "${group}" at ${file}. Run \`just icons-fetch\` first.`, { cause: err })
  }
}

/** Load the whole mirror as `group -> Map<leafName, markup>`. */
export async function readMirror(groups = GROUPS) {
  const index = new Map()
  for (const group of groups) {
    const { symbols } = parseSymbols(await readMirroredGroup(group), group)
    index.set(group, symbols)
  }
  return index
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
 * Suggest replacements for an icon the manifest asked for and the mirror does
 * not have. Searches every group, not just the one that was asked for: the
 * common mistake is a right name in the wrong group — `sections` is Zara's
 * womenswear/menswear sections, not page furniture, so `sections/home-outlined`
 * is really `others/home-outlined`.
 */
export function suggest(index, group, name, limit = 4) {
  const scored = []
  for (const [candidateGroup, symbols] of index) {
    for (const candidate of symbols.keys()) {
      // Substring hits rank above edit-distance ones: a wrong-group name matches
      // exactly and should always be offered first.
      const exact = candidate === name
      const contains = candidate.includes(name) || name.includes(candidate)
      const d = distance(name, candidate)
      if (!exact && !contains && d > 4) continue
      scored.push({
        ref: `${candidateGroup}/${candidate}`,
        rank: exact ? -2 : contains ? -1 : d,
        sameGroup: candidateGroup === group,
      })
    }
  }
  scored.sort((a, b) => a.rank - b.rank || Number(b.sameGroup) - Number(a.sameGroup) || a.ref.localeCompare(b.ref))
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
