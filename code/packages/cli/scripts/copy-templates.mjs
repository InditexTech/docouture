#!/usr/bin/env node
'use strict'

// Copies the raw template assets (YAML, AsciiDoc, JSON) next to the compiled
// output. They are not TypeScript, so tsc never touches them; this is the
// step that gets them into build/ at all. Kept as a tiny standalone script
// rather than a gulp/build-tool dependency — there is exactly one directory
// to copy.

import { cp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dest = join(root, 'build', 'templates')

// `cp` with `recursive: true` merges into an existing destination rather
// than replacing it — a file removed or moved from templates/ (e.g. the
// .github/workflows -> workflows/ move in GH-93) would otherwise keep
// lingering in build/ forever, copied nowhere in source but never cleaned
// up either. Clear the destination first so build/templates always matches
// templates/ exactly.
await rm(dest, { recursive: true, force: true })
await cp(join(root, 'templates'), dest, { recursive: true })
