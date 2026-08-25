'use strict'

// Mermaid is the one SUPPORTED_TYPES entry (kroki-config.js) with a
// documented, source-level theming mechanism: a `%%{init: {...}}%%`
// directive as the diagram's own first line, which Mermaid's renderer
// itself reads before laying anything out — `themeVariables` recolors its
// built-in palette, `themeCSS` is arbitrary CSS Mermaid inlines into the
// `<style>` block it already generates. Unlike the CSS-based overrides this
// package used to apply from the OUTSIDE (ui-bundle's diagram.css, fighting
// Mermaid's own `#container`-scoped rules with `!important`), this bakes
// the result INTO the SVG (or PNG — Kroki's mermaid companion renders PNG
// by literally screenshotting the same themed SVG in headless Chrome, so
// this applies identically to both) that Kroki returns. Verified against a
// live render both ways: computed `rx`/`fill` on the resulting `<rect>`
// match this file's own values, with zero page CSS involved at all.
//
// COLORS ARE HARDCODED HEX, NOT `--ids-*` TOKENS — deliberately. This runs
// server-side, at prewarm/render time, against a plain HTTP POST body; there
// is no CSS custom-property resolution available there (no page, no
// cascade, nothing). The values below are IOP DS's own light-theme
// `--ids-color-{bg,border,content}-default` (ids-tokens.css) copied
// verbatim — same exception the iop-ds-foundations skill already carves out
// for `--hljs-*`'s own syntax palette, for the same reason: a value that
// cannot be expressed as a token in the context it's actually used. DARK
// MODE IS NOT BAKED HERE: the result is always this fixed, light-theme
// palette; `ui-bundle/src/css/diagram.css`'s dark-mode `invert()` filter is
// what flips it for a reader in dark mode — same mechanism every other
// SUPPORTED_TYPES entry's own baked-in colors already rely on, since this
// is now one of them rather than a page-CSS-recolored special case.
const DEFAULT_THEME_INIT = {
  theme: 'base',
  themeVariables: {
    primaryColor: '#ffffff',
    primaryBorderColor: '#000000',
    primaryTextColor: '#000000',
    lineColor: '#000000',
    textColor: '#000000',
  },
  // Selectors and colors copied from a real render's own injected <style>
  // block (see diagram.css's git history for the CSS-side version this
  // replaces) — not guessed at, and not Mermaid's documented API surface
  // (themeCSS accepts arbitrary CSS; these particular selectors are
  // specific to the `stateDiagram-v2` type this package ships as its own
  // example). A different Mermaid diagram type (flowchart, sequence, ...)
  // draws through entirely different classes this won't reach — same
  // documented limitation the old CSS-based version had.
  themeCSS:
    '.node rect,.statediagram-state rect.basic,.statediagram-cluster rect{rx:0!important;ry:0!important;}' +
    // `.transition` is the edge/connector PATH itself, not an arrowhead —
    // it always ships its own inline `fill:none` (paths are lines, never
    // filled shapes). Setting `fill` here too (as a previous version of
    // this rule did) beats that inline `fill:none` (an `!important`
    // stylesheet rule always wins over a plain inline declaration,
    // regardless of specificity) and silently turns any edge whose path
    // happens to double back on itself — e.g. a self-loop like `G --> G`
    // in a stateDiagram — into a solid black blob, since the now-closed-ish
    // curve gets a fill. `stroke` is the only channel `.transition` should
    // ever touch; arrowheads are separate elements matched below.
    '.transition{stroke:#000000!important;}' +
    '.marker,.node circle.state-start,[id$="-barbEnd"]{stroke:#000000!important;fill:#000000!important;}' +
    '.node circle.state-end{fill:#000000!important;stroke:#ffffff!important;}' +
    '.nodeLabel,.edgeLabel,.stateLabel,.cluster-label{color:#000000!important;}',
}

const INIT_DIRECTIVE = '%%{init: ' + JSON.stringify(DEFAULT_THEME_INIT) + ' }%%\n'

/**
 * Prepends this package's own default Mermaid theme to `source`, UNLESS
 * the author already opened their diagram with their own `%%{init...}%%`
 * directive — Mermaid only ever honors the first one, so prepending ours
 * ahead of an author-supplied one would silently discard whatever theme (or
 * other init-only setting) they actually asked for. An author who wants
 * this package's own light-touch styling untouched writes a plain
 * `stateDiagram-v2`/`flowchart`/... block, same as before this existed; one
 * who wants their own look opts out simply by writing `%%{init...}%%`
 * themselves — no separate attribute needed to turn this off.
 *
 * Both halves of this feature (kroki.js, synchronous; kroki-prewarm.js,
 * async) must call this with the SAME input before either computing a
 * cache key or sending anything to Kroki — the whole point of a shared,
 * pure function rather than two independent copies.
 *
 * @param {string} source - the diagram's raw literal-block content, as
 *   Asciidoctor's reader or kroki-prewarm.js's own regex handed it over.
 * @returns {string}
 */
function applyDefaultMermaidTheme(source) {
  const text = String(source)
  if (text.trimStart().startsWith('%%{init')) return text
  return INIT_DIRECTIVE + text
}

module.exports = { applyDefaultMermaidTheme, DEFAULT_THEME_INIT }
