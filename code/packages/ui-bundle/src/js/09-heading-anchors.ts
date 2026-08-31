;(function () {
  'use strict'

  // GH-11 (Figma 2672:47091/3615:59166), extended to h3–h5 per design
  // review: every `.sect1`–`.sect4` heading already renders a working
  // `<a class="anchor" href="#…">` server-side — Asciidoctor's own
  // `sectanchors` attribute, set by every playbook and the preview harness
  // — so the acceptance criterion ("anchors present with JavaScript
  // disabled") is already met before this file runs. What's progressive is
  // the icon and the clipboard feedback: this upgrades that plain anchor
  // into the design's ghost icon button, same split 06-copy-to-clipboard.ts
  // makes for code blocks (a real `<pre>` either way, a copy button only
  // when script runs). `h1`/`h6` are deliberately excluded — they keep the
  // plain hover-`§` permalink instead (doc.css has the full story).
  var config: Record<string, string | undefined> =
    (document.getElementById('site-script') || { dataset: {} }).dataset
  var supportsCopy = window.navigator.clipboard
  var uiRootPath = (config.uiRootPath == null ? window.uiRootPath : config.uiRootPath) || '.'

  if (!supportsCopy) return

  ;[].slice
    .call(
      document.querySelectorAll(
        '.doc h2:not(.discrete) > a.anchor, .doc h3:not(.discrete) > a.anchor, ' +
          '.doc h4:not(.discrete) > a.anchor, .doc h5:not(.discrete) > a.anchor'
      )
    )
    .forEach(function (anchor: HTMLAnchorElement) {
      anchor.setAttribute('aria-label', 'Copy link to this section')

      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('class', 'dt-icon')
      svg.setAttribute('aria-hidden', 'true')
      svg.setAttribute('focusable', 'false')
      var use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
      use.setAttribute('href', uiRootPath + '/img/icons.svg#icon-link')
      svg.appendChild(use)
      anchor.appendChild(svg)

      var toast = document.createElement('span')
      toast.className = 'copy-toast'
      toast.setAttribute('aria-live', 'polite')
      toast.appendChild(document.createTextNode('Copied!'))
      anchor.appendChild(toast)
      anchor.classList.add('copy-button')

      // The href is already the right fragment; default navigation stays
      // intact (fragment-jumper.ts drives the offset scroll) so the URL bar
      // ends up showing exactly what was just copied. `href` is read fresh
      // rather than cached, matching how the anchor itself was rendered.
      anchor.addEventListener('click', function () {
        var url = window.location.href.replace(/#.*$/, '') + anchor.getAttribute('href')
        window.navigator.clipboard.writeText(url).then(
          function () {
            anchor.classList.add('clicked')
            anchor.offsetHeight // force reflow so the animation restarts
            anchor.classList.remove('clicked')
          },
          function () {}
        )
      })
    })
})()
