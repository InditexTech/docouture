// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

/**
 * Derives, from `playbook.site.url`, the path prefix and the absolute base URL
 * that static build outputs (search index, llms.txt) need to prepend to an
 * Antora `pub.url`, which is always relative to the site root. Mirrors the
 * three forms @antora/page-composer's build-ui-model.js accepts: a full URL,
 * a leading-`/` path, or `/`.
 *
 * @param {String} [siteUrl]
 * @returns {{ pathPrefix: String, baseUrl: String }}
 */
module.exports = function siteUrlParts(siteUrl) {
  if (typeof siteUrl !== 'string' || !siteUrl) return { pathPrefix: '', baseUrl: '' }
  if (siteUrl.charAt(0) === '/') return { pathPrefix: stripTrailingSlashes(siteUrl), baseUrl: '' }
  let pathname
  try {
    pathname = new URL(siteUrl).pathname
  } catch {
    return { pathPrefix: '', baseUrl: '' }
  }
  return { pathPrefix: stripTrailingSlashes(pathname), baseUrl: stripTrailingSlashes(siteUrl) }
}

function stripTrailingSlashes(value) {
  return value.replace(/\/+$/, '')
}
