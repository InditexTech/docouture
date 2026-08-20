'use strict'

const { defineConfig } = require('vitest/config')

module.exports = defineConfig({
  test: {
    include: ['lib/**/*.spec.js'],
    environment: 'node',
  },
})
