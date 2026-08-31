// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

export interface GlobalFlags {
  json: boolean
  verbose: boolean
  noColor: boolean
  rest: string[]
}

/**
 * Recognises the three global flags (--json, --verbose, --no-color/--color)
 * anywhere in argv — before or after the command name — strips them out,
 * and returns what's left for command dispatch. Ported from
 * packages/cli/src/lib/global-flags.ts (GH-140); kept separate from any
 * per-command flag parsing for the same reason the original is: these are
 * process-wide concerns, never a value a specific command's own flags need
 * to see.
 */
export function extractGlobalFlags(argv: string[]): GlobalFlags {
  const rest: string[] = []
  let json = false
  let verbose = false
  let noColor = false

  for (const arg of argv) {
    if (arg === '--json') json = true
    else if (arg === '--verbose') verbose = true
    else if (arg === '--no-color') noColor = true
    else if (arg === '--color') noColor = false
    else rest.push(arg)
  }

  return { json, verbose, noColor, rest }
}
