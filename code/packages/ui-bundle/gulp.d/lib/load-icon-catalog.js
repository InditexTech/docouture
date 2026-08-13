'use strict'

// Preview-only. Builds the data + assets for the icons catalog page from the
// gitignored `.icons/` mirror (`just icons-fetch`), not from the vendored
// `src/img/icons.yml` manifest — the catalog's job is to show every icon that
// *could* be vendored, with the ones already in the sprite flagged, so picking
// one is browsing rather than guessing group/name pairs.
//
// `.icons/` is scratch and may not exist (fresh clone, CI). Absence is not an
// error: the caller gets `{ available: false }` and renders an explainer
// instead of a catalog.

const fs = require('fs-extra')
const ospath = require('path')

const PACKAGE_ROOT = ospath.join(__dirname, '..', '..')
const MIRROR_DIR = ospath.join(PACKAGE_ROOT, '.icons')

/**
 * @param {string} previewDest e.g. 'public', where the mirror's sprites are
 *   copied to so the preview page can reference them over http.
 * @returns {Promise<{available: false} | {available: true, total: number, groups: Array<{name: string, icons: Array<{name: string, id: string, vendored: boolean}>}>}>}
 */
module.exports = async function loadIconCatalog(previewDest) {
  const { GROUPS, parseSymbols, loadManifest } = await import('../../scripts/lib/icons.mjs')

  if (!(await fs.pathExists(MIRROR_DIR))) return { available: false }

  const vendored = new Set((await loadManifest()).map(({ group, name }) => `${group}/${name}`))
  const destDir = ospath.join(PACKAGE_ROOT, previewDest, '_', 'img', 'preview-icons')
  await fs.ensureDir(destDir)

  const groups = []
  let total = 0
  for (const group of GROUPS) {
    const file = ospath.join(MIRROR_DIR, `sw-icons-${group}.symbol.svg`)
    if (!(await fs.pathExists(file))) continue
    const svg = await fs.readFile(file, 'utf8')
    const { symbols } = parseSymbols(svg, group)
    await fs.copyFile(file, ospath.join(destDir, `sw-icons-${group}.symbol.svg`))
    const groupIcons = [...symbols.keys()]
      .sort()
      .map((name) => ({ name, id: `sw-icons-${group}-${name}`, vendored: vendored.has(`${group}/${name}`) }))
    groups.push({ name: group, icons: groupIcons })
    total += groupIcons.length
  }

  return { available: true, total, groups }
}
