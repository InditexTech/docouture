// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// Just enough SemVer 2.0.0 for docs version resolution: validation,
// precedence ordering and the three bump levels, matching `semver.inc` for
// stable and prerelease inputs. Not a dependency: this is one small,
// well-specified function set.

export type BumpLevel = 'patch' | 'minor' | 'major'

export interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

const NUMERIC_IDENTIFIER = /^(0|[1-9]\d*)$/
const ALPHANUMERIC_IDENTIFIER = /^[0-9A-Za-z-]+$/
const DIGITS_ONLY = /^\d+$/

// A prerelease identifier is alphanumeric; when it is all digits it must not
// have a leading zero.
function isPrereleaseIdentifier(identifier: string): boolean {
  if (!ALPHANUMERIC_IDENTIFIER.test(identifier)) return false
  return !DIGITS_ONLY.test(identifier) || NUMERIC_IDENTIFIER.test(identifier)
}

function splitVersion(version: string): { core: string; prerelease: string | null; build: string | null } {
  const plus = version.indexOf('+')
  const build = plus === -1 ? null : version.slice(plus + 1)
  const withoutBuild = plus === -1 ? version : version.slice(0, plus)
  const dash = withoutBuild.indexOf('-')
  return {
    core: dash === -1 ? withoutBuild : withoutBuild.slice(0, dash),
    prerelease: dash === -1 ? null : withoutBuild.slice(dash + 1),
    build,
  }
}

// Full SemVer 2.0.0 grammar: MAJOR.MINOR.PATCH with no leading zeros, an
// optional -prerelease and an optional +build. A leading 'v' and a two-part
// '1.2' are not valid.
export function isSemver(version: string): boolean {
  const { core, prerelease, build } = splitVersion(version)
  const numbers = core.split('.')
  if (numbers.length !== 3 || !numbers.every((part) => NUMERIC_IDENTIFIER.test(part))) return false
  if (prerelease !== null && !prerelease.split('.').every(isPrereleaseIdentifier)) return false
  return build === null || build.split('.').every((part) => ALPHANUMERIC_IDENTIFIER.test(part))
}

export function parseSemver(version: string): ParsedVersion | null {
  if (!isSemver(version)) return null
  const { core, prerelease } = splitVersion(version)
  const [major = 0, minor = 0, patch = 0] = core.split('.').map(Number)
  return { major, minor, patch, prerelease: prerelease === null ? [] : prerelease.split('.') }
}

function comparePrereleaseIdentifier(a: string, b: string): number {
  const aNumeric = DIGITS_ONLY.test(a)
  const bNumeric = DIGITS_ONLY.test(b)
  if (aNumeric && bNumeric) return Math.sign(Number(a) - Number(b))
  if (aNumeric) return -1
  if (bNumeric) return 1
  if (a === b) return 0
  return a < b ? -1 : 1
}

// A version with a prerelease sorts below the same version without one; two
// prereleases compare identifier by identifier, and a shorter list loses when
// all shared identifiers are equal.
function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return Math.sign(b.length - a.length)
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const result = comparePrereleaseIdentifier(a[i]!, b[i]!)
    if (result !== 0) return result
  }
  return Math.sign(a.length - b.length)
}

// SemVer 2.0.0 precedence: build metadata is ignored.
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa || !pb) throw new Error(`cannot compare invalid SemVer: '${pa ? b : a}'`)
  return (
    Math.sign(pa.major - pb.major) ||
    Math.sign(pa.minor - pb.minor) ||
    Math.sign(pa.patch - pb.patch) ||
    comparePrerelease(pa.prerelease, pb.prerelease)
  )
}

export function highestSemver(versions: string[]): string | null {
  let best: string | null = null
  for (const version of versions) {
    if (!isSemver(version)) continue
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
    return isPrerelease && minor === 0 && patch === 0 ? `${major}.0.0` : `${major + 1}.0.0`
  }
  if (level === 'minor') {
    return isPrerelease && patch === 0 ? `${major}.${minor}.0` : `${major}.${minor + 1}.0`
  }
  return isPrerelease ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch + 1}`
}
