'use strict'

const registerFooter = require('./lib/footer')
const registerLlmsTxt = require('./lib/llms-txt')
const registerNavModules = require('./lib/nav-modules')
const registerSearchIndex = require('./lib/search-index')
const registerShikiPrewarm = require('./lib/shiki-prewarm')

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
 *
 * REGISTRATION ORDER IS LOAD-BEARING. footer, search-index and llms-txt all
 * listen on `navigationBuilt`, and GeneratorContext#notify awaits listeners
 * in registration order (see nav-modules.js's own header for the citation),
 * not declaration order within a single file — the order these calls are
 * made IS that order. nav-modules MUST run first: it stamps `tree.module` /
 * `tree.title` onto `componentVersion.navigation`, and both search-index and
 * llms-txt (GH-95) read those same fields off the same event to build each
 * record's/section's category. footer and llms-txt have no such dependency
 * on each other and could run in either order after nav-modules; swap either
 * of them with search-index and nothing throws — records/sections just fall
 * back to filing themselves under the component title, as if no site
 * declared `nav_modules` at all.
 *
 * shiki-prewarm (GH-89) listens on a DIFFERENT event (`contentAggregated`,
 * not `navigationBuilt`) and touches none of the state the other four
 * share, so its position in this list is not load-bearing the way theirs is
 * — it is simply registered here too because this file is the one place
 * `@antora/site-generator` is told about every pdocs Antora extension.
 */
module.exports.register = function () {
  registerNavModules(this)
  registerFooter(this)
  registerSearchIndex(this)
  registerLlmsTxt(this)
  registerShikiPrewarm(this)
}
