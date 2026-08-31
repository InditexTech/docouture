// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: MPL-2.0

;(function () {
  'use strict'

  // GH-103: page-versions.hbs is rendered twice on a real page — once in the
  // header (header-content.hbs) and once in the side-menu drawer (nav.hbs) —
  // with CSS, not markup, deciding which one is visible at a given
  // breakpoint (header.css / side-menu.css). A single `querySelector` here
  // wired only the first (the header's), so the drawer's own toggle — the
  // one actually shown at xs/s — never opened: clicking it did nothing.
  // `querySelectorAll` wires both; each toggles its own ancestor
  // `.page-versions`, not a shared one.
  var toggles = document.querySelectorAll('.page-versions .version-menu-toggle')
  if (!toggles.length) return

  toggles.forEach(function (toggle) {
    var selector = toggle.closest('.page-versions')
    if (!selector) return
    toggle.addEventListener('click', function (e) {
      var isActive = selector.classList.toggle('is-active')
      // GH-103: mirrors `.side-menu__toggle`'s own convention (side-menu.css)
      // — the chevron's rotation is driven off `aria-expanded`, not
      // `.is-active` directly, so the same state that tells assistive tech
      // the menu is open also drives its own animation.
      toggle.setAttribute('aria-expanded', String(isActive))
      e.stopPropagation() // trap event
    })
  })

  document.documentElement.addEventListener('click', function () {
    document.querySelectorAll('.page-versions.is-active').forEach(function (selector) {
      selector.classList.remove('is-active')
      var toggle = selector.querySelector('.version-menu-toggle')
      if (toggle) toggle.setAttribute('aria-expanded', 'false')
    })
  })
})()
