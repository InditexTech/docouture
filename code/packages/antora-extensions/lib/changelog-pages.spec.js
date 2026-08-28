'use strict'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const registerChangelogPages = require('./changelog-pages')

function createContext(logger = { warn: vi.fn(), info: vi.fn() }) {
  const listeners = {}
  return {
    logger,
    getLogger: () => logger,
    on(event, fn) {
      ;(listeners[event] ||= []).push(fn)
    },
    async emit(event, payload) {
      for (const fn of listeners[event] || []) await fn(payload)
    },
  }
}

function createIndexFile(component, version, module_, contents = '= Changelog\n\nSome intro.\n') {
  return {
    src: { component, version, module: module_, family: 'page', relative: 'changelog/index.adoc' },
    contents: Buffer.from(contents),
  }
}

const dirs = []
function writeChangelog(content) {
  const dir = mkdtempSync(join(tmpdir(), 'changelog-pages-'))
  dirs.push(dir)
  const file = join(dir, 'CHANGELOG.md')
  writeFileSync(file, content)
  return { dir, file }
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true })
})

async function run(changelogPath, { files = [], logger, playbookDir } = {}) {
  const context = createContext(logger)
  registerChangelogPages(context, changelogPath)

  const contentCatalog = {
    getFiles: () => files,
    // Mirrors real docouture antora.yml convention (and version-report.js /
    // duplicate-latest-version.js's own use of the same Antora-resolved
    // flag): the 'prerelease' version string is the one built from `main`
    // and flagged prerelease; anything else ('stable', a tagged '1.0.0', …)
    // is a real, tagged release.
    getComponentVersion: (component, version) => ({ prerelease: version === 'prerelease' }),
  }
  const playbook = { dir: playbookDir }

  await context.emit('contentClassified', { contentCatalog, playbook })
  return { files, logger: context.logger }
}

const SAMPLE = `# Changelog

## [Unreleased]

### Added

- [#150](https://github.com/InditexTech/docouture/pull/150) [documentation] Document docouture using docouture

## [1.0.0] - 2026-01-15

### Added

- [#100](https://github.com/InditexTech/x/pull/100) [cli] Add docouture new
- [#99](https://github.com/InditexTech/x/pull/99) [ui-bundle] Header toolbar

### Fixed

- [#98](https://github.com/InditexTech/x/pull/98) [cli] Fix a crash

## [0.9.0] - 2025-11-01

### Added

- [#50](https://github.com/InditexTech/x/pull/50) [cli] Initial scaffold
`

describe('registerChangelogPages', () => {
  it('does nothing when no changelog/index.adoc page exists on the site', async () => {
    const { dir } = writeChangelog(SAMPLE)
    const { logger } = await run('CHANGELOG.md', { files: [], playbookDir: dir })

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("No 'changelog/index.adoc'"))
  })

  it('warns and leaves the index page untouched when CHANGELOG.md cannot be read', async () => {
    const logger = { warn: vi.fn(), info: vi.fn() }
    const indexFile = createIndexFile('ROOT', 'prerelease', 'main')
    await run('does-not-exist/CHANGELOG.md', { files: [indexFile], logger, playbookDir: '/tmp' })

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not read'),
      expect.any(String),
      expect.any(String)
    )
    expect(indexFile.contents.toString()).toBe('= Changelog\n\nSome intro.\n') // untouched
  })

  it('shows Unreleased above the cut releases on the prerelease version, newest first', async () => {
    const { dir } = writeChangelog(SAMPLE)
    const indexFile = createIndexFile('ROOT', 'prerelease', 'main')
    await run('CHANGELOG.md', { files: [indexFile], playbookDir: dir })

    const source = indexFile.contents.toString()
    expect(source).toContain('Some intro.') // original prose preserved
    expect(source).toContain('== Unreleased')
    expect(source).toContain('== v1.0.0 — 2026-01-15')
    expect(source).toContain('== v0.9.0 — 2025-11-01')
    expect(source).toContain(
      '* link:https://github.com/InditexTech/docouture/pull/150[#150] [documentation] Document docouture using docouture'
    )

    const unreleasedPos = source.indexOf('== Unreleased')
    const v1Pos = source.indexOf('== v1.0.0')
    const v0Pos = source.indexOf('== v0.9.0')
    expect(unreleasedPos).toBeGreaterThan(-1)
    expect(v1Pos).toBeGreaterThan(unreleasedPos) // Unreleased leads, authored newest-first order preserved below it
    expect(v0Pos).toBeGreaterThan(v1Pos)
  })

  it('never shows Unreleased on a real, tagged version\u2019s page, even with the same CHANGELOG.md', async () => {
    const { dir } = writeChangelog(SAMPLE)
    const indexFile = createIndexFile('ROOT', 'stable', 'main')
    await run('CHANGELOG.md', { files: [indexFile], playbookDir: dir })

    const source = indexFile.contents.toString()
    expect(source).not.toContain('Unreleased')
    expect(source).toContain('== v1.0.0 — 2026-01-15')
    expect(source).toContain('== v0.9.0 — 2025-11-01')
  })

  it('converts ### headings and bullet entries to nested AsciiDoc (=== / * link:)', async () => {
    const { dir } = writeChangelog(SAMPLE)
    const indexFile = createIndexFile('ROOT', 'prerelease', 'main')
    await run('CHANGELOG.md', { files: [indexFile], playbookDir: dir })

    const source = indexFile.contents.toString()
    expect(source).toContain('=== Added')
    expect(source).toContain('=== Fixed')
    expect(source).toContain('* link:https://github.com/InditexTech/x/pull/100[#100] [cli] Add docouture new')
    expect(source).toContain('* link:https://github.com/InditexTech/x/pull/98[#98] [cli] Fix a crash')
  })

  it('appends a "no tagged release yet" placeholder on a real version when nothing has been cut', async () => {
    const { dir } = writeChangelog('# Changelog\n\n## [Unreleased]\n\n### Added\n\n- [#1](url) thing\n')
    const indexFile = createIndexFile('ROOT', 'stable', 'main') // a real, tagged version — never shows Unreleased
    await run('CHANGELOG.md', { files: [indexFile], playbookDir: dir })

    expect(indexFile.contents.toString()).toContain('No tagged release yet')
  })

  it('appends the placeholder on the prerelease version too when Unreleased itself is empty', async () => {
    const { dir } = writeChangelog('# Changelog\n\n## [Unreleased]\n')
    const indexFile = createIndexFile('ROOT', 'prerelease', 'main')
    await run('CHANGELOG.md', { files: [indexFile], playbookDir: dir })

    const source = indexFile.contents.toString()
    expect(source).toContain('No tagged release yet')
    expect(source).not.toContain('== Unreleased')
  })

  it('warns and copies a malformed entry verbatim instead of failing', async () => {
    const { dir } = writeChangelog('# Changelog\n\n## [1.0.0] - 2026-01-15\n\n### Added\n\nnot a bullet at all\n')
    const logger = { warn: vi.fn(), info: vi.fn() }
    const indexFile = createIndexFile('ROOT', 'prerelease', 'main')
    await run('CHANGELOG.md', { files: [indexFile], logger, playbookDir: dir })

    expect(indexFile.contents.toString()).toContain('not a bullet at all')
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("doesn't match the known Keep a Changelog shape"),
      expect.any(String),
      expect.any(String)
    )
  })

  it('drops trailing Keep a Changelog reference-style link definitions silently', async () => {
    // Mirrors what `release-flow/keep-a-changelog-action`'s `bump` command
    // appends at the bottom of the file on every release cut.
    const { dir } = writeChangelog(
      '# Changelog\n\n' +
        '## [Unreleased]\n\n' +
        '## [0.1.0] - 2026-01-15\n\n' +
        '### Added\n\n' +
        '- [#1](https://github.com/InditexTech/x/pull/1) thing\n\n' +
        '[Unreleased]: https://github.com/InditexTech/docouture/compare/0.1.0...HEAD\n' +
        '[0.1.0]: https://github.com/InditexTech/docouture/releases/tag/0.1.0\n'
    )
    const logger = { warn: vi.fn(), info: vi.fn() }
    const indexFile = createIndexFile('ROOT', 'prerelease', 'main')
    await run('CHANGELOG.md', { files: [indexFile], logger, playbookDir: dir })

    const source = indexFile.contents.toString()
    expect(source).toContain('== v0.1.0')
    expect(source).not.toContain('[Unreleased]: https://')
    expect(source).not.toContain('[0.1.0]: https://github.com/InditexTech/docouture/releases')
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('resolves the default code/CHANGELOG.md path relative to playbook.dir when unconfigured', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'changelog-pages-'))
    dirs.push(dir)
    const docsDir = join(dir, 'docs')
    const codeDir = join(dir, 'code')
    require('node:fs').mkdirSync(docsDir)
    require('node:fs').mkdirSync(codeDir)
    writeFileSync(join(codeDir, 'CHANGELOG.md'), SAMPLE)

    const indexFile = createIndexFile('ROOT', 'prerelease', 'main')
    await run(undefined, { files: [indexFile], playbookDir: docsDir })

    expect(indexFile.contents.toString()).toContain('== v1.0.0')
  })

  it('handles multiple existing changelog index pages (multi-version site) independently', async () => {
    const { dir } = writeChangelog(SAMPLE)
    const prerelease = createIndexFile('ROOT', 'prerelease', 'main')
    const stable = createIndexFile('ROOT', 'stable', 'main')
    await run('CHANGELOG.md', { files: [prerelease, stable], playbookDir: dir })

    expect(prerelease.contents.toString()).toContain('== v1.0.0')
    expect(stable.contents.toString()).toContain('== v1.0.0')

    // Only the prerelease version's own page gets Unreleased.
    expect(prerelease.contents.toString()).toContain('== Unreleased')
    expect(stable.contents.toString()).not.toContain('Unreleased')
  })
})
