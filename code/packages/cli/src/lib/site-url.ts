// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// The commented hint antora-playbook.yml carries when no site URL is known —
// same text the template shipped before `docouture new` started asking.
const SITE_URL_HINT_LINE = '  # url: https://<org>.github.io/<repo>\n'

export type SiteUrlResult = { ok: true; value: string | undefined } | { ok: false; error: string }

// Trims, treats empty as "skip" (value undefined), requires an http(s) URL
// otherwise, and strips trailing slashes — Antora's `site.url` takes no
// trailing slash. Shared by the wizard validator, the --site-url flag and
// the origin-derived default so all three agree.
export function normalizeSiteUrl(raw: string): SiteUrlResult {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: true, value: undefined }
  if (!/^https?:\/\/\S+$/.test(trimmed)) {
    return { ok: false, error: `expected an http(s) URL such as 'https://docs.example.com', got '${raw}'` }
  }
  return { ok: true, value: trimmed.replace(/\/+$/, '') }
}

// The whole `site.url` line for antora-playbook.yml (see
// TemplateValues.siteUrlLine): active when a URL is known, else the hint.
export function siteUrlLine(url: string | undefined): string {
  return url === undefined ? SITE_URL_HINT_LINE : `  url: ${url}\n`
}
