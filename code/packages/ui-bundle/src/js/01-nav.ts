;(function () {
  'use strict'

  var STORAGE_KEY = 'pdocs-side-menu'
  var SECT_CLASS_RX = /^sect(\d)$/

  var root = document.documentElement
  var sideMenu = document.getElementById('side-menu')
  var toggle = document.querySelector<HTMLButtonElement>('.side-menu-toggle')
  if (!sideMenu || !toggle) return

  var nav = sideMenu.querySelector<HTMLElement>('.side-menu__nav')
  var closeButton = sideMenu.querySelector<HTMLButtonElement>('.side-menu__close')
  // Only breakpoint l (>=1680) pushes the layout; m/s/xs are all overlay
  // drawers — see side-menu.css's own breakpoint-by-breakpoint comment.
  var pushQuery = window.matchMedia('(min-width: 1680px)')

  // The control does nothing without JavaScript, so it is hidden until wired
  // up rather than shipped as a dead button — see theme-toggle's 08-theme.ts.
  toggle.hidden = false
  labelToggle()
  toggle.addEventListener('click', onToggleClick)
  if (closeButton) closeButton.addEventListener('click', onCloseClick)

  function isCollapsed () {
    // Below l the menu's own CSS default is closed, with no class needed to
    // say so (see side-menu.css) — `.is-active` is the only signal there.
    // At or above it, default is open and `is-side-menu-collapsed` is the
    // override, set either by the pre-paint bootstrap (head-prelude.hbs) or
    // by a previous click here.
    return pushQuery.matches ? root.classList.contains('is-side-menu-collapsed') : !sideMenu.classList.contains('is-active')
  }

  function labelToggle () {
    var collapsed = isCollapsed()
    toggle.setAttribute('aria-expanded', String(!collapsed))
    toggle.setAttribute(
      'aria-label',
      pushQuery.matches ? (collapsed ? 'Show navigation' : 'Hide navigation') : collapsed ? 'Open navigation' : 'Close navigation'
    )
  }

  // One mechanism drives every breakpoint: `is-side-menu-collapsed` on
  // <html> forces the menu shut at l (default there is open); `.is-active`
  // on the menu itself forces it open below l (default there is closed) —
  // see side-menu.css. Toggling both together, unconditionally, is harmless:
  // each class only has an effect at the breakpoint it targets, courtesy of
  // that CSS. Below l only, the toggle additionally locks page scroll and
  // closes on an outside click (the scrim, at m/s, or anywhere at xs).
  function onToggleClick (e: MouseEvent) {
    e.stopPropagation()
    var opening = isCollapsed()
    setOpen(opening)
    if (!pushQuery.matches) {
      if (opening) document.addEventListener('click', onDocumentClick)
      else document.removeEventListener('click', onDocumentClick)
    }
  }

  function onCloseClick (e: MouseEvent) {
    e.stopPropagation()
    setOpen(false)
    document.removeEventListener('click', onDocumentClick)
  }

  function setOpen (open: boolean) {
    root.classList.toggle('is-side-menu-collapsed', !open)
    sideMenu.classList.toggle('is-active', open)
    root.classList.toggle('is-clipped--nav', open && !pushQuery.matches)
    try {
      localStorage.setItem(STORAGE_KEY, open ? 'open' : 'collapsed')
    } catch (err) {
      // private browsing, or storage disabled: the choice simply does not persist
    }
    labelToggle()
  }

  function onDocumentClick (e: MouseEvent) {
    if (sideMenu.contains(e.target as Node)) return
    setOpen(false)
    document.removeEventListener('click', onDocumentClick)
  }

  if (!nav) return

  // Every branch server-renders expanded (aria-expanded="true"), so
  // JavaScript-disabled degrades to fully expanded per the issue's
  // acceptance criteria. With JavaScript, collapse whatever is not on the
  // current page's path.
  find(nav, '.side-menu__toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      btn.setAttribute('aria-expanded', String(btn.getAttribute('aria-expanded') !== 'true'))
    })
  })

  // Current page is real state (aria-current), not a class — see
  // nav-tree.hbs / side-menu.css.
  var currentItem = nav.querySelector<HTMLElement>('.ids-list-item[aria-current="page"]')
  var originalItem = currentItem
  if (currentItem) {
    activateCurrentPath(currentItem)
    scrollItemToMidpoint(nav, currentItem)
  } else {
    // No entry in this tree is the current page, so there is no path to
    // reveal and everything server-rendered open should shut. Two ways to get
    // here: a page that simply isn't in the navigation, and the landing (GH-18),
    // which borrows another module's tree with `:page-nav-module:` and can
    // never match it. Leaving it as rendered means the landing opens with
    // every branch of somebody else's module expanded.
    collapseOtherBranches(null)
  }

  function activateCurrentPath (item: Element) {
    var li = item.closest('li')
    while (li) {
      var toggleBtn = li.querySelector<HTMLElement>(':scope > .side-menu__row > .side-menu__toggle')
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true')
      var parentLi = li.parentElement
      li = parentLi ? parentLi.closest('li') : null
    }
    collapseOtherBranches(item)
  }

  // `item` null means "keep nothing open", which is what a tree with no
  // current page wants.
  function collapseOtherBranches (item: Element | null) {
    var keep: Element[] = []
    var li = item ? item.closest('li') : null
    while (li) {
      keep.push(li)
      var parentLi = li.parentElement
      li = parentLi ? parentLi.closest('li') : null
    }
    find(nav, '.side-menu__toggle').forEach(function (btn) {
      var owner = btn.closest('li')
      if (owner && keep.indexOf(owner) === -1) btn.setAttribute('aria-expanded', 'false')
    })
  }

  function onHashChange () {
    var navLink: HTMLElement | null = null
    var hash = window.location.hash
    if (hash) {
      if (hash.indexOf('%')) hash = decodeURIComponent(hash)
      navLink = nav.querySelector<HTMLElement>('.ids-list-item[href="' + hash + '"]')
      if (!navLink) {
        var targetNode = document.getElementById(hash.slice(1))
        if (targetNode) {
          var current: Element = targetNode
          var ceiling = document.querySelector('article.doc')
          while ((current = current.parentElement) && current !== ceiling) {
            var id = current.id
            // NOTE: look for section heading
            if (!id && SECT_CLASS_RX.test(current.className)) id = current.firstElementChild?.id
            if (id && (navLink = nav.querySelector<HTMLElement>('.ids-list-item[href="#' + id + '"]'))) break
          }
        }
      }
    }
    var navItem: HTMLElement | null
    if (navLink) {
      navItem = navLink
    } else if (originalItem) {
      navItem = originalItem
    } else {
      return
    }
    if (navItem === currentItem) return
    if (currentItem) currentItem.removeAttribute('aria-current')
    navItem.setAttribute('aria-current', 'page')
    currentItem = navItem
    activateCurrentPath(navItem)
    scrollItemToMidpoint(nav, navItem)
  }

  if (nav.querySelector('.ids-list-item[href^="#"]')) {
    if (window.location.hash) onHashChange()
    window.addEventListener('hashchange', onHashChange)
  }

  function scrollItemToMidpoint (panel: HTMLElement, el: HTMLElement) {
    var rect = panel.getBoundingClientRect()
    var effectiveHeight = rect.height
    panel.scrollTop = Math.max(0, (el.getBoundingClientRect().height - effectiveHeight) * 0.5 + el.offsetTop)
  }

  function find (from: ParentNode, selector: string) {
    return [].slice.call(from.querySelectorAll(selector)) as HTMLElement[]
  }
})()
