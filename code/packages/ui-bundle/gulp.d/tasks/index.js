// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: MPL-2.0

'use strict'

const camelCase = (name) => name.replace(/-./g, (m) => m.slice(1).toUpperCase())

module.exports = require('require-directory')(module, __dirname, { recurse: false, rename: camelCase })
