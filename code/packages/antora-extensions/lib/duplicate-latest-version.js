// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

/**
 * Duplicates a component's LATEST version's already-rendered pages, images
 * and attachments as a second, fully independent copy published under a
 * fixed `latest` URL segment — so `/…/<real-version>/…` (`stable` in
 * standalone mode, whichever release tag Antora computed as latest in
 * versioned mode) AND `/…/latest/…` both serve real, non-redirect content.
 *
 * Why this exists instead of `urls.latest_version_segment`: every one of
 * Antora's own `latest_version_segment_strategy` values (`replace` — the
 * default — `redirect:to`, `redirect:from`) treats one of the two segments
 * as a symbolic alias and reduces the OTHER one to a single root-page
 * redirect stub; every other page under the aliased-away segment stops
 * being real at all. For a standalone (stable/prerelease) site that meant
 * `/…/stable/…` — the URL its own feature name promises — silently stopped
 * resolving to real content the moment a release existed. See GH #137 and
 * this repo's `docs-site-package` skill (`reference/versioning-modes.md`,
 * "URL routing") for the full story.
 *
 * Hooked on `pagesComposed` — after Antora has rendered every page's final
 * HTML (`file.contents`) but before redirects/sitemap/publish — so what
 * this does is add plain, already-rendered files straight to `siteCatalog`
 * (the same catalog redirects.js and not-found-page.js add their own
 * site-level files to), not `contentCatalog`: nothing here needs
 * `contentCatalog`'s key-based duplicate bookkeeping or Vinyl wrapping,
 * since Antora's own file-publisher only ever looks at two fields on a
 * published file — `out.path` and `contents` — regardless of which catalog
 * it came from.
 *
 * No HTML rewriting is needed to make this correct. This UI bundle's own
 * `relativize` helper (see `packages/ui-bundle/src/helpers/relativize.ts`)
 * computes every internal href as a PATH-RELATIVE offset from the current
 * page's own directory — a pure function of directory DEPTH, never of the
 * literal version string. Swapping one version segment for another
 * (`stable` → `latest`) never changes how many segments a path has, so
 * every href already baked into a real page's rendered `contents` — nav,
 * breadcrumbs, pagination, even the version switcher's links to sibling
 * versions — resolves exactly as correctly from the `/latest/…` clone as it
 * did from the source version's own tree. This also means
 * `<link rel="canonical">` (computed off the SOURCE page's own `pub.url`
 * and already baked into `contents` before this extension ever sees it)
 * keeps pointing at the source version by construction — the desired
 * default, since it avoids duplicate-content SEO issues while both URLs
 * still return full, real, 200-status content.
 *
 * Mode-agnostic on purpose: this always duplicates `component.latest` (the
 * ComponentVersion Antora itself computes as latest, excluding
 * prereleases by default) to the `latest` segment, for every component.
 * That happens to be `stable` in standalone mode and whichever release tag
 * is newest in versioned mode — no mode branching needed here at all. A
 * versioned-mode site's `/latest/…` duplicate therefore moves to a new tag
 * automatically the next time a newer one ships; nothing here has to know
 * that happened.
 *
 * Deliberately does nothing when:
 *   - `config.duplicateLatestVersion` is not truthy (opt-in, like
 *     `redirects.js`'s own `rules` config).
 *   - a component has no non-prerelease version yet (`component.latest` is
 *     itself the prerelease — no real release exists to duplicate; a fresh
 *     standalone site with no `stable` tag yet, or a fresh versioned site
 *     with no release tag yet, should show only `/…/prerelease/…`, not a
 *     `/latest/…` alias for content that was never actually released).
 *   - `component.latest.version` already equals the `latest` segment
 *     itself (nothing to duplicate onto itself).
 *
 * Configured on the extension's own registration entry in the playbook —
 * same place `redirects.js`'s rules live, for the same reason (this is
 * build behaviour, not per-ref content). MUST be authored snake_case, like
 * every other playbook key (`html_extension_style`, `latest_version_segment`,
 * ...): `@antora/playbook-builder` lowercases every playbook key and only
 * re-cases `_`/`-` boundaries back to camelCase (`build-playbook.js`'s own
 * `camelCaseKeys`) — a camelCase-authored `duplicateLatestVersion: true`
 * survives as `duplicatelatestversion`, which `config?.duplicateLatestVersion`
 * below then reads as `undefined` and silently no-ops (GH #137 follow-up;
 * this is exactly what happened the first time this shipped):
 *
 *     antora:
 *       extensions:
 *         - require: '@inditextech/docouture-antora-extensions'
 *           duplicate_latest_version: true
 */
module.exports = function registerDuplicateLatestVersion(context, config) {
  const logger = context.getLogger('docouture-duplicate-latest-version')
  if (!config?.duplicateLatestVersion) return

  const ALIAS_SEGMENT = 'latest'

  context.on('pagesComposed', ({ contentCatalog, siteCatalog }) => {
    for (const component of contentCatalog.getComponents()) {
      const latest = component.latest
      if (!latest || latest.prerelease) continue // no real release yet — nothing to duplicate
      const sourceVersion = latest.version
      if (sourceVersion === ALIAS_SEGMENT) continue // already the alias segment itself

      const componentSegment = component.name === 'ROOT' ? '' : component.name
      const sourceFiles = contentCatalog
        .getFiles()
        .filter((file) => file.out && file.src.component === component.name && file.src.version === sourceVersion)

      let cloned = 0
      for (const file of sourceFiles) {
        const outPath = withReplacedVersionSegment(file.out.path, componentSegment, sourceVersion, ALIAS_SEGMENT)
        if (outPath === undefined) {
          logger.warn(
            "Could not compute a '%s' alias path for %s (component '%s', version '%s') — skipping",
            ALIAS_SEGMENT,
            file.out.path,
            component.name,
            sourceVersion
          )
          continue
        }
        const clone = { out: { path: outPath }, contents: file.contents }
        if (file.pub?.url) {
          const pubUrl = withReplacedVersionSegment(file.pub.url, componentSegment, sourceVersion, ALIAS_SEGMENT, true)
          if (pubUrl !== undefined) clone.pub = { url: pubUrl }
        }
        siteCatalog.addFile(clone)
        cloned++
      }

      if (cloned) {
        logger.info(
          "Duplicated %s file(s) of %s's '%s' version under '/%s/' as a second, independent copy",
          cloned,
          component.name,
          sourceVersion,
          ALIAS_SEGMENT
        )
      }
    }
  })
}

// Replaces the `<version>` path segment in a real file's already-computed
// `out.path` (no leading slash) or `pub.url` (leading slash) with the alias
// segment — anchored to the exact `<component>/<version>/` (or `<version>/`
// for the ROOT component) prefix Antora's own computeOut/computePub always
// produce, so this never touches anything past that prefix even if the
// version string happens to reappear later in the path (e.g. inside a page
// name).
function withReplacedVersionSegment(str, componentSegment, oldVersion, newVersion, leadingSlash = false) {
  const prefix = (leadingSlash ? '/' : '') + (componentSegment ? componentSegment + '/' : '')
  const oldSegment = prefix + oldVersion + '/'
  if (!str.startsWith(oldSegment)) return undefined
  return prefix + newVersion + '/' + str.slice(oldSegment.length)
}
