// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: MPL-2.0

;(function () {
  'use strict'

  var article = document.querySelector('article.doc')
  if (!article) return
  // GH-9 renamed the fixed header from `.toolbar` to `.header-toolbar`
  // (breadcrumbs moved into the hero); this stayed stale, so `toolbar` was
  // `null` and every jump below threw before it could run, silently
  // falling through to the browser's own unoffset anchor jump — which is
  // exactly what lands a heading behind the fixed header.
  var toolbar = document.querySelector('.header-toolbar')
  var supportsScrollToOptions = 'scrollTo' in document.documentElement

  // Extra breathing room below the header (vars.css, base.css) — without
  // it a jump lands a heading flush against the header's own bottom edge.
  // Read off `scroll-padding-top`, a real longhand property, rather than
  // `--anchor-scroll-margin` itself: `getComputedStyle` resolves the
  // former to a pixel value but returns the latter as its raw, unresolved
  // `calc(...)` string.
  var scrollMargin = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0

  function decodeFragment (hash) {
    return hash && (~hash.indexOf('%') ? decodeURIComponent(hash) : hash).slice(1)
  }

  function computePosition (el, sum) {
    return article.contains(el) ? computePosition(el.offsetParent, el.offsetTop + sum) : sum
  }

  function jumpToAnchor (e) {
    if (e) {
      if (e.altKey || e.ctrlKey) return
      window.location.hash = '#' + this.id
      e.preventDefault()
    }
    var y = computePosition(this, 0) - (toolbar ? toolbar.getBoundingClientRect().bottom : 0) - scrollMargin
    var instant = e === false && supportsScrollToOptions
    instant ? window.scrollTo({ left: 0, top: y, behavior: 'instant' }) : window.scrollTo(0, y)
  }

  window.addEventListener('load', function jumpOnLoad (e) {
    var fragment, target
    fragment = decodeFragment(window.location.hash)
    if (fragment && (target = document.getElementById(fragment))) {
      jumpToAnchor.call(target, false)
      setTimeout(jumpToAnchor.bind(target, false), 250)
    }
    window.removeEventListener('load', jumpOnLoad)
  })

  Array.prototype.slice.call(document.querySelectorAll('a[href^="#"]')).forEach(function (el) {
    var fragment, target
    fragment = decodeFragment(el.hash)
    if (fragment && (target = document.getElementById(fragment))) {
      el.addEventListener('click', jumpToAnchor.bind(target))
    }
  })
})()

// Empty export makes this a real ES module for TypeScript's purposes (it
// otherwise has no top-level import/export, so tsc treats a `03-fragment-jumper.spec.ts`
// dynamically importing it as TS2306 "not a module") — a genuine no-op at
// runtime, esbuild strips it, the IIFE above still runs for its side effects
// exactly the same.
export {}
