// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { parseVersionSource, resolveDescriptor, resolveRelease } from './release-resolve.js'
import { isSemver } from './semver.js'

describe('resolveDescriptor', () => {
  it('reads the descriptor in versioned mode', () => {
    const r = resolveDescriptor({ mode: 'versioned', descriptor: '1.2.0\n' })
    expect(r).toEqual({ version: '1.2.0', tag: 'docs/v1.2.0', source: 'docs/.release-version' })
  })

  it('prefers an explicit version over the descriptor', () => {
    const r = resolveDescriptor({ mode: 'versioned', explicit: '2.0.0', descriptor: '1.2.0' })
    expect(r.version).toBe('2.0.0')
    expect(r.source).toBe('version input')
    expect(r.error).toBeUndefined()
  })

  it('targets stable in standalone mode regardless of inputs', () => {
    const r = resolveDescriptor({ mode: 'standalone', explicit: '9.9.9', descriptor: 'junk' })
    expect(r).toEqual({ version: 'stable', tag: 'docs/stable', source: 'standalone' })
  })

  it('accepts prerelease and build metadata', () => {
    expect(resolveDescriptor({ mode: 'versioned', descriptor: '1.2.0-rc.1' }).tag).toBe('docs/v1.2.0-rc.1')
    expect(resolveDescriptor({ mode: 'versioned', descriptor: '1.2.0+build.5' }).error).toBeUndefined()
  })

  it.each(['v1.2.0', '1.2', '01.2.3', '1.2.3-', 'abc'])('rejects %s as invalid', (value) => {
    const r = resolveDescriptor({ mode: 'versioned', descriptor: value })
    expect(r.error?.kind).toBe('invalid')
    expect(r.error?.value).toBe(value)
  })

  it('reports a missing file', () => {
    const r = resolveDescriptor({ mode: 'versioned', descriptor: null })
    expect(r.error?.kind).toBe('missing')
    expect(r.error?.message).toContain('missing')
  })

  it('reports an empty file as missing', () => {
    expect(resolveDescriptor({ mode: 'versioned', descriptor: '  \n' }).error?.kind).toBe('missing')
  })

  it('rejects stable as a versioned version', () => {
    expect(resolveDescriptor({ mode: 'versioned', explicit: 'stable', descriptor: null }).error?.kind).toBe('reserved')
  })
})

// The preview workflow has no Node/install steps, so it keeps its own bash
// copy of the SemVer grammar. Guard it against drifting from the CLI's.
describe('preview workflow SemVer parity', () => {
  const template = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'templates',
    'workflows',
    'docouture-release-preview.yml'
  )
  const source = /SEMVER_RE='([^']+)'/.exec(readFileSync(template, 'utf8'))?.[1]

  it('finds the regex in the template', () => {
    expect(source).toBeDefined()
  })

  it.each([
    '1.2.0',
    '0.0.0',
    '1.2.0-rc.1',
    '1.2.0-0',
    '1.2.0+build.5',
    '1.2.0-beta+exp.sha.5114f85',
    'v1.2.0',
    '1.2',
    '1.2.3.4',
    '01.2.3',
    '1.02.3',
    '1.2.3-',
    '1.2.3-01',
    '1.2.3-a..b',
    '1.2.3+',
    '1.0.0-x-y-z.-',
    '1.0.0+21AF26D3----117B344092BD',
    '',
    'stable',
  ])('agrees on %j', (value) => {
    const bashRe = new RegExp(source ?? '(?!)')
    expect(bashRe.test(value)).toBe(isSemver(value))
  })
})

describe('parseVersionSource', () => {
  it('accepts the three sources and rejects others', () => {
    expect(parseVersionSource('descriptor')).toBe('descriptor')
    expect(parseVersionSource('github-release')).toBe('github-release')
    expect(parseVersionSource('tag-bump')).toBe('tag-bump')
    expect(parseVersionSource('tag_bump')).toBeNull()
    expect(parseVersionSource(undefined)).toBeNull()
  })
})

describe('resolveRelease', () => {
  it('defaults to descriptor and flags the descriptor steps', () => {
    const r = resolveRelease({ mode: 'versioned', descriptor: '1.2.0' })
    expect(r).toMatchObject({ version: '1.2.0', tag: 'docs/v1.2.0', usesDescriptor: true })
  })

  it('standalone never uses the descriptor, whatever the source', () => {
    const r = resolveRelease({ mode: 'standalone', source: 'tag-bump', descriptor: null })
    expect(r).toMatchObject({ version: 'stable', tag: 'docs/stable', usesDescriptor: false })
  })

  describe('github-release', () => {
    const base = { mode: 'versioned', source: 'github-release', descriptor: '9.9.9' } as const

    it('uses a plain release tag, ignoring the descriptor', () => {
      const r = resolveRelease({ ...base, event: 'release', releaseTag: '1.4.0' })
      expect(r).toMatchObject({ version: '1.4.0', tag: 'docs/v1.4.0', usesDescriptor: false })
      expect(r.error).toBeUndefined()
    })

    it('strips the configured prefix', () => {
      const r = resolveRelease({ ...base, event: 'release', releaseTag: 'docs-site@1.4.0', prefix: 'docs-site@' })
      expect(r.version).toBe('1.4.0')
    })

    it('fails on a tag without the prefix', () => {
      const r = resolveRelease({ ...base, event: 'release', releaseTag: 'other@1.4.0', prefix: 'docs-site@' })
      expect(r.error?.kind).toBe('prefix')
    })

    it('rejects a v-prefixed tag as invalid SemVer', () => {
      const r = resolveRelease({ ...base, event: 'release', releaseTag: 'v1.4.0' })
      expect(r.error?.kind).toBe('invalid')
    })

    it('fails a docs/release pull request with no Release available', () => {
      const r = resolveRelease({ ...base, event: 'pull_request', labels: ['docs/release'] })
      expect(r.error?.kind).toBe('unsupported')
      expect(r.error?.message).toContain('github-release')
      expect(r.error?.message).toContain('published GitHub Release')
    })

    describe('docs-only pull request', () => {
      const pr = { ...base, event: 'pull_request', labels: ['docs/release'] } as const

      it('republishes the highest Release', () => {
        const r = resolveRelease({ ...pr, releases: ['1.3.9', '1.4.0', '1.2.0'] })
        expect(r).toMatchObject({ version: '1.4.0', tag: 'docs/v1.4.0', usesDescriptor: false })
        expect(r.error).toBeUndefined()
      })

      it('picks the highest SemVer, not the newest', () => {
        expect(resolveRelease({ ...pr, releases: ['1.3.9', '1.4.0'] }).version).toBe('1.4.0')
        expect(resolveRelease({ ...pr, releases: ['1.4.0', '1.3.9'] }).version).toBe('1.4.0')
      })

      it('lets the prefix select the package', () => {
        const r = resolveRelease({
          ...pr,
          prefix: 'docs-site@',
          releases: ['api@9.0.1', 'docs-site@1.4.0', 'docs-site@1.3.9'],
        })
        expect(r.version).toBe('1.4.0')
      })

      it('ignores prereleases and non-SemVer tags', () => {
        expect(resolveRelease({ ...pr, releases: ['1.5.0-rc.1', 'nightly', '1.4.0'] }).version).toBe('1.4.0')
      })

      it('names the prefix and the count when nothing matches', () => {
        const r = resolveRelease({ ...pr, prefix: 'docs-site@', releases: ['api@9.0.1'] })
        expect(r.error?.kind).toBe('missing')
        expect(r.error?.message).toContain('docs-site@')
        expect(r.error?.message).toContain('1 published release ')
      })

      it('lets a release tag win over the supplied releases', () => {
        const r = resolveRelease({ ...pr, releaseTag: '1.5.0', releases: ['1.9.0'] })
        expect(r.version).toBe('1.5.0')
      })

      it('lets an explicit version win', () => {
        const r = resolveRelease({ ...pr, explicit: '2.0.0', releases: ['1.9.0'] })
        expect(r.version).toBe('2.0.0')
      })

      it('does not use releases without the docs/release label', () => {
        const r = resolveRelease({ ...base, event: 'pull_request', labels: [], releases: ['1.9.0'] })
        expect(r.error?.kind).toBe('missing')
      })
    })

    it('lets an explicit version win, even for a labelled pull request', () => {
      const r = resolveRelease({ ...base, event: 'workflow_dispatch', explicit: '2.0.0', releaseTag: '1.0.0' })
      expect(r.version).toBe('2.0.0')
      expect(r.source).toBe('version input')
    })

    it('reports a missing tag', () => {
      expect(resolveRelease({ ...base, event: 'release' }).error?.kind).toBe('missing')
    })
  })

  describe('tag-bump', () => {
    const base = { mode: 'versioned', source: 'tag-bump', descriptor: null } as const
    const tags = ['docs/v1.2.3', 'docs/v1.1.0', 'docs/stable', 'something']

    it('bumps patch on docs/release', () => {
      const r = resolveRelease({ ...base, tags, labels: ['docs/release'] })
      expect(r).toMatchObject({ version: '1.2.4', tag: 'docs/v1.2.4', usesDescriptor: false })
    })

    it('bumps patch when there are no labels (release event)', () => {
      expect(resolveRelease({ ...base, tags }).version).toBe('1.2.4')
    })

    it('bumps minor and major', () => {
      expect(resolveRelease({ ...base, tags, labels: ['docs/release-minor'] }).version).toBe('1.3.0')
      expect(resolveRelease({ ...base, tags, labels: ['docs/release-major'] }).version).toBe('2.0.0')
    })

    it('takes the highest bump when several labels are present', () => {
      const labels = ['docs/release', 'docs/release-minor', 'docs/release-major']
      expect(resolveRelease({ ...base, tags, labels }).version).toBe('2.0.0')
    })

    it('orders prereleases and bumps from the highest', () => {
      const r = resolveRelease({ ...base, tags: ['docs/v1.2.0-rc.1', 'docs/v1.1.9'] })
      expect(r.version).toBe('1.2.0')
    })

    it('lets an explicit version win without bumping', () => {
      expect(resolveRelease({ ...base, tags, explicit: '3.0.0' }).version).toBe('3.0.0')
    })

    it('validates an explicit version', () => {
      expect(resolveRelease({ ...base, tags, explicit: 'v3' }).error?.kind).toBe('invalid')
    })

    it('fails the first release without a version', () => {
      const r = resolveRelease({ ...base, tags: ['docs/stable'] })
      expect(r.error?.kind).toBe('missing')
      expect(r.error?.message).toContain('explicit version')
    })

    it('allows the first release with an explicit version', () => {
      expect(resolveRelease({ ...base, tags: [], explicit: '1.0.0' }).version).toBe('1.0.0')
    })
  })
})
