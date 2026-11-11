// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export type SiteMode = 'versioned' | 'standalone'

// Same signal docouture-release.yml's "Detect mode" step reads: the first
// `tags:` line of antora-playbook.yml says `docs/v*` (versioned) or
// `docs/stable` (standalone). Derived live, never stored.
export function detectModeFromPlaybook(content: string): SiteMode | null {
  const line = content.split('\n').find((candidate) => candidate.includes('tags:'))
  if (line === undefined) return null
  if (line.includes('v*')) return 'versioned'
  if (line.includes('stable')) return 'standalone'
  return null
}

export async function detectSiteMode(siteRoot: string): Promise<SiteMode | null> {
  try {
    return detectModeFromPlaybook(await readFile(join(siteRoot, 'antora-playbook.yml'), 'utf8'))
  } catch {
    return null
  }
}
