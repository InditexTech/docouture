// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

import type { HelperOptions } from '../../types/ui'

/**
 * `{{icon name}}` — render an icon from this bundle's vendored sprite.
 *
 *     {{icon "triangle-alert"}}
 *     {{icon "x" class="toolbar__icon"}}
 *     {{icon "panel-left" label="On this page"}}
 *
 * Emits a reference into the vendored sprite at `img/icons.svg`, which is
 * generated from `src/img/icons.yml` by `just icons-build`. An icon must be in
 * that manifest before a template can use it; `just icons-build` fails the
 * build if a template references one that is not.
 *
 * Names are Lucide's own (lucide.dev/icons/<name>) — an external `<use href>`
 * produces the icon in static, JavaScript-off HTML with no client-side
 * fetch/inject step, and the symbol id (`icon-<name>`) is just that name
 * prefixed, so a sprite id can never collide with an unrelated element id
 * elsewhere on a page.
 *
 * Icons are decorative by default (`aria-hidden`), because they nearly always
 * sit beside their own label. Pass `label` when the icon is the only content of
 * a control and therefore carries the accessible name itself.
 */

// Names come from the manifest, but a template can pass anything; anything with
// a quote in it would break out of the attribute.
const NAME_RX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const escapeAttr = (value: string): string =>
  value.replaceAll(/&/g, '&amp;').replaceAll(/</g, '&lt;').replaceAll(/>/g, '&gt;').replaceAll(/"/g, '&quot;')

const escapeText = (value: string): string =>
  value.replaceAll(/&/g, '&amp;').replaceAll(/</g, '&lt;').replaceAll(/>/g, '&gt;')

/**
 * A Handlebars SafeString without importing Handlebars.
 *
 * Helpers are required by Antora out of the UI bundle, not out of this
 * package's `node_modules`, so `require('handlebars')` here would resolve
 * against whatever Antora happens to have. `escapeExpression` duck-types its
 * input — anything with `toHTML()` is passed through unescaped — so returning
 * this shape means `{{icon}}` works without needing the triple-stash form.
 */
const safe = (html: string) => ({ toHTML: () => html, toString: () => html })

const icon = (name: string, options: HelperOptions) => {
  if (!NAME_RX.test(name)) {
    throw new Error(`Invalid icon reference "${name}": expected a lowercase, hyphen-separated name`)
  }

  const uiRootPath = (options.data.root.uiRootPath as string | undefined) ?? '.'
  const href = `${uiRootPath}/img/icons.svg#icon-${name}`

  const classes = ['dt-icon']
  const extra = options.hash.class
  if (typeof extra === 'string' && extra) classes.push(extra)

  const label = options.hash.label
  const labelled = typeof label === 'string' && label !== ''

  // focusable="false" is not redundant with aria-hidden: without it the SVG
  // takes tab focus in some engines even when hidden from assistive technology.
  const attrs = [
    `class="${escapeAttr(classes.join(' '))}"`,
    labelled ? 'role="img"' : 'aria-hidden="true"',
    'focusable="false"',
  ]
  const title = labelled ? `<title>${escapeText(label as string)}</title>` : ''

  return safe(`<svg ${attrs.join(' ')}>${title}<use href="${escapeAttr(href)}"></use></svg>`)
}

export = icon
