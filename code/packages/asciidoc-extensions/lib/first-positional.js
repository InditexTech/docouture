// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// The inline macro `attrs` parameter's shape differs between the two
// Asciidoctor majors this repo runs — verified empirically, not documented
// anywhere obvious:
//   - 2.2 (site builds, via Antora):   attrs.$positional[0]
//   - 4.0 (ui-bundle preview harness): attrs['1']
// Both are the attribute list's first positional entry.
module.exports = function firstPositional(attrs) {
  if (attrs && Array.isArray(attrs.$positional)) return attrs.$positional[0]
  if (attrs && Object.prototype.hasOwnProperty.call(attrs, '1')) return attrs['1']
  return undefined
}
