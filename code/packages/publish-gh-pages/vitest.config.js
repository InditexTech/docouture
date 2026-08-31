// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

const { defineConfig } = require('vitest/config')

module.exports = defineConfig({
  test: {
    include: ['*.spec.js'],
    environment: 'node',
  },
})
