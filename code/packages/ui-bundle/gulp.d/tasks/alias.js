'use strict'

const fs = require('fs-extra')
const ospath = require('path')

// Copies the versioned bundle produced by `bundle:pack` to a stable, unversioned
// name.
//
// Antora's `ui.bundle.url` takes a literal path — it does not glob — so a
// versioned-only output would force an edit to every playbook on every version
// bump. The unversioned copy keeps `url: ../ui-bundle/build/ui-bundle.zip`
// working for local development while the versioned file remains the artifact
// to publish.
//
// This is a separate task rather than a callback on the pack stream so that
// gulp's `series` guarantees the zip has been fully written and closed before
// anything reads it back.
//
// A copy, not a symlink: a link does not survive a CI artifact upload and is
// awkward on Windows checkouts, and the bundle is small enough that the
// duplicate does not matter in a gitignored build directory.
module.exports = (dest, bundleName, version, onFinish) => async () => {
  const versioned = ospath.resolve(dest, `${bundleName}-bundle-${version}.zip`)
  const stable = ospath.resolve(dest, `${bundleName}-bundle.zip`)
  await fs.copy(versioned, stable, { overwrite: true })
  if (onFinish) onFinish(versioned, stable)
}
