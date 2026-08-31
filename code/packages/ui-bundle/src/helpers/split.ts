// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

/**
 * `{{split str sep}}` — split a delimited string into trimmed, non-empty parts.
 *
 *     {{#each (split page.attributes.tags ',')}}<li>{{this}}</li>{{/each}}
 *
 * `str` is typically an AsciiDoc page attribute (`:page-tags: Beta, Internal`),
 * which Asciidoctor hands back as a single string — never pre-split. Returns
 * `[]` for an absent attribute so `{{#each}}` renders nothing rather than
 * throwing.
 */
const split = (str: string | undefined, sep: string): string[] => {
  if (!str) return []
  return str
    .split(sep)
    .map((part) => part.trim())
    .filter(Boolean)
}

export = split
