// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

/**
 * The single svgo configuration for this package.
 *
 * Shared by the gulp asset pipeline (gulp.d/lib/optimize-svg.js) and by the
 * icon sprite generator (scripts/build-sprite.mjs), so a generated sprite is
 * optimized exactly as the build would optimize it and passes through the
 * build unchanged.
 */
module.exports = {
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          // IDs are referenced by `<use href="...#icon-foo">` from the
          // templates and by CSS, so they must survive optimization.
          cleanupIds: false,
          removeDesc: false,
          // The icon sprite is a `<svg width="0" height="0" style="display:none">`
          // wrapper whose children are only ever rendered through `<use>`.
          // removeHiddenElems reads that as dead markup and empties the file.
          removeHiddenElems: false,
        },
      },
    },
  ],
  // NOTE svgo 4 dropped removeViewBox from preset-default, so the viewBox that
  // drives icon scaling is preserved without an override.
}
