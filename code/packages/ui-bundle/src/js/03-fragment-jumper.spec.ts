// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: MPL-2.0

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * This module is a self-running IIFE with no exports (see its own header) —
 * every test builds the DOM it expects FIRST, then dynamically imports it
 * fresh (`vi.resetModules()`) so the IIFE reads that exact fixture.
 */
async function load() {
  vi.resetModules()
  await import('./03-fragment-jumper')
}

beforeEach(() => {
  document.body.innerHTML = ''
  window.scrollTo = vi.fn()
})

describe('fragment jumper', () => {
  it('does nothing when the page has no article.doc', async () => {
    await expect(load()).resolves.toBeUndefined()
  })

  it('jumps to the target of a same-page anchor on click, offset by the toolbar height', async () => {
    document.body.innerHTML = `
      <div class="header-toolbar"></div>
      <article class="doc">
        <a id="link" href="#target">Jump</a>
        <h2 id="target">Target</h2>
      </article>
    `
    await load()
    const link = document.getElementById('link') as HTMLAnchorElement
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(event)
    expect(window.scrollTo).toHaveBeenCalled()
  })

  it('ignores a click with a modifier key (opening in a new tab)', async () => {
    document.body.innerHTML = `
      <article class="doc">
        <a id="link" href="#target">Jump</a>
        <h2 id="target">Target</h2>
      </article>
    `
    await load()
    const link = document.getElementById('link') as HTMLAnchorElement
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })
    link.dispatchEvent(event)
    // preventDefault must not have been called — the browser's own new-tab
    // handling should proceed untouched.
    expect(event.defaultPrevented).toBe(false)
  })

  it('jumps on load when the URL already carries a matching fragment', async () => {
    document.body.innerHTML = `
      <article class="doc">
        <h2 id="target">Target</h2>
      </article>
    `
    window.location.hash = '#target'
    await load()
    window.dispatchEvent(new Event('load'))
    expect(window.scrollTo).toHaveBeenCalled()
    window.location.hash = ''
  })

  it('decodes a percent-encoded fragment', async () => {
    document.body.innerHTML = `
      <article class="doc">
        <a id="link" href="#a%20b">Jump</a>
        <h2 id="a b">Target</h2>
      </article>
    `
    await load()
    const link = document.getElementById('link') as HTMLAnchorElement
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(window.scrollTo).toHaveBeenCalled()
  })

  it('ignores an anchor whose fragment matches no element', async () => {
    document.body.innerHTML = `
      <article class="doc">
        <a id="link" href="#does-not-exist">Jump</a>
      </article>
    `
    await load()
    const link = document.getElementById('link') as HTMLAnchorElement
    expect(() => link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))).not.toThrow()
    expect(window.scrollTo).not.toHaveBeenCalled()
  })
})
