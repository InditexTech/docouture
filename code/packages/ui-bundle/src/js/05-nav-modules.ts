// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

/*
 * Module switcher (nav-switcher.hbs) — opens and closes the popover that
 * moves between one module's navigation and another's.
 *
 * Deliberately more than the two-line class toggle 04-page-versions.ts uses
 * for the version menu: this control is a `aria-haspopup` button rather than
 * a tag, so the open state lives on `aria-expanded` and the panel's own
 * `hidden` attribute — the panel stays genuinely hidden from assistive
 * technology when closed, and stays that way with JavaScript off, since
 * nothing here ever runs to reveal it. Escape closes and returns focus to
 * the trigger, which a popover owes a keyboard user and which the version
 * menu never had to provide.
 */
;(function () {
  'use strict'

  var switcher = document.querySelector<HTMLElement>('.nav-switcher')
  if (!switcher) return

  var toggle = switcher.querySelector<HTMLButtonElement>('.nav-switcher__toggle')
  var menu = switcher.querySelector<HTMLElement>('.nav-switcher__menu')
  if (!toggle || !menu) return

  toggle.addEventListener('click', function (e) {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true')
    // Trapped, so the document listener below doesn't immediately undo it.
    e.stopPropagation()
  })

  // A click inside the panel is either a link (the page is about to change
  // anyway) or dead space; neither should be read as "clicked away".
  menu.addEventListener('click', function (e) {
    e.stopPropagation()
  })

  document.documentElement.addEventListener('click', function () {
    setOpen(false)
  })

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || toggle.getAttribute('aria-expanded') !== 'true') return
    setOpen(false)
    toggle.focus()
  })

  function setOpen (open: boolean) {
    toggle.setAttribute('aria-expanded', String(open))
    menu.hidden = !open
    switcher.classList.toggle('is-active', open)
  }
})()
