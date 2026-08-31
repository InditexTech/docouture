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
]

// Kroki's own `/{type}/{format}` API rejects a format it doesn't support for
// that type with a plain 400 rather than degrading — verified against a
// live server, one `SUPPORTED_TYPES` entry at a time (posting a
// deliberately-invalid body to every type's own `/png` endpoint: a syntax
// error means the format itself was accepted, "Unsupported output format"
// means it wasn't). Five entries are SVG-only in Kroki's own catalogue:
// `excalidraw`, `nomnoml`, `svgbob`, `wavedrom`, and — despite drawing
// ordinary rectangles and circles that look no different from any other
// diagram-as-code output — `bpmn`. The other nine, listed here, all render
// PNG (and Kroki formats beyond that this package doesn't expose a way to
// request) the same way they render SVG. `format=png` on an unlisted type
// falls back to `svg` with a warning — see `resolveFormat` — the same
// degrade-not-fail posture as an unknown `kroki-diagram-types` entry.
const PNG_SUPPORTED_TYPES = new Set([
  'mermaid',
  'plantuml',
  'graphviz',
  'c4plantuml',
  'blockdiag',
  'ditaa',
  'erd',
  'vega',
  'vegalite',
])

const DEFAULT_FORMAT = 'svg'

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
 * @param {string} type - a `SUPPORTED_TYPES` entry.
 * @param {unknown} requestedFormat - the block's own `format` attribute,
 *   however Asciidoctor or the raw-text regex handed it over — anything at
 *   all, not just `"svg"`/`"png"`, since this is the one place both sides
 *   actually validate it (kroki-prewarm.js's own regex deliberately doesn't
 *   restrict the value it captures, for exactly this reason).
 * @param {(type: string, requestedFormat: string) => void} [onUnsupported] -
 *   called once for any `requestedFormat` that isn't `svg`/absent and isn't
 *   a `png` this type's Kroki companion actually supports — an unrecognized
 *   value (a typo, `format=jpeg`) and a recognized-but-unsupported one
 *   (`format=png` on `bpmn`) both go through this the same way, so the
 *   caller can warn with its own node context either way.
 * @returns {'svg' | 'png'}
 */
function resolveFormat(type, requestedFormat, onUnsupported) {
  if (requestedFormat == null || requestedFormat === '' || requestedFormat === DEFAULT_FORMAT) return DEFAULT_FORMAT
  if (requestedFormat === 'png' && PNG_SUPPORTED_TYPES.has(type)) return 'png'
  if (onUnsupported) onUnsupported(type, String(requestedFormat))
  return DEFAULT_FORMAT
}

module.exports = {
  KROKI_URL,
  SUPPORTED_TYPES,
  PNG_SUPPORTED_TYPES,
  DEFAULT_FORMAT,
  ENABLED_ATTR,
  TYPES_ATTR,
  isTruthy,
  resolveEnabledTypes,
  resolveFormat,
}
