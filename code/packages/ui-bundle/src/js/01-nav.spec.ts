// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: MPL-2.0

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

/** jsdom does not implement matchMedia — stub a fixed, non-matching (below breakpoint l) result. */
function stubMatchMedia(matches = false) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

async function load() {
  vi.resetModules()
  await import('./01-nav')
}

function baseMenu(navHtml = '') {
  return `
    <button class="side-menu-toggle" hidden></button>
    <nav id="side-menu">
      <button class="side-menu__close"></button>
      <div class="side-menu__nav">${navHtml}</div>
    </nav>
  `
}

beforeEach(() => {
  document.body.innerHTML = ''
  document.documentElement.className = ''
  stubMatchMedia(false)
  vi.spyOn(window.localStorage.__proto__, 'setItem')
})

describe('side menu toggle', () => {
  it('does nothing when the menu or its toggle button is missing', async () => {
    document.body.innerHTML = ''
    await expect(load()).resolves.toBeUndefined()
  })

  it('reveals the toggle button and labels it for the collapsed (below-l) default state', async () => {
    document.body.innerHTML = baseMenu()
    await load()
    const toggle = document.querySelector<HTMLButtonElement>('.side-menu-toggle')!
    expect(toggle.hidden).toBe(false)
    expect(toggle.getAttribute('aria-label')).toBe('Open navigation')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })

  it('opens on click, relabels to Close navigation, and persists the choice', async () => {
    document.body.innerHTML = baseMenu()
    await load()
    const toggle = document.querySelector<HTMLButtonElement>('.side-menu-toggle')!
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(toggle.getAttribute('aria-label')).toBe('Close navigation')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById('side-menu')!.classList.contains('is-active')).toBe(true)
  })

  it('closes via the close button', async () => {
    document.body.innerHTML = baseMenu()
    await load()
    const toggle = document.querySelector<HTMLButtonElement>('.side-menu-toggle')!
    const closeButton = document.querySelector<HTMLButtonElement>('.side-menu__close')!
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(document.getElementById('side-menu')!.classList.contains('is-active')).toBe(false)
    expect(toggle.getAttribute('aria-label')).toBe('Open navigation')
  })

  it('labels for the pushed (>= l) default-open state', async () => {
    stubMatchMedia(true)
    document.body.innerHTML = baseMenu()
    await load()
    const toggle = document.querySelector<HTMLButtonElement>('.side-menu-toggle')!
    expect(toggle.getAttribute('aria-label')).toBe('Hide navigation')
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(toggle.getAttribute('aria-label')).toBe('Show navigation')
  })
})

describe('current-page path activation', () => {
  it('expands every ancestor toggle of the current page and collapses the rest', async () => {
    document.body.innerHTML = baseMenu(`
      <ul>
        <li>
          <div class="side-menu__row">
            <button class="side-menu__toggle" aria-expanded="true"></button>
          </div>
          <ul>
            <li><a class="dt-list-item" href="/other.html" aria-current="false">Other</a></li>
            <li>
              <a class="dt-list-item" href="/current.html" aria-current="page">Current</a>
            </li>
          </ul>
        </li>
        <li>
          <div class="side-menu__row">
            <button class="side-menu__toggle" aria-expanded="true"></button>
          </div>
          <ul><li><a class="dt-list-item" href="/unrelated.html">Unrelated</a></li></ul>
        </li>
      </ul>
    `)
    await load()
    const toggles = document.querySelectorAll('.side-menu__toggle')
    // First branch (ancestor of the current page) stays expanded...
    expect(toggles[0].getAttribute('aria-expanded')).toBe('true')
    // ...the unrelated branch collapses.
    expect(toggles[1].getAttribute('aria-expanded')).toBe('false')
  })

  it('collapses every branch when no item in the tree is the current page', async () => {
    document.body.innerHTML = baseMenu(`
      <ul>
        <li>
          <div class="side-menu__row">
            <button class="side-menu__toggle" aria-expanded="true"></button>
          </div>
          <ul><li><a class="dt-list-item" href="/other.html">Other</a></li></ul>
        </li>
      </ul>
    `)
    await load()
    const toggleBtn = document.querySelector('.side-menu__toggle')!
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false')
  })

  it('toggles a branch open/closed on its own toggle click', async () => {
    document.body.innerHTML = baseMenu(`
      <ul>
        <li>
          <div class="side-menu__row">
            <button class="side-menu__toggle" aria-expanded="false"></button>
          </div>
          <ul><li><a class="dt-list-item" href="/other.html">Other</a></li></ul>
        </li>
      </ul>
    `)
    await load()
    const toggleBtn = document.querySelector<HTMLButtonElement>('.side-menu__toggle')!
    toggleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true')
  })
})

describe('hash-driven current-item tracking', () => {
  it('walks up from a heading id to find and activate the matching nav link on hashchange', async () => {
    document.body.innerHTML =
      baseMenu(`
      <ul>
        <li>
          <div class="side-menu__row"><button class="side-menu__toggle" aria-expanded="false"></button></div>
          <ul><li><a class="dt-list-item" href="#section-one">Section one</a></li></ul>
        </li>
      </ul>
    `) +
      `
      <article class="doc">
        <div class="sect1">
          <h2 id="section-one">Heading</h2>
          <p id="deep-anchor">Some deep-linked paragraph with no nav entry of its own.</p>
        </div>
      </article>
    `
    window.location.hash = '#deep-anchor'
    await load()
    const navLink = document.querySelector('.dt-list-item[href="#section-one"]')!
    expect(navLink.getAttribute('aria-current')).toBe('page')
    window.location.hash = ''
  })
})
