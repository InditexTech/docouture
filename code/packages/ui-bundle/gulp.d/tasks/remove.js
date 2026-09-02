// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: MPL-2.0

'use strict'

const fs = require('fs-extra')
const { Transform } = require('node:stream')
const map = (transform) => new Transform({ objectMode: true, transform })
const vfs = require('vinyl-fs')

const removeFiles = (files) => () =>
  vfs.src(files, { allowEmpty: true }).pipe(map((file, enc, next) => fs.remove(file.path, next)))

module.exports = removeFiles
