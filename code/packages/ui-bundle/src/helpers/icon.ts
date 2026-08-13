import type { HelperOptions } from '../../types/ui'

/**
 * `{{icon group name}}` — render an IOP Design System icon.
 *
 *     {{icon "alerts" "information-outlined"}}
 *     {{icon "actions" "search-outlined" class="toolbar__icon"}}
 *     {{icon "design" "sidebar-outlined" label="On this page"}}
 *
 * Emits a reference into the vendored sprite at `img/ids-icons.svg`, which is
 * generated from `src/img/icons.yml` by `just icons-build`. An icon must be in
 * that manifest before a template can use it; `just icons-build` fails the
 * build if a template references one that is not.
 *
 * The design system's own React `<Icon>` fetches a sprite from its CDN and
 * injects it into the DOM at runtime, which produces nothing in static,
 * JavaScript-off HTML. An external `<use href>` needs neither, and the symbol
 * ids match the design system's (`sw-icons-<group>-<name>`) so the local sprite
 * stays swappable with the published one.
 *
 * Icons are decorative by default (`aria-hidden`), because they nearly always
 * sit beside their own label. Pass `label` when the icon is the only content of
 * a control and therefore carries the accessible name itself.
 */

// Names come from the manifest, but a template can pass anything; anything with
// a quote in it would break out of the attribute.
const NAME_RX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const escapeAttr = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const escapeText = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

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

const icon = (group: string, name: string, options: HelperOptions) => {
  if (!NAME_RX.test(group) || !NAME_RX.test(name)) {
    throw new Error(`Invalid icon reference "${group}/${name}": expected lowercase, hyphen-separated names`)
  }

  const uiRootPath = (options.data.root.uiRootPath as string | undefined) ?? '.'
  const href = `${uiRootPath}/img/ids-icons.svg#sw-icons-${group}-${name}`

  const classes = ['ids-icon']
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
