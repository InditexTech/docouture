'use strict'

const postcss = require('postcss')

// GH-12 (A6, code blocks): the syntax palette comes from highlight.js's own
// upstream themes rather than a hand-authored mapping onto design system
// tokens (see .opencode/skills — decision recorded on issue #12), so both
// `github-dark` and `github-dark-dimmed` are imported as bare specifiers from
// src/css/site.css and this plugin scopes them to this bundle's own two site
// themes:
//
//   github-dark         -> :root:not(.ids-theme-dark)   ("light" site theme)
//   github-dark-dimmed  -> .ids-theme-dark               ("dark" site theme)
//
// Runs as a plugin in the same postcss() pipeline as postcss-import
// (gulp.d/tasks/build.js), positioned right after it: postcss-import mutates
// `root` in place when it resolves `@import`, so by the time this plugin's
// Once() runs the two themes' rules are already merged into the same tree as
// every other stylesheet — each retaining its own `rule.source.input.file`,
// which is what this plugin filters on. Same mechanism idsCustomMedia relies
// on (see that file's own header).
//
// Each theme file ships its own code-surface rules — `.hljs { color;
// background }`, `pre code.hljs { padding }`, `code.hljs { padding }` — which
// would fight doc.css's surface (Figma's #000, DS spacing tokens, DS
// typography). Those three selectors are dropped entirely rather than
// scoped; what survives is exactly each theme's ~20 `.hljs-*` scope-colour
// rules, wrapped in `@media screen` — print.css already forces the code
// surface itself back to a plain light background (GH-12), and these hues
// were picked for a dark background: several fail contrast against print's
// white page (e.g. github-dark's `--hljs-string` blue, #79c0ff, is ~2.2:1 on
// white). Printed code renders in the page's own plain text colour instead.

const THEMES = [
  { match: /highlight\.js[\\/]styles[\\/]github-dark\.css$/, prefix: ':root:not(.ids-theme-dark)' },
  { match: /highlight\.js[\\/]styles[\\/]github-dark-dimmed\.css$/, prefix: '.ids-theme-dark' },
]

const SURFACE_SELECTORS = new Set(['.hljs', 'pre code.hljs', 'code.hljs'])

module.exports = () => ({
  postcssPlugin: 'hljs-theme-scope',
  Once(root) {
    // Two-phase: collect first, mutate after — walkRules visits live tree
    // order, and reparenting a rule into the `@media screen` wrapper mid-walk
    // would risk the walk skipping or revisiting siblings.
    const themeRules = new Map(THEMES.map((theme) => [theme, []]))
    root.walkRules((rule) => {
      const file = rule.source && rule.source.input && rule.source.input.file
      if (!file) return
      const theme = THEMES.find((t) => t.match.test(file))
      if (!theme) return
      themeRules.get(theme).push(rule)
    })

    const missing = THEMES.filter((theme) => themeRules.get(theme).length === 0)
    if (missing.length) {
      // Fails loudly rather than silently shipping an unthemed code block if
      // a dependency bump ever renames/moves these files.
      throw new Error(
        `hljs-theme-scope: expected highlight.js theme file(s) not found in the build — ${missing
          .map((t) => t.match)
          .join(', ')}. Check the highlight.js version and the @import specifiers in site.css.`
      )
    }

    for (const [theme, rules] of themeRules) {
      const media = postcss.atRule({ name: 'media', params: 'screen' })
      rules[0].before(media)
      for (const rule of rules) {
        if (SURFACE_SELECTORS.has(rule.selector)) {
          rule.remove()
          continue
        }
        rule.selectors = rule.selectors.map((selector) => `${theme.prefix} ${selector}`)
        media.append(rule)
      }
    }
  },
})
module.exports.postcss = true
