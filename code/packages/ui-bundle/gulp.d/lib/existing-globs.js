// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

const fs = require('fs')
const ospath = require('path')

const MAGIC_RX = /[*?[\]{}()!+@]/

/**
 * Drop globs whose containing directory does not exist.
 *
 * vinyl-fs 4 throws ENOENT when the literal prefix of a glob names a missing
 * directory, where vinyl-fs 3 quietly yielded nothing. Several source
 * directories here are optional — `src/css/vendor` and `src/font` only exist
 * once someone adds a vendored stylesheet or a self-hosted font — so the globs
 * that reference them are filtered out rather than allowed to fail the build.
 *
 * @param {string} cwd directory the globs are resolved against
 * @param {string[]} globs candidate globs
 * @returns {string[]} the subset whose base directory exists
 */
module.exports = (cwd, globs) =>
  globs.filter((glob) => {
    const segments = glob.split('/')
    const firstMagic = segments.findIndex((it) => MAGIC_RX.test(it))
    const dirSegments = firstMagic === -1 ? segments.slice(0, -1) : segments.slice(0, firstMagic)
    if (!dirSegments.length) return true
    return fs.existsSync(ospath.join(cwd, ...dirSegments))
  })
