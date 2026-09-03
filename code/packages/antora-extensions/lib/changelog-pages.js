// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

const fs = require('node:fs')
const path = require('node:path')

/**
 * Appends one `== vX.Y.Z` section per cut release in `code/CHANGELOG.md`
 * onto the existing `changelog/index.adoc` page, so the page always lists
 * every real release without ever hand-copying the file's own content,
 * which would just go stale again the moment it did.
 *
 * `code/CHANGELOG.md` is read from plain disk, ONCE per build, with plain
 * `fs.readFileSync` — not through Antora's own content aggregator, since the
 * file lives outside `docs/src` entirely (no `antora.yml` sits next to it,
 * so Antora never sees it as content). This is a deliberate scope decision,
 * not an oversight: Antora's aggregator reads every OTHER ref (branches,
 * tags) straight out of git objects, never checking them out to disk, so in
 * principle a historical release tag's own build should show that tag's own
 * historical `CHANGELOG.md`, not whatever happens to be checked out on disk
 * right now. Doing that properly means resolving each component version
 * back to its underlying git ref and reading the file through git plumbing
 * instead of the filesystem — meaningfully more code, and untestable in
 * practice today since this repo has never yet had a second real version to
 * verify it against. So: one read, off disk, applied identically to every
 * component version this build produces. Revisit once a real second version
 * actually exists side-by-side with `main` and this stops being accurate.
 *
 * Every real cut `## [x.y.z]` section becomes a `== vX.Y.Z` section on
 * every component version's page. `## [Unreleased]` is different: Keep a
 * Changelog doesn't consider "unreleased" a version, so it never becomes
 * one here either — but its content is still real and current, so it's
 * rendered as a plain `== Unreleased` section, and ONLY on the component
 * version Antora resolved as `prerelease` (built from `main`, never
 * itself tagged — see `isPrereleaseVersion`). Any real, tagged release's
 * page never shows it: a tag is an immutable snapshot of the past, and
 * `[Unreleased]` is by definition whatever has landed on `main` since —
 * content that tag never contained (GH #160).
 *
 * Hooked on `contentClassified` — same event version-report.js uses: late
 * enough that every component/version Antora resolved is final, early
 * enough that `convertDocuments` (the synchronous Asciidoctor pass) hasn't
 * run yet, so appending to `changelog/index.adoc`'s own `.contents` here
 * still gets converted normally, exactly like every hand-written word
 * already on that page. Its position in index.js's registration list is not
 * load-bearing: nothing else here reads or writes this file before
 * conversion.
 *
 * Deliberately convention-based rather than configured: this only ever acts
 * on a site that already has its own `changelog/index.adoc` page (this
 * repo's own `docs/src/modules/main/pages/changelog/index.adoc`), and
 * quietly does nothing (an info log, not a warning — plenty of sites have
 * no changelog page at all) otherwise.
 *
 * The `code/CHANGELOG.md` path itself can be overridden — relative to the
 * PLAYBOOK's own directory, same convention `kroki-docker.js`'s
 * `playbook.dir` comment documents — via this extension's own registration
 * entry, snake_case per every other playbook key here:
 *
 *     antora:
 *       extensions:
 *         - require: '@inditextech/docouture-antora-extensions'
 *           changelog_path: ../code/CHANGELOG.md
 */
module.exports = function registerChangelogPages(context, changelogPath) {
  const logger = context.getLogger('docouture-changelog-pages')

  context.on('contentClassified', ({ contentCatalog, playbook }) => {
    const resolvedPath = resolveChangelogPath(playbook, changelogPath)

    let raw
    try {
      raw = fs.readFileSync(resolvedPath, 'utf8')
    } catch (err) {
      logger.warn("Could not read '%s' (%s) — changelog/index.adoc left as-is", resolvedPath, err.code || err.message)
      return
    }

    const indexFiles = contentCatalog
      .getFiles()
      .filter((file) => file.src?.family === 'page' && file.src?.relative === 'changelog/index.adoc')

    if (!indexFiles.length) {
      logger.info("No 'changelog/index.adoc' page found on this site — nothing to append to")
      return
    }

    const parsed = parseReleases(raw, logger)

    for (const indexFile of indexFiles) {
      const isPrerelease = isPrereleaseVersion(contentCatalog, indexFile.src.component, indexFile.src.version)
      indexFile.contents = Buffer.concat([indexFile.contents, Buffer.from(buildAppendedSource(parsed, isPrerelease))])
    }

    logger.info(
      'Appended %s release section(s) (+ Unreleased where applicable) from %s to changelog/index.adoc',
      parsed.releases.length,
      resolvedPath
    )
  })
}

// `playbook.dir` is wherever antora-playbook.yml actually is — this repo's
// own `docs/antora-playbook.yml`, per its own comment, so `code/CHANGELOG.md`
// resolves as `path.resolve(playbook.dir, '..', 'code', 'CHANGELOG.md')` by
// default. A configured path is resolved the same way, relative to
// `playbook.dir`, not to whatever the build's own cwd happens to be.
function resolveChangelogPath(playbook, changelogPath) {
  if (typeof changelogPath === 'string') return path.resolve(playbook.dir, changelogPath)
  return path.resolve(playbook.dir, '..', 'code', 'CHANGELOG.md')
}

// Splits on the '## [x.y.z]' / '## [Unreleased]' H2 boundary — the same
// boundary release-flow/keep-a-changelog-action and `docouture changelog`
// (packages/tooling/src/commands/changelog.ts) already key off.
//
// `[Unreleased]` is parsed out separately from `releases` rather than
// dropped outright: it is never a release section in its own right (Keep a
// Changelog doesn't consider "unreleased" a version, and it carries no
// date), but its body is still real, current content — what's landed on
// `main` since the last cut — that `buildAppendedSource` renders on the
// `prerelease` component version only. See that function's own comment.
function parseReleases(raw, logger) {
  // No trailing `\s*$`: whichever branch matches, its own captured group is
  // already greedy all the way to the true end of the line, so that anchor
  // never changed what's captured — it only left a `(.+)…\s*$` shape a
  // catastrophic-backtracking scanner flags for the no-date branch, with no
  // actual behavioural payoff.
  const headingRe = /^##\s+\[(.+?)\](?:\s*-\s*(.+))?/
  const releases = []
  let unreleased = null
  let current = null

  const flush = () => {
    if (!current) return
    if (current.version.toLowerCase() === 'unreleased') {
      unreleased = { body: convertBody(current.lines, logger, 'Unreleased') }
    } else {
      releases.push({
        version: current.version,
        date: current.date,
        body: convertBody(current.lines, logger, current.version),
      })
    }
    current = null
  }

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(headingRe)
    if (match) {
      flush()
      current = { version: match[1].trim(), date: match[2] ? match[2].trim() : undefined, lines: [] }
      continue
    }
    if (current) current.lines.push(line)
  }
  flush()

  return { releases, unreleased }
}

// Whether the component version a given changelog/index.adoc page belongs
// to is the `prerelease` one — the version built from `main`, per every
// docs/antora.yml this tooling scaffolds (see this file's own header and
// docs/antora.yml's own comment) — as opposed to a real, tagged release.
//
// Reads the flag Antora itself computed (`componentVersion.prerelease`,
// resolved off that version's own antora.yml), the same signal
// version-report.js and duplicate-latest-version.js already key off,
// rather than string-matching the `prerelease` version label: the label
// happens to be a fixed convention here, but the boolean is the real API.
function isPrereleaseVersion(contentCatalog, component, version) {
  return Boolean(contentCatalog.getComponentVersion?.(component, version)?.prerelease)
}

// Converts one release's body — restricted, by this repo's own changelog
// convention, to '### Section' headings and '- [#123](url) text' bullets —
// to AsciiDoc, ONE LEVEL DEEPER than a standalone page would need
// ('=== Section', not '== Section'), since every release now lives as a
// '== vX.Y.Z' subsection of the single changelog/index.adoc page rather
// than a page of its own. Anything that doesn't match either shape is
// copied through verbatim with a build-time warning, rather than silently
// mis-rendering: a real convention drift in CHANGELOG.md should be visible
// in build logs.
function convertBody(lines, logger, versionLabel) {
  const out = []
  for (const line of lines) {
    if (line.trim() === '') {
      out.push('')
      continue
    }
    const heading = line.match(/^###\s+(.+)/)
    if (heading) {
      out.push(`=== ${heading[1].trim()}`)
      continue
    }
    // No `\s*` before the final capture: it and the `.*` right after it can
    // both match the very same trailing spaces, which is exactly the
    // ambiguous-boundary shape a catastrophic-backtracking scanner flags —
    // trimming the captured group in JS gets the identical rendered text
    // (there is always at most one such space in a real changelog bullet)
    // with no such ambiguity.
    const bullet = line.match(/^-\s+\[#(\d+)\]\((\S+?)\)(.*)$/)
    if (bullet) {
      out.push(`* link:${bullet[2]}[#${bullet[1]}] ${unescapeMarkdownBrackets(bullet[3].trim())}`.trimEnd())
      continue
    }
    // Keep a Changelog reference-style link definitions, e.g.
    // `[Unreleased]: https://.../compare/0.1.0...HEAD` or
    // `[0.1.0]: https://.../releases/tag/0.1.0` — `release-flow/keep-a-changelog-action`
    // appends these at the bottom of the file on every `bump`, so they land in
    // the last cut release's body here. They're changelog-file plumbing, not
    // release content, so they're dropped silently rather than warned about.
    if (/^\[.+?\]:\s*\S+/.test(line.trim())) continue
    logger.warn(
      "changelog entry for '%s' doesn't match the known Keep a Changelog shape, copying verbatim: %s",
      versionLabel,
      line
    )
    out.push(line)
  }
  return out.join('\n')
}

// This repo's own CHANGELOG.md convention escapes a leading `[type]` tag as
// `\[type]` (e.g. `\[cli] Add docouture new`) — a Markdown-only concern:
// GitHub renders CHANGELOG.md as Markdown, where a bare `[foo]` can be read
// as the start of a reference-style link, so contributors escape it there.
// AsciiDoc has no equivalent meaning for `\[` — a bare `[...]` in running
// prose isn't special syntax — so Asciidoctor doesn't strip the backslash
// either; left alone, it renders as a literal `\` character on the
// changelog page (GH #223). `\*`/`\_`/`` \` ``/etc are deliberately left
// untouched here: those escape AsciiDoc's own quoted-text formatting marks
// the same way they escape Markdown's, so passing them through unchanged is
// already correct.
function unescapeMarkdownBrackets(text) {
  return text.replace(/\\([[\]])/g, '$1')
}

// `isPrerelease` is only true for the component version Antora flagged
// `prerelease: true` (see `isPrereleaseVersion` above) — the version built
// from `main`, still under active development and never itself tagged. Its
// changelog page is the one place `[Unreleased]`'s own content is useful:
// it's what's landed since the last cut, on the exact build where "no
// tagged release yet" would otherwise be the whole story (GH #160). Any
// real, tagged release's page never gets it — a tag is an immutable
// snapshot; showing content that landed on `main` AFTER that tag was cut
// would misrepresent what that version actually contains.
//
// An `[Unreleased]` heading with no entries under it (a fresh cut, nothing
// merged since) renders no section at all rather than an empty `==
// Unreleased` — falls through to the real releases below it, or to the
// placeholder if there are none of those either.
function buildAppendedSource({ releases, unreleased }, isPrerelease) {
  const sections = []

  if (isPrerelease && unreleased && unreleased.body.trim() !== '') {
    sections.push(`\n\n== Unreleased\n\n${unreleased.body}`)
  }

  if (releases.length) {
    sections.push(
      releases
        .map((release) => {
          const title = release.date ? `v${release.version} — ${release.date}` : `v${release.version}`
          return `\n\n== ${title}\n\n${release.body}`
        })
        .join('')
    )
  }

  if (!sections.length) {
    return (
      '\n\n== Versions\n\n' +
      "No tagged release yet — see `code/CHANGELOG.md`'s `[Unreleased]` section for what has landed so far.\n"
    )
  }

  return sections.join('').concat('\n')
}
