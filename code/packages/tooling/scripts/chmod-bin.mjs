#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// `bin` entries get their executable bit set automatically when npm packs a
// published tarball, but this package is never published (GH-140) — only
// ever run from a local build via `pnpm exec docouture-tooling`, or through
// pnpm's workspace link, neither of which sets the bit for us.

import { chmod } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

await chmod(join(root, 'build', 'bin.js'), 0o755)
