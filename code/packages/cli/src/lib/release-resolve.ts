// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { bumpVersion, highestSemver, isSemver, parseSemver } from './semver.js'

export type ReleaseMode = 'versioned' | 'standalone'

export type ReleaseErrorKind = 'missing' | 'invalid' | 'reserved' | 'prefix' | 'unsupported'

export interface ReleaseResolution {
  version: string
  tag: string
  source: string
  // True only when the descriptor bump and the prerelease sync apply: versioned
  // mode under the `descriptor` version source.
  usesDescriptor?: boolean
  error?: { kind: ReleaseErrorKind; value: string; message: string }
}

export const DESCRIPTOR_SOURCE = 'docs/.release-version'
export const INPUT_SOURCE = 'version input'

export type VersionSource = 'descriptor' | 'github-release' | 'tag-bump'

export const VERSION_SOURCES: readonly VersionSource[] = ['descriptor', 'github-release', 'tag-bump']

export function parseVersionSource(value: unknown): VersionSource | null {
  return typeof value === 'string' && (VERSION_SOURCES as readonly string[]).includes(value)
    ? (value as VersionSource)
    : null
}

export const RELEASE_LABEL = 'docs/release'
export const RELEASE_MINOR_LABEL = 'docs/release-minor'
export const RELEASE_MAJOR_LABEL = 'docs/release-major'
export const TAG_PREFIX = 'docs/v'

export interface ResolveInput {
  mode: ReleaseMode
  // An explicit version (the workflow_dispatch input), if any.
  explicit?: string
  // Contents of docs/.release-version, or null when the file does not exist.
  descriptor: string | null
  // Active version source; absent means `descriptor`.
  source?: VersionSource
  // GitHub event name (workflow_dispatch, pull_request, release, ...).
  event?: string
  // Tag of the published GitHub Release (github-release).
  releaseTag?: string
  // Tags of the repository's published, non-draft, non-prerelease GitHub
  // Releases (github-release, docs-only pull request). Order is irrelevant.
  releases?: string[]
  // `docouture.versionSourcePrefix`, stripped from releaseTag (github-release).
  prefix?: string
  // Labels on the merged pull request (tag-bump, and the github-release guard).
  labels?: string[]
  // Existing git tag names, e.g. 'docs/v1.2.3' (tag-bump). Others are ignored.
  tags?: string[]
}

type ReleaseError = NonNullable<ReleaseResolution['error']>

// Shared validation of a resolved versioned-mode version: present, not the
// standalone name 'stable', and valid SemVer.
function checkVersion(version: string, source: string): ReleaseError | undefined {
  if (version === '') {
    return { kind: 'missing', value: '', message: 'versioned mode requires a real target version, e.g. 1.2.0' }
  }
  if (version === 'stable') {
    return {
      kind: 'reserved',
      value: version,
      message:
        "'stable' is standalone's target name, not a valid versioned-mode version — use a real version, e.g. 1.2.0",
    }
  }
  if (!isSemver(version)) {
    return {
      kind: 'invalid',
      value: version,
      message: `${source} must be a valid SemVer version like 1.2.0 — got '${version}'. Prerelease/build metadata (1.2.0-beta.1, 1.2.0+build) is fine; a leading 'v' or a two-part '1.2' is not`,
    }
  }
  return undefined
}

function finish(version: string, source: string, usesDescriptor: boolean, error?: ReleaseError): ReleaseResolution {
  const result: ReleaseResolution = { version, tag: `${TAG_PREFIX}${version}`, source, usesDescriptor }
  if (error) result.error = error
  return result
}

// The `descriptor` resolver: explicit input wins, else docs/.release-version.
// Standalone always targets 'stable'. Pure: the command does the file IO.
export function resolveDescriptor(input: ResolveInput): ReleaseResolution {
  if (input.mode === 'standalone') {
    return { version: 'stable', tag: 'docs/stable', source: 'standalone' }
  }

  const explicit = input.explicit?.trim() ?? ''
  const fromInput = explicit.length > 0
  const source = fromInput ? INPUT_SOURCE : DESCRIPTOR_SOURCE
  const version = fromInput ? explicit : (input.descriptor?.replace(/\s+/g, '') ?? '')

  if (version === '' && !fromInput) {
    const message = `versioned mode requires a target version, and ${DESCRIPTOR_SOURCE} is ${input.descriptor === null ? 'missing' : 'empty'} — add it with the version to release (e.g. 1.2.0)`
    return { version, tag: `${TAG_PREFIX}${version}`, source, error: { kind: 'missing', value: '', message } }
  }

  const error = checkVersion(version, source)
  const result: ReleaseResolution = { version, tag: `${TAG_PREFIX}${version}`, source }
  if (error) result.error = error
  return result
}

// Highest stable SemVer among published Release tags: only tags that start
// with the prefix count, the prefix is stripped, and anything that is not
// SemVer or is a SemVer prerelease is ignored.
function highestRelease(releases: string[], prefix: string): string | null {
  const versions = releases
    .filter((tag) => tag.startsWith(prefix))
    .map((tag) => tag.slice(prefix.length))
    .filter((version) => (parseSemver(version)?.prerelease.length ?? 1) === 0)
  return highestSemver(versions)
}

// `github-release`: the docs follow the code release, so the version is the
// published release tag minus an optional prefix. A docs-only pull request has
// no release tag; it republishes the highest published Release instead.
function resolveGithubRelease(input: ResolveInput, explicit: string): ReleaseResolution {
  const prefix = input.prefix ?? ''
  const tag = input.releaseTag?.trim() ?? ''
  const isDocsPullRequest = input.event === 'pull_request' && (input.labels ?? []).includes(RELEASE_LABEL)

  if (!explicit && tag === '' && isDocsPullRequest) {
    const releases = (input.releases ?? []).map((r) => r.trim()).filter((r) => r !== '')
    if (releases.length === 0) {
      return finish('', 'github-release', false, {
        kind: 'unsupported',
        value: RELEASE_LABEL,
        message: `this site's docs version source is 'github-release': a '${RELEASE_LABEL}' pull request republishes the docs at the highest published GitHub Release, and none was found — publish a Release first, or start docouture-release manually with an explicit version`,
      })
    }
    const latest = highestRelease(releases, prefix)
    if (latest === null) {
      const count = `${releases.length} published ${releases.length === 1 ? 'release' : 'releases'}`
      const scope = prefix === '' ? '' : ` starting with the configured docouture.versionSourcePrefix '${prefix}'`
      return finish('', 'github-release', false, {
        kind: 'missing',
        value: prefix,
        message: `no stable SemVer GitHub Release tag${scope} was found among ${count} considered — publish a Release first, or start docouture-release manually with an explicit version`,
      })
    }
    return finish(latest, 'latest GitHub Release', false)
  }

  const sourceLabel = explicit ? INPUT_SOURCE : 'release tag'
  let version = explicit
  if (!explicit) {
    if (tag === '') {
      return finish('', sourceLabel, false, {
        kind: 'missing',
        value: '',
        message:
          "version source 'github-release' reads the published GitHub Release tag, and none was given — run it from a release event or pass an explicit version",
      })
    }
    if (prefix !== '' && !tag.startsWith(prefix)) {
      return finish(tag, sourceLabel, false, {
        kind: 'prefix',
        value: tag,
        message: `release tag '${tag}' does not start with the configured docouture.versionSourcePrefix '${prefix}'`,
      })
    }
    version = tag.slice(prefix.length)
  }
  return finish(version, sourceLabel, false, checkVersion(version, sourceLabel))
}

function bumpFromLabels(labels: string[]): 'patch' | 'minor' | 'major' {
  if (labels.includes(RELEASE_MAJOR_LABEL)) return 'major'
  if (labels.includes(RELEASE_MINOR_LABEL)) return 'minor'
  return 'patch'
}

// `tag-bump`: the latest docs/v* tag plus a bump the PR labels choose.
function resolveTagBump(input: ResolveInput, explicit: string): ReleaseResolution {
  if (explicit) return finish(explicit, INPUT_SOURCE, false, checkVersion(explicit, INPUT_SOURCE))

  const versions = (input.tags ?? []).filter((t) => t.startsWith(TAG_PREFIX)).map((t) => t.slice(TAG_PREFIX.length))
  const latest = highestSemver(versions)
  if (latest === null) {
    return finish('', 'docs/v* tags', false, {
      kind: 'missing',
      value: '',
      message:
        "version source 'tag-bump' needs an existing docs/v* tag to bump from, and none exists — pass an explicit version for the first release (for example through workflow_dispatch)",
    })
  }
  const version = bumpVersion(latest, bumpFromLabels(input.labels ?? []))
  return finish(version, `docs/v${latest} + bump`, false)
}

// Resolves the docs version for the configured source. Standalone always
// targets 'stable'. Pure: the command gathers every input.
export function resolveRelease(input: ResolveInput): ReleaseResolution {
  if (input.mode === 'standalone') {
    return { version: 'stable', tag: 'docs/stable', source: 'standalone', usesDescriptor: false }
  }
  const explicit = input.explicit?.trim() ?? ''
  switch (input.source ?? 'descriptor') {
    case 'github-release':
      return resolveGithubRelease(input, explicit)
    case 'tag-bump':
      return resolveTagBump(input, explicit)
    default:
      return { ...resolveDescriptor(input), usesDescriptor: true }
  }
}
