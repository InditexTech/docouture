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
 * Only real cut `## [x.y.z]` sections become a section — `## [Unreleased]`
 * is deliberately excluded, the same way Keep a Changelog itself doesn't
 * consider "unreleased" a version.
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
      .filter((file) => file.src && file.src.family === 'page' && file.src.relative === 'changelog/index.adoc')

    if (!indexFiles.length) {
      logger.info("No 'changelog/index.adoc' page found on this site — nothing to append to")
      return
    }

    const releases = parseReleases(raw, logger)
    const appended = buildAppendedSource(releases)

    for (const indexFile of indexFiles) {
      indexFile.contents = Buffer.concat([indexFile.contents, Buffer.from(appended)])
    }

    logger.info('Appended %s release section(s) from %s to changelog/index.adoc', releases.length, resolvedPath)
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
// (packages/tooling/src/commands/changelog.ts) already key off — and drops
// Unreleased entirely, per this file's own header.
function parseReleases(raw, logger) {
  const headingRe = /^##\s+\[(.+?)\](?:\s*-\s*(.+))?\s*$/
  const releases = []
  let current = null

  const flush = () => {
    if (current && current.version.toLowerCase() !== 'unreleased') {
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

  return releases
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
    const heading = line.match(/^###\s+(.+)$/)
    if (heading) {
      out.push(`=== ${heading[1].trim()}`)
      continue
    }
    const bullet = line.match(/^-\s+\[#(\d+)\]\((\S+?)\)\s*(.*)$/)
    if (bullet) {
      out.push(`* link:${bullet[2]}[#${bullet[1]}] ${bullet[3]}`.trimEnd())
      continue
    }
    logger.warn(
      "changelog entry for '%s' doesn't match the known Keep a Changelog shape, copying verbatim: %s",
      versionLabel,
      line
    )
    out.push(line)
  }
  return out.join('\n')
}

function buildAppendedSource(releases) {
  if (!releases.length) {
    return (
      '\n\n== Versions\n\n' +
      "No tagged release yet — see `code/CHANGELOG.md`'s `[Unreleased]` section for what has landed so far.\n"
    )
  }
  return releases
    .map((release) => {
      const title = release.date ? `v${release.version} — ${release.date}` : `v${release.version}`
      return `\n\n== ${title}\n\n${release.body}`
    })
    .join('')
    .concat('\n')
}
