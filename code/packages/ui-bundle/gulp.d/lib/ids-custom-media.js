'use strict'

const fs = require('fs')
const path = require('path')
const postcss = require('postcss')

// Prepends this bundle's own @custom-media breakpoint declarations (generated
// from the IOP Design System by tools/ids/sync.mjs — see
// packages/ui-bundle/src/css/ids-breakpoints.css) to every stylesheet before
// postcss-custom-media resolves `@media (--ids-breakpoints-m)` and friends.
// Deliberately not an @import in site.css: postcss-import runs earlier in the
// chain and would leave the declarations resolvable only in files that import
// site.css, whereas every stylesheet in this bundle uses these breakpoints
// directly. Replaces what used to be a require() of the design system's own
// PostCSS plugin (@inditex/sewingiopdsweb-styles/postcss/custom-media.cjs) —
// same behaviour, sourced from the committed derivative instead of a
// credentialed install. See tools/ids/README.md.

const breakpointsPath = path.resolve(__dirname, '../../src/css/ids-breakpoints.css')
const breakpointsContent = fs.readFileSync(breakpointsPath, 'utf-8')
const breakpointsAST = postcss.parse(breakpointsContent)
const customMediaNodes = breakpointsAST.nodes.filter((node) => node.type === 'atrule' && node.name === 'custom-media')

module.exports = () => ({
  postcssPlugin: 'ids-custom-media',
  Once(root) {
    const sourceFile = root.source?.input?.file ? path.resolve(root.source.input.file) : null
    if (sourceFile === breakpointsPath) return

    let hasIdsCustomMedia = false
    root.walkAtRules('custom-media', (atRule) => {
      const name = atRule.params && atRule.params.trim().split(/\s+/)[0]
      if (name && name.startsWith('--ids-')) {
        hasIdsCustomMedia = true
        return false
      }
    })
    if (hasIdsCustomMedia) return

    root.prepend(customMediaNodes.map((node) => node.clone()))
  },
})
module.exports.postcss = true
