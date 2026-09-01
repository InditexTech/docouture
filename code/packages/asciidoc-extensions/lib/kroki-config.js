// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// Shared between the two halves of GH-44's Kroki support — see
// kroki.js's own header for why there are two halves at all.
//
// THE URL IS NOT SITE-CONFIGURABLE, ON PURPOSE. Every other piece of Kroki
// config here (whether it runs at all, which diagram types) is an authored
// `asciidoc.attributes` key a site can set — but the endpoint itself is a
// single fixed value, `http://localhost:8500`, the one
// @inditextech/docouture-antora-extensions' `kroki-prewarm.js`/`kroki-docker.js`
// auto-start against, and the one baked into their bundled
// `resources/kroki-compose.yml`. That was a deliberate call (see GH-44's own
// thread): letting a site point this at an arbitrary URL turns a
// same-machine, no-network-egress diagram renderer into an arbitrary
// outbound HTTP call an author's `asciidoc.attributes` YAML can redirect —
// not a risk worth taking for a value with exactly one legitimate answer per
// environment (the loopback Kroki this repo's own tooling starts). 8500
// rather than Kroki's own factory default (8000) only to keep this
// project's fixed port away from whatever else a contributor's machine
// already has bound to 8000 — it carries no other meaning and does not need
// to match Kroki's upstream docs.
const KROKI_URL = 'http://localhost:8500'

// Every block style name this extension recognizes, and the exact path
// segment Kroki's own `/{diagramType}/svg` API expects for it — identical
// strings for every type Kroki supports, so this is also the full set of
// values `kroki-diagram-types` accepts.
//
// Curated, not Kroki's entire catalogue: each entry here is a type this
// project has actually verified end to end (see the sibling
// `kroki-prewarm.js` and `@inditextech/docouture-antora-extensions`'
// `resources/kroki-compose.yml`). Kroki supports more; add to this list —
// and to that compose file's companions, for any type that needs one,
// mermaid, bpmn and excalidraw being the three in Kroki's own catalogue
// that do (each is its own headless-Chrome/Puppeteer service, on its own
// fixed port — see that compose file's own header for the port each one
// actually listens on, verified by inspecting the running container rather
// than assumed) — before authors can rely on a new one. A site can
// customize that compose file for itself via `docouture eject kroki` without
// forking this package.
//
// GH-195: the block after `bpmn` (`actdiag` through `wireviz`) are every
// remaining type Kroki's own Architecture doc lists as bundled in the core
// `yuzutech/kroki` gateway image itself — https://docs.kroki.io/kroki/architecture/
// — i.e. needing no companion container of their own, unlike mermaid/bpmn/
// excalidraw above. Each was posted, individually, straight at this repo's
// own already-running local Kroki (`docker ps` showed `resources-kroki-1`
// live on :8500) with a minimal real (not placeholder) source for that
// diagram language, both at `/svg` and `/png`, before being added here —
// see `FORMAT_SUPPORT`'s own comment for the full per-type matrix that
// verification produced (not just `svg`/`png`).
// `d2`, `dbml` and `tikz` — in the syntax doc's diagram-types table but
// ABSENT from the Architecture doc's own per-image breakdown — and
// `diagramsnet` (its own companion, and marked "experimental" upstream) are
// deliberately NOT added here: unverified against the image this project
// actually pins, not merely "not yet gotten to".
const SUPPORTED_TYPES = [
  'mermaid',
  'plantuml',
  'graphviz',
  'c4plantuml',
  'excalidraw',
  'blockdiag',
  'ditaa',
  'erd',
  'nomnoml',
  'svgbob',
  'vega',
  'vegalite',
  'wavedrom',
  'bpmn',
  'actdiag',
  'bytefield',
  'goat',
  'nwdiag',
  'packetdiag',
  'pikchr',
  'rackdiag',
  'seqdiag',
  'structurizr',
  'symbolator',
  'umlet',
  'wireviz',
]

const DEFAULT_FORMAT = 'svg'

// GH-195: the exact per-type format support Kroki's OWN server reports —
// not an approximation. Kroki's `/{type}/{format}` rejects an unsupported
// format with a 400 whose body names every format that type DOES accept
// (`Error 400: Unsupported output format: bogus for plantuml. Must be one
// of png, svg, pdf, base64, txt or utxt.`) — so rather than guess that
// `png`-capable implies `jpeg`/`pdf`/`base64`/`txt`-capable (it does not:
// `mermaid` supports only `png`/`svg` and nothing else; `graphviz` supports
// `jpeg` but not `txt`; `plantuml` supports `txt`/`base64` but not `jpeg`),
// every `SUPPORTED_TYPES` entry below was posted a deliberately-invalid
// format string against this repo's own already-running local Kroki and
// this table transcribes that response verbatim, `svg` (accepted
// everywhere, the one format never listed as a rejection) added back in.
// Re-run this probe (`curl --data-raw x http://localhost:8500/<type>/bogus`)
// whenever the pinned `yuzutech/kroki*` image versions
// (`kroki-compose.yml`) move — a newer Kroki release can both add and drop
// per-type format support.
const FORMAT_SUPPORT = {
  mermaid: ['svg', 'png'],
  plantuml: ['svg', 'png', 'pdf', 'base64', 'txt', 'utxt'],
  graphviz: ['svg', 'png', 'jpeg', 'pdf'],
  c4plantuml: ['svg', 'png', 'pdf', 'base64', 'txt', 'utxt'],
  excalidraw: ['svg'],
  blockdiag: ['svg', 'png', 'pdf'],
  ditaa: ['svg', 'png'],
  erd: ['svg', 'png', 'jpeg', 'pdf'],
  nomnoml: ['svg'],
  svgbob: ['svg'],
  vega: ['svg', 'png', 'pdf'],
  vegalite: ['svg', 'png', 'pdf'],
  wavedrom: ['svg'],
  bpmn: ['svg'],
  actdiag: ['svg', 'png', 'pdf'],
  bytefield: ['svg'],
  goat: ['svg'],
  nwdiag: ['svg', 'png', 'pdf'],
  packetdiag: ['svg', 'png', 'pdf'],
  pikchr: ['svg'],
  rackdiag: ['svg', 'png', 'pdf'],
  seqdiag: ['svg', 'png', 'pdf'],
  structurizr: ['svg', 'png', 'pdf', 'base64', 'txt', 'utxt'],
  symbolator: ['svg', 'png'],
  umlet: ['svg', 'png', 'jpeg'],
  wireviz: ['svg', 'png'],
}

// Backward-compatible view over `FORMAT_SUPPORT` — every type whose table
// entry includes `png`. Nothing in this package derives `jpeg`/`pdf`/
// `base64`/`txt`/`utxt` support from this any more (see `resolveFormat`,
// which now consults `FORMAT_SUPPORT` directly, per format); kept as its
// own export because it is still the simplest true statement of "does this
// type rasterize at all" for anything outside this file that only cares
// about that one distinction.
const PNG_SUPPORTED_TYPES = new Set(Object.keys(FORMAT_SUPPORT).filter((type) => FORMAT_SUPPORT[type].includes('png')))

// `jpg` is accepted as an alias for `jpeg` (Kroki's own API, and
// `FORMAT_SUPPORT` above, only ever say `jpeg`) — normalized in
// `resolveFormat`, so both spellings key the cache identically instead of
// `format=jpg` silently becoming a permanent miss. `atxt` is real —
// present in the syntax doc's own output-formats table — but doesn't
// appear as an accepted value for ANY `SUPPORTED_TYPES` entry against the
// Kroki version this project pins (every `txt`-family entry above lists
// `txt`/`utxt` but never `atxt`); kept resolvable rather than special-cased
// out, since `resolveFormat` treats an unsupported-for-this-type format
// the same way regardless (falls back to `svg`, warns) and a future Kroki
// version, or a type this project hasn't added yet, may support it.
const TEXT_FORMATS = new Set(['txt', 'atxt', 'utxt'])
const JPG_ALIAS = 'jpg'

// The two `asciidoc.attributes` keys a site sets in its playbook. Both are
// read from the same `document` object on the synchronous (Asciidoctor)
// side, in kroki.js, and from `playbook.asciidoc.attributes` on the async
// (Antora pipeline) side, in kroki-prewarm.js — kept together here so the
// two never drift into checking different key strings.
const ENABLED_ATTR = 'kroki-enabled'
const TYPES_ATTR = 'kroki-diagram-types'

/**
 * Antora/Asciidoctor attribute truthiness: an attribute given as YAML `true`
 * arrives as the boolean `true`; one written `kroki-enabled: "true"` (or set
 * via a document `:kroki-enabled: true` line) arrives as the string
 * `'true'`. Anything else — unset, `false`, `'false'`, empty string — is
 * off. There is no third state: this package has no other boolean-attribute
 * precedent to match against, so the two truthy shapes actually reachable
 * from YAML and from AsciiDoc source are both covered and nothing else is
 * guessed at.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isTruthy(value) {
  return value === true || value === 'true'
}

/**
 * Resolves which of `SUPPORTED_TYPES` are actually active, given the two
 * attribute values a site may have set. Shared verbatim by both the sync
 * block processor (which must not attempt a type that was never prewarmed)
 * and the async prewarm listener (which must not fetch a type nobody asked
 * for) — the two have to agree, or a type enabled in one place and not the
 * other either wastes a network call or never gets rendered.
 *
 * @param {unknown} enabledAttr - raw `kroki-enabled` attribute value.
 * @param {unknown} typesAttr - raw `kroki-diagram-types` attribute value;
 *   comma-separated, whitespace tolerated. Omitted (or empty) while enabled
 *   means "every supported type".
 * @param {(unknown: string) => void} [onUnknownType] - called once per
 *   comma-separated entry that isn't in `SUPPORTED_TYPES`, so the caller can
 *   warn with its own node context. Not called when `typesAttr` is absent —
 *   omitting the attribute is the documented way to mean "all of them", not
 *   an authoring mistake.
 * @returns {Set<string>} the active subset of `SUPPORTED_TYPES`; empty when
 *   `kroki-enabled` is not truthy.
 */
function resolveEnabledTypes(enabledAttr, typesAttr, onUnknownType) {
  if (!isTruthy(enabledAttr)) return new Set()
  if (typesAttr == null || typesAttr === '') return new Set(SUPPORTED_TYPES)

  const requested = String(typesAttr)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  const active = new Set()
  for (const type of requested) {
    if (SUPPORTED_TYPES.includes(type)) {
      active.add(type)
    } else if (onUnknownType) {
      onUnknownType(type)
    }
  }
  return active
}

/**
 * Resolves the actual output format to request from Kroki for one block:
 * an author writes `[mermaid,format=png]`; omitted, empty, or explicitly
 * `svg` all mean the existing default. Shared verbatim by the sync block
 * processor (kroki.js) and the async prewarm scanner (kroki-prewarm.js) for
 * the same reason `resolveEnabledTypes` is — both derive a cache key from
 * this value (kroki-instance.js's `keyFor`), so a type this function
 * silently downgrades in one place and not the other would look up a key
 * the other side never populated.
 *
 * GH-195: widened beyond `svg`/`png` to the real extension's own format
 * vocabulary — `jpeg` (`jpg` accepted as an alias, normalized here so both
 * spellings share one cache entry), `pdf`, `base64`, `txt`, `atxt`, `utxt`
 * — gated per type against `FORMAT_SUPPORT`'s real, live-server-verified
 * matrix rather than one blanket rule. The caller (`kroki.js`/
 * `kroki-prewarm.js`) is what decides a text-family result means "render a
 * literal block, not an image" — see `isTextFormat` — this function only
 * ever resolves which string to request.
 *
 * @param {string} type - a `SUPPORTED_TYPES` entry.
 * @param {unknown} requestedFormat - the block's own `format` attribute,
 *   however Asciidoctor or the raw-text regex handed it over — anything at
 *   all, not just a known format string, since this is the one place both
 *   sides actually validate it (kroki-prewarm.js's own regex deliberately
 *   doesn't restrict the value it captures, for exactly this reason).
 * @param {(type: string, requestedFormat: string) => void} [onUnsupported] -
 *   called once for any `requestedFormat` that isn't recognized, or that
 *   `FORMAT_SUPPORT` says this particular type doesn't accept — an
 *   unrecognized value (a typo, `format=jpg2000`) and a
 *   recognized-but-unsupported one (`format=jpeg` on `mermaid`) both go
 *   through this the same way, so the caller can warn with its own node
 *   context either way.
 * @returns {'svg' | 'png' | 'jpeg' | 'pdf' | 'base64' | 'txt' | 'atxt' | 'utxt'}
 */
function resolveFormat(type, requestedFormat, onUnsupported) {
  if (requestedFormat == null || requestedFormat === '' || requestedFormat === DEFAULT_FORMAT) return DEFAULT_FORMAT
  const normalized = String(requestedFormat === JPG_ALIAS ? 'jpeg' : requestedFormat)
  const accepted = FORMAT_SUPPORT[type]
  if (accepted && accepted.includes(normalized))
    return /** @type {'svg' | 'png' | 'jpeg' | 'pdf' | 'base64' | 'txt' | 'atxt' | 'utxt'} */ (normalized)
  if (onUnsupported) onUnsupported(type, String(requestedFormat))
  return DEFAULT_FORMAT
}

/**
 * @param {string} format - `resolveFormat`'s return value.
 * @returns {boolean} whether this format renders as a literal block of text
 *   (Kroki's own ASCII-art-style output) rather than an image.
 */
function isTextFormat(format) {
  return TEXT_FORMATS.has(format)
}

// GH-195: every attribute the real asciidoctor-kroki extension itself
// reserves — https://docs.asciidoctor.org/kroki-extension/latest/syntax/#attributes
// plus the positional/bookkeeping keys Asciidoctor's own attribute-list
// parser adds regardless (`$positional` under 2.2, numeric `1`/`2`/`3`
// under both — filtered separately, by `isPositionalKey`, since they're not
// fixed strings; `cloaked-context`, which Asciidoctor sets on every literal/
// listing block itself, diagram or not). Anything ELSE a block carries as a
// NAMED attribute is a Kroki diagram-specific option (`view-key=`, `theme=`,
// …) — see `resolveDiagramOptions` — forwarded to Kroki verbatim, exactly
// as the real extension forwards them as `Kroki-Diagram-Options-<key>`
// headers (see kroki-prewarm.js's own `fetchDiagram`).
const BUILTIN_ATTRIBUTES = new Set([
  'target',
  'width',
  'height',
  'format',
  'fallback',
  'link',
  'float',
  'align',
  'role',
  'title',
  'caption',
  'subs',
  'opts',
  'options',
  'id',
  'cloaked-context',
  '$positional',
])

/**
 * @param {string} key - a raw attribute key, as Asciidoctor's own attrs
 *   object (2.2 or 4.0 shape) or kroki-prewarm.js's raw-attrlist parser
 *   produces it.
 * @returns {boolean} whether `key` is a positional/option bookkeeping key
 *   rather than something an author wrote as `name=value` — a bare numeric
 *   index (`"1"`, `"2"`, …, both majors) or an `<opt>-option` flag
 *   Asciidoctor's own attribute-list grammar synthesizes from `opts=`/
 *   `options=` (see kroki.js's own header on that expansion).
 */
function isPositionalOrOptionKey(key) {
  return /^\d+$/.test(key) || key.endsWith('-option')
}

/**
 * Every named attribute on a diagram block that ISN'T one of
 * `BUILTIN_ATTRIBUTES` or positional/option bookkeeping — i.e. a Kroki
 * diagram-specific option (`view-key=SystemContext`, `theme=hacker`, …),
 * forwarded to Kroki verbatim as `Kroki-Diagram-Options-<key>` headers.
 *
 * @param {Record<string, unknown>} attrs - a real Asciidoctor attrs object
 *   (kroki.js) or the raw-attrlist-parser's named-attribute map
 *   (kroki-prewarm.js) — same shape either way: plain string-keyed object.
 * @returns {Record<string, string>} diagram-specific options, values
 *   coerced to strings (HTTP header values must be strings).
 */
function resolveDiagramOptions(attrs) {
  /** @type {Record<string, string>} */
  const options = {}
  for (const key of Object.keys(attrs || {})) {
    if (BUILTIN_ATTRIBUTES.has(key) || isPositionalOrOptionKey(key)) continue
    options[key] = String(attrs[key])
  }
  return options
}

module.exports = {
  KROKI_URL,
  SUPPORTED_TYPES,
  PNG_SUPPORTED_TYPES,
  FORMAT_SUPPORT,
  TEXT_FORMATS,
  DEFAULT_FORMAT,
  ENABLED_ATTR,
  TYPES_ATTR,
  BUILTIN_ATTRIBUTES,
  isTruthy,
  resolveEnabledTypes,
  resolveFormat,
  isTextFormat,
  isPositionalOrOptionKey,
  resolveDiagramOptions,
}
