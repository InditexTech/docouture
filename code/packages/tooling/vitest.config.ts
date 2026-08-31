// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    // Several specs shell out to real `git`/`npm`/`pnpm` subprocesses (bump,
    // doctor, release-local dry-run paths). Give every test the same
    // headroom a cold CI runner needs rather than sprinkling per-test
    // overrides — matches packages/cli's own vitest.config.ts.
    testTimeout: 20_000,
  },
})
