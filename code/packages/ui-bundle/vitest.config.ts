// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // src/helpers/**/*.ts run in Node (Handlebars helpers, evaluated at
    // build time) and default to the 'node' environment below. src/js/**
    // runs in the browser — those spec files opt into jsdom individually
    // via a `// @vitest-environment jsdom` docblock, since the two halves
    // of this package need different globals (see tsconfig.json vs
    // tsconfig.browser.json's own lib split).
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['lcov', 'text-summary'],
      reportsDirectory: 'reports/vite-coverage',
      // gulp.d/** and scripts/** are this bundle's own build tooling (see
      // sonar-project.properties' coverage.exclusions for the same split)
      // — excluded from the coverage report the same way, so a local run
      // reports the same signal Sonar does.
      exclude: ['gulp.d/**', 'scripts/**', 'preview-src/**', '**/*.config.{js,ts}'],
    },
  },
})
