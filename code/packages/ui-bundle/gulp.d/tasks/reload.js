// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

const vfs = require('vinyl-fs')
const { finished } = require('node:stream/promises')

// Runs once after `build` and `preview:build-pages` have BOTH finished, so
// live reload never fires against a half-written `public/` — reloading off
// the page-render stream alone (the previous approach) could beat a
// slower CSS/JS rebuild to the browser, serving a stale stylesheet.
//
// `livereload` is `gulp-connect`'s `reload` function, present only when
// `LIVERELOAD` is enabled (see gulpfile.js); absent, this is a no-op.
const reload = (previewDest, livereload) => () => {
  if (!livereload) return Promise.resolve()
  // NOTE unlike the Transform streams used elsewhere in this package,
  // gulp-connect's `reload()` stream (built on `map-stream`) does not return
  // `this` from `.resume()` — do not fold this into `finished(stream.resume())`.
  const stream = vfs.src(`${previewDest}/**/*`, { read: false, allowEmpty: true }).pipe(livereload())
  const done = finished(stream)
  stream.resume()
  return done
}

module.exports = reload
