'use strict'

// Traces Antora's OWN generator pipeline — when it starts, and how long
// each documented phase takes — under a single `pdocs-lifecycle` logger, at
// `info`. @antora/site-generator's generate-site.js notifies every one of
// the events below (`context.notify(eventName)`, see that file's own
// source for the exact call sites this list is transcribed from) but never
// logs any of them at any level itself — they exist purely as extension
// hook points. Nothing else, in Antora or this package, narrates "starting
// content aggregation" or "site generation took Ns" without this; asking
// Antora for a higher `--log-level` gets you MORE of its per-file/per-page
// diagnostic noise, not a trace of its own pipeline.
//
// Unconditional, always registered, unlike kroki-prewarm.js/
// shiki-prewarm.js — this touches no external state (no Docker, no
// network) and has no failure mode worth degrading from: it is `Date.now()`
// and a log line, nothing else, so there is nothing here to disable.
//
// Its log lines flow through the exact same observability plumbing already
// wired for every other `pdocs-*` extension — `--log-level=info` (Antora's
// own real default is `warn`) plus a `"name":"pdocs-` filter — in this
// monorepo's own `just dev`/`just build-site` recipes and in
// `pdocs dev`/`pdocs build` (the CLI package's `antora-log.ts`). No extra
// flag or config specific to this file is needed to see it.
//
// EVENT ORDER below is generate-site.js's actual pipeline order (plus
// GeneratorContext's own always-fired contextStarted/contextClosed), not
// alphabetical.
const EVENTS = [
  'contextStarted', // GeneratorContext.start — before the playbook is even built
  'playbookBuilt',
  'beforeProcess',
  'contentAggregated', // kroki-prewarm.js's/shiki-prewarm.js's own hook point
  'uiLoaded',
  'contentClassified', // version-report.js's own hook point
  'documentsConverted',
  'navigationBuilt', // nav-modules.js's/footer.js's/search-index.js's/llms-txt.js's/not-found-page.js's own hook point
  'pagesComposed',
  'redirectsProduced',
  'siteMapped', // only fires when playbook.site.url is set
  'beforePublish',
  'sitePublished',
  'contextClosed', // GeneratorContext.close, in generate-site.js's own `finally` — always fires, success or failure
]

module.exports = function registerLifecycleLog(context, deps = {}) {
  const now = deps.now || Date.now
  const logger = context.getLogger('pdocs-lifecycle')
  const startedAt = now()
  let lastAt = startedAt

  for (const event of EVENTS) {
    context.on(event, () => {
      const at = now()
      logger.info('Antora: %s (+%dms, %dms total)', event, at - lastAt, at - startedAt)
      lastAt = at
    })
  }
}

module.exports.EVENTS = EVENTS
