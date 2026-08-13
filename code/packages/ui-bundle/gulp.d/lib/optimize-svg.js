'use strict'

const { Transform } = require('stream')

const svgoConfig = require('./svgo-config')

// svgo is ESM-only, so it is loaded lazily with a dynamic import from this
// CommonJS pipeline and cached after the first use.
let svgoPromise

const loadSvgo = () => (svgoPromise = svgoPromise || import('svgo'))

/**
 * SVG optimization for the asset pipeline.
 *
 * Replaces upstream's gulp-imagemin. That pulled four optimizers, three of
 * which (optipng, jpegtran, gifsicle) are native binaries with postinstall
 * downloaders that no longer build on current Node — and which optimized zero
 * files here, since every image in this UI is an SVG. Only the SVG optimizer
 * ever did any work, and svgo is pure JavaScript with no native dependency.
 */
module.exports = () =>
  new Transform({
    objectMode: true,
    async transform(file, enc, next) {
      if (!file.isBuffer() || file.extname !== '.svg') return next(null, file)
      try {
        const { optimize } = await loadSvgo()
        const { data } = optimize(file.contents.toString('utf8'), { path: file.path, ...svgoConfig })
        file.contents = Buffer.from(data, 'utf8')
        next(null, file)
      } catch (err) {
        next(new Error(`Failed to optimize ${file.relative}: ${err.message}`, { cause: err }))
      }
    },
  })
