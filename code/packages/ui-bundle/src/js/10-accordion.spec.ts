// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

async function load() {
  vi.resetModules()
  await import('./10-accordion')
}

/** A fake Animation good enough to drive `toggle()`'s finish/cancel handling. */
function stubAnimate() {
  const listeners: Record<string, Array<() => void>> = { finish: [], cancel: [] }
  const fakeAnimation = {
    addEventListener: (type: string, fn: () => void) => listeners[type].push(fn),
    cancel: vi.fn(() => listeners.cancel.forEach((fn) => fn())),
    finish: () => listeners.finish.forEach((fn) => fn()),
  }
  const animate = vi.fn().mockReturnValue(fakeAnimation)
  // jsdom does not implement the Web Animations API at all.
  ;(HTMLElement.prototype as unknown as { animate: typeof animate }).animate = animate
  return { animate, fakeAnimation }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('accordion open/close animation', () => {
  it('does nothing when the page has no <details> under .doc at all', async () => {
    const { animate } = stubAnimate()
    document.body.innerHTML = `<div class="doc"></div>`
    await load()
    expect(animate).not.toHaveBeenCalled()
  })

  it('ignores a <details> missing the expected summary/.content shape', async () => {
    const { animate } = stubAnimate()
    document.body.innerHTML = `<div class="doc"><details><p>no summary/.content children</p></details></div>`
    await load()
    const details = document.querySelector('details')!
    details.querySelector('p')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(animate).not.toHaveBeenCalled()
  })

  it('opens with an animation from 0 to scrollHeight on summary click, preventing the native toggle', async () => {
    const { animate } = stubAnimate()
    document.body.innerHTML = `
      <div class="doc">
        <details>
          <summary>Q</summary>
          <div class="content">A</div>
        </details>
      </div>
    `
    await load()
    const details = document.querySelector('details') as HTMLDetailsElement
    const summary = details.querySelector('summary')!
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    summary.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(details.open).toBe(true)
    expect(animate).toHaveBeenCalledTimes(1)
    expect(animate.mock.calls[0][0]).toEqual([{ height: '0px' }, { height: '0px' }])
  })

  it('closes with an animation, setting details.open = false only once the animation finishes', async () => {
    const { animate, fakeAnimation } = stubAnimate()
    document.body.innerHTML = `
      <div class="doc">
        <details open>
          <summary>Q</summary>
          <div class="content">A</div>
        </details>
      </div>
    `
    await load()
    const details = document.querySelector('details') as HTMLDetailsElement
    const summary = details.querySelector('summary')!
    summary.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(animate).toHaveBeenCalledTimes(1)
    // Still open — closing only happens on the animation's own finish callback.
    expect(details.open).toBe(true)
    fakeAnimation.finish()
    expect(details.open).toBe(false)
  })

  it('cancels a pending animation on the same content before starting a new one', async () => {
    const { animate, fakeAnimation } = stubAnimate()
    document.body.innerHTML = `
      <div class="doc">
        <details>
          <summary>Q</summary>
          <div class="content">A</div>
        </details>
      </div>
    `
    await load()
    const summary = document.querySelector('summary')!
    summary.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    summary.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(fakeAnimation.cancel).toHaveBeenCalledTimes(1)
    expect(animate).toHaveBeenCalledTimes(2)
  })
})

describe('accordion group keyboard roving focus', () => {
  function group() {
    return `
      <div class="docouture-accordion-group">
        <details><summary id="s1">One</summary><div class="content">A</div></details>
        <details><summary id="s2">Two</summary><div class="content">B</div></details>
        <details><summary id="s3">Three</summary><div class="content">C</div></details>
      </div>
    `
  }

  it('moves focus to the next/previous header on ArrowDown/ArrowUp, wrapping at the ends', async () => {
    stubAnimate()
    document.body.innerHTML = `<div class="doc">${group()}</div>`
    await load()
    const summaries = [...document.querySelectorAll('summary')] as HTMLElement[]
    for (const s of summaries) s.focus = vi.fn()

    summaries[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    expect(summaries[1].focus).toHaveBeenCalled()

    summaries[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))
    expect(summaries[2].focus).toHaveBeenCalled()
  })

  it('moves focus to the first/last header on Home/End', async () => {
    stubAnimate()
    document.body.innerHTML = `<div class="doc">${group()}</div>`
    await load()
    const summaries = [...document.querySelectorAll('summary')] as HTMLElement[]
    for (const s of summaries) s.focus = vi.fn()

    summaries[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }))
    expect(summaries[0].focus).toHaveBeenCalled()

    summaries[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))
    expect(summaries[2].focus).toHaveBeenCalled()
  })

  it('ignores a key it does not handle', async () => {
    stubAnimate()
    document.body.innerHTML = `<div class="doc">${group()}</div>`
    await load()
    const summaries = [...document.querySelectorAll('summary')] as HTMLElement[]
    for (const s of summaries) s.focus = vi.fn()
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    summaries[0].dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(summaries.some((s) => (s.focus as ReturnType<typeof vi.fn>).mock.calls.length > 0)).toBe(false)
  })

  it('gives no roving focus to a standalone [%collapsible] outside any group', async () => {
    stubAnimate()
    document.body.innerHTML = `
      <div class="doc"><details><summary id="lone">Lone</summary><div class="content">A</div></details></div>
    `
    await load()
    const summary = document.getElementById('lone')!
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    expect(() => summary.dispatchEvent(event)).not.toThrow()
    expect(event.defaultPrevented).toBe(false)
  })
})
