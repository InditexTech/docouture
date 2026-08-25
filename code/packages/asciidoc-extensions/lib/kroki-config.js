'use strict'

// Shared between the two halves of GH-44's Kroki support — see
// kroki.js's own header for why there are two halves at all.
//
// THE URL IS NOT SITE-CONFIGURABLE, ON PURPOSE. Every other piece of Kroki
// config here (whether it runs at all, which diagram types) is an authored
// `asciidoc.attributes` key a site can set — but the endpoint itself is a
// single fixed value, `http://localhost:8500`, the one
// @inditextech/pdocs-antora-extensions' `kroki-prewarm.js`/`kroki-docker.js`
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
// `kroki-prewarm.js` and `@inditextech/pdocs-antora-extensions`'
// `resources/kroki-compose.yml`). Kroki supports more; add to this list —
// and to that compose file's companions, for any type that needs one,
// mermaid and excalidraw being the two in Kroki's own catalogue that do —
// before authors can rely on a new one. A site can customize that compose
// file for itself via `pdocs eject kroki` without forking this package.
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

module.exports = {
  KROKI_URL,
  SUPPORTED_TYPES,
  ENABLED_ATTR,
  TYPES_ATTR,
  isTruthy,
  resolveEnabledTypes,
}
