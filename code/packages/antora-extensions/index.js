'use strict'

const registerFooter = require('./lib/footer')
const registerNavModules = require('./lib/nav-modules')

/**
 * Registers pdocs' Antora pipeline extensions.
 *
 * These are ANTORA extensions, not Asciidoctor ones — a different contract
 * and a different playbook key. They hook the site generator's own lifecycle
 * (`antora.extensions` in the playbook), where the sibling
 * @inditextech/pdocs-asciidoc-extensions package hooks the AsciiDoc processor
 * per page (`asciidoc.extensions`). Antora tells the two apart by inspecting
 * `register.toString()` and warns when one is listed under the other's key.
 *
 * Declared with NO parameters on purpose. @antora/site-generator's
 * GeneratorContext._registerExtensions branches on `register.length` and on
 * whether the first parameter is named: a named one gets
 * `register(context, vars)` — and, if it happens to be called `registry`, an
 * "Asciidoctor extension registered as an Antora extension" warning — while
 * zero parameters gets `register.call(context)`. Nothing here needs the
 * playbook or the extension's own `config` block at registration time, so the
 * zero-parameter form is both the simplest and the one furthest from that
 * misdetection.
 */
module.exports.register = function () {
  registerNavModules(this)
  registerFooter(this)
}
