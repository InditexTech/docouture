// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// `docouture upgrade` cleanup for the removed check-links feature (GH #273):
// takes docs/package.json's text and returns it without the `check-links`
// script, the `docouture.checkLinks` block and — only when nothing else
// references it — the `linkinator` devDependency.

export interface CheckLinksRemoval {
  content: string
  changed: boolean
  removed: string[]
  keptLinkinator: boolean
}

type Json = Record<string, unknown>

function detectIndent(text: string): string | number {
  return /^([ \t]+)"/m.exec(text)?.[1] ?? 2
}

export function removeCheckLinks(original: string): CheckLinksRemoval | null {
  let pkg: Json
  try {
    pkg = JSON.parse(original) as Json
  } catch {
    return null
  }
  const removed: string[] = []
  let keptLinkinator = false

  const scripts = pkg.scripts as Record<string, unknown> | undefined
  if (scripts && 'check-links' in scripts) {
    delete scripts['check-links']
    removed.push('scripts.check-links')
  }

  const docouture = pkg.docouture as Json | undefined
  if (docouture && 'checkLinks' in docouture) {
    delete docouture.checkLinks
    removed.push('docouture.checkLinks')
  }

  const dev = pkg.devDependencies as Record<string, unknown> | undefined
  if (dev && 'linkinator' in dev) {
    const usedElsewhere = Object.values(scripts ?? {}).some((v) => typeof v === 'string' && v.includes('linkinator'))
    if (usedElsewhere) keptLinkinator = true
    else {
      delete dev.linkinator
      removed.push('devDependencies.linkinator')
    }
  }

  if (removed.length === 0) return { content: original, changed: false, removed, keptLinkinator }
  const content = `${JSON.stringify(pkg, null, detectIndent(original))}\n`
  return { content, changed: content !== original, removed, keptLinkinator }
}
