'use strict'

// HTML construction helpers for extensions that emit markup through a `pass`
// block. Shared so the escaping rule below is decided once, in one place,
// rather than re-derived (or forgotten) by each extension that interpolates
// authored text into a string of HTML.
//
// WHAT NEEDS ESCAPING, AND WHAT MUST NOT BE
//
// Asciidoctor applies its `specialcharacters` substitution to some authored
// strings before an extension ever sees them, and to others not at all.
// Escaping a string that was already substituted double-encodes it (`&` shows
// up as `&amp;` on the page); failing to escape one that was not lets authored
// text inject markup. So the distinction has to be exact. Measured against
// BOTH majors this repo runs — 2.2 via Antora for site builds, 4.0 for the
// ui-bundle preview harness — with `A & B <x>` as the probe value:
//
//   source                                    arrives as            escape?
//   ----------------------------------------  --------------------  -------
//   inline macro, positional  `x:t[A & B]`    `A &amp; B &lt;x&gt;`  NO
//   inline macro, named    `x:t[k="A & B"]`   `A &amp; B &lt;x&gt;`  NO
//   document attribute   `:page-k: A & B`     `A &amp; B &lt;x&gt;`  NO
//   block macro, positional  `x::t[A & B]`    `A & B <x>`            YES
//   block macro, named    `x::t[k="A & B"]`   `A & B <x>`            YES
//   block style attribute   `[x,k="A & B"]`   `A & B <x>`            YES
//
// Identical results on 2.2.9 and 4.0.8 — this is a block-vs-inline split, not
// a version split, so one rule covers both.
//
// Separately, and just as important: anything obtained from `getText()` on a
// Block or a ListItem is ALREADY CONVERTED HTML, not text — a dlist term
// carrying an `xref:` arrives as `<a href="some.html">Link <strong>bold</strong>
// &amp; co</a>`. Escaping that would render the anchor as visible source. Never
// pass converted output through `escapeHtml`; it is for raw attribute values.
//
// Rule of thumb, and the one the README states: escape every value read off a
// BLOCK's attributes; escape nothing that came from an inline macro, a document
// attribute, or `getText()`.

/**
 * Characters that must not survive unescaped into an HTML text node or a
 * double-quoted attribute value.
 *
 * `"` is included because {@link attr} places values inside double quotes;
 * `'` is not needed for that but is escaped anyway, so a single value is safe
 * in either quoting style.
 */
const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

const ESCAPE_RX = /[&<>"']/g

/**
 * Escapes a RAW authored string for interpolation into HTML.
 *
 * `&` is replaced first by virtue of the single pass — a naive sequence of
 * `.replace()` calls would re-escape the ampersands it had just introduced.
 *
 * @param {unknown} value - the raw value; `null`/`undefined` become `''`, so a
 *   missing optional attribute needs no separate check at the call site.
 * @returns {string} the escaped string, safe in a text node or a quoted
 *   attribute value.
 */
function escapeHtml(value) {
  if (value == null) return ''
  return String(value).replace(ESCAPE_RX, (char) => ESCAPES[/** @type {keyof typeof ESCAPES} */ (char)])
}

/**
 * Builds a single HTML attribute, escaped, or the empty string when the value
 * is absent — so optional attributes can be concatenated unconditionally
 * instead of guarded one by one at the call site:
 *
 * ```js
 * '<a' + attr('href', url) + attr('aria-label', label) + '>'
 * ```
 *
 * An empty string IS emitted (`attr('alt', '')` → ` alt=""`), because an empty
 * `alt` is meaningful — it marks a decorative image. Only `null`/`undefined`
 * drop the attribute entirely.
 *
 * @param {string} name - the attribute name; assumed to be a literal from the
 *   extension itself, never authored input, so it is not escaped.
 * @param {unknown} value - the raw attribute value.
 * @returns {string} ` name="value"`, leading space included, or `''`.
 */
function attr(name, value) {
  if (value == null) return ''
  return ' ' + name + '="' + escapeHtml(value) + '"'
}

const TAG_RX = /<[^>]*>/g

/**
 * Strips every HTML tag from a string, looping to a fixed point rather than
 * a single `.replace()` pass — a single pass can be bypassed by
 * overlapping/nested angle brackets (e.g. removing the inner tag out of
 * `<scr<script>ipt>` can leave a well-formed `<script>` behind, since that
 * one pass only ever removes the leftmost, shortest match). Used wherever
 * converted HTML (not raw author input) needs to become plain text — an ARIA
 * label, a title used as a `data-` attribute, and the like.
 *
 * @param {string} html
 * @returns {string}
 */
function stripTags(html) {
  let previous
  let current = html
  do {
    previous = current
    current = previous.replace(TAG_RX, '')
  } while (current !== previous)
  return current
}

module.exports = { escapeHtml, attr, stripTags }
