// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: MPL-2.0

'use strict'

const autoprefixer = require('autoprefixer')
const cssnano = require('cssnano')
const esbuild = require('esbuild')
const fs = require('fs-extra')
const dtCustomMedia = require('../lib/dt-custom-media')
const merge = require('../lib/concat-streams')
const ospath = require('path')
const path = ospath.posix
const postcss = require('gulp-postcss')
const postcssCalc = require('postcss-calc')
const postcssCustomMedia = require('postcss-custom-media')
const postcssImport = require('postcss-import')
const postcssUrl = require('postcss-url')
const { Transform } = require('stream')
const { finished } = require('stream/promises')
const vfs = require('vinyl-fs')
const Vinyl = require('vinyl')

const compileHelpers = require('../lib/compile-helpers')
const existingGlobs = require('../lib/existing-globs')
const optimizeSvg = require('../lib/optimize-svg')

const map = (transform) => new Transform({ objectMode: true, transform })

// Browser target for the scripts shipped in the bundle. Kept in step with the
// `browserslist` field in package.json.
const ESBUILD_TARGET = ['es2018']

module.exports = (src, dest, preview) => async () => {
  // NOTE encoding:false / removeBOM:false keep binary assets (fonts, raster
  // images) byte-exact: vinyl-fs 4 decodes contents as UTF-8 by default.
  // Text consumers downstream call toString() themselves, so a raw Buffer is
  // always safe here.
  const opts = { base: src, cwd: src, encoding: false, removeBOM: false }
  const sourcemaps = preview || process.env.SOURCEMAPS === 'true'

  // NOTE the plugin list uses the postcss 8 conventions. Upstream targeted
  // postcss 7, where a plugin was a bare function and cssnano could be invoked
  // directly as `cssnano(opts)(css, result)`; under postcss 8 a plugin is an
  // object and calling it throws.
  const postcssPlugins = [
    postcssImport,
    trackImportedStylesheetMtimes,
    // Prepend this bundle's own @custom-media breakpoint declarations
    // (generated from the design system into src/css/dt-breakpoints.css) to
    // every stylesheet, then resolve them. Together these let any rule write
    // `@media (--dt-breakpoints-m)` instead of a hardcoded width.
    dtCustomMedia(),
    postcssCustomMedia(),
    postcssUrl([
      {
        filter: (asset) => new RegExp('^[~][^/]*(?:font|typeface)[^/]*/.*/files/.+[.](?:ttf|woff2?)$').test(asset.url),
        url: (asset) => {
          const relpath = asset.pathname.slice(1)
          const abspath = require.resolve(relpath)
          const basename = ospath.basename(abspath)
          const destpath = ospath.join(dest, 'font', basename)
          if (!fs.pathExistsSync(destpath)) fs.copySync(abspath, destpath)
          return path.join('..', 'font', basename)
        },
      },
    ]),
    // NOTE custom properties are deliberately NOT flattened. Dark mode, the
    // density scale and the resolution tiers are all runtime custom-property
    // swaps performed by the design system, so a build that inlines their
    // values would ship a permanently light, fixed-density site. postcss-custom
    // -properties used to run here; every browser in the browserslist target
    // supports custom properties natively, so nothing replaced it.
    // cssnano already applies postcssCalc, so it is only needed for the preview
    ...(preview ? [postcssCalc] : []),
    autoprefixer,
    ...(preview ? [] : [cssnano({ preset: 'default' }), pseudoElementFixer]),
  ]

  // Compile `src/helpers/*.ts` to CommonJS ahead of staging. Antora requires
  // each helper as a CommonJS module and expects `module.exports` to be the
  // function itself, so these go through tsc (`export =`) rather than esbuild,
  // whose CJS output would expose the function as `exports.default`.
  const tsbuildDir = await compileHelpers()

  const [siteJs, vendorJs] = await Promise.all([
    bundleScript({
      entry: ospath.join(src, 'js', 'index.ts'),
      outPath: 'js/site.js',
      minify: !preview,
      sourcemaps,
    }),
    bundleVendorScripts({ src, minify: !preview, sourcemaps }),
  ])

  // NOTE this task is async, so it must await the write itself. Gulp waits on a
  // returned promise OR a returned stream, but when a promise resolves TO a
  // stream it only waits for the promise — the task would report success before
  // a single file had been written.
  // Reads a set of globs that may reference an optional directory, yielding an
  // empty stream when none of them exist.
  const optionalSrc = (globs, options) => {
    const present = existingGlobs(src, globs)
    return present.length ? vfs.src(present, { ...opts, ...options }) : toStream([])
  }

  // NOTE this task is async, so it must await the write itself. Gulp waits on a
  // returned promise OR a returned stream, but when a promise resolves TO a
  // stream it only waits for the promise — the task would report success before
  // a single file had been written. Because gulp is no longer consuming the
  // destination stream either, it has to be drained here (`resume`), otherwise
  // the pipeline stalls once the object-mode highWaterMark is reached.
  const staged = merge(
    vfs.src('ui.yml', { ...opts, allowEmpty: true }),
    toStream([siteJs, ...vendorJs]),
    optionalSrc(['js/vendor/*.min.js'], { allowEmpty: true }).pipe(
      map((file, enc, next) => next(null, Object.assign(file, { extname: '' }, { extname: '.js' })))
    ),
    optionalSrc(['css/site.css', 'css/vendor/*.css'], { sourcemaps }).pipe(
      postcss((file) => ({ plugins: postcssPlugins, options: { file } }))
    ),
    optionalSrc(['font/*.{ttf,woff*(2)}'], { allowEmpty: true }),
    optionalSrc(['img/**/*.{gif,ico,jpg,png,svg}'], { allowEmpty: true }).pipe(preview ? through() : optimizeSvg()),
    vfs.src('helpers/*.js', { base: tsbuildDir, cwd: tsbuildDir }),
    vfs.src('layouts/*.hbs', opts),
    vfs.src('partials/*.hbs', opts),
    // NOTE upstream used the glob `static/**/*[!~]` to skip editor backup
    // files. Under glob-stream 8 that pattern matches no dotfiles (so
    // `.nojekyll` was dropped) and stalls the stream, so the exclusion is
    // expressed as an explicit negated glob instead.
    optionalSrc(['static/**/*', '!static/**/*~'], {
      base: ospath.join(src, 'static'),
      dot: true,
      allowEmpty: true,
    })
  ).pipe(vfs.dest(dest, { sourcemaps: sourcemaps && '.' }))

  return finished(staged.resume())
}

const through = () => map((file, enc, next) => next(null, file))

/** Wrap already-built Vinyl files as a readable object stream. */
function toStream(files) {
  const { Readable } = require('stream')
  return Readable.from(files, { objectMode: true })
}

/**
 * Bundle one TypeScript entry point into a single browser script.
 *
 * Replaces the upstream browserify + browser-pack-flat + uglify chain: esbuild
 * resolves the module graph, strips types and minifies in one pass.
 */
async function bundleScript({ entry, outPath, minify, sourcemaps }) {
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    minify,
    sourcemap: sourcemaps ? 'inline' : false,
    target: ESBUILD_TARGET,
    format: 'iife',
    platform: 'browser',
    legalComments: 'inline',
    metafile: true,
    write: false,
    logLevel: 'silent',
  })
  const output = result.outputFiles[0]
  const { mtime } = await newestMtimeOf(result.metafile, entry)
  return new Vinyl({
    path: outPath,
    contents: Buffer.from(output.contents),
    stat: { mtime },
  })
}

/** Bundle every `src/js/vendor/*.bundle.ts` entry, dropping the `.bundle` infix. */
async function bundleVendorScripts({ src, minify, sourcemaps }) {
  const vendorDir = ospath.join(src, 'js', 'vendor')
  if (!(await fs.pathExists(vendorDir))) return []
  const entries = (await fs.readdir(vendorDir)).filter((it) => it.endsWith('.bundle.ts'))
  return Promise.all(
    entries.map((entry) =>
      bundleScript({
        entry: ospath.join(vendorDir, entry),
        outPath: `js/vendor/${entry.slice(0, -'.bundle.ts'.length)}.js`,
        minify,
        sourcemaps,
      })
    )
  )
}

/**
 * Newest mtime across an entry point and everything it pulls in, so gulp's
 * incremental preview rebuild notices edits to imported modules.
 */
async function newestMtimeOf(metafile, entry) {
  const inputs = metafile ? Object.keys(metafile.inputs) : [entry]
  const stats = await Promise.all(inputs.map((it) => fs.stat(it).catch(() => null)))
  const mtime = stats.reduce((max, it) => (it && (!max || it.mtime > max) ? it.mtime : max), null)
  return { mtime: mtime || new Date() }
}

/**
 * Roll the newest mtime of any @import-ed stylesheet up onto the entry file, so
 * the preview watch rebuilds when a partial stylesheet changes.
 */
const trackImportedStylesheetMtimes = {
  postcssPlugin: 'track-imported-stylesheet-mtimes',
  async OnceExit(root, { result }) {
    const file = result.opts.file
    if (!file || !file.stat) return
    const depPaths = result.messages.filter(({ type }) => type === 'dependency').map(({ file: depPath }) => depPath)
    const mtimes = await Promise.all(
      depPaths.map((depPath) =>
        fs
          .stat(depPath)
          .then(({ mtime }) => mtime)
          .catch(() => null)
      )
    )
    const newestMtime = mtimes.reduce((max, curr) => (curr && (!max || curr > max) ? curr : max), file.stat.mtime)
    if (newestMtime > file.stat.mtime) file.stat.mtimeMs = +(file.stat.mtime = newestMtime)
  },
}

/**
 * Normalize single-colon `:before` / `:after` to the double-colon form after
 * minification, which some of the source stylesheets still use.
 */
const pseudoElementFixer = {
  postcssPlugin: 'pseudo-element-fixer',
  OnceExit(root) {
    root.walkRules(/(?:^|[^:]):(?:before|after)/, (rule) => {
      rule.selector = rule.selectors.map((it) => it.replace(/(^|[^:]):(before|after)$/, '$1::$2')).join(',')
    })
  },
}
