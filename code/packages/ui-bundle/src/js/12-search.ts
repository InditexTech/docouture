// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

/*
 * Search dialog (GH-67/GH-68/GH-69, S3/S4/S5 of the search epic, #64) — the
 * behaviour half of the static shell GH-66 (S2) shipped: header-content.hbs's
 * trigger, search-dialog.hbs's floating trigger (GH-68, xs only), its module
 * filter chips and `<dialog>` (GH-69 adds the chips; the rest predate it),
 * all already carrying every class this file needs.
 *
 * Two triggers, one dialog: the header button (hidden at xs) and the
 * floating button (shown only at xs, search-dialog.css) are never both
 * visible at once, but both exist in the DOM on every page that has either,
 * so this file binds the same open/preload handlers to whichever of the two
 * is present rather than assuming a single element.
 *
 * Absent trigger/dialog means this component version has no search index at
 * all (search-dialog.hbs and both triggers are all guarded by
 * `page.componentVersion.searchIndex` server-side — see antora-extensions/
 * lib/search-index.js, which only sets that attribute when a component
 * version produced at least one record) — nothing to wire up, so this file
 * is a no-op on those pages, the same "leave it in its plain, already-
 * working state" rule every other numbered script in this bundle follows.
 *
 * The engine (`js/vendor/search.js`, built from vendor/search.bundle.ts) is
 * NOT requested here on page load — only from `preload()`, itself only
 * reachable from a real signal of intent (hover/focus on either trigger, or
 * the first hotkey press), the same "on first intent, not async on every
 * page" split `highlight.bundle.ts` doesn't need to make because syntax
 * highlighting is needed immediately, and search isn't.
 *
 * `showModal()` gives the top layer, the focus trap, Esc-to-close and the
 * `::backdrop` from the platform — this file only ever calls `showModal()`/
 * `close()` and handles what the platform doesn't: focus restore to
 * whichever trigger opened the dialog, locking background scroll (the
 * dialog is NOT full-viewport at m+ — GH-69), and everything else that
 * happens between those two calls.
 *
 * GH-69 (S5) adds three things to what was already here:
 *
 *   - Module filter chips (search-dialog.hbs): clicking one sets
 *     `activeCategory` and re-runs the current query, post-filtering hits by
 *     `hit.category` and asking the engine for a wider pool first (see
 *     FILTER_FETCH_LIMIT) so filtering doesn't starve the visible count.
 *   - Recent searches (13-search-recents.ts, a separate file — see its own
 *     header): `renderIdle` defers to it whenever the query is empty, and
 *     folds whatever rows it returns into this file's own `rows` array so
 *     arrow-key roving treats them exactly like search result rows.
 *   - The ARIA 1.2 combobox pattern: `field` is the combobox, `resultsEl`
 *     the listbox it owns via `aria-controls`, and the active row is
 *     reported through `aria-activedescendant` — never by moving DOM focus
 *     off the field, so typing and arrowing keep working together. A
 *     `aria-live="polite"` region announces the result count on change.
 */
;(function () {
  'use strict'

  var triggers = Array.prototype.slice.call(
    document.querySelectorAll<HTMLButtonElement>('.header-toolbar__search-trigger, .search-fab__trigger')
  ) as HTMLButtonElement[]
  var dialog = document.getElementById('search-dialog') as HTMLDialogElement | null
  if (!triggers.length || !dialog) return

  var field = dialog.querySelector<HTMLInputElement>('.dt-search-field-minimal__input')
  var closeButton = dialog.querySelector<HTMLButtonElement>('.search-dialog__close')
  var resultsEl = dialog.querySelector<HTMLElement>('.search-dialog__results')
  var statusEl = dialog.querySelector<HTMLElement>('.search-dialog__status')
  var chips = Array.prototype.slice.call(dialog.querySelectorAll<HTMLButtonElement>('.search-dialog__chip')) as HTMLButtonElement[]
  var chipsRow = dialog.querySelector<HTMLElement>('.search-dialog__chips')
  var shortcutChip = triggers[0].querySelector<HTMLElement>('.header-toolbar__search-shortcut')
  // The panel — `.dt-modal`/`.dt-modal--small`, nested inside `.dt-overlay`
  // as the sibling of `.dt-overlay__content` (search-dialog.hbs's own header
  // explains why that nesting matters). `.dt-modal--fullscreen` toggles here,
  // not on `dialog` itself, which no longer carries any `.dt-modal*` class.
  var panel = dialog.querySelector<HTMLElement>('.search-dialog__panel')
  // The backdrop — a real element, not `dialog` itself, is what a click
  // outside the panel actually lands on (see search-dialog.hbs's header).
  var overlayContent = dialog.querySelector<HTMLElement>('.dt-overlay__content')
  if (!field || !closeButton || !resultsEl || !panel || !overlayContent) return

  var indexBasename = dialog.dataset.searchIndex
  if (!indexBasename) return // belt and braces — the server-side guard already covers this

  var scriptConfig = (document.getElementById('site-script') || { dataset: {} as DOMStringMap }).dataset
  var uiRootPath = (scriptConfig.uiRootPath ?? window.uiRootPath) || '.'
  var indexUrl = uiRootPath + '/search/' + indexBasename
  var engineUrl = uiRootPath + '/js/vendor/search.js'

  // Matches search.bundle.ts's own DEFAULT_LIMIT — kept in sync there so the
  // unfiltered path actually fetches this many, not just displays up to it.
  // Requested explicitly (not left to the engine's default) only while a
  // chip filter is active (see onQuery); the unfiltered path already gets
  // this many straight from the engine.
  var RESULT_LIMIT = 24
  var FILTER_FETCH_LIMIT = 96

  correctShortcutChip()

  triggers.forEach(function (trigger) {
    trigger.setAttribute('aria-haspopup', 'dialog')
    trigger.setAttribute('aria-controls', 'search-dialog')
  })

  // GH-68 (S4): fullscreen below the project's own `m` (1240px) — matches
  // `--dt-breakpoints-xs-s` (dt-breakpoints.css). `.dt-modal--fullscreen`
  // and `.dt-modal--small` share the same specificity in dt-components.css
  // with `--fullscreen`'s rule declared later, so it would win unconditionally
  // at every breakpoint if both classes were simply left on the element
  // together — this toggles it instead, the same matchMedia pattern
  // 01-nav.ts uses for its own breakpoint-dependent behaviour.
  var fullscreenQuery = window.matchMedia('(max-width: 1239.98px)')
  syncFullscreen()
  fullscreenQuery.addEventListener('change', syncFullscreen)

  function syncFullscreen () {
    panel!.classList.toggle('dt-modal--fullscreen', fullscreenQuery.matches)
  }

  var engineScriptPromise: Promise<void> | null = null
  var searcherPromise: ReturnType<NonNullable<Window['__docoutureSearch']>['load']> | null = null
  var currentAbort: AbortController | null = null
  var rows: HTMLElement[] = []
  var activeRow = -1
  // '' means "All" — the chip with `data-category=""` (search-dialog.hbs).
  var activeCategory = ''
  // Whichever trigger actually opened the dialog gets focus back on close —
  // the two are mutually exclusive by breakpoint (search-dialog.css), but
  // never assume which one that was.
  var openedFrom: HTMLButtonElement | null = null

  triggers.forEach(function (trigger) {
    trigger.addEventListener('pointerenter', preload)
    trigger.addEventListener('focus', preload)
    trigger.addEventListener('click', function () {
      open(trigger)
    })
  })
  document.addEventListener('keydown', onGlobalKeydown)
  closeButton.addEventListener('click', function () {
    dialog!.close()
  })
  dialog.addEventListener('close', function () {
    if (currentAbort) currentAbort.abort()
    unlockBodyScroll()
    field!.setAttribute('aria-expanded', 'false')
    if (openedFrom) openedFrom.focus()
  })
  overlayContent.addEventListener('click', function () {
    // The backdrop — the only thing painted behind the panel now that the
    // nesting is correct (search-dialog.hbs's header) — a click here IS a
    // click outside the panel, unconditionally: nothing else in the DOM ever
    // sits on top of `.dt-overlay__content` other than the panel itself.
    dialog!.close()
  })
  field.addEventListener('input', onQuery)
  field.addEventListener('keydown', onFieldKeydown)
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      onChipSelected(chip)
    })
  })
  // `.search-dialog__chips` is a horizontally-scrolling row (search-
  // dialog.css: `overflow-x: auto`, scrollbar hidden) — a trackpad's
  // two-finger swipe already reports a `deltaX` and scrolls it natively,
  // no JS required. A plain mouse wheel only ever reports `deltaY`, and the
  // browser's own default wheel handling looks for the nearest VERTICALLY
  // scrollable ancestor to apply that to — this row has no vertical
  // overflow at all, so a vertical wheel over it does nothing rather than
  // being reinterpreted as horizontal. Re-mapping `deltaY` onto
  // `scrollLeft` ourselves (only when it's the larger axis, so a trackpad's
  // own `deltaX` swipes are left untouched) is the standard fix for this —
  // the same one horizontal-scrolling galleries need everywhere.
  if (chipsRow) {
    chipsRow.addEventListener(
      'wheel',
      function (e) {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
        if (chipsRow!.scrollWidth <= chipsRow!.clientWidth) return
        chipsRow!.scrollLeft += e.deltaY
        e.preventDefault()
      },
      { passive: false }
    )
  }

  function onChipSelected (chip: HTMLButtonElement) {
    var category = chip.dataset.category || ''
    if (category === activeCategory) return
    activeCategory = category
    chips.forEach(function (c) {
      var selected = c === chip
      c.classList.toggle('dt-tag--selected', selected)
      c.setAttribute('aria-pressed', String(selected))
    })
    // Idle state (empty field) has nothing category-scoped to re-filter —
    // recent searches aren't module-scoped — so only a live query re-runs.
    if (field!.value.trim()) onQuery()
  }

  function onGlobalKeydown (e: KeyboardEvent) {
    if (!isHotkey(e)) return
    e.preventDefault()
    preload()
    // A hotkey has no originating trigger element — the currently visible
    // trigger (if any) gets focus back on close, same as a click would.
    var visible = triggers.filter(function (t) { return t.offsetParent !== null })
    open(visible.length ? visible[0] : null)
  }

  /** Ignored inside an input/textarea/contenteditable — those keystrokes are text, not shortcuts. */
  function isHotkey (e: KeyboardEvent): boolean {
    var target = e.target as HTMLElement | null
    if (target) {
      var tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return false
    }
    if (e.key === '/') return true
    return (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
  }

  /** Fired on hover/focus intent; failures are swallowed here and only surfaced once a real query runs. */
  function preload () {
    ensureEngine()
      .then(loadIndex)
      .catch(function () {
        /* surfaced by onQuery's own catch when the reader actually searches */
      })
  }

  function open (trigger: HTMLButtonElement | null) {
    openedFrom = trigger
    field!.disabled = false
    closeButton!.disabled = false
    if (dialog!.open) return
    lockBodyScroll()
    dialog!.showModal()
    field!.setAttribute('aria-expanded', 'true')
    field!.value = ''
    renderIdle()
    field!.focus()
  }

  /**
   * The dialog isn't full-viewport at m+ (search-dialog.css pins a small
   * panel near the top rather than covering the page), so the background
   * stays visible AND scrollable behind it unless locked explicitly.
   * Removing the scrollbar with `overflow: hidden` shifts everything
   * sideways by its own width — compensated here with a custom property
   * search-dialog.css turns into `padding-right`, measured fresh on every
   * open since a reader can resize between opens.
   */
  function lockBodyScroll () {
    var scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.documentElement.style.setProperty('--search-dialog-scrollbar-width', scrollbarWidth + 'px')
    document.documentElement.classList.add('search-dialog-locked')
  }

  function unlockBodyScroll () {
    document.documentElement.classList.remove('search-dialog-locked')
    document.documentElement.style.removeProperty('--search-dialog-scrollbar-width')
  }

  function ensureEngine (): Promise<void> {
    if (engineScriptPromise) return engineScriptPromise
    engineScriptPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script')
      script.src = engineUrl
      script.addEventListener('load', function () {
        resolve()
      })
      script.addEventListener('error', function () {
        engineScriptPromise = null
        reject(new Error('search engine failed to load'))
      })
      document.head.appendChild(script)
    })
    return engineScriptPromise
  }

  function loadIndex () {
    if (searcherPromise) return searcherPromise
    searcherPromise = ensureEngine().then(function () {
      return window.__docoutureSearch!.load(indexUrl)
    })
    searcherPromise.catch(function () {
      searcherPromise = null
    })
    return searcherPromise
  }

  function onQuery () {
    var term = field!.value.trim()
    if (currentAbort) currentAbort.abort()

    if (!term) {
      renderIdle()
      return
    }

    var controller = new AbortController()
    currentAbort = controller
    renderLoading()

    // A filter chip's post-filter narrows what the engine already returned
    // rather than issuing a real filtered query (search.bundle.ts's own
    // header explains why a `where` clause isn't available here) — so ask
    // for a wider pool up front whenever one is active, or the filtered
    // count would be starved by a limit sized for the unfiltered case.
    var options = activeCategory ? { limit: FILTER_FETCH_LIMIT } : undefined

    loadIndex()!
      .then(function (searcher) {
        return searcher(term, controller.signal, options)
      })
      .then(function (hits) {
        if (controller.signal.aborted) return
        renderResults(term, hits)
      })
      .catch(function () {
        if (controller.signal.aborted) return
        renderUnavailable()
      })
  }

  function onFieldKeydown (e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveActive(rows.length ? (activeRow + 1) % rows.length : -1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveActive(rows.length ? (activeRow - 1 + rows.length) % rows.length : -1)
    } else if (e.key === 'Home' && rows.length) {
      e.preventDefault()
      moveActive(0)
    } else if (e.key === 'End' && rows.length) {
      e.preventDefault()
      moveActive(rows.length - 1)
    } else if (e.key === 'Enter' && activeRow >= 0 && rows[activeRow]) {
      e.preventDefault()
      rows[activeRow].click()
    }
  }

  /**
   * Replaces `rows` and gives each one the identity the ARIA 1.2 combobox
   * pattern needs (`role="option"` + an id `aria-activedescendant` can
   * point at) — shared by both search result rows and recent-search rows
   * (13-search-recents.ts), so arrow-key roving treats the two identically.
   */
  function prepareRows (newRows: HTMLElement[]) {
    if (activeRow >= 0 && rows[activeRow]) {
      rows[activeRow].classList.remove('dt-list-item--selected')
      rows[activeRow].setAttribute('aria-selected', 'false')
    }
    rows = newRows
    activeRow = -1
    field!.removeAttribute('aria-activedescendant')
    rows.forEach(function (row, index) {
      row.id = 'search-dialog-option-' + index
      row.setAttribute('role', 'option')
      row.setAttribute('aria-selected', 'false')
    })
  }

  function moveActive (index: number) {
    if (activeRow >= 0 && rows[activeRow]) {
      rows[activeRow].classList.remove('dt-list-item--selected')
      rows[activeRow].setAttribute('aria-selected', 'false')
    }
    activeRow = index
    if (activeRow >= 0 && rows[activeRow]) {
      rows[activeRow].classList.add('dt-list-item--selected')
      rows[activeRow].setAttribute('aria-selected', 'true')
      rows[activeRow].scrollIntoView({ block: 'nearest' })
      field!.setAttribute('aria-activedescendant', rows[activeRow].id)
    } else {
      field!.removeAttribute('aria-activedescendant')
    }
  }

  function announce (message: string) {
    if (statusEl) statusEl.textContent = message
  }

  /** Replays a recent search (13-search-recents.ts) — refills the field and re-runs the query, same as typing it again. */
  function replay (term: string) {
    field!.value = term
    field!.focus()
    onQuery()
  }

  /** Idle state: recent searches (13-search-recents.ts) when there are any, a blank panel otherwise. */
  function renderIdle () {
    announce('')
    var recents = window.__docoutureSearchRecents
    var recentRows = recents ? recents.render(resultsEl!, replay, renderIdle) : []
    if (!recents) resultsEl!.replaceChildren()
    prepareRows(recentRows)
  }

  function renderLoading () {
    prepareRows([])
    var loader = document.createElement('div')
    loader.className = 'dt-loader'
    loader.setAttribute('aria-hidden', 'true')
    var circle = document.createElement('span')
    circle.className = 'dt-loader__circle dt-loader__circle--medium'
    circle.appendChild(document.createElement('span'))
    var label = document.createElement('span')
    label.className = 'dt-loader__label'
    label.textContent = 'Loading the search index…'
    loader.append(circle, label)
    resultsEl!.replaceChildren(loader)
  }

  function renderUnavailable () {
    prepareRows([])
    announce('Search is unavailable')
    var empty = document.createElement('div')
    empty.className = 'dt-empty-state'
    var message = document.createElement('div')
    message.className = 'dt-empty-state__message'
    var title = document.createElement('p')
    title.className = 'dt-empty-state__title'
    title.textContent = 'Search is unavailable'
    var description = document.createElement('p')
    description.className = 'dt-empty-state__description'
    description.textContent = 'Try reloading the page.'
    message.append(title, description)
    empty.appendChild(message)
    resultsEl!.replaceChildren(empty)
  }

  function renderEmpty (term: string) {
    prepareRows([])
    announce('No results for “' + term + '”')
    var empty = document.createElement('div')
    empty.className = 'dt-empty-state'
    var message = document.createElement('div')
    message.className = 'dt-empty-state__message'
    var title = document.createElement('p')
    title.className = 'dt-empty-state__title'
    title.textContent = 'No results found'
    var description = document.createElement('p')
    description.className = 'dt-empty-state__description'
    description.textContent = 'Try a different search term'
    message.append(title, description)
    empty.appendChild(message)
    resultsEl!.replaceChildren(empty)
  }

  /**
   * Hits sharing a URL ignoring the fragment collapse into one entry —
   * `zbsearch` returns one hit per indexed section, so five matches on one
   * page arrive as five hits here and must read as one result with five
   * deep links, not five unrelated rows. Category headings render whenever
   * the SITE has more than one module (`chips.length` — the same nav-
   * annotated modules the filter chips come from), regardless of how many
   * distinct categories the current result set happens to span: a result
   * set narrowed to one module (by a chip, or just by what matched) still
   * gets that module named once, at the top — only a genuinely
   * single-module site (`starter`, no chips at all) gets a flat list with
   * no heading, because there's nothing to distinguish.
   *
   * `activeCategory` post-filters before grouping, then re-caps at
   * RESULT_LIMIT: the engine was asked for FILTER_FETCH_LIMIT hits precisely
   * because filtering narrows the pool, but the display itself stays sized
   * the same as the unfiltered path.
   */
  function renderResults (term: string, hits: SearchHit[]) {
    var filtered = activeCategory ? hits.filter(function (h) { return h.category === activeCategory }) : hits
    filtered = filtered.slice(0, RESULT_LIMIT)

    if (!filtered.length) {
      renderEmpty(term)
      return
    }

    var entries: { baseUrl: string; category: string; sections: SearchHit[] }[] = []
    var byBaseUrl = new Map<string, (typeof entries)[number]>()
    filtered.forEach(function (hit) {
      var baseUrl = hit.url.split('#')[0]
      var entry = byBaseUrl.get(baseUrl)
      if (!entry) {
        entry = { baseUrl: baseUrl, category: hit.category, sections: [] }
        byBaseUrl.set(baseUrl, entry)
        entries.push(entry)
      }
      entry.sections.push(hit)
    })

    // Whether the SITE has multiple modules — not whether the current
    // result set happens to span more than one of them (see this
    // function's own header for why that distinction matters).
    var showCategories = chips.length > 0

    var list = document.createElement('ul')
    list.className = 'dt-list'
    var lastCategory: string | null = null
    var rowEls: HTMLElement[] = []

    entries.forEach(function (entry) {
      if (showCategories && entry.category !== lastCategory) {
        lastCategory = entry.category
        var heading = document.createElement('li')
        heading.className = 'search-dialog__category'
        heading.setAttribute('role', 'presentation')
        heading.textContent = entry.category
        list.appendChild(heading)
      }

      entry.sections.forEach(function (hit) {
        var item = document.createElement('li')
        var link = document.createElement('a')
        // `--divider` (DS: an inset bottom border in `--dt-color-border-low`)
        // on every row — stripped off the very last one below, once the full
        // list is known, since a divider under the last row would just be a
        // stray line before the footer.
        link.className = 'dt-list-item dt-list-item--clickable dt-list-item--divider'
        link.href = hit.url

        var text = document.createElement('span')
        text.className = 'dt-list-item__text'

        // Site name dropped always (hierarchy[0] — see search-index.js: it's
        // always the component title, or that title merged with the
        // category when there's no nav_modules split — either way,
        // redundant while already on the site). The category/module name
        // (hierarchy[1], when the site name and category are distinct
        // entries — see above) is ALSO dropped whenever `showCategories` is
        // true: that's exactly when it's shown once already, above this
        // row, as the group heading — repeating it in every row under that
        // heading is the redundant part. A genuinely single-module site
        // (no chips, `showCategories` false) has no such heading anywhere,
        // so the category stays in the crumb there — it's real
        // information, not a repeat.
        var crumbs = showCategories ? hit.hierarchy.slice(2) : hit.hierarchy.slice(1)
        if (hit.section) crumbs = crumbs.concat(hit.section)
        if (crumbs.length) text.appendChild(buildBreadcrumbs(crumbs))

        var titleEl = document.createElement('span')
        titleEl.className = 'dt-list-item__label'
        appendHighlighted(titleEl, hit.title)
        text.appendChild(titleEl)

        var description = document.createElement('span')
        description.className = 'dt-list-item__description'
        appendHighlighted(description, hit.snippet)
        text.appendChild(description)

        link.appendChild(text)
        // Recorded on open, not on every keystroke — 13-search-recents.ts
        // remembers the SEARCH TERM that led here, not the destination.
        // `dialog.close()` here too: a result is a real `<a href>`, and for
        // a same-page hit (an anchor within the current document — a
        // heading a few sections down) the browser only scrolls, it never
        // unloads this page, so nothing else would ever close the dialog —
        // it would sit open, on top of the content the reader just asked to
        // jump to. Closing unconditionally on click is correct for a
        // cross-page hit too: that navigation tears the whole document
        // (and the dialog with it) down anyway, so closing first only ever
        // avoids the dialog being visibly still open for the instant before
        // the browser unloads.
        link.addEventListener('click', function () {
          if (window.__docoutureSearchRecents) window.__docoutureSearchRecents.record(term)
          dialog!.close()
        })
        item.appendChild(link)
        list.appendChild(item)
        rowEls.push(link)
      })
    })

    if (rowEls.length) rowEls.at(-1)!.classList.remove('dt-list-item--divider')

    resultsEl!.replaceChildren(list)
    prepareRows(rowEls)
    moveActive(0)
    announce(rowEls.length + (rowEls.length === 1 ? ' result' : ' results') + ' for “' + term + '”')
  }

  /**
   * The real DS breadcrumbs component (`.dt-breadcrumbs`/`.dt-breadcrumb-
   * item`, vendored the same way breadcrumbs.hbs's page-level trail is) —
   * not hand-joined text — reused here as plain, non-interactive spans:
   * these crumbs are history, not a navigable trail of their own. Each
   * segment carries its own highlight marks, same as title/snippet.
   */
  function buildBreadcrumbs (crumbs: SearchHit['hierarchy']): HTMLElement {
    var nav = document.createElement('span')
    nav.className = 'dt-breadcrumbs search-result__breadcrumbs'
    crumbs.forEach(function (crumb) {
      var item = document.createElement('span')
      item.className = 'dt-breadcrumb-item'
      var content = document.createElement('span')
      content.className = 'dt-breadcrumb-item__content'
      appendHighlighted(content, crumb)
      item.appendChild(content)
      nav.appendChild(item)
    })
    return nav
  }

  /** Turns `{ text, marks }` into text nodes + `<mark>` — never `innerHTML`, since this text is third-party page content. */
  function appendHighlighted (el: HTMLElement, highlighted: SearchHit['title']) {
    var text = highlighted.text
    var cursor = 0
    highlighted.marks.forEach(function (mark) {
      if (mark.start > cursor) el.appendChild(document.createTextNode(text.slice(cursor, mark.start)))
      var markEl = document.createElement('mark')
      markEl.className = 'dt-highlight__mark'
      markEl.textContent = text.slice(mark.start, mark.end)
      el.appendChild(markEl)
      cursor = mark.end
    })
    if (cursor < text.length) el.appendChild(document.createTextNode(text.slice(cursor)))
  }

  /** Renders "Ctrl" instead of the server-rendered "⌘" on non-Apple platforms — no way to detect the platform without JS, so the Apple form is what a reader with script disabled or a slow connection sees for one frame. */
  function correctShortcutChip () {
    if (!shortcutChip) return
    var isApple = /Mac|iPhone|iPad|iPod/.test(window.navigator.platform || window.navigator.userAgent)
    if (!isApple) shortcutChip.textContent = 'Ctrl K'
  }
})()
