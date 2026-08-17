'use strict'

const registerLabelMacro = require('./lib/label-macro')
const registerMonoMacro = require('./lib/mono-macro')
const registerTableWidth = require('./lib/table-width')
const registerTableContainer = require('./lib/table-container')
const registerNowrapCols = require('./lib/nowrap-cols')

function registerAll(target) {
  registerLabelMacro(target)
  registerMonoMacro(target)
  // table-width.js's tree processor must run (be registered) before
  // table-container.js's postprocessor for its stash to exist by the time
  // the postprocessor reads it — tree processors always run before
  // postprocessors regardless of registration order (Asciidoctor's own
  // fixed processor-phase pipeline), but keeping the registration order
  // matching that phase order here too, for anyone reading top to bottom.
  registerTableWidth(target)
  registerTableContainer(target)
  registerNowrapCols(target)
}

/**
 * Registers pdocs' AsciiDoc extensions.
 *
 * Antora calls this once per page with a fresh, per-page `registry` (see
 * @antora/asciidoc-loader's resolve-asciidoc-config.js) — the first
 * parameter must be literally named `registry` or Antora's own regex match
 * against `register.toString()` fails, decides this is an Antora pipeline
 * extension mistakenly listed here, logs a warning, and skips it entirely.
 *
 * The ui-bundle preview harness (gulp.d/tasks/build-preview-pages.js) calls
 * this differently: `extension.register.call(Asciidoctor.Extensions)` — no
 * argument, `this` bound to the Asciidoctor 4.0 `Extensions` NAMESPACE, not
 * a registry. That object has `.register`/`.create` but no `.inlineMacro`
 * of its own (verified empirically) — `.register(fn)` is what hands `fn` a
 * real registry as ITS `this`, one more hop than the Antora case.
 *
 * That global path is a one-time registration for the life of the process —
 * fine for a single `gulp preview:build` run, but `gulp preview` (the
 * watch server) re-runs build-preview-pages.js, and so this whole module,
 * on every rebuild WITHOUT restarting the node process. `Extensions.register`
 * has no dedupe of its own: each rebuild adds one more global registration,
 * so a table ends up wrapped in as many nested `.tableblock-wrap`s as
 * rebuilds have happened — a real bug reproduced live in that watch server
 * (`.tableblock-wrap` nested inside its own `.tablecontainer`, doubling the
 * width cap). Guarded here with a flag on the namespace object itself,
 * rather than in gulp.d (out of this package's own control) — idempotent
 * across any number of calls in the same process.
 */
module.exports.register = function (registry) {
  const target = registry || this
  if (typeof target.inlineMacro === 'function') {
    registerAll(target)
  } else if (!target.$pdocsAsciidocExtensionsRegistered) {
    target.$pdocsAsciidocExtensionsRegistered = true
    target.register(function () {
      registerAll(this)
    })
  }
}
