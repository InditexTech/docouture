// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: MPL-2.0

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

async function load() {
  vi.resetModules()
  await import('./06-copy-to-clipboard')
}

function stubClipboard(writeText = vi.fn().mockResolvedValue(undefined)) {
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
  return writeText
}

beforeEach(() => {
  document.body.innerHTML = ''
  // jsdom has no clipboard API by default — supportsCopy would be undefined.
  stubClipboard()
  // jsdom does not implement fullscreen either.
  Object.defineProperty(document, 'fullscreenEnabled', { value: false, configurable: true })
  // jsdom has no layout engine, so `innerText` (which real browsers derive
  // from rendered layout) is unimplemented — fall back to `textContent`,
  // close enough for these plain <pre>/<code> fixtures with no hidden nodes.
  if (!Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText')) {
    Object.defineProperty(HTMLElement.prototype, 'innerText', {
      configurable: true,
      get() {
        return this.textContent
      },
      set(value) {
        this.textContent = value
      },
    })
  }
})

describe('copy to clipboard / source toolbox', () => {
  it('does nothing when there is no highlighted or console literal block', async () => {
    document.body.innerHTML = `<div class="doc"><pre>plain</pre></div>`
    await expect(load()).resolves.toBeUndefined()
    expect(document.querySelector('.source-toolbox')).toBeNull()
  })

  it('adds a toolbox with a language label and a copy button to a highlighted code block', async () => {
    document.body.innerHTML = `
      <div class="doc">
        <div class="listingblock"><div class="content">
          <pre class="highlight"><code data-lang="javascript">const x = 1</code></pre>
        </div></div>
      </div>
    `
    await load()
    const toolbox = document.querySelector('.source-toolbox')!
    expect(toolbox).not.toBeNull()
    expect(toolbox.querySelector('.source-lang')!.textContent).toBe('javascript')
    expect(toolbox.querySelector('.source-actions button')).not.toBeNull()
    // The toolbox is prepended, so it is .content's first child.
    expect(toolbox.parentElement!.firstElementChild).toBe(toolbox)
  })

  it('omits the language label for a console block', async () => {
    document.body.innerHTML = `
      <div class="doc"><div class="listingblock"><div class="content">
        <pre class="highlight"><code data-lang="console">$ echo hi</code></pre>
      </div></div></div>
    `
    await load()
    expect(document.querySelector('.source-lang')).toBeNull()
  })

  it('promotes a literalblock starting with "$ " to a console listingblock', async () => {
    document.body.innerHTML = `
      <div class="doc"><div class="literalblock"><div class="content">
        <pre>$ npm install</pre>
      </div></div></div>
    `
    await load()
    const block = document.querySelector('.listingblock')
    expect(block).not.toBeNull()
    expect(document.querySelector('.literalblock')).toBeNull()
    const code = block!.querySelector('code')!
    expect(code.className).toBe('language-console hljs')
    expect(code.dataset.lang).toBe('console')
    expect(code.textContent).toBe('$ npm install')
  })

  it('ignores a plain literalblock not starting with "$ "', async () => {
    document.body.innerHTML = `
      <div class="doc"><div class="literalblock"><div class="content">
        <pre>just some output</pre>
      </div></div></div>
    `
    await load()
    expect(document.querySelector('.source-toolbox')).toBeNull()
  })

  it('does not render a copy button when the clipboard API is unavailable', async () => {
    Object.defineProperty(window.navigator, 'clipboard', { value: undefined, configurable: true })
    document.body.innerHTML = `
      <div class="doc"><div class="listingblock"><div class="content">
        <pre class="highlight"><code data-lang="javascript">const x = 1</code></pre>
      </div></div></div>
    `
    await load()
    expect(document.querySelector('.source-actions button')).toBeNull()
  })

  it('copies the plain block text to the clipboard and shows/restores feedback', async () => {
    vi.useFakeTimers()
    const writeText = stubClipboard()
    document.body.innerHTML = `
      <div class="doc"><div class="listingblock"><div class="content">
        <pre class="highlight"><code data-lang="javascript">const x = 1</code></pre>
      </div></div></div>
    `
    await load()
    const button = document.querySelector<HTMLButtonElement>('.source-actions button')!
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledWith('const x = 1')
    expect(button.getAttribute('aria-label')).toBe('Copied to clipboard')
    vi.advanceTimersByTime(2000)
    expect(button.getAttribute('aria-label')).toBe('Copy code')
    vi.useRealTimers()
  })

  it('extracts only the $-prefixed command lines from a console block, joined with &&', async () => {
    vi.useFakeTimers()
    const writeText = stubClipboard()
    document.body.innerHTML = `
      <div class="doc"><div class="listingblock"><div class="content">
        <pre class="highlight"><code data-lang="console">$ echo one
some output line
$ echo two</code></pre>
      </div></div></div>
    `
    await load()
    const button = document.querySelector<HTMLButtonElement>('.source-actions button')!
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledWith('echo one && echo two')
    vi.useRealTimers()
  })
})
