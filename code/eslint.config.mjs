// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/build/**',
      '**/public/**',
      '**/.tsbuild/**',
      '**/.nx/**',
      'packages/*/src/js/vendor/*.min.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    // Browser sources shipped inside the UI bundle.
    files: ['packages/*/src/js/**/*.ts'],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // These files are the upstream Antora default UI scripts, carried over as
      // loose ES5. They are exempt from the stylistic rules so the fork could
      // land without rewriting behaviour that has no test coverage — the same
      // reason tsconfig.browser.json relaxes `strict` for them. Drop these
      // exemptions file by file as the UI redesign rewrites them.
      'no-var': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
  {
    // Node build tooling: the gulp pipeline stays CommonJS on purpose.
    files: ['packages/*/gulpfile.js', 'packages/*/gulp.d/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Asciidoctor extensions (GH-14): CommonJS is the registration contract
    // both Antora (asciidoc.extensions) and the ui-bundle preview harness
    // require — see .opencode/skills/asciidoc/reference/extensions.md.
    files: ['packages/asciidoc-extensions/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Antora pipeline extensions: CommonJS for the same reason as the
    // Asciidoctor ones above — `require`d by Antora itself, out of the
    // playbook's own directory, never bundled or transpiled. Different
    // lifecycle, different playbook key (`antora.extensions`), same contract.
    files: ['packages/antora-extensions/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // docouture publish drivers: plain CommonJS Node modules, `require()`d by
    // @inditextech/docouture-cli's `publish` command out of a site's own
    // node_modules — not bundled, not an Antora extension (that's why this
    // isn't grouped with antora-extensions above).
    files: ['packages/publish-gh-pages/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Developer scripts: standalone Node programs, ES modules, run by hand or
    // through a package script. Not part of any bundle. The `templates/*/scripts`
    // entry covers the CLI's own scaffolded-site scripts (e.g.
    // packages/cli/templates/starter/scripts/check-links.mjs) — these ship
    // inside a template dir, never executed here, but still real Node ESM
    // that lints as such.
    files: [
      'scripts/**/*.mjs',
      'packages/*/scripts/**/*.mjs',
      'packages/*/templates/*/scripts/**/*.mjs',
      'tools/*/*.mjs',
    ],
    languageOptions: {
      sourceType: 'module',
      globals: globals.node,
    },
  }
)
