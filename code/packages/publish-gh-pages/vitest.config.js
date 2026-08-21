'use strict'

const { defineConfig } = require('vitest/config')

module.exports = defineConfig({
  test: {
    include: ['*.spec.js'],
    environment: 'node',
  },
})
