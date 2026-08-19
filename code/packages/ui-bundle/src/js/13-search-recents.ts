/*
 * Recent searches (GH-69, S5 of the search epic, #64) — shown by
 * 12-search.ts's `renderIdle` in place of a blank panel whenever the query
 * is empty and at least one recent exists.
 *
 * A separate numbered file, not folded into 12-search.ts, the same
 * one-concern-per-file split the rest of this bundle already follows
 * (01-nav.ts / 05-nav-modules.ts both touch navigation but stay apart
 * because they own different controls). Like every pair of numbered files
 * here, this one and 12-search.ts are each their own IIFE with no shared
 * module system — `window.__pdocsSearchRecents` is the agreed surface
 * between them, the same pattern `window.__pdocsSearch` uses to cross the
 * boundary into vendor/search.bundle.ts.
 *
 * What's remembered is the SEARCH TERM, not the page that was opened —
 * "recent searches", not "recent pages" — recorded once a reader actually
 * opens a result (12-search.ts calls `record` from there), not on every
 * keystroke. Clicking a recent replays it: refills the field and re-runs
 * the query, exactly like typing it again.
 */
;(function () {
  'use strict'

  var STORAGE_LIMIT = 8

  var scriptConfig = (document.getElementById('site-script') || { dataset: {} as DOMStringMap }).dataset
  var uiRootPath = (scriptConfig.uiRootPath == null ? window.uiRootPath : scriptConfig.uiRootPath) || '.'

  // Namespaced per site, not just per component version: two pdocs sites
  // hosted under different sub-paths of the same origin must not share a
  // history. `uiRootPath` alone is only ever relative ('.', '..', '../..'),
  // identical-looking from two different pages of two different sites — so
  // it's resolved to an absolute pathname first.
  var STORAGE_KEY = 'pdocs-search-recents:' + siteId()

  function siteId (): string {
    try {
      return new URL(uiRootPath, window.location.href).pathname
    } catch (e) {
      return uiRootPath
    }
  }

  function load (): string[] {
    try {
      var raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      var parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter(function (t) { return typeof t === 'string' }) : []
    } catch (e) {
      return [] // private browsing, storage disabled, or corrupt JSON — no history rather than a thrown error
    }
  }

  function save (terms: string[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(terms))
    } catch (e) {
      // storage disabled or full: the choice simply does not persist
    }
  }

  function record (term: string) {
    term = term.trim()
    if (!term) return
    var terms = load().filter(function (t) { return t.toLowerCase() !== term.toLowerCase() })
    terms.unshift(term)
    save(terms.slice(0, STORAGE_LIMIT))
  }

  function remove (term: string) {
    save(load().filter(function (t) { return t !== term }))
  }

  /**
   * Renders into `container`, replacing its children; returns the rows so
   * the caller (12-search.ts) can fold them into its own `rows` array for
   * arrow-key roving, exactly like search result rows. Returns `[]` (and
   * leaves `container` empty) when there's nothing to show — the caller's
   * own idle-state fallback then applies.
   *
   * `onSelect(term)` replays a recent; `onRemove()` is called after a
   * removal so the caller re-renders idle state from scratch — deleting one
   * entry from storage doesn't just delete this row's DOM, since the roving
   * `rows`/`activeRow` bookkeeping lives in 12-search.ts, not here.
   */
  function render (container: HTMLElement, onSelect: (term: string) => void, onRemove: () => void): HTMLElement[] {
    var terms = load()
    if (!terms.length) {
      container.replaceChildren()
      return []
    }

    var rowEls: HTMLElement[] = []
    var heading = document.createElement('p')
    heading.className = 'search-recents__heading'
    heading.id = 'search-recents-heading'
    heading.textContent = 'Recent searches'

    var list = document.createElement('ul')
    list.className = 'ids-list'
    list.setAttribute('aria-labelledby', heading.id)

    terms.forEach(function (term) {
      // The row itself IS `.ids-list-item` (an `<li>`, not a wrapping
      // element around a separate one) — see this file's own CSS
      // (search-dialog.css) for why: the remove button lives INSIDE it, as
      // `.ids-list-item__content-end` (the real DS `ListItem`'s own slot for
      // a trailing action), so the hover/selected background covers the
      // whole row rather than stopping short of the button.
      //
      // Not a `<button>`/`<a>` itself: it nests a real `<button>` for the
      // remove action, and interactive elements cannot nest. A plain click
      // listener stands in, the same shape the DS's own `ListItem` uses —
      // `element="li"` by default, `onClick` wired by the component rather
      // than relying on native button/link semantics.
      var item = document.createElement('li')
      item.className = 'ids-list-item ids-list-item--clickable search-recents__row'
      item.addEventListener('click', function () {
        onSelect(term)
      })

      var iconSlot = document.createElement('span')
      iconSlot.className = 'ids-list-item__icon-start'
      iconSlot.setAttribute('aria-hidden', 'true')
      iconSlot.appendChild(icon('time', 'history-outlined'))

      var text = document.createElement('span')
      text.className = 'ids-list-item__text'
      var label = document.createElement('span')
      label.className = 'ids-list-item__label'
      label.textContent = term
      text.appendChild(label)

      var contentEnd = document.createElement('span')
      contentEnd.className = 'ids-list-item__content-end'
      var removeButton = document.createElement('button')
      removeButton.type = 'button'
      removeButton.className = 'ids-button ids-button--ghost ids-button--icon-only'
      removeButton.setAttribute('aria-label', 'Remove “' + term + '” from recent searches')
      var removeContent = document.createElement('span')
      removeContent.className = 'ids-button__content'
      var removeIconSlot = document.createElement('span')
      removeIconSlot.className = 'ids-button__icon ids-button__icon-icon'
      removeIconSlot.appendChild(icon('actions', 'close-small-outlined'))
      removeContent.appendChild(removeIconSlot)
      removeButton.appendChild(removeContent)
      removeButton.addEventListener('click', function (e) {
        e.stopPropagation()
        remove(term)
        onRemove()
      })
      contentEnd.appendChild(removeButton)

      item.append(iconSlot, text, contentEnd)
      list.appendChild(item)
      rowEls.push(item)
    })

    container.replaceChildren(heading, list)
    return rowEls
  }

  /** `<svg><use></use></svg>` against the vendored sprite — same shape 06-copy-to-clipboard.ts and 09-heading-anchors.ts build by hand for the same reason: no `{{icon}}` Handlebars helper at runtime. `.ids-icon` is what actually sizes it; without that class it renders at the `<use>` element's own intrinsic (viewport-filling) size. */
  function icon (group: string, name: string): SVGSVGElement {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'ids-icon')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('focusable', 'false')
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
    use.setAttribute('href', uiRootPath + '/img/ids-icons.svg#sw-icons-' + group + '-' + name)
    svg.appendChild(use)
    return svg
  }

  window.__pdocsSearchRecents = { record: record, render: render }
})()
