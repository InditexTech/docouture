import { dirname, resolve, join } from 'node:path'
import { existsSync } from 'node:fs'

// The Antora modules this migration created (Phase 0) — deliberately named
// to match each Fumadocs "root" segment 1:1, so a `/docs/<root>/<rest>` URL
// rewrites to `xref:<root>:<rest>.adoc[]` by simple substitution, no route
// table needed. See code/packages/example's own package description.
export const MODULES = [
  'main',
  'sdk',
  'react',
  'types',
  'store-websockets',
  'store-azure-web-pubsub',
  'store-standalone',
]

// `/docs/sdk/api-reference/actions/rectangle-tool` -> { resourceId:
// "sdk:api-reference/actions/rectangle-tool.adoc" }. Root landing pages
// (`/docs/sdk`) resolve to that module's `index.adoc`.
//
// A link can also point at a directory that has its own `index.mdx`
// (`/docs/main/build` -> main/build/index.mdx, a Fumadocs/Next.js
// directory-index route) rather than a `<rest>.mdx` file directly — caught
// by a real Antora build, not by inspection: 7 distinct targets across the
// corpus (main/build, main/build/{actions,nodes,plugins,stores},
// main/manual-installation{,/frontend}) all resolved to a nonexistent
// `<rest>.adoc` instead of the real `<rest>/index.adoc`. `contentDocsRoot`
// is required so this can check which shape is real; passing it is the only
// reason this function now needs filesystem access at all.
//
// The folder wins whenever BOTH shapes exist for the same `rest` — matching
// real Next.js/Fumadocs route precedence (an index route is more specific
// than a flat file at the same slug) — not just when the flat file is
// absent. The one such collision in the corpus,
// sdk/api-reference/weave.mdx vs weave/index.mdx, is why migrate.mjs
// excludes the flat file from CONVERSION, but the flat file still exists on
// the SOURCE filesystem — checking "does the direct file exist" first, as
// an earlier version of this function did, is fooled by that and points
// every one of the ~35 links to this page at a `.adoc` this migration never
// writes. Caught by a real build: `sdk:api-reference/weave.adoc` alone
// accounted for 77 of that build's broken-xref errors.
//
// Known upstream link bugs, found and confirmed via the Phase 5 real-build
// + real-source audit (each corrected target verified to actually exist —
// none of this is guessed). Keyed by the literal `/docs/...` href exactly
// as written in the source .mdx, applied before any other resolution, so a
// corpus re-run keeps applying the same fix without ever hand-editing
// generated .adoc.
const LINK_FIXES = new Map([
  // main/build/actions/comment-tool.mdx: singular "node" — every other
  // node page (and the real file) is under the plural build/nodes/.
  ['/docs/main/build/node/comment', '/docs/main/build/nodes/comment'],
  // main/build/actions/selection-tool.mdx: this same page already links
  // to "nodes-selection" correctly once, in its own intro — a second,
  // later mention drops the "s".
  ['/docs/main/build/plugins/node-selection', '/docs/main/build/plugins/nodes-selection'],
  // main/build/plugins/stage-panning.mdx: "Move tool" is an action, not a
  // plugin — the real page is under build/actions/, not build/plugins/.
  ['/docs/main/build/plugins/move-tool', '/docs/main/build/actions/move-tool'],
  // sdk/api-reference/actions/brush-tool.mdx: missing the "sdk" root
  // segment entirely, so it resolved as if "api-reference" were itself a
  // module.
  ['/docs/api-reference/nodes/line', '/docs/sdk/api-reference/nodes/line'],
  // sdk/api-reference/actions/index.mdx's own Card href — and that same
  // directory's meta.json (see build-nav.mjs's SLUG_FIXES for the nav
  // side of this) — both drop the "s" from the real file,
  // export-nodes-tool.mdx.
  ['/docs/sdk/api-reference/actions/export-node-tool', '/docs/sdk/api-reference/actions/export-nodes-tool'],
])

// One link with no valid target anywhere in the corpus at all — not a
// typo, main/changelog/index.mdx's own "0.77.2" bullet, for a prerelease
// version that was never actually published (confirmed absent from the
// whole content tree, not just from prerelease/ — see build-nav.mjs's own
// SKIP_SLUGS for the nav side of the same gap). Degraded to plain text by
// the caller rather than emitted as a dead xref: unlike LINK_FIXES above,
// there is no correct target this migration could point at instead.
const DEAD_LINKS = new Set(['/docs/main/changelog/prerelease/0.77.2'])

// A handful of other links point at a root/slug that was never real in
// Fumadocs either — pre-existing content bugs, not converter bugs, but
// ones with no single knowable correct target (a wrong section that could
// mean several things, ambiguous enough not to guess at). Rather than
// silently "fixing" someone else's broken link, this still emits an xref
// (so Antora's own `failure_level: warn` catches it structurally) and
// also returns `unresolved: true` so the caller can log it.
export function rewriteDocLink(url, contentDocsRoot) {
  if (!url.startsWith('/docs/')) return null
  const fixedUrl = LINK_FIXES.get(url) || url
  if (DEAD_LINKS.has(fixedUrl)) return { dead: true }

  const withoutPrefix = fixedUrl.slice('/docs/'.length)
  const [pathPart, hash] = withoutPrefix.split('#')
  const segments = pathPart.split('/').filter(Boolean)
  const root = segments[0]
  const rest = segments.slice(1)

  let page = rest.length > 0 ? rest.join('/') : 'index'
  if (rest.length > 0 && contentDocsRoot) {
    const indexFile = join(contentDocsRoot, root, page, 'index.mdx')
    if (existsSync(indexFile)) {
      page = `${page}/index`
    }
  }

  return {
    resourceId: `${root}:${page}.adoc`,
    hash,
    unresolved: !MODULES.includes(root),
  }
}

// `/images/actions/rectangle-tool.gif` -> `actions/rectangle-tool.gif`,
// the path an Antora `image::` macro expects relative to the owning
// module's `images` family. All 65 image references in the corpus are under
// `main` (verified against the source tree), so callers pass a fixed module.
export function imageSubpath(url) {
  if (!url.startsWith('/images/')) return null
  return url.slice('/images/'.length)
}

// Resolves an `<include>` target (a path relative to the .mdx file) to an
// absolute source path plus a stable relative path to copy it to under a
// module's `examples/` directory. The two real anchors in the corpus are
// content/docs/examples/ (the 2-3 store server snippets) and the sibling
// manual-installation/ sample app (45 files) — both are outside
// content/docs, addressed with a chain of `../`. Anything else is unexpected
// and falls back to the basename alone, flagged for manual review.
export function resolveIncludeTarget(rawPath, mdxAbsPath, docsRoot) {
  const absTarget = resolve(dirname(mdxAbsPath), rawPath.trim())
  const examplesAnchor = `${docsRoot}/content/docs/examples/`
  const manualAnchor = `${docsRoot}/manual-installation/`
  let relPath
  if (absTarget.startsWith(examplesAnchor)) {
    relPath = absTarget.slice(examplesAnchor.length)
  } else if (absTarget.startsWith(manualAnchor)) {
    relPath = `manual-installation/${absTarget.slice(manualAnchor.length)}`
  } else {
    relPath = null
  }
  return { absTarget, relPath }
}
