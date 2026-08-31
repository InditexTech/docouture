#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// `bin` entries get their executable bit set automatically when npm packs a
// published tarball, but that happens at publish time — a local build (what
// pnpm's workspace link and `pnpm nx run cli:build` produce) needs it done
// explicitly, or invoking `docouture` fails with EACCES before node ever runs.

import { chmod } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

await chmod(join(root, 'build', 'bin.js'), 0o755)
