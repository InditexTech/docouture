#!/usr/bin/env node
'use strict'

// Copies the raw template assets (YAML, AsciiDoc, JSON) next to the compiled
// output. They are not TypeScript, so tsc never touches them; this is the
// step that gets them into build/ at all. Kept as a tiny standalone script
// rather than a gulp/build-tool dependency — there is exactly one directory
// to copy.

import { cp } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

await cp(join(root, 'templates'), join(root, 'build', 'templates'), { recursive: true })
