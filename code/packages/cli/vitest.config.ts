// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    // Many specs shell out to real `git`/`npm`/`gh` subprocesses (scaffolding,
    // doctor checks). Vitest's 5s default is comfortable on a warm local
    // machine but too tight on CI runners, where an unauthenticated `gh`
    // call in particular can take several seconds to fail closed. Give every
    // test the same headroom rather than sprinkling per-test overrides.
    testTimeout: 20_000,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['lcov', 'text-summary'],
      reportsDirectory: 'reports/vite-coverage',
    },
  },
})
