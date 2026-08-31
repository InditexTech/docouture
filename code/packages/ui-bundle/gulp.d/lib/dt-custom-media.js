'use strict'

const fs = require('fs')
const path = require('path')
const postcss = require('postcss')

// Prepends this bundle's own @custom-media breakpoint declarations
// (packages/ui-bundle/src/css/dt-breakpoints.css) to every stylesheet before
// postcss-custom-media resolves `@media (--dt-breakpoints-m)` and friends.
// Deliberately not an @import in site.css: postcss-import runs earlier in the
// chain and would leave the declarations resolvable only in files that import
// site.css, whereas every stylesheet in this bundle uses these breakpoints
// directly.

const breakpointsPath = path.resolve(__dirname, '../../src/css/dt-breakpoints.css')
const breakpointsContent = fs.readFileSync(breakpointsPath, 'utf-8')
const breakpointsAST = postcss.parse(breakpointsContent)
const customMediaNodes = breakpointsAST.nodes.filter((node) => node.type === 'atrule' && node.name === 'custom-media')

module.exports = () => ({
  postcssPlugin: 'dt-custom-media',
  Once(root) {
    const sourceFile = root.source?.input?.file ? path.resolve(root.source.input.file) : null
    if (sourceFile === breakpointsPath) return

    let hasCustomMedia = false
    root.walkAtRules('custom-media', (atRule) => {
      const name = atRule.params && atRule.params.trim().split(/\s+/)[0]
      if (name && name.startsWith('--dt-')) {
        hasCustomMedia = true
        return false
      }
    })
    if (hasCustomMedia) return

    root.prepend(customMediaNodes.map((node) => node.clone()))
  },
})
module.exports.postcss = true
