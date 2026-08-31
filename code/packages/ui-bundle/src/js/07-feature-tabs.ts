// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

/*
 * Key features switcher (GH-22) — the behaviour half of the `[feature-tabs]`
 * block (asciidoc-extensions/lib/feature-tabs.js).
 *
 * The block arrives here as a complete, readable section: every panel visible
 * under its own heading, and a list of in-page anchors pointing at them. That
 * is what a reader without JavaScript gets, and it is why this file creates no
 * markup at all — it upgrades what is already there into an APG tab widget and
 * lets `is-enhanced` tell the stylesheet the widget now exists.
 *
 * Which is also why every ARIA role below is set HERE rather than emitted by
 * the extension: `role=tab` and `aria-selected` describe a control that does
 * not exist until this runs. Announcing four selected tabs that do nothing
 * would be worse than the plain anchors the reader would otherwise get.
 *
 * Vertical orientation, so the arrow keys are Up and Down (the APG tabs
 * pattern's own mapping for `aria-orientation=vertical`), and selection
 * follows focus — every panel is already in the DOM, so activating one costs
 * nothing and a reader arrowing through the list sees each slide as they pass
 * it.
 */
;(function () {
  'use strict'

  var blocks = [].slice.call(document.querySelectorAll<HTMLElement>('[data-feature-tabs]'))
  if (!blocks.length) return

  blocks.forEach(function (block: HTMLElement) {
    var list = block.querySelector<HTMLElement>('.docouture-feature-tabs__list')
    var tabs = [].slice.call(
      block.querySelectorAll<HTMLAnchorElement>('.docouture-feature-tabs__tab')
    ) as HTMLAnchorElement[]
    var panels = [].slice.call(
      block.querySelectorAll<HTMLElement>('.docouture-feature-tabs__panel')
    ) as HTMLElement[]
    // One tab per panel or the pairing below is guesswork — leave the block in
    // its server-rendered state, which is readable on its own, rather than
    // half-upgrade it.
    if (!list || !tabs.length || tabs.length !== panels.length) return

    list.setAttribute('role', 'tablist')
    list.setAttribute('aria-orientation', 'vertical')
    // The `<li>`s carry the list semantics a tablist must not have.
    ;[].slice.call(list.children).forEach(function (item: HTMLElement) {
      item.setAttribute('role', 'presentation')
    })

    tabs.forEach(function (tab, index) {
      var panel = panels[index]
      tab.setAttribute('role', 'tab')
      tab.setAttribute('aria-controls', panel.id)
      panel.setAttribute('role', 'tabpanel')
      // Named by its tab, per the pattern. Server-side it is named by its own
      // heading instead — the only name available before a tablist exists.
      if (tab.id) panel.setAttribute('aria-labelledby', tab.id)
      // A tabpanel is a scroll container the reader may need to reach with the
      // keyboard, and its content is not always focusable.
      panel.setAttribute('tabindex', '0')

      tab.addEventListener('click', function (e) {
        // The href is a real in-page anchor and stays one: without script it is
        // how a reader reaches the panel. With script it would jump the page to
        // a panel that is already on screen, so the jump — and only the jump —
        // is suppressed.
        e.preventDefault()
        select(index)
      })

      tab.addEventListener('keydown', function (e) {
        var next = keyTarget(e.key, index, tabs.length)
        if (next === null) return
        e.preventDefault()
        select(next)
        tabs[next].focus()
      })
    })

    // A deep link to one panel selects it rather than being lost: with script
    // off that fragment scrolls to the panel, and it should not mean something
    // different once this file runs.
    var fromHash = panels.findIndex(function (panel) {
      return '#' + panel.id === window.location.hash
    })
    select(fromHash === -1 ? selectedIndex(tabs) : fromHash)

    block.classList.add('is-enhanced')

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
    if (key === 'ArrowDown' || key === 'ArrowRight') return (index + 1) % count
    if (key === 'ArrowUp' || key === 'ArrowLeft') return (index - 1 + count) % count
    if (key === 'Home') return 0
    if (key === 'End') return count - 1
    return null
  }

  /** The tab the server marked selected, defaulting to the first. */
  function selectedIndex (tabs: HTMLAnchorElement[]): number {
    var index = tabs.findIndex(function (tab) {
      return tab.classList.contains('dt-tabs-item--selected')
    })
    return index === -1 ? 0 : index
  }
})()
