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
    // Developer scripts: standalone Node programs, ES modules, run by hand or
    // through a package script. Not part of any bundle.
    files: ['scripts/**/*.mjs', 'packages/*/scripts/**/*.mjs', 'tools/*/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.node,
    },
  }
)
