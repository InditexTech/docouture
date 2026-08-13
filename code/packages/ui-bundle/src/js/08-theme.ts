;(function () {
  'use strict'

  var STORAGE_KEY = 'ids-theme'
  var THEMES = ['light', 'dark']

  var root = document.documentElement

  function current () {
    return root.classList.contains('ids-theme-dark') ? 'dark' : 'light'
  }

  /**
   * Apply a theme. IDS keys every component stylesheet off a class on the root
   * element, so the class is the source of truth; color-scheme keeps native
   * form controls, scrollbars and the canvas in step.
   */
  function apply (theme) {
    THEMES.forEach(function (it) {
      root.classList.toggle('ids-theme-' + it, it === theme)
    })
    root.style.colorScheme = theme
  }

  function label (button, theme) {
    var next = theme === 'dark' ? 'light' : 'dark'
    button.setAttribute('aria-label', 'Switch to ' + next + ' theme')
    button.setAttribute('title', 'Switch to ' + next + ' theme')
    button.setAttribute('aria-pressed', String(theme === 'dark'))
  }

  var button = document.querySelector('.theme-toggle') as HTMLButtonElement | null
  if (!button) return

  // The control does nothing without JavaScript, so it is hidden until wired up
  // rather than shipped as a dead button.
  button.hidden = false
  label(button, current())

  button.addEventListener('click', function () {
    var theme = current() === 'dark' ? 'light' : 'dark'
    apply(theme)
    label(button, theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch (e) {
      // private browsing, or storage disabled: the choice simply does not persist
    }
  })

  // Follow the OS while the reader has expressed no preference of their own.
  var media = window.matchMedia('(prefers-color-scheme: dark)')
  var onSystemChange = function (e) {
    var stored
    try {
      stored = localStorage.getItem(STORAGE_KEY)
    } catch (err) {
      // storage disabled: treat it as no stored preference
    }
    if (stored === 'light' || stored === 'dark') return
    var theme = e.matches ? 'dark' : 'light'
    apply(theme)
    label(button, theme)
  }
  if (media.addEventListener) media.addEventListener('change', onSystemChange)
  else if (media.addListener) media.addListener(onSystemChange)
})()
