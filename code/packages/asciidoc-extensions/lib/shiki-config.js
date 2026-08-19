'use strict'

// Shared config between the two halves of the Shiki (GH-89) syntax
// highlighter: `shiki-prewarm.js` (an @inditextech/pdocs-antora-extensions
// pipeline extension, builds the one shared highlighter instance
// asynchronously before any page converts) and `shiki-syntax-highlighter.js`
// (the Asciidoctor SyntaxHighlighter adapter that reads it back
// synchronously, once per source block). Both need the exact same language
// and theme set — if the prewarm loads a language the highlighter never
// asks for, or vice versa, `getLoadedLanguages()` and the actual grammar set
// silently disagree.

module.exports = {
  // Shiki's "css variables" dual-theme mode (`defaultColor: false` — see
  // shiki-syntax-highlighter.js) emits `--shiki-light`/`--shiki-dark` custom
  // properties instead of literal colours; ui-bundle's doc.css switches
  // between them on `.ids-theme-dark`, the same toggle the rest of the site
  // themes off. Named themes, not hljs's theme FILES (GH-12) — @shikijs/themes
  // ships them as data, no CSS import/PostCSS scoping step needed at all.
  //
  // Both slots are the SAME theme — deliberately, not an oversight. The
  // code surface itself (doc.css) is black in EITHER site theme by design
  // (GH-12 again: the design keeps a dark code surface regardless of
  // light/dark site mode), so there is no separate "light" palette to
  // switch to in the first place — a genuinely light-background theme
  // (tried: 'github-light') renders near-illegible dark-grey text on that
  // black surface (verified empirically). 'github-dark'/'github-dark-dimmed'
  // (matching hljs's own old GH-12 pairing) and 'monokai' were tried next
  // and both worked; settled on 'dark-plus' — Shiki's bundled name for VS
  // Code's own default "Dark+" theme (GH-89 follow-up request) — for the
  // familiarity of VS Code's own colour choices. One name in both slots
  // means the code blocks look identical regardless of site theme —
  // intentional, not a placeholder half-migration.
  LIGHT_THEME: 'dark-plus',
  DARK_THEME: 'dark-plus',

  // @shikijs/langs module ids to bundle into the one synchronous highlighter
  // instance — see shiki-prewarm.js's own header for why this must be a
  // fixed, synchronously-loadable list rather than Shiki's normal on-demand
  // dynamic import. Mirrors the language set
  // ui-bundle/src/js/vendor/highlight.bundle.ts used to register under
  // highlight.js, plus 'html', 'typescript' and 'tsx' — actually used by
  // authored content (`[source,html]`, `[source,ts]`, `[source,tsx]`) but
  // never registered under the old hljs bundle, so those three blocks were
  // never really syntax-highlighted before this.
  LANGS: [
    'asciidoc',
    'bash',
    'clojure',
    'cpp',
    'csharp',
    'css',
    'diff',
    'dockerfile',
    'elixir',
    'go',
    'groovy',
    'haskell',
    'html',
    'java',
    'javascript',
    'json',
    'julia',
    'kotlin',
    'lua',
    'markdown',
    'nix',
    'objective-c',
    'perl',
    'php',
    'properties',
    'puppet',
    'python',
    'ruby',
    'rust',
    'scala',
    'shell',
    'sql',
    'swift',
    'tsx',
    'typescript',
    'xml',
    'yaml',
  ],

  // hljs's own name for a grammar Shiki registers under a different id.
  // highlight.js's objectivec.js self-registers as 'objectivec' with alias
  // 'objc'; Shiki's equivalent grammar is 'objective-c' (aliased to 'objc',
  // not 'objectivec') — so `[source,objectivec]`, if ever authored, needs an
  // explicit redirect. 'ts'/'tsx'/'js' need no entry here: Shiki auto-registers
  // a loaded grammar's own `aliases` (typescript's include 'ts', 'cts', 'mts'),
  // so `getLoadedLanguages()` already reports them once 'typescript' loads.
  LANG_ALIASES: { objectivec: 'objective-c' },
}
