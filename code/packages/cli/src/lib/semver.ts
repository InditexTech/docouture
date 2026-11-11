// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// Just enough SemVer 2.0.0 for docs version resolution: precedence ordering
// and the three bump levels, matching `semver.inc` for stable and prerelease
// inputs. Not a dependency: this is one small, well-specified function pair.

// Full SemVer 2.0.0 grammar (semver.org's own regex). Prerelease and build
// metadata suffixes are valid; a leading 'v' or a two-part '1.2' is not.
export const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-(0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(\.(0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(\+[0-9a-zA-Z-]+(\.[0-9a-zA-Z-]+)*)?$/

export type BumpLevel = 'patch' | 'minor' | 'major'

export interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

export function parseSemver(version: string): ParsedVersion | null {
  if (!SEMVER_RE.test(version)) return null
  const [core = '', ...rest] = version.split('+')[0]!.split('-')
  const [major = '0', minor = '0', patch = '0'] = core.split('.')
  const prerelease = rest.length > 0 ? rest.join('-').split('.') : []
  return { major: Number(major), minor: Number(minor), patch: Number(patch), prerelease }
}

function comparePrereleaseIdentifier(a: string, b: string): number {
  const aNumeric = /^\d+$/.test(a)
  const bNumeric = /^\d+$/.test(b)
  if (aNumeric && bNumeric) return Math.sign(Number(a) - Number(b))
  if (aNumeric) return -1
  if (bNumeric) return 1
  if (a === b) return 0
  return a < b ? -1 : 1
}

// SemVer 2.0.0 precedence: build metadata is ignored, a version with a
// prerelease sorts below the same version without one.
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa || !pb) throw new Error(`cannot compare invalid SemVer: '${pa ? b : a}'`)
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (pa[key] !== pb[key]) return Math.sign(pa[key] - pb[key])
  }
  if (pa.prerelease.length === 0 && pb.prerelease.length === 0) return 0
  if (pa.prerelease.length === 0) return 1
  if (pb.prerelease.length === 0) return -1
  const length = Math.max(pa.prerelease.length, pb.prerelease.length)
  for (let i = 0; i < length; i++) {
    const x = pa.prerelease[i]
    const y = pb.prerelease[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const result = comparePrereleaseIdentifier(x, y)
    if (result !== 0) return result
  }
  return 0
}

export function highestSemver(versions: string[]): string | null {
  let best: string | null = null
  for (const version of versions) {
    if (!parseSemver(version)) continue
    if (best === null || compareSemver(version, best) > 0) best = version
  }
  return best
}

// Same rules as `semver.inc(version, level)`: a bump from a prerelease whose
// lower components are already zero only drops the prerelease; build metadata
// is discarded.
export function bumpVersion(version: string, level: BumpLevel): string {
  const parsed = parseSemver(version)
  if (!parsed) throw new Error(`cannot bump invalid SemVer: '${version}'`)
  const { major, minor, patch, prerelease } = parsed
  const isPrerelease = prerelease.length > 0

  if (level === 'major') {
    if (isPrerelease && minor === 0 && patch === 0) return `${major}.0.0`
    return `${major + 1}.0.0`
  }
  if (level === 'minor') {
    if (isPrerelease && patch === 0) return `${major}.${minor}.0`
    return `${major}.${minor + 1}.0`
  }
  if (isPrerelease) return `${major}.${minor}.${patch}`
  return `${major}.${minor}.${patch + 1}`
}
