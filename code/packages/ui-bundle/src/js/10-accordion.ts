/*
 * `<details>` height animation (GH-61 Part 1 follow-up) + `[accordion]`
 * group keyboard nav (Part 2) — layered onto the server-rendered markup
 * both `[%collapsible]` (plain Asciidoctor, no extension involved) and
 * `asciidoc-extensions/lib/accordion.js` (a `.pdocs-accordion-group`
 * wrapping the same `<details>` shape) emit. Every `<details>` under
 * `.doc` is already a fully working, independently togglable disclosure
 * with NO script at all (that is Part 1's whole point) — single-open, when
 * the author asked for it, already works with no script too — `<details
 * name="…">`, patched on by the extension, is native-browser radio-group
 * behaviour (Chrome 120+/Safari 17.2+/Firefox 130+; older browsers degrade
 * to every item independent, never broken).
 *
 * So this file adds exactly two things neither of those has on their own:
 *
 *   1. A height animation on open/close, eased by the DS's own
 *      `--ids-motion-duration-s-high` / `--ids-motion-easing-standard-3`
 *      (`accordion.css`'s own comment on `.doc details > .content` has the
 *      full grounding: the real `AccordionItem`'s content is a
 *      `<Visibility animation="expand">`, not the icon's `micro-appear`)
 *      — read at animation time via `getComputedStyle`, not hard-coded, so
 *      it collapses to ~0 for free under `prefers-reduced-motion` exactly
 *      the way the tokens themselves already do (`ids-tokens.css`) for
 *      every other consumer. Applied to EVERY `<details>` under `.doc` —
 *      a standalone `[%collapsible]` gets the exact same animation as one
 *      inside an `[accordion]` group; there is no behavioural difference
 *      between the two shapes this file treats as worth having.
 *
 *   2. Arrow-Down/Up + Home/End moves focus directly between a GROUP's own
 *      headers, matching the DS's own `Accordion.handleKeyDown`
 *      (wraparound included) — real behaviour, not a hint: the APG
 *      accordion pattern does NOT rove `tabindex` the way a tablist does
 *      (verified against the DS: `cloneElement` in `accordion.js` never
 *      passes a `tabIndex` to its children), so every header stays in the
 *      normal tab order and the arrow keys only ever move focus, never
 *      remove a stop from Tab. Deliberately scoped to `.pdocs-accordion-
 *      group` only, unlike (1): roving focus between `<details>` elements
 *      that have nothing to do with each other (two unrelated
 *      `[%collapsible]`s three sections apart) would move focus somewhere
 *      the reader has no reason to expect it, which is exactly what the
 *      APG pattern this mirrors reserves for members of ONE accordion.
 *
 * Neither changes what happens with script disabled or before this runs:
 * every `<summary>` is a real, already-functional disclosure button: this
 * only intercepts its OWN click to animate rather than snap, and restores
 * plain behaviour (`details.open = …`) either way.
 *
 * LIMITATION, DELIBERATE: single-open's OWN exclusivity (closing sibling
 * items when one opens) is entirely the browser's native `<details name>`
 * behaviour, not this file's — this file only ever animates the ONE
 * `<details>` the reader actually activated. A sibling the browser auto-
 * closes as a side effect closes instantly, un-animated, the same way it
 * would with no script at all. Animating every side-effected sibling too
 * would mean re-deriving the browser's own exclusivity logic in JS to know
 * which ones just closed — real duplication for a transition on an element
 * the reader's attention has already left.
 */
;(function () {
  'use strict'

  var allDetails = [].slice.call(document.querySelectorAll<HTMLDetailsElement>('.doc details'))
  if (!allDetails.length) return

  allDetails.forEach(function (details: HTMLDetailsElement) {
    var summary = details.querySelector<HTMLElement>(':scope > summary')
    var content = details.querySelector<HTMLElement>(':scope > .content')
    // One or the other missing means this isn't the shape either Part 1 or
    // Part 2 emits — leave it in its plain, unenhanced, still-working state.
    if (!summary || !content) return

    summary.addEventListener('click', function (e: MouseEvent) {
      // The native toggle is what's replaced by the animated one below —
      // without preventDefault this fires twice, once instantly (native)
      // and once animated (ours), fighting each other.
      e.preventDefault()
      toggle(details, content as HTMLElement)
    })
  })

  // Keyboard roving focus, unlike the animation above, is scoped to items
  // that share a `.pdocs-accordion-group` — see the header comment's point
  // (2) for why a standalone `[%collapsible]` deliberately gets none of it.
  var groups = [].slice.call(document.querySelectorAll<HTMLElement>('.pdocs-accordion-group'))
  groups.forEach(function (group: HTMLElement) {
    var items = [].slice.call(group.querySelectorAll<HTMLDetailsElement>(':scope > details'))
    var summaries = items.map(function (details: HTMLDetailsElement) {
      return details.querySelector<HTMLElement>(':scope > summary')
    })

    items.forEach(function (_details: HTMLDetailsElement, index: number) {
      var summary = summaries[index]
      if (!summary) return

      summary.addEventListener('keydown', function (e: KeyboardEvent) {
        var next = keyTarget(e.key, index, summaries.length)
        if (next === null) return
        e.preventDefault()
        var target = summaries[next]
        if (target) target.focus()
      })
    })
  })

  /** The header the pressed key moves focus to, or `null` for a key this widget ignores. */
  function keyTarget(key: string, index: number, count: number): number | null {
    if (key === 'ArrowDown') return (index + 1) % count
    if (key === 'ArrowUp') return (index - 1 + count) % count
    if (key === 'Home') return 0
    if (key === 'End') return count - 1
    return null
  }

  /**
   * Opens or closes `details`, animating `content`'s height across the
   * change rather than snapping — the content is always actually present
   * in the DOM either way (`details.open` toggling, nothing removed or
   * added), so a reader with script disabled or a screen reader gets
   * exactly the same end state, just without the transition between them.
   */
  function toggle (details: HTMLDetailsElement, content: HTMLElement) {
    var opening = !details.open
    var motion = readMotion(content)
    if (opening) {
      // Opened FIRST, synchronously — the content has to actually be in the
      // rendered (not `display: none`) tree before `scrollHeight` means
      // anything, and before this can be announced as expanded.
      details.open = true
      animate(content, 0, content.scrollHeight, motion, null)
    } else {
      var from = content.scrollHeight
      animate(content, from, 0, motion, function () {
        details.open = false
      })
    }
  }

  /**
   * The duration and easing this document's own theme has set for the
   * `transition` on `.doc details > .content` — `--ids-motion-duration-s-
   * high` / `--ids-motion-easing-standard-3` (`accordion.css`'s own
   * comment on that rule has the full grounding against the real DS's
   * `<Visibility animation="expand">`) — read off `el` rather than
   * assumed, and already ~0 under `prefers-reduced-motion`
   * (`ids-tokens.css`), which this inherits for free by never hard-coding
   * a duration of its own. Deliberately a DIFFERENT pairing than the
   * chevron's own rotation (`accordion.css`'s `summary::after`, still
   * `--ids-motion-micro-appear`) — the real component doesn't reuse one
   * for the other either, so the two animate independently, at different
   * speeds, exactly as shipped.
   *
   * Used whole, NOT `.split(',')[0]` — `accordion.css` only ever declares
   * one `transition` on this element, so there is only ever one value to
   * read, and a naive comma-split breaks it anyway: a `cubic-bezier(...)`
   * takes four comma-separated numbers as ITS OWN arguments, so splitting
   * on every comma in the computed value truncates `cubic-bezier(0,0,
   * 0.58,1)` down to `cubic-bezier(0` — not a valid easing, which made
   * `Element.animate()` throw synchronously on EVERY toggle, open or
   * close. Opening still LOOKED like it worked regardless: `toggle()`
   * sets `details.open = true` before calling `animate()`, so the throw
   * came after the part that actually mattered. Closing has no such head
   * start — `details.open = false` only ever runs from `animate()`'s own
   * finish callback below, so the same throw meant a closed state that
   * never arrived: the item stayed open, unclosable, from the reader's
   * own click onward.
   */
  function readMotion (el: HTMLElement): { duration: number; easing: string } {
    var cs = getComputedStyle(el)
    var duration = parseFloat(cs.transitionDuration) * 1000
    var easing = cs.transitionTimingFunction.trim()
    return { duration: duration || 0, easing: easing || 'ease' }
  }

  /**
   * Animates `el`'s height between `from` and `to` with the Web Animations
   * API — CSS transitions can't animate to/from `auto`, which is the only
   * height a block of arbitrary authored content (prose, a table, nested
   * blocks) actually has, so the end points are measured in pixels instead
   * and the animation is thrown away (`cancel()`) rather than left
   * pinning the element at a stale pixel height once it finishes.
   */
  function animate (el: HTMLElement, from: number, to: number, motion: { duration: number; easing: string }, onDone: (() => void) | null) {
    var pending = (el as HTMLElement & { pdocsAccordionAnimation?: Animation }).pdocsAccordionAnimation
    if (pending) pending.cancel()

    el.style.overflow = 'hidden'
    var anim = el.animate([{ height: from + 'px' }, { height: to + 'px' }], {
      duration: motion.duration,
      easing: motion.easing,
    })
    ;(el as HTMLElement & { pdocsAccordionAnimation?: Animation }).pdocsAccordionAnimation = anim

    anim.addEventListener('finish', finish)
    anim.addEventListener('cancel', finish)

    function finish () {
      el.style.overflow = ''
      el.style.height = ''
      ;(el as HTMLElement & { pdocsAccordionAnimation?: Animation }).pdocsAccordionAnimation = undefined
      if (onDone) onDone()
    }
  }
})()
