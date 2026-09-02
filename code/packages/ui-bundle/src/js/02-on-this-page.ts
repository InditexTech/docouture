// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: MPL-2.0

;(function () {
  'use strict'

  var STORAGE_KEY = 'docouture-toc'

  var root = document.documentElement
  var sidebar = document.getElementById('on-this-page')
  if (!sidebar) return
  if (document.querySelector('body.-toc')) return sidebar.parentNode.removeChild(sidebar)
  var levels = Number.parseInt(sidebar.dataset.levels || '4', 10)
  if (levels < 0) return

  var articleSelector = 'article.doc'
  var article = document.querySelector<HTMLElement>(articleSelector)
  if (!article) return
  var headingsSelector = []
  for (var level = 0; level <= levels; level++) {
    var headingSelector = [articleSelector]
    if (level) {
      for (var l = 1; l <= level; l++) headingSelector.push((l === 2 ? '.sectionbody>' : '') + '.sect' + l)
      headingSelector.push('h' + (level + 1) + '[id]' + (level > 1 ? ':not(.discrete)' : ''))
    } else {
      headingSelector.push('h1[id].sect0')
    }
    headingsSelector.push(headingSelector.join('>'))
  }
  var headings = find(headingsSelector.join(','), article.parentNode)
  if (!headings.length) return sidebar.parentNode.removeChild(sidebar)

  var lastActiveFragment
  var links = {}
  var list = headings.reduce(function (accum, heading) {
    var link = document.createElement('a')
    link.textContent = heading.textContent
    // NOT `links[link.href] = link` — reading `.href` back goes through the
    // anchor's own getter, which always resolves to an ABSOLUTE URL, not the
    // bare fragment `onScroll()` below looks entries up by. The fragment has
    // to be captured in a local and reused as both the assigned href and the
    // lookup key.
    var fragment = '#' + heading.id
    link.href = fragment
    links[fragment] = link
    var listItem = document.createElement('li')
    listItem.dataset.level = String(Number.parseInt(heading.nodeName.slice(1), 10) - 1)
    listItem.appendChild(link)
    accum.appendChild(listItem)
    return accum
  }, document.createElement('ul'))

  var menu = sidebar.querySelector('.toc-menu')
  if (!menu) {
    menu = document.createElement('div')
    menu.className = 'toc-menu'
  }

  var title = document.createElement('h3')
  title.textContent = sidebar.dataset.title || 'On this page'
  menu.appendChild(title)
  menu.appendChild(list)

  // GH-10: only now — headings found, page not opted out — reveal the
  // panel and narrow the article to make room for it. `html.has-toc` is
  // what toc.css/doc.css gate their grid split behind, rather than a
  // static `.dt-grid-layout__item--span-*` utility class on either
  // element: a page with JavaScript disabled never reaches this line, so
  // it stays full width per this issue's own acceptance criterion, with
  // nothing to reflow later.
  root.classList.add('has-toc')

  // Toggle button in the hero's own reserved slot (GH-9's own header
  // comment). `hidden` until now — see theme-toggle.hbs / 08-theme.ts and
  // the side-menu toggle for the same reasoning: a control with no ToC to
  // open must not render. Hidden again outright below breakpoint m by
  // hero.css — the ToC sits above the article there instead of beside it,
  // with nothing to toggle.
  var toggle = document.querySelector<HTMLButtonElement>('.toc-toggle')
  if (toggle) {
    toggle.hidden = false
    var stored
    try {
      stored = localStorage.getItem(STORAGE_KEY)
    } catch (e) {
      // private browsing, or storage disabled: the choice simply does not persist
    }
    setOpen(stored !== 'closed')
    toggle.addEventListener('click', function () {
      setOpen(root.classList.contains('is-toc-closed'))
    })
  }

  function setOpen (open: boolean) {
    root.classList.toggle('is-toc-closed', !open)
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(open))
      toggle.setAttribute('aria-label', (open ? 'Hide' : 'Show') + ' on this page')
      try {
        localStorage.setItem(STORAGE_KEY, open ? 'open' : 'closed')
      } catch (e) {
        // private browsing, or storage disabled: the choice simply does not persist
      }
    }
    // The active-link scroll math below reads offsetTop/offsetHeight off
    // `list`, both 0 while the panel is `display: none` — recompute the
    // instant it becomes visible rather than waiting for the next scroll.
    onScroll()
  }

  window.addEventListener('load', function () {
    onScroll()
    window.addEventListener('scroll', onScroll)
  })

  function onScroll () {
    var scrolledBy = window.pageYOffset
    var buffer = getNumericStyleVal(document.documentElement, 'fontSize') * 1.15
    var ceil = article.offsetTop
    if (scrolledBy && window.innerHeight + scrolledBy + 2 >= document.documentElement.scrollHeight) {
      lastActiveFragment = Array.isArray(lastActiveFragment) ? lastActiveFragment : Array(lastActiveFragment || 0)
      var activeFragments = []
      var lastIdx = headings.length - 1
      headings.forEach(function (heading, idx) {
        var fragment = '#' + heading.id
        if (idx === lastIdx || heading.getBoundingClientRect().top + getNumericStyleVal(heading, 'paddingTop') > ceil) {
          activeFragments.push(fragment)
          if (lastActiveFragment.indexOf(fragment) < 0) links[fragment].classList.add('is-active')
        } else if (~lastActiveFragment.indexOf(fragment)) {
          links[lastActiveFragment.shift()].classList.remove('is-active')
        }
      })
      list.scrollTop = list.scrollHeight - list.offsetHeight
      lastActiveFragment = activeFragments.length > 1 ? activeFragments : activeFragments[0]
      return
    }
    if (Array.isArray(lastActiveFragment)) {
      lastActiveFragment.forEach(function (fragment) {
        links[fragment].classList.remove('is-active')
      })
      lastActiveFragment = undefined
    }
    var activeFragment
    headings.some(function (heading) {
      if (heading.getBoundingClientRect().top + getNumericStyleVal(heading, 'paddingTop') - buffer > ceil) return true
      activeFragment = '#' + heading.id
    })
    if (activeFragment) {
      if (activeFragment === lastActiveFragment) return
      if (lastActiveFragment) links[lastActiveFragment].classList.remove('is-active')
      var activeLink = links[activeFragment]
      activeLink.classList.add('is-active')
      if (list.scrollHeight > list.offsetHeight) {
        list.scrollTop = Math.max(0, activeLink.offsetTop + activeLink.offsetHeight - list.offsetHeight)
      }
      lastActiveFragment = activeFragment
    } else if (lastActiveFragment) {
      links[lastActiveFragment].classList.remove('is-active')
      lastActiveFragment = undefined
    }
  }

  function find (selector, from) {
    return [].slice.call((from || document).querySelectorAll(selector))
  }

  function getNumericStyleVal (el, prop) {
    return Number.parseFloat(window.getComputedStyle(el)[prop])
  }
})()

// Empty export makes this a real ES module for TypeScript's purposes (it
// otherwise has no top-level import/export, so tsc treats a `02-on-this-page.spec.ts`
// dynamically importing it as TS2306 "not a module") — a genuine no-op at
// runtime, esbuild strips it, the IIFE above still runs for its side effects
// exactly the same.
export {}
