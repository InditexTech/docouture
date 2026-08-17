;(function () {
  'use strict'

  var CMD_RX = /^\$ (\S[^\\\n]*(\\\n(?!\$ )[^\\\n]*)*)(?=\n|$)/gm
  var LINE_CONTINUATION_RX = /( ) *\\\n *|\\\n( ?) */g
  var TRAILING_SPACE_RX = / +$/gm

  var config: Record<string, string | undefined> =
    (document.getElementById('site-script') || { dataset: {} }).dataset
  var supportsCopy = window.navigator.clipboard
  var uiRootPath = (config.uiRootPath == null ? window.uiRootPath : config.uiRootPath) || '.'

  // GH-12 (A6): the action bar is the design's IDS Code Block (Figma
  // 2610:24218) — a ghost "copy code" button (icon + label) and, where the
  // Fullscreen API exists, an icon-only ghost fullscreen toggle — replacing
  // the plain icon-and-toast this bundle shipped before. Both buttons are
  // real `.ids-button` markup (see button/button.js in the DS sidecar for
  // the shape this mirrors) so they pick up ids-components.css and the dark
  // token scope doc.css/ids-tokens.css give `.doc .listingblock > .content`
  // for free — no bundle-authored button styling here.
  function icon (name: string): SVGSVGElement {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'ids-icon')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('focusable', 'false')
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
    use.setAttribute('href', uiRootPath + '/img/ids-icons.svg#sw-icons-' + name)
    svg.appendChild(use)
    return svg
  }

  ;[].slice.call(document.querySelectorAll('.doc pre.highlight, .doc .literalblock pre')).forEach(function (pre) {
    var code, language, lang, toolbox, actions

    if (pre.classList.contains('highlight')) {
      code = pre.querySelector('code')
      if ((language = code.dataset.lang) && language !== 'console') {
        ;(lang = document.createElement('span')).className = 'source-lang'
        lang.appendChild(document.createTextNode(language))
      }
    } else if (pre.innerText.startsWith('$ ')) {
      var block = pre.parentNode.parentNode
      block.classList.remove('literalblock')
      block.classList.add('listingblock')
      pre.classList.add('highlightjs', 'highlight')
      ;(code = document.createElement('code')).className = 'language-console hljs'
      code.dataset.lang = 'console'
      while (pre.hasChildNodes()) code.appendChild(pre.firstChild)
      pre.appendChild(code)
    } else {
      return
    }

    var content = pre.parentNode // .listingblock > .content, also the fullscreen target

    ;(toolbox = document.createElement('div')).className = 'source-toolbox'
    if (lang) toolbox.appendChild(lang)
    ;(actions = document.createElement('div')).className = 'source-actions'
    toolbox.appendChild(actions)

    if (supportsCopy) {
      var copyButton = document.createElement('button')
      copyButton.className = 'ids-button ids-button--ghost ids-button--icon-and-label'
      copyButton.type = 'button'
      var copyContent = document.createElement('div')
      copyContent.className = 'ids-button__content'
      var copyIconSlot = document.createElement('span')
      copyIconSlot.className = 'ids-button__icon ids-button__icon-icon'
      copyIconSlot.setAttribute('aria-hidden', 'true')
      copyIconSlot.appendChild(icon('actions-copy-outlined'))
      var copyLabel = document.createElement('span')
      copyLabel.className = 'ids-button__label'
      copyLabel.setAttribute('aria-live', 'polite')
      var copyLabelText = document.createTextNode('copy code')
      copyLabel.appendChild(copyLabelText)
      copyContent.appendChild(copyIconSlot)
      copyContent.appendChild(copyLabel)
      copyButton.appendChild(copyContent)
      actions.appendChild(copyButton)
      copyButton.addEventListener('click', writeToClipboard.bind(null, code, copyLabelText))
    }

    // requestFullscreen/fullscreenElement is unprefixed in every currently
    // supported browser (this bundle's browserslist target is "last 2
    // versions, not dead") — no vendor-prefixed fallback needed. Where the
    // API genuinely doesn't exist (rare embedded webviews), the button is
    // simply not rendered rather than shipping one that does nothing.
    if (document.fullscreenEnabled && content.requestFullscreen) {
      var fullscreenButton = document.createElement('button')
      fullscreenButton.className = 'ids-button ids-button--ghost ids-button--icon-only'
      fullscreenButton.type = 'button'
      fullscreenButton.setAttribute('aria-pressed', 'false')
      fullscreenButton.setAttribute('aria-label', 'View full screen')
      var fullscreenContent = document.createElement('div')
      fullscreenContent.className = 'ids-button__content'
      var fullscreenIconSlot = document.createElement('span')
      fullscreenIconSlot.className = 'ids-button__icon ids-button__icon-icon'
      fullscreenIconSlot.setAttribute('aria-hidden', 'true')
      var fullscreenIcon = icon('actions-full-screen-enter-outlined')
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
          uiRootPath + '/img/ids-icons.svg#sw-icons-actions-full-screen-' + (active ? 'exit' : 'enter') + '-outlined'
        )
      })
    }

    content.appendChild(toolbox)
  })

  function extractCommands (text) {
    var cmds = []
    var m
    while ((m = CMD_RX.exec(text))) cmds.push(m[1].replace(LINE_CONTINUATION_RX, '$1$2'))
    return cmds.join(' && ')
  }

  // Feedback is the button's own label swapping to "copied" for a couple of
  // seconds (aria-live="polite" on the label announces it) rather than the
  // toast pill heading-anchors still uses — the design's ghost button has no
  // toast, and this is the one caller left that would still have wanted one.
  function writeToClipboard (code, labelText) {
    var text = code.innerText.replace(TRAILING_SPACE_RX, '')
    if (code.dataset.lang === 'console' && text.startsWith('$ ')) text = extractCommands(text)
    window.navigator.clipboard.writeText(text).then(
      function () {
        var original = labelText.data
        labelText.data = 'copied'
        setTimeout(function () {
          labelText.data = original
        }, 2000)
      },
      function () {}
    )
  }
})()
