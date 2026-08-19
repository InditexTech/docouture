/*
 * Search dialog (GH-67, S3 of the search epic, #64) — the behaviour half of
 * the static shell GH-66 (S2) shipped: header-content.hbs's trigger and
 * search-dialog.hbs's `<dialog>`, both already carrying every class this
 * file needs, neither wired to anything until now.
 *
 * Absent trigger/dialog means this component version has no search index at
 * all (search-dialog.hbs and the trigger are both guarded by
 * `page.componentVersion.searchIndex` server-side — see antora-extensions/
 * lib/search-index.js, which only sets that attribute when a component
 * version produced at least one record) — nothing to wire up, so this file
 * is a no-op on those pages, the same "leave it in its plain, already-
 * working state" rule every other numbered script in this bundle follows.
 *
 * The engine (`js/vendor/search.js`, built from vendor/search.bundle.ts) is
 * NOT requested here on page load — only from `preload()`, itself only
 * reachable from a real signal of intent (hover/focus on the trigger, or the
 * first hotkey press), the same "on first intent, not async on every page"
 * split `highlight.bundle.ts` doesn't need to make because syntax
 * highlighting is needed immediately, and search isn't.
 *
 * `showModal()` gives the top layer, the focus trap, Esc-to-close and the
 * `::backdrop` from the platform — this file only ever calls `showModal()`/
 * `close()` and handles what the platform doesn't: focus restore to the
 * trigger, and everything that happens between those two calls.
 */
;(function () {
  'use strict'

  var trigger = document.querySelector<HTMLButtonElement>('.header-toolbar__search-trigger')
  var dialog = document.getElementById('search-dialog') as HTMLDialogElement | null
  if (!trigger || !dialog) return

  var field = dialog.querySelector<HTMLInputElement>('.ids-search-field-minimal__input')
  var closeButton = dialog.querySelector<HTMLButtonElement>('.search-dialog__close')
  var resultsEl = dialog.querySelector<HTMLElement>('.search-dialog__results')
  var shortcutChip = trigger.querySelector<HTMLElement>('.header-toolbar__search-shortcut')
  if (!field || !closeButton || !resultsEl) return

  var indexBasename = dialog.dataset.searchIndex
  if (!indexBasename) return // belt and braces — the server-side guard already covers this

  var scriptConfig = (document.getElementById('site-script') || { dataset: {} as DOMStringMap }).dataset
  var uiRootPath = (scriptConfig.uiRootPath == null ? window.uiRootPath : scriptConfig.uiRootPath) || '.'
  var indexUrl = uiRootPath + '/search/' + indexBasename
  var engineUrl = uiRootPath + '/js/vendor/search.js'

  correctShortcutChip()

  trigger.setAttribute('aria-haspopup', 'dialog')
  trigger.setAttribute('aria-controls', 'search-dialog')

  var engineScriptPromise: Promise<void> | null = null
  var searcherPromise: ReturnType<NonNullable<Window['__pdocsSearch']>['load']> | null = null
  var currentAbort: AbortController | null = null
  var rows: HTMLAnchorElement[] = []
  var activeRow = -1

  trigger.addEventListener('pointerenter', preload)
  trigger.addEventListener('focus', preload)
  trigger.addEventListener('click', open)
  document.addEventListener('keydown', onGlobalKeydown)
  closeButton.addEventListener('click', function () {
    dialog!.close()
  })
  dialog.addEventListener('close', function () {
    if (currentAbort) currentAbort.abort()
    trigger!.focus()
  })
  dialog.addEventListener('click', function (e) {
    // A native <dialog> has no built-in "click outside closes" — the
    // overlay fills the dialog's own box (search-dialog.css), so a click
    // landing on the dialog element itself (not something inside
    // .search-dialog__container) is a click on the backdrop.
    if (e.target === dialog) dialog!.close()
  })
  field.addEventListener('input', onQuery)
  field.addEventListener('keydown', onFieldKeydown)

  function onGlobalKeydown (e: KeyboardEvent) {
    if (!isHotkey(e)) return
    e.preventDefault()
    preload()
    open()
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

  function open () {
    field!.disabled = false
    closeButton!.disabled = false
    if (dialog!.open) return
    dialog!.showModal()
    field!.value = ''
    renderIdle()
    field!.focus()
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
      return window.__pdocsSearch!.load(indexUrl)
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

    loadIndex()!
      .then(function (searcher) {
        return searcher(term, controller.signal)
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

  function moveActive (index: number) {
    if (activeRow >= 0 && rows[activeRow]) rows[activeRow].classList.remove('ids-list-item--selected')
    activeRow = index
    if (activeRow >= 0 && rows[activeRow]) {
      rows[activeRow].classList.add('ids-list-item--selected')
      rows[activeRow].scrollIntoView({ block: 'nearest' })
    }
  }

  function renderIdle () {
    rows = []
    activeRow = -1
    resultsEl!.replaceChildren()
  }

  function renderLoading () {
    rows = []
    activeRow = -1
    var loader = document.createElement('div')
    loader.className = 'ids-loader'
    loader.setAttribute('aria-hidden', 'true')
    var circle = document.createElement('span')
    circle.className = 'ids-loader__circle ids-loader__circle--medium'
    circle.appendChild(document.createElement('span'))
    var label = document.createElement('span')
    label.className = 'ids-loader__label'
    label.textContent = 'Loading the search index…'
    loader.append(circle, label)
    resultsEl!.replaceChildren(loader)
  }

  function renderUnavailable () {
    rows = []
    activeRow = -1
    var empty = document.createElement('div')
    empty.className = 'ids-empty-state'
    var message = document.createElement('div')
    message.className = 'ids-empty-state__message'
    var title = document.createElement('p')
    title.className = 'ids-empty-state__title'
    title.textContent = 'Search is unavailable'
    var description = document.createElement('p')
    description.className = 'ids-empty-state__description'
    description.textContent = 'Try reloading the page.'
    message.append(title, description)
    empty.appendChild(message)
    resultsEl!.replaceChildren(empty)
  }

  function renderEmpty (term: string) {
    rows = []
    activeRow = -1
    var empty = document.createElement('div')
    empty.className = 'ids-empty-state'
    var message = document.createElement('div')
    message.className = 'ids-empty-state__message'
    var title = document.createElement('p')
    title.className = 'ids-empty-state__title'
    title.textContent = 'No results for “' + term + '”'
    var description = document.createElement('p')
    description.className = 'ids-empty-state__description'
    description.textContent = 'Try a different search term.'
    message.append(title, description)
    empty.appendChild(message)
    resultsEl!.replaceChildren(empty)
  }

  /**
   * Hits sharing a URL ignoring the fragment collapse into one entry —
   * `zbsearch` returns one hit per indexed section, so five matches on one
   * page arrive as five hits here and must read as one result with five
   * deep links, not five unrelated rows. Category headings render only when
   * the current result set spans more than one category, so a single-module
   * site (`starter`) gets a flat list with no special-casing.
   */
  function renderResults (term: string, hits: SearchHit[]) {
    if (!hits.length) {
      renderEmpty(term)
      return
    }

    rows = []
    activeRow = -1

    var entries: { baseUrl: string; category: string; sections: SearchHit[] }[] = []
    var byBaseUrl = new Map<string, (typeof entries)[number]>()
    hits.forEach(function (hit) {
      var baseUrl = hit.url.split('#')[0]
      var entry = byBaseUrl.get(baseUrl)
      if (!entry) {
        entry = { baseUrl: baseUrl, category: hit.category, sections: [] }
        byBaseUrl.set(baseUrl, entry)
        entries.push(entry)
      }
      entry.sections.push(hit)
    })

    var categories = new Set(entries.map(function (e) { return e.category }))
    var showCategories = categories.size > 1

    var list = document.createElement('ul')
    list.className = 'ids-list'
    var lastCategory: string | null = null

    entries.forEach(function (entry) {
      if (showCategories && entry.category !== lastCategory) {
        lastCategory = entry.category
        var heading = document.createElement('li')
        heading.className = 'search-dialog__category ids-text ids-text--detail-m'
        heading.setAttribute('role', 'presentation')
        heading.textContent = entry.category
        list.appendChild(heading)
      }

      entry.sections.forEach(function (hit) {
        var item = document.createElement('li')
        var link = document.createElement('a')
        link.className = 'ids-list-item ids-list-item--clickable'
        link.href = hit.url

        var label = document.createElement('span')
        label.className = 'ids-list-item__label'
        var crumbs = hit.section ? hit.hierarchy.concat(hit.section) : hit.hierarchy
        appendCrumbs(label, crumbs, hit.title)

        var description = document.createElement('span')
        description.className = 'ids-list-item__description'
        appendHighlighted(description, hit.snippet)

        link.append(label, description)
        item.appendChild(link)
        list.appendChild(item)
        rows.push(link)
      })
    })

    resultsEl!.replaceChildren(list)
    moveActive(0)
  }

  /** `A > B > C` breadcrumb label, `C` (the page title) rendered with its own highlight ranges. */
  function appendCrumbs (el: HTMLElement, crumbs: string[], title: SearchHit['title']) {
    crumbs.forEach(function (crumb, index) {
      if (index > 0) el.appendChild(document.createTextNode(' › '))
      if (index === crumbs.length - 1) {
        appendHighlighted(el, title)
      } else {
        el.appendChild(document.createTextNode(crumb))
      }
    })
  }

  /** Turns `{ text, marks }` into text nodes + `<mark>` — never `innerHTML`, since this text is third-party page content. */
  function appendHighlighted (el: HTMLElement, highlighted: SearchHit['title']) {
    var text = highlighted.text
    var cursor = 0
    highlighted.marks.forEach(function (mark) {
      if (mark.start > cursor) el.appendChild(document.createTextNode(text.slice(cursor, mark.start)))
      var markEl = document.createElement('mark')
      markEl.className = 'ids-highlight__mark'
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
