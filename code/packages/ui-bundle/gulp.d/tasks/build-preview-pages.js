'use strict'

// NOTE @asciidoctor/core 3 replaced the v2 factory export: the CommonJS module
// object itself now carries `load`, `convert` and `Extensions`.
const Asciidoctor = require('@asciidoctor/core')
const fs = require('fs-extra')
const handlebars = require('handlebars')
const merge = require('../lib/concat-streams')
const ospath = require('path')
const path = ospath.posix
const requireFromString = require('require-from-string')
const { Transform } = require('stream')
const { finished } = require('stream/promises')
const map = (transform = () => {}, flush = undefined) => new Transform({ objectMode: true, transform, flush })
// NOTE the default sink must actually forward files. `map()` builds a Transform
// whose callback is never invoked, which stalls the pipeline as soon as the
// object-mode highWaterMark is reached.
const passThrough = () => map((file, enc, next) => next(null, file))
const vfs = require('vinyl-fs')
const yaml = require('js-yaml')

const compileHelpers = require('../lib/compile-helpers')
const loadIconCatalog = require('../lib/load-icon-catalog')

const ASCIIDOC_ATTRIBUTES = { experimental: '', icons: 'font', sectanchors: '', 'source-highlighter': 'highlight.js' }

module.exports =
  (src, previewSrc, previewDest, sink = passThrough) =>
  async () => {
    const [sampleUiModel, { layouts }] = await Promise.all([
      loadSampleUiModel(previewSrc),
      compileHelpers().then((tsbuildDir) =>
        toPromise(
          merge(
            compileLayouts(src),
            registerPartials(src),
            registerHelpers(tsbuildDir),
            copyPreviewAssets(previewSrc, previewDest)
          )
        )
      ),
    ])

    // Preview-only layouts (hub, icons, ...) live in previewSrc/layouts, not
    // src/layouts, so they are never packed into the published UI bundle.
    // They share the same Map and the partials already registered above.
    await toPromise(compileLayouts(previewSrc, layouts))

    const iconCatalog = await loadIconCatalog(previewDest)

    const extensions = ((sampleUiModel.asciidoc || {}).extensions || []).map((request) => {
      ASCIIDOC_ATTRIBUTES[request.replace(/^@|\.js$/, '').replace(/[/]/g, '-') + '-loaded'] = ''
      const extension = require(request)
      extension.register.call(Asciidoctor.Extensions)
      return extension
    })
    const asciidoc = { extensions }
    for (const component of sampleUiModel.site.components) {
      for (const version of component.versions || []) version.asciidoc = asciidoc
    }
    const baseUiModel = { ...sampleUiModel, env: process.env }
    delete baseUiModel.asciidoc

    const stream = vfs
      .src('**/*.adoc', { base: previewSrc, cwd: previewSrc })
      .pipe(
        // NOTE @asciidoctor/core 4 made both `load` and `convert` async, so this
        // transform awaits them; it was synchronous under v2.
        map(async (file, enc, next) => {
          const siteRootPath = path.relative(ospath.dirname(file.path), ospath.resolve(previewSrc))
          const uiModel = { ...baseUiModel }
          uiModel.page = { ...uiModel.page }
          uiModel.siteRootPath = siteRootPath
          uiModel.uiRootPath = path.join(siteRootPath, '_')
          if (file.stem === '404') {
            uiModel.page = { layout: '404', title: 'Page Not Found' }
          } else {
            // NOTE @asciidoctor/core 4 requires a string, not a Buffer.
            const doc = await Asciidoctor.load(file.contents.toString(), {
              safe: 'safe',
              attributes: ASCIIDOC_ATTRIBUTES,
            })
            uiModel.page.attributes = Object.entries(doc.getAttributes())
              .filter(([name]) => name.startsWith('page-'))
              .reduce((accum, [name, val]) => {
                accum[name.slice(5)] = val
                return accum
              }, {})
            uiModel.page.description = doc.getAttribute('description')
            uiModel.page.layout = doc.getAttribute('page-layout', 'default')
            uiModel.page.title = doc.getDocumentTitle()
            uiModel.page.contents = Buffer.from(await doc.convert())
            // GH-103: `page-version-scenario` names a key under
            // `pageVersionsScenarios` in ui-model.yml; when present, its
            // fields are merged onto this page's own `page.*`, replacing the
            // fixture's default version/dropdown state with the one the
            // scenario page (page-versions-*.adoc) wants to demonstrate.
            // Everything else on `page` (navigation, breadcrumbs, component)
            // stays the shared fixture's — only version data comes from the
            // scenario. See ui-model.yml's own comment for why this has to
            // happen per rendered *page*, not by overriding `page` locally
            // inside a shared one with `{{#with}}`.
            const versionScenario = doc.getAttribute('page-version-scenario')
            const scenario = versionScenario && (sampleUiModel.pageVersionsScenarios || {})[versionScenario]
            if (versionScenario && !scenario) {
              throw new Error(`page-version-scenario "${versionScenario}" is not defined in ui-model.yml`)
            }
            if (scenario) Object.assign(uiModel.page, scenario)
            // NOTE the sample ui-model pins `home: true` globally; only the
            // landing page should actually behave like the docs home page
            // (toolbar and side-menu brand links current, side menu collapsed
            // by default). That is home.adoc, the `home` layout's own fixture
            // (GH-18) — it is what `site.homeUrl` points at in ui-model.yml.
            uiModel.page.home = file.stem === 'home'
            if (uiModel.page.layout === 'icons') uiModel.icons = iconCatalog
          }
          file.extname = '.html'
          try {
            file.contents = Buffer.from(layouts.get(uiModel.page.layout)(uiModel))
            next(null, file)
          } catch (e) {
            next(transformHandlebarsError(e, uiModel.page.layout))
          }
        })
      )
      .pipe(vfs.dest(previewDest))
      .pipe(sink())

    // NOTE the task is async, so it must both drain the pipeline and await it;
    // gulp is no longer consuming the returned stream on its behalf.
    return finished(stream.resume())
  }

function loadSampleUiModel(src) {
  // NOTE js-yaml 4 removed safeLoad; load is safe by default.
  return fs.readFile(ospath.join(src, 'ui-model.yml'), 'utf8').then((contents) => yaml.load(contents))
}

function registerPartials(src) {
  return vfs.src('partials/*.hbs', { base: src, cwd: src }).pipe(
    map((file, enc, next) => {
      handlebars.registerPartial(file.stem, file.contents.toString())
      next()
    })
  )
}

// NOTE reads the CommonJS output of `src/helpers/*.ts`, not the TypeScript sources.
function registerHelpers(tsbuildDir) {
  handlebars.registerHelper('resolvePage', resolvePage)
  handlebars.registerHelper('resolvePageURL', resolvePageURL)
  return vfs.src('helpers/*.js', { base: tsbuildDir, cwd: tsbuildDir }).pipe(
    map((file, enc, next) => {
      handlebars.registerHelper(file.stem, requireFromString(file.contents.toString()))
      next()
    })
  )
}

function compileLayouts(src, layouts = new Map()) {
  return vfs.src('layouts/*.hbs', { base: src, cwd: src, allowEmpty: true }).pipe(
    map(
      (file, enc, next) => {
        const srcName = path.join(src, file.relative)
        layouts.set(file.stem, handlebars.compile(file.contents.toString(), { preventIndent: true, srcName }))
        next()
      },
      function (done) {
        this.push({ layouts })
        done()
      }
    )
  )
}

function copyPreviewAssets(src, dest) {
  // preview.css styles the preview-only layouts (hub, icons) and is never
  // staged into public/_, so it can never end up in the published UI bundle —
  // only src/css/site.css (built by build.js) reaches build/ui-bundle.zip.
  //
  // `jpg`/`jpeg`/`gif` joined `png`/`svg` here for GH-15's own raster image
  // examples (`content.adoc`'s "real size, capped" fixture) — this glob is
  // the only thing that copies `preview-src/*` into the served `public/`
  // root at all, so a format missing from it 404s silently (the `<img>`
  // still renders, with `naturalWidth: 0`, no console error of its own).
  return vfs
    .src('**/*.{png,jpg,jpeg,gif,svg,css}', { base: src, cwd: src, encoding: false, removeBOM: false })
    .pipe(vfs.dest(dest))
    .pipe(map((file, enc, next) => next()))
}

function resolvePage(spec) {
  if (spec) return { pub: { url: resolvePageURL(spec) } }
}

// NOTE the real @antora/page-composer resolvePageURL returns undefined for
// anything it can't resolve as a page in the content catalog — an absolute
// URL or a bare `#fragment` included, since those aren't page IDs at all
// (see GH-9's hero, whose `:page-action-url:` accepts either a page
// reference or a literal URL and leans on that fallthrough via
// `(or (resolvePageURL spec) spec)`). This stub has no content catalog to
// consult, so it emulates the distinction the cheap way: anything that
// looks like a URL or a fragment is left for the caller's own `or` to fall
// back on, instead of being blindly mangled into a bogus `.html` path.
const EXTERNAL_OR_FRAGMENT_RX = /^(?:[a-z][a-z0-9+.-]*:)?\/\/|^#/i

function resolvePageURL(spec) {
  if (spec && !EXTERNAL_OR_FRAGMENT_RX.test(spec)) {
    return '/' + (spec = spec.split(':').pop()).slice(0, spec.lastIndexOf('.')) + '.html'
  }
}

function transformHandlebarsError({ message, stack }, layout) {
  const m = stack.match(/^ *at Object\.ret \[as (.+?)\]/m)
  const templatePath = `src/${m ? 'partials/' + m[1] : 'layouts/' + layout}.hbs`
  const err = new Error(`${message}${~message.indexOf('\n') ? '\n^ ' : ' '}in UI template ${templatePath}`)
  err.stack = [err.toString()].concat(stack.slice(message.length + 8)).join('\n')
  return err
}

// NOTE resolves on 'end', not 'finish'. concat-streams yields a Readable,
// which never emits 'finish' — merge-stream's Duplex did, and waiting for it
// here left the preview build hanging forever.
function toPromise(stream) {
  const data = {}
  return new Promise((resolve, reject) =>
    stream
      .on('error', reject)
      .on('data', (chunk) => chunk.constructor === Object && Object.assign(data, chunk))
      .on('end', () => resolve(data))
  )
}
