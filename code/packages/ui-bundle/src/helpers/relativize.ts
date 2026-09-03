// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: MPL-2.0

import { posix as path } from 'node:path'

import type { HelperOptions } from '../../types/ui'

const isDir = (str: string): boolean => str.at(-1) === '/'

/**
 * `{{relativize to}}` — rewrite a root-relative URL as a URL relative to the
 * current page, so the generated site works when served from a subdirectory or
 * straight off the filesystem.
 *
 * Supports both the current invocation (`to`, options) and the legacy
 * three-argument form (`to`, `from`, options).
 */
function relativize(to: string | undefined, ctx: HelperOptions): string
function relativize(to: string | undefined, from: string, ctx: HelperOptions): string
function relativize(to: string | undefined, fromOrCtx: string | HelperOptions, maybeCtx?: HelperOptions): string {
  if (!to) return '#'
  if (to.charAt(0) !== '/') return to

  // NOTE only the legacy invocation provides both `to` and `from`
  const ctx: HelperOptions = maybeCtx ?? (fromOrCtx as HelperOptions)
  const from = maybeCtx ? (fromOrCtx as string) : ctx.data.root.page.url
  if (!from) return (ctx.data.root.site.path || '') + to

  let hash = ''
  const hashIdx = to.indexOf('#')
  if (hashIdx !== -1) {
    hash = to.slice(hashIdx)
    to = to.slice(0, hashIdx)
  }

  if (to === from) return hash || (isDir(to) ? './' : path.basename(to))

  const rel = path.relative(path.dirname(from + '.'), to)
  if (rel) return (isDir(to) ? rel + '/' : rel) + hash
  return (isDir(to) ? './' : '../' + path.basename(to)) + hash
}

export = relativize
