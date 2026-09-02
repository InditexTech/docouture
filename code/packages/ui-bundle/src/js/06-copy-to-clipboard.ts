// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: MPL-2.0

;(function () {
  'use strict'

  var CMD_RX = /^\$ (\S[^\\\n]*(\\\n(?!\$ )[^\\\n]*)*)(?=\n|$)/gm
  var LINE_CONTINUATION_RX = /( ) *\\\n *|\\\n( ?) */g
  var TRAILING_SPACE_RX = / +$/gm

  var config: Record<string, string | undefined> =
    (document.getElementById('site-script') || { dataset: {} }).dataset
  var supportsCopy = window.navigator.clipboard
  var uiRootPath = (config.uiRootPath == null ? window.uiRootPath : config.uiRootPath) || '.'

  // GH-12 (A6) follow-up (design review): both action-bar buttons are
  // icon-only ghost buttons now — no visible "copy code" label — real
  // `.dt-button` markup (see button/button.js in the DS sidecar for the
  // shape this mirrors) so they pick up dt-components.css and the dark
  // token scope doc.css/dt-tokens.css give `.doc .listingblock >
  // .content` for free. Copy feedback, with no label left to swap, is the
  // icon itself swapping to a checkmark plus a visually-hidden live
  // region for screen readers — same split fullscreen's icon+aria-pressed
  // swap already uses, just with an announcement added since a checkmark
  // alone says nothing to anyone not looking at it.
  function icon (name: string): SVGSVGElement {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'dt-icon')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('focusable', 'false')
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
    use.setAttribute('href', uiRootPath + '/img/icons.svg#icon-' + name)
    svg.appendChild(use)
    return svg
  }

  ;[].slice.call(document.querySelectorAll('.doc pre.highlight, .doc .literalblock pre')).forEach(function (pre) {
    var code, language, lang, toolbox, actions

    if (pre.classList.contains('highlight')) {
      code = pre.querySelector('code')
      language = code.dataset.lang
      if (language && language !== 'console') {
        lang = document.createElement('span')
        lang.className = 'source-lang'
        lang.appendChild(document.createTextNode(language))
      }
    } else if (pre.innerText.startsWith('$ ')) {
      var block = pre.parentNode.parentNode
      block.classList.remove('literalblock')
      block.classList.add('listingblock')
      pre.classList.add('highlightjs', 'highlight')
      code = document.createElement('code')
      code.className = 'language-console hljs'
      code.dataset.lang = 'console'
      while (pre.hasChildNodes()) code.appendChild(pre.firstChild)
      pre.appendChild(code)
    } else {
      return
    }

    var content = pre.parentNode // .listingblock > .content, also the fullscreen target

    toolbox = document.createElement('div')
    toolbox.className = 'source-toolbox'
    if (lang) toolbox.appendChild(lang)
    actions = document.createElement('div')
    actions.className = 'source-actions'
    toolbox.appendChild(actions)

    if (supportsCopy) {
      var copyButton = document.createElement('button')
      copyButton.className = 'dt-button dt-button--ghost dt-button--icon-only'
      copyButton.type = 'button'
      copyButton.setAttribute('aria-label', 'Copy code')
      var copyContent = document.createElement('div')
      copyContent.className = 'dt-button__content'
      var copyIconSlot = document.createElement('span')
      copyIconSlot.className = 'dt-button__icon dt-button__icon-icon'
      copyIconSlot.setAttribute('aria-hidden', 'true')
      var copyIcon = icon('copy')
      copyIconSlot.appendChild(copyIcon)
      copyContent.appendChild(copyIconSlot)
      copyButton.appendChild(copyContent)
      var copyLiveRegion = document.createElement('span')
      copyLiveRegion.className = 'visually-hidden'
      copyLiveRegion.setAttribute('aria-live', 'polite')
      copyButton.appendChild(copyLiveRegion)
      actions.appendChild(copyButton)
      copyButton.addEventListener('click', writeToClipboard.bind(null, code, copyButton, copyIcon, copyLiveRegion))
    }

    // requestFullscreen/fullscreenElement is unprefixed in every currently
    // supported browser (this bundle's browserslist target is "last 2
    // versions, not dead") — no vendor-prefixed fallback needed. Where the
    // API genuinely doesn't exist (rare embedded webviews), the button is
    // simply not rendered rather than shipping one that does nothing.
    if (document.fullscreenEnabled && content.requestFullscreen) {
      var fullscreenButton = document.createElement('button')
      fullscreenButton.className = 'dt-button dt-button--ghost dt-button--icon-only'
      fullscreenButton.type = 'button'
      fullscreenButton.setAttribute('aria-pressed', 'false')
      fullscreenButton.setAttribute('aria-label', 'View full screen')
      var fullscreenContent = document.createElement('div')
      fullscreenContent.className = 'dt-button__content'
      var fullscreenIconSlot = document.createElement('span')
      fullscreenIconSlot.className = 'dt-button__icon dt-button__icon-icon'
      fullscreenIconSlot.setAttribute('aria-hidden', 'true')
      var fullscreenIcon = icon('maximize')
      fullscreenIconSlot.appendChild(fullscreenIcon)
      fullscreenContent.appendChild(fullscreenIconSlot)
      fullscreenButton.appendChild(fullscreenContent)
      actions.appendChild(fullscreenButton)

      fullscreenButton.addEventListener('click', function () {
        if (document.fullscreenElement === content) document.exitFullscreen()
        else content.requestFullscreen()
      })
      content.addEventListener('fullscreenchange', function () {
        var active = document.fullscreenElement === content
        fullscreenButton.setAttribute('aria-pressed', String(active))
        fullscreenButton.setAttribute('aria-label', active ? 'Exit full screen' : 'View full screen')
        fullscreenIcon.querySelector('use').setAttribute(
          'href',
          uiRootPath + '/img/icons.svg#icon-' + (active ? 'minimize' : 'maximize')
        )
      })
    }

    // Prepended, not appended: `.content` is a flex column now (the action
    // bar is a normal row above the code, not an absolute overlay — see
    // doc.css), so DOM order is visual order. `pre` is already `.content`'s
    // only child at this point (server-rendered), so this always puts the
    // bar first.
    content.insertBefore(toolbox, content.firstChild)
  })

  function extractCommands (text) {
    var cmds = []
    var m
    while ((m = CMD_RX.exec(text))) cmds.push(m[1].replace(LINE_CONTINUATION_RX, '$1$2'))
    return cmds.join(' && ')
  }

  function writeToClipboard (code, button, iconEl, liveRegion) {
    var text = code.innerText.replace(TRAILING_SPACE_RX, '')
    if (code.dataset.lang === 'console' && text.startsWith('$ ')) text = extractCommands(text)
    window.navigator.clipboard.writeText(text).then(
      function () {
        iconEl.querySelector('use').setAttribute('href', uiRootPath + '/img/icons.svg#icon-circle-check-big')
        button.setAttribute('aria-label', 'Copied to clipboard')
        liveRegion.textContent = 'Copied to clipboard'
        setTimeout(function () {
          iconEl.querySelector('use').setAttribute('href', uiRootPath + '/img/icons.svg#icon-copy')
          button.setAttribute('aria-label', 'Copy code')
          liveRegion.textContent = ''
        }, 2000)
      },
      function () {}
    )
  }
})()

// Empty export makes this a real ES module for TypeScript's purposes (it
// otherwise has no top-level import/export, so tsc treats a `06-copy-to-clipboard.spec.ts`
// dynamically importing it as TS2306 "not a module") — a genuine no-op at
// runtime, esbuild strips it, the IIFE above still runs for its side effects
// exactly the same.
export {}
