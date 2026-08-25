'use strict'

const registerFooter = require('./lib/footer')
const registerKrokiPrewarm = require('./lib/kroki-prewarm')
const registerLifecycleLog = require('./lib/lifecycle-log')
const registerLlmsTxt = require('./lib/llms-txt')
const registerNavModules = require('./lib/nav-modules')
const registerNotFoundPage = require('./lib/not-found-page')
const registerRedirects = require('./lib/redirects')
const registerSearchIndex = require('./lib/search-index')
const registerShikiPrewarm = require('./lib/shiki-prewarm')
const registerVersionReport = require('./lib/version-report')

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
 * Declared with two named parameters, `(context, { config })` — GH redirects
 * feature. @antora/site-generator's GeneratorContext._registerExtensions
 * branches on `register.length`: zero parameters gets `register.call(context)`
 * (no way to receive this extension entry's own playbook config at all);
 * exactly one NAMED parameter gets `register(context)`, still no config;
 * anything else — including this file's two — gets a plain
 * `register(context, Object.assign({ config }, vars))` call, `config` being
 * everything on this package's own `antora.extensions` entry in the playbook
 * besides `enabled`/`id`/`require`. redirects.js's rules (see its own header)
 * are authored there, not in `docs/antora.yml`, which is the one reason this
 * package needs that config at all — every other sub-extension here still
 * ignores it entirely. The one thing that still has to be avoided is the
 * OTHER branch of that same detection: a parameter literally named `registry`
 * is what trips the "Asciidoctor extension registered as an Antora extension"
 * warning, so this stays `context`, never `registry`, same as before.
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
 *
 * kroki-prewarm (GH-44) listens on the same `contentAggregated` event as
 * shiki-prewarm, for the same reason (async work that must finish before
 * Asciidoctor's synchronous conversion starts) but touches entirely
 * different state (kroki-instance.js, not shiki-instance.js) — the two
 * listeners are independent and their relative order is not load-bearing
 * either.
 *
 * not-found-page also listens on `navigationBuilt`, but only to stash the
 * `navigationCatalog` reference for later — it reads `tree.module` (which
 * nav-modules.js stamps during THAT SAME event) only once `pagesComposed`
 * fires, by which point every `navigationBuilt` listener, regardless of
 * order, has already run to completion. Its position here is therefore not
 * load-bearing either.
 *
 * version-report listens on yet another event (`contentClassified`, fired
 * before `navigationBuilt`) and only reads `contentCatalog`, which none of
 * the above write to — its position is not load-bearing either; it is
 * simply a plain diagnostic report of what Antora already decided.
 *
 * lifecycle-log listens on EVERY documented generate-site.js event (see its
 * own header for the full list and citation) purely to log when Antora
 * itself enters each one and how long the previous phase took — it reads
 * and writes no shared state at all, so its position is not load-bearing
 * either. Registered FIRST anyway: for an event several extensions share
 * (`contentAggregated`, `contentClassified`, `navigationBuilt`), that makes
 * its "entering phase" trace line print before that event's own
 * extension-specific work (and its logs) run, which reads chronologically
 * rather than the other way round.
 *
 * redirects also listens on `navigationBuilt`, reading only real pages'
 * already-computed `pub.url` — nothing nav-modules/footer/search-index/
 * llms-txt/not-found-page write, and nothing that reads from it either — so
 * its position is not load-bearing. Listed last simply because it's the
 * newest addition.
 */
module.exports.register = function (context, { config }) {
  registerLifecycleLog(context)
  registerNavModules(context)
  registerFooter(context)
  registerSearchIndex(context)
  registerLlmsTxt(context)
  registerShikiPrewarm(context)
  registerKrokiPrewarm(context)
  registerNotFoundPage(context)
  registerVersionReport(context)
  registerRedirects(context, config?.redirects)
}
