'use strict'

// Preview-only. Builds the data + assets for the icons catalog page from
// lucide-static's own combined sprite (a normal, always-installed
// devDependency — nothing to fetch, nothing that may be absent), not from
// the vendored `src/img/icons.yml` manifest — the catalog's job is to show
// every icon that *could* be vendored, with the ones already in the sprite
// flagged, so picking one is browsing rather than guessing a name.

const fs = require('fs-extra')
const ospath = require('path')

const PACKAGE_ROOT = ospath.join(__dirname, '..', '..')
const LUCIDE_SPRITE = ospath.join(PACKAGE_ROOT, 'node_modules/lucide-static/sprite.svg')

/**
 * @param {string} previewDest e.g. 'public', where lucide's sprite is copied
 *   to so the preview page can reference it over http.
 * @returns {Promise<{available: false} | {available: true, total: number, icons: Array<{name: string, vendored: boolean}>}>}
 */
module.exports = async function loadIconCatalog(previewDest) {
  const { loadLucideIndex, loadManifest } = await import('../../scripts/lib/icons.mjs')

  if (!(await fs.pathExists(LUCIDE_SPRITE))) return { available: false }

  const vendored = new Set(await loadManifest())
  const destDir = ospath.join(PACKAGE_ROOT, previewDest, '_', 'img', 'preview-icons')
  await fs.ensureDir(destDir)
  await fs.copyFile(LUCIDE_SPRITE, ospath.join(destDir, 'sprite.svg'))

  const index = await loadLucideIndex()
  const icons = [...index.keys()].sort().map((name) => ({ name, vendored: vendored.has(name) }))

  return { available: true, total: icons.length, icons }
}
