// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

/*
 * Content tabs (GH-45) — the behaviour half of the `[tabs]` block
 * (asciidoc-extensions/lib/tabs.js).
 *
 * Unlike 07-feature-tabs.ts, the server-rendered markup here is ALREADY a
 * real tab widget — `role=tab`/`tabpanel`, `aria-selected`, `aria-controls`
 * are all emitted by the extension itself, because exactly one panel is
 * ever visible (tabs.css hides every panel but `.is-selected`
 * unconditionally, not just once a script has run). There is no "plain
 * document" state to layer this on top of; this file only wires up
 * SWITCHING which tab is selected.
 *
 * EVERY BLOCK IS INDEPENDENT. On purpose, and worth stating plainly because
 * an earlier revision of this file got it wrong: picking a tab in one
 * `[tabs]` block must never affect another one elsewhere on the page. There
 * is no cross-block grouping, nothing written to `localStorage` — each
 * block only ever touches its own tabs and its own panels.
 *
 * NO ANCHORS, ANYWHERE. The tab strip is `<button>`, never `<a href="#…">`.
 * An earlier revision used real anchors (for a no-JS jump-to-panel
 * fallback that no longer exists now that only one panel ever renders) and
 * it broke in a way worth remembering: `03-fragment-jumper.ts` scans EVERY
 * `a[href^="#"]` on the page at load and attaches its OWN click handler
 * that calls `window.location.hash = …` directly — a plain assignment, not
 * the browser's default navigation, so it runs regardless of any
 * `preventDefault()` a DIFFERENT listener (this file's own) calls on the
 * same click. The visible symptom was exactly what it sounds like: clicking
 * a tab jumped/scrolled the page and rewrote the URL even though this file
 * tried to suppress it. A `<button>` is invisible to that scanner — it only
 * ever looks at anchors — so the class of bug cannot recur here.
 */
;(function () {
  'use strict'

  var blockEls = Array.prototype.slice.call(document.querySelectorAll<HTMLElement>('[data-tabs]'))
  if (!blockEls.length) return

  blockEls.forEach(function (block: HTMLElement) {
    var tabs = Array.prototype.slice.call(block.querySelectorAll<HTMLButtonElement>('.docouture-tabs__tab')) as HTMLButtonElement[]
    var panels = Array.prototype.slice.call(block.querySelectorAll<HTMLElement>('.docouture-tabs__panel')) as HTMLElement[]
    // One tab per panel or the pairing below is guesswork — leave the
    // block in its server-rendered state (first tab selected) rather than
    // half-upgrade it.
    if (!tabs.length || tabs.length !== panels.length) return

    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () {
        select(index)
        tab.focus()
      })

      tab.addEventListener('keydown', function (e) {
        var next = keyTarget(e.key, index, tabs.length)
        if (next === null) return
        e.preventDefault()
        select(next)
        tabs[next].focus()
      })
    })

    function select (index: number) {
      tabs.forEach(function (tab, i) {
        var selected = i === index
        tab.classList.toggle('dt-tabs-item--selected', selected)
        tab.setAttribute('aria-selected', String(selected))
        // Roving tabindex: one stop for the whole tablist, arrow keys inside it.
        tab.tabIndex = selected ? 0 : -1
        panels[i].classList.toggle('is-selected', selected)
      })
    }
  })

  /** The tab the pressed key moves to, or `null` for a key this widget ignores. */
  function keyTarget (key: string, index: number, count: number): number | null {
    if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % count
    if (key === 'ArrowLeft' || key === 'ArrowUp') return (index - 1 + count) % count
    if (key === 'Home') return 0
    if (key === 'End') return count - 1
    return null
  }
})()
