// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

/*
 * Click-to-zoom overlay (GH-197) for `[role=zoom-in]` images and Kroki
 * diagrams — image-zoom-dialog.hbs's static shell, image-zoom.css's
 * affordance (cursor/hover for a mouse, a persistent badge for touch).
 *
 * ONE shared dialog, MANY triggers — a structural difference from
 * 12-search.ts, which wires exactly two known trigger elements to one
 * dialog. Here, every `.imageblock.zoom-in`/`.docouture-diagram.zoom-in`
 * on the page is a trigger, discovered once at load via
 * `querySelectorAll` — docs pages render their content once, server-side,
 * so no MutationObserver/re-scan is needed for content that could appear
 * later.
 *
 * `showModal()` gives the top layer, the focus trap, Esc-to-close and the
 * `::backdrop` from the platform, same as the search dialog — this file
 * only ever calls `showModal()`/`close()` and hand-wires backdrop
 * click-to-close (the platform doesn't give that one for free either,
 * same as 12-search.ts's own `overlayContent` listener).
 *
 * NO body-scroll lock, UNLIKE 12-search.ts: that one is needed there
 * because the search panel is NOT full-viewport at m+ (search-dialog.css's
 * own header), so the page behind stays visible and scrollable unless
 * locked. This dialog is `.dt-modal--fullscreen` unconditionally, at every
 * breakpoint (image-zoom-dialog.hbs) — there is nothing behind it to see
 * move, the exact "harmless at xs/s" case search-dialog.css's own scroll-
 * lock comment already describes, just true here at every width instead
 * of only the narrow ones.
 *
 * The trigger elements (`.content`/`.docouture-diagram__content`) are
 * plain `<div>`s, not `<button>`/`<a>` — an image/diagram block's own
 * markup is Asciidoctor's (or kroki.js's) to generate, not this bundle's,
 * so making them keyboard-operable is this file's job: `role="button"` +
 * `tabindex="0"` + an Enter/Space keydown handler, the same "custom
 * button" shape 13-search-recents.ts's own remove buttons would need if
 * THEY weren't real `<button>`s (see that file's own header) — here they
 * genuinely can't be, since nesting a `<button>` inside `.content` would
 * also swallow clicks on the image itself in some browsers.
 */
;(function () {
  'use strict'

  var dialog = document.getElementById('image-zoom-dialog') as HTMLDialogElement | null
  var triggers = [].slice.call(
    document.querySelectorAll<HTMLElement>('.imageblock.zoom-in .content, .docouture-diagram.zoom-in .docouture-diagram__content')
  ) as HTMLElement[]
  if (!dialog || !triggers.length) return

  var closeButton = dialog.querySelector<HTMLButtonElement>('.image-zoom-dialog__close')
  var content = dialog.querySelector<HTMLElement>('.image-zoom-dialog__content')
  // The backdrop — a real element, not `dialog` itself, is what a click
  // outside the panel actually lands on (see image-zoom-dialog.hbs's own
  // header, mirroring search-dialog.hbs's stacking-order argument).
  var overlayContent = dialog.querySelector<HTMLElement>('.dt-overlay__content')
  if (!closeButton || !content || !overlayContent) return

  // Whichever trigger opened the dialog gets focus back on close — same
  // pattern 12-search.ts uses for its own two triggers, generalised here to
  // however many images/diagrams the page actually has.
  var openedFrom: HTMLElement | null = null

  triggers.forEach(function (trigger) {
    trigger.setAttribute('role', 'button')
    trigger.setAttribute('tabindex', '0')
    trigger.setAttribute('aria-haspopup', 'dialog')
    trigger.addEventListener('click', function () {
      open(trigger)
    })
    trigger.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      open(trigger)
    })
  })

  closeButton.addEventListener('click', function () {
    dialog!.close()
  })
  overlayContent.addEventListener('click', function () {
    dialog!.close()
  })
  dialog.addEventListener('close', function () {
    // Emptied on close, not just left stale for the next open to overwrite —
    // a lingering clone would otherwise flash for a frame the next time
    // ANY trigger opens the dialog, before `open()` below replaces it.
    content!.innerHTML = ''
    if (openedFrom) openedFrom.focus()
  })

  function open (trigger: HTMLElement) {
    // What kroki.js/Asciidoctor's own converter actually frames — an
    // `<img>`/inline `<svg>`/`<embed>` (kroki's own `pdf` case) — cloned
    // into the dialog rather than re-fetched or re-rendered, so the
    // overlay shows the exact same element, just bigger.
    //
    // A cloned inline SVG duplicates whatever ids `svg-namespace.js`
    // already made unique on the ORIGINAL — both copies exist in the DOM
    // at once while the dialog is open, which is invalid HTML in the
    // strictest sense. Left as-is deliberately for v1 (the issue's own
    // "static view only" scope): any `url(#id)`/`href="#id"` reference
    // inside the SVG resolves to the first matching id in document order
    // either way, which is the SAME element's own fill/gradient/symbol
    // reference in both copies — a real collision would need two
    // DIFFERENT ids to disagree on, which svg-namespace.js's own
    // per-occurrence prefixing already rules out.
    var media = trigger.querySelector('img, svg, embed')
    if (!media) return
    openedFrom = trigger
    content!.innerHTML = ''
    content!.appendChild(media.cloneNode(true))
    dialog!.showModal()
  }
})()
