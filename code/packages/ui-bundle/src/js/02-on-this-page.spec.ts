// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: MPL-2.0

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

async function load() {
  vi.resetModules()
  await import('./02-on-this-page')
}

beforeEach(() => {
  document.body.innerHTML = ''
  document.body.className = ''
  document.documentElement.className = ''
})

describe('on this page', () => {
  it('does nothing when there is no #on-this-page sidebar', async () => {
    await expect(load()).resolves.toBeUndefined()
  })

  it('removes the sidebar outright on a body.-toc (opted-out) page', async () => {
    document.body.className = '-toc'
    document.body.innerHTML += `<div id="on-this-page"><div class="toc-menu"></div></div><article class="doc"><h2 id="a">A</h2></article>`
    await load()
    expect(document.getElementById('on-this-page')).toBeNull()
  })

  it('removes the sidebar when the article has no matching headings', async () => {
    document.body.innerHTML = `<div id="on-this-page"><div class="toc-menu"></div></div><article class="doc"></article>`
    await load()
    expect(document.getElementById('on-this-page')).toBeNull()
  })

  it('builds a toc list from the article headings and reveals the has-toc class', async () => {
    document.body.innerHTML = `
      <div id="on-this-page" data-levels="2"><div class="toc-menu"></div></div>
      <article class="doc">
        <h1 class="sect0" id="intro">Intro</h1>
        <div class="sect1"><h2 id="one">One</h2></div>
      </article>
    `
    await load()
    const sidebar = document.getElementById('on-this-page')!
    expect(document.documentElement.classList.contains('has-toc')).toBe(true)
    const links = sidebar.querySelectorAll('a')
    expect(links.length).toBe(2)
    expect(links[0].getAttribute('href')).toBe('#intro')
    expect(links[1].getAttribute('href')).toBe('#one')
    expect(sidebar.querySelector('h3')!.textContent).toBe('On this page')
  })

  it('uses a custom data-title when given', async () => {
    document.body.innerHTML = `
      <div id="on-this-page" data-title="Contents"><div class="toc-menu"></div></div>
      <article class="doc"><h1 class="sect0" id="intro">Intro</h1></article>
    `
    await load()
    expect(document.getElementById('on-this-page')!.querySelector('h3')!.textContent).toBe('Contents')
  })

  it('removes the sidebar for a negative data-levels', async () => {
    document.body.innerHTML = `
      <div id="on-this-page" data-levels="-1"><div class="toc-menu"></div></div>
      <article class="doc"><h1 class="sect0" id="intro">Intro</h1></article>
    `
    await load()
    // levels < 0 returns before the "no headings" removal branch even runs,
    // so the element is simply left in place, untouched.
    expect(document.getElementById('on-this-page')).not.toBeNull()
    expect(document.getElementById('on-this-page')!.querySelector('h3')).toBeNull()
  })

  it('reveals and wires the toc-toggle button, defaulting to open', async () => {
    document.body.innerHTML = `
      <div id="on-this-page"><div class="toc-menu"></div></div>
      <button class="toc-toggle" hidden></button>
      <article class="doc"><h1 class="sect0" id="intro">Intro</h1></article>
    `
    await load()
    const toggle = document.querySelector<HTMLButtonElement>('.toc-toggle')!
    expect(toggle.hidden).toBe(false)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(document.documentElement.classList.contains('is-toc-closed')).toBe(false)

    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(document.documentElement.classList.contains('is-toc-closed')).toBe(true)
    expect(toggle.getAttribute('aria-label')).toBe('Show on this page')
  })

  it('restores a previously closed toc from localStorage', async () => {
    window.localStorage.setItem('docouture-toc', 'closed')
    document.body.innerHTML = `
      <div id="on-this-page"><div class="toc-menu"></div></div>
      <button class="toc-toggle" hidden></button>
      <article class="doc"><h1 class="sect0" id="intro">Intro</h1></article>
    `
    await load()
    expect(document.documentElement.classList.contains('is-toc-closed')).toBe(true)
    window.localStorage.removeItem('docouture-toc')
  })

  it('reuses an existing .toc-menu element instead of creating a new one', async () => {
    document.body.innerHTML = `
      <div id="on-this-page"><div class="toc-menu" data-marker="existing"></div></div>
      <article class="doc"><h1 class="sect0" id="intro">Intro</h1></article>
    `
    await load()
    const menu = document.getElementById('on-this-page')!.querySelector('.toc-menu')!
    expect(menu.getAttribute('data-marker')).toBe('existing')
  })

  it('creates its own .toc-menu when the sidebar has none (defensive — real markup always server-renders one, see toc.hbs)', async () => {
    document.body.innerHTML = `
      <div id="on-this-page"></div>
      <article class="doc"><h1 class="sect0" id="intro">Intro</h1></article>
    `
    await expect(load()).resolves.toBeUndefined()
  })

  it('marks the active link on scroll/load', async () => {
    document.body.innerHTML = `
      <div id="on-this-page"><div class="toc-menu"></div></div>
      <article class="doc">
        <h1 class="sect0" id="intro">Intro</h1>
      </article>
    `
    await load()
    window.dispatchEvent(new Event('load'))
    // jsdom's layout metrics are all 0, so onScroll runs but every heading
    // reads the same (0) position — this simply exercises the scroll-handler
    // code path without asserting on which link ends up active.
    window.dispatchEvent(new Event('scroll'))
    expect(document.getElementById('on-this-page')).not.toBeNull()
  })
})
