'use strict'

const produceRedirects = require('@antora/redirect-producer')

/**
 * Generates static redirect stubs from literal, arbitrary legacy URLs (e.g.
 * a Fumadocs-era `/weavejs/docs/main/quickstart`) to whatever real page
 * currently answers the equivalent URL in this site (e.g.
 * `/weavejs/latest/main/quickstart`) — for migrated content whose old URL
 * shape doesn't fit Antora's own `component:version:module:family/relative`
 * page-ID grammar, so the built-in `page-aliases` attribute can't reach it.
 *
 * Configured on the EXTENSION'S OWN registration entry in the playbook, not
 * in `docs/antora.yml` — unlike nav_modules/footer/llms, which are
 * versioned per ref (see nav-modules.js's own header for why those live in
 * the component descriptor instead of `site.keys`), these rules are
 * evaluated fresh against whatever pages a given build actually resolves,
 * regardless of which refs that build aggregates, so there is nothing to
 * gain from repeating the list on every tag — one copy, in the one
 * playbook, covers every build:
 *
 *     antora:
 *       extensions:
 *         - require: '@inditextech/docouture-antora-extensions'
 *           redirects:
 *             - from: '/weavejs/docs/main/build/node/comment'
 *               to: '/weavejs/latest/main/build/nodes/comment'
 *             - from: '/weavejs/docs/**'
 *               to: '/weavejs/latest/**'
 *
 * Both `from` and `to` are literal URL templates, not resource IDs — `*`
 * captures exactly one path segment, `**` captures everything remaining
 * (potentially several segments). `to` is the side that gets matched
 * against every REAL page's own already-computed `pub.url`: only actually
 * published content can be a redirect target, so matching against it (and
 * never against another alias/redirect Antora itself may have produced,
 * e.g. urls.latest_version_segment's own stubs) is what keeps a rule from
 * ever chaining two redirects together. A `to` naming a segment that's
 * currently just an alias itself — `/weavejs/stable/**` while
 * `latest_version_segment`'s default `replace` strategy is active — matches
 * nothing, on purpose: `/weavejs/latest/**` is the only target guaranteed
 * to always be real content, release after release.
 *
 * `from`'s wildcards are filled in, in the order they appear, with the
 * segment(s) `to`'s matching wildcards captured — so a rule's `from` and
 * `to` must carry the same number of wildcards, checked once per rule at
 * registration time, not per match.
 *
 * Rules are tried in authoring order and are first-match-wins: once a
 * legacy URL has been claimed by an earlier rule, a later rule computing
 * the same legacy URL is silently skipped — this is the intended mechanism
 * for layering a handful of exact overrides ahead of one broad `**`
 * catch-all, not a bug. A rule whose computed legacy URL collides with a
 * REAL page's own URL is different — that's never silently allowed, since
 * it would mean overwriting real content with a redirect stub.
 *
 * A rule that matches zero real pages warns (and, under this site's
 * `runtime.log.failure_level: warn`, fails the build) — the same treatment
 * as a broken xref — rather than silently shipping a rule that never does
 * anything, which is how a typo, or a `to` accidentally naming an
 * alias-only segment, would otherwise go unnoticed.
 *
 * Reuses @antora/redirect-producer, the same library `urls.
 * latest_version_segment` and the built-in `page-aliases` attribute are
 * built on, so whatever `redirect_facility` the playbook is configured with
 * (static — the default, and what this site and any plain static host like
 * GitHub Pages need — or nginx/httpd/netlify/gitlab) gets the right output
 * format for these rules too, for free.
 */
module.exports = function registerRedirects(context, rules) {
  const logger = context.getLogger('docouture-redirects')
  if (rules === undefined) return
  if (!Array.isArray(rules)) {
    logger.warn('Ignoring redirects extension config: expected a list of {from, to} rules, got %s', typeof rules)
    return
  }

  const compiled = compileRules(rules, logger)
  if (!compiled.length) return

  context.on('navigationBuilt', ({ contentCatalog, siteCatalog, playbook }) => {
    const htmlExtensionStyle = playbook.urls?.htmlExtensionStyle
    const pages = contentCatalog.getPages((page) => page.out)
    // Trailing-slash-normalized: a real page's own pub.url and a computed
    // alias's pub.url are both built from this same html_extension_style,
    // so in a real build they already agree — normalizing here is just
    // cheap insurance, not a workaround for a real discrepancy.
    const realUrls = new Set(pages.map((page) => stripTrailingSlash(page.pub.url)))
    const aliasFiles = []

    // Raw match count per rule, computed independently of precedence below
    // — a rule that never matches ANY real page is worth flagging even when
    // every page it WOULD have matched was going to lose to an earlier,
    // higher-priority rule anyway (so it can't be derived from the
    // precedence loop, which stops looking at a page once an earlier rule
    // already claims it).
    const rawMatchCounts = compiled.map((rule) => pages.filter((page) => rule.toRegex.test(page.pub.url)).length)

    for (const page of pages) {
      // First rule (in authoring order) whose `to` matches this page wins —
      // a later rule (e.g. a broad `**` catch-all) never gets a say once an
      // earlier, more specific rule already claims the same real page, even
      // if it would have computed a different legacy URL.
      for (const rule of compiled) {
        const match = rule.toRegex.exec(page.pub.url)
        if (!match) continue

        const legacyPath = substitute(rule.from, match.slice(1))
        const { pubUrl, outPath } = buildUrlAndOutPath(legacyPath, htmlExtensionStyle)

        if (realUrls.has(stripTrailingSlash(pubUrl))) {
          logger.warn(
            "Skipping redirects rule (from: '%s', to: '%s'): computed legacy URL %s collides with a real page",
            rule.from,
            rule.to,
            pubUrl
          )
        } else {
          aliasFiles.push({ out: { path: outPath }, pub: { url: pubUrl }, rel: { pub: { url: page.pub.url } } })
        }
        break // this page is claimed (matched or collided) — no lower-priority rule gets to touch it
      }
    }

    compiled.forEach((rule, i) => {
      if (!rawMatchCounts[i]) {
        logger.warn("redirects rule (from: '%s', to: '%s') matched no real pages", rule.from, rule.to)
      }
    })

    if (!aliasFiles.length) return

    // Mirrors what @antora/site-generator's own generate-site.js does with
    // Antora's own alias family: for the 'static' facility (this site's
    // default, and the only one a plain static host like GitHub Pages can
    // use) produceRedirects mutates each file's `contents` in place and
    // returns an empty array; for nginx/httpd/netlify/gitlab it instead
    // returns the one rewrite-rule file to add, having stripped `out` off
    // the (now unpublished as individual files) aliases itself.
    const produced = produceRedirects(playbook, aliasFiles)
    if (produced.length) {
      for (const file of produced) siteCatalog.addFile(file)
    } else {
      for (const file of aliasFiles) if (file.out) siteCatalog.addFile(file)
    }
  })
}

function compileRules(rules, logger) {
  const compiled = []
  for (const rule of rules) {
    if (!rule || typeof rule.from !== 'string' || typeof rule.to !== 'string') {
      logger.warn('Ignoring malformed redirects rule: %s', JSON.stringify(rule))
      continue
    }
    const { regex, wildcardCount } = compilePattern(rule.to)
    const fromWildcardCount = countWildcards(rule.from)
    if (fromWildcardCount !== wildcardCount) {
      logger.warn(
        "Ignoring redirects rule (from: '%s', to: '%s'): wildcard count mismatch (%s vs %s)",
        rule.from,
        rule.to,
        fromWildcardCount,
        wildcardCount
      )
      continue
    }
    compiled.push({ from: rule.from, to: rule.to, toRegex: regex })
  }
  return compiled
}

// Compiles a literal URL template into a matching RegExp: '*' captures one
// path segment, '**' captures everything remaining (including slashes).
// Longest-token-first so '**' is never mistaken for two '*' matches.
function compilePattern(template) {
  let pattern = ''
  let wildcardCount = 0
  let i = 0
  while (i < template.length) {
    if (template[i] === '*') {
      if (template[i + 1] === '*') {
        pattern += '(.+)'
        i += 2
      } else {
        pattern += '([^/]+)'
        i += 1
      }
      wildcardCount++
    } else {
      pattern += escapeRegExp(template[i])
      i += 1
    }
  }
  return { regex: new RegExp('^' + pattern + '$'), wildcardCount }
}

function countWildcards(template) {
  let count = 0
  let i = 0
  while (i < template.length) {
    if (template[i] === '*') {
      count++
      i += template[i + 1] === '*' ? 2 : 1
    } else {
      i += 1
    }
  }
  return count
}

// Fills a template's wildcards, in the order they appear, with the given
// captured segments — the counterpart to compilePattern's capture order.
function substitute(template, captures) {
  let result = ''
  let captureIdx = 0
  let i = 0
  while (i < template.length) {
    if (template[i] === '*') {
      result += captures[captureIdx++]
      i += template[i + 1] === '*' ? 2 : 1
    } else {
      result += template[i]
      i += 1
    }
  }
  return result
}

function escapeRegExp(char) {
  return /[.*+?^${}()|[\]\\]/.test(char) ? '\\' + char : char
}

// Mirrors @antora/content-classifier's own URL/out-path computation for the
// two html_extension_style values that matter here — 'indexify' (this
// site's own setting) and Antora's 'default' — since a synthetic redirect
// stub gets no calculatePub pass of its own; it has to be built by hand
// to match the shape everything else on the site already uses.
function buildUrlAndOutPath(literalPath, htmlExtensionStyle) {
  const trimmed = literalPath.replace(/^\/+/, '').replace(/\/+$/, '')
  if (htmlExtensionStyle === 'indexify') {
    return { pubUrl: '/' + trimmed + '/', outPath: trimmed + '/index.html' }
  }
  return { pubUrl: '/' + trimmed + '.html', outPath: trimmed + '.html' }
}

function stripTrailingSlash(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url
}
