/**
 * `{{includes list value}}` — whitespace-split membership test.
 *
 *     {{#unless (includes page.role '-hero')}}{{> hero}}{{/unless}}
 *
 * `list` is a raw AsciiDoc role string (`:page-role: -hero`, possibly several
 * space-separated roles) rather than something pre-split — the same shape
 * `main.css`'s `body.-toc` selector and `02-on-this-page.ts`'s
 * `body.-toc` query already rely on, there via the browser's own class-list
 * splitting rather than an explicit split. This helper does the equivalent
 * check at template time, for a decision (rendering the hero at all) that
 * cannot be made in CSS.
 */
const includes = (list: string | undefined, value: string): boolean => {
  if (!list) return false
  return list.split(/\s+/).includes(value)
}

export = includes
