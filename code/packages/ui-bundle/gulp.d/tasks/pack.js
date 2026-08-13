'use strict'

const ospath = require('path')
const vfs = require('vinyl-fs')
const zip = (() => {
  try {
    return require('@vscode/gulp-vinyl-zip')
  } catch {
    return require('gulp-vinyl-zip')
  }
})()

module.exports = (src, dest, bundleName, version, onFinish) => () =>
  vfs
    // NOTE encoding:false / removeBOM:false are essential. vinyl-fs 4 decodes
    // file contents as UTF-8 by default (v3 did not), which silently corrupts
    // every binary file — fonts came out of the zip nearly twice their real
    // size and browsers rejected them with 'incorrect file size in WOFF header'.
    .src('**/*', { base: src, cwd: src, dot: true, encoding: false, removeBOM: false })
    // The versioned name is the canonical artifact — it is what gets published,
    // and it is the only thing that tells you which bundle you downloaded. The
    // unversioned copy is made by the `bundle:alias` task that follows.
    .pipe(zip.dest(ospath.join(dest, `${bundleName}-bundle-${version}.zip`)))
    .on('finish', () => onFinish && onFinish(ospath.resolve(dest, `${bundleName}-bundle-${version}.zip`)))
