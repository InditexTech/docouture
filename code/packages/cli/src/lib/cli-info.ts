'use strict'

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface CliInfo {
  name: string
  version: string
}

// Reads THIS package's own package.json — the one npm actually published (or
// `just release-local` snapshot-published) — never a value baked in at
// compile time, so it can never drift from what's really running. Callers
// pass their own import.meta.url plus how many directories separate them
// from the package root (bin.js lives at build/bin.js, one level down;
// new.js lives at build/commands/new.js, two levels down), since that
// differs by caller and there is no other reliable anchor at runtime.
export async function readCliInfo(callerUrl: string, levelsToPackageRoot: number): Promise<CliInfo> {
  const here = dirname(fileURLToPath(callerUrl))
  const upSegments = Array.from({ length: levelsToPackageRoot }, () => '..')
  const pkgPath = join(here, ...upSegments, 'package.json')
  const raw = await readFile(pkgPath, 'utf8')
  const pkg = JSON.parse(raw) as { name?: string; version?: string }
  return { name: pkg.name ?? '@inditextech/pdocs-cli', version: pkg.version ?? '0.0.0' }
}
