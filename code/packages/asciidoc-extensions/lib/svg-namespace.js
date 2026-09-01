// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// GH-196: rewrites every id an inline `<svg>` diagram carries — and every
// reference to it — to a page-unique prefix, so two SVG-format diagrams on
// the same page (or even the same tool rendering twice) can't collide.
//
// WHY THIS IS NEEDED
//
// Kroki's own SVG output frequently hardcodes ids that are not unique per
// render — verified against a live server: Mermaid's root `<svg>` is always
// `id="container"`, with its own `%%{init}%%`-driven
// `<style>#container{...}</style>` block scoped to that exact id;
// GraphViz starts a fresh `node1`/`edge1`/`graph0` sequence on every single
// render, with no per-render namespace of its own. Two such diagrams
// embedded inline on one page — this extension's whole point, see
// kroki.js's own header — collide: HTML forbids duplicate ids, and a CSS
// id-selector (`#container{...}`) matches EVERY element carrying that id on
// the page, not just the one it was generated alongside, so the first
// diagram's own baked-in style can leak onto the second's identically-id'd
// root.
//
// WHY THIS RUNS AT RENDER TIME, NOT PREWARM TIME
//
// `kroki-prewarm.js` caches one payload per `(type, source, format,
// options)` tuple — the same rendered SVG is reused verbatim wherever that
// exact diagram appears, including twice on the same page or across many
// pages. Rewriting ids once, into the CACHED payload, would only relocate
// the collision: the same fixed prefix would still collide with itself the
// second time that cached diagram is placed. Only a render-time rewrite,
// keyed off something unique to THIS block's specific occurrence on THIS
// page (`lib/unique-id.js`'s own per-document counter — see that file's own
// header for why a plain module-level counter is wrong here too), actually
// solves it — see kroki.js's own call site.
//
// APPROACH: TARGETED STRING SUBSTITUTION, NOT A FULL SVG/CSS PARSER
//
// Every id value Kroki's own tools generate (`container`, `flowchart-A-0`,
// `node1`, `graph0`, …) is specific enough that its exact substring is
// vanishingly unlikely to appear anywhere in the markup EXCEPT as a real id
// declaration or a real reference to one. So this walks the markup once to
// collect every literal `id="..."`/`id='...'` value, then does a single
// global replace of `id="ID"`/`id='ID'` (the declaration) and `#ID` (every
// reference — `url(#ID)` in `fill`/`stroke`/`clip-path`/`mask`/`filter`,
// `href="#ID"`/`xlink:href="#ID"`, and a CSS id-selector `#ID` inside an
// embedded `<style>` block all share this exact shape) with the prefixed
// equivalent. Simpler and far more robust against however a given tool
// happens to structure its markup than trying to write a real SVG+CSS
// grammar for one narrow purpose.

const ID_DECLARATION_RX = /id=["']([^"']+)["']/g

/**
 * Escapes a string for literal use inside a `RegExp` — the collected id
 * values are arbitrary tool output, not something this file controls.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * @param {string} svgMarkup - a raw `<svg>...</svg>` string, exactly as
 *   Kroki returned it (`kroki-instance.js`'s cached payload `data`, for
 *   `format === 'svg'`).
 * @param {string} prefix - unique within the page this markup is about to
 *   be embedded on (see `lib/unique-id.js`).
 * @returns {string} the same markup, every id declaration and reference
 *   rewritten to `${prefix}-${originalId}`. Returned unchanged if the
 *   markup carries no ids at all.
 */
function namespaceSvgIds(svgMarkup, prefix) {
  const ids = new Set()
  let match
  ID_DECLARATION_RX.lastIndex = 0
  while ((match = ID_DECLARATION_RX.exec(svgMarkup))) ids.add(match[1])
  if (!ids.size) return svgMarkup

  // Longest-first: GraphViz's own sequential ids (`node1`, `node10`,
  // `node11`, …) mean a naive replace of the SHORTER id first would also
  // match the first few characters of the longer one — trying the longest
  // alternative first at every position is what stops `#node1` from eating
  // into `#node10`.
  const sortedIds = Array.from(ids).sort((a, b) => b.length - a.length)
  const idAlternation = sortedIds.map(escapeRegExp).join('|')

  const declarationRx = new RegExp('id=(["\'])(' + idAlternation + ')\\1', 'g')
  // Not followed by another id-safe character (a word character or `-`) —
  // same reasoning as the longest-first sort, belt and suspenders: even if
  // two ids somehow shared a length, this stops a partial match at the
  // reference site too.
  const referenceRx = new RegExp('#(' + idAlternation + ')(?![\\w-])', 'g')

  return svgMarkup
    .replace(declarationRx, (_, quote, id) => 'id=' + quote + prefix + '-' + id + quote)
    .replace(referenceRx, (_, id) => '#' + prefix + '-' + id)
}

module.exports = namespaceSvgIds
