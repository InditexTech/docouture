'use strict'

import { createRequire } from 'node:module'
import { join } from 'node:path'

import { exists } from './copy-template.js'

// Shared by `pdocs eject kroki` and `pdocs teardown kroki` — GH-44. Both
// need to locate the `docker compose` file @inditextech/pdocs-antora-
// extensions' `kroki-prewarm.js`/`kroki-docker.js` use to run Kroki; kept in
// one place so the two commands can never disagree about where that file is.

export const PACKAGE_NAME = '@inditextech/pdocs-antora-extensions'
export const RESOURCE = 'resources/kroki-compose.yml'
export const OVERRIDE_FILENAME = 'kroki-compose.yml'

/**
 * The package's own bundled default — what `pdocs eject kroki` copies out,
 * regardless of whether a site has already ejected/customized one of its
 * own. Resolved from the SITE's own installed copy of the package (via
 * `createRequire` against its `package.json`, exactly like `publish.ts`'s
 * `loadDriver` resolves a publish driver), not from any copy this CLI
 * itself might depend on — this CLI has no dependency on
 * @inditextech/pdocs-antora-extensions at all, since a plain `pdocs` install
 * has no reason to carry every package a scaffolded site might use.
 *
 * @param {string} packageJsonFile - the SITE's `package.json` (`docs/package.json`).
 * @returns {string} an absolute path to the bundled compose file.
 * @throws if the package (or this resource within it) cannot be resolved —
 *   not installed, or an old version predating this feature.
 */
export function resolveBundledComposeFile(packageJsonFile: string): string {
  return createRequire(packageJsonFile).resolve(`${PACKAGE_NAME}/${RESOURCE}`)
}

/**
 * Whichever compose file a build actually used — `kroki-docker.js`'s own
 * resolution order, reproduced here: an ejected override at the site root
 * first, the bundled default otherwise. Used by `pdocs teardown kroki`,
 * which has to target the file that's actually running, not necessarily the
 * bundled one.
 *
 * @param {string} siteRoot - `docs/`, the directory containing `antora-playbook.yml`
 *   (== `playbook.dir` on the Antora side).
 * @returns {Promise<string | null>} the resolved path, or `null` if neither
 *   an override nor a resolvable bundled default exists.
 */
export async function resolveEffectiveComposeFile(siteRoot: string): Promise<string | null> {
  const override = join(siteRoot, OVERRIDE_FILENAME)
  if (await exists(override)) return override

  const packageJsonFile = join(siteRoot, 'package.json')
  try {
    return resolveBundledComposeFile(packageJsonFile)
  } catch {
    return null
  }
}
