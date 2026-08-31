// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { getContext } from './cli-context.js'

// A small themed colour layer, replacing both bin.ts/new.ts's direct use of
// picocolors and doctor.ts's own hand-rolled raw ANSI escapes (see their old
// comments) with one place that: (a) has a single, consistent set of
// semantic roles (success/error/warn/info/muted/bold) instead of each file
// picking its own raw colour, and (b) decides whether colour is on fresh on
// every single call rather than once at import time.
//
// That second point is why this doesn't just re-export picocolors: picocolors
// (like most colour libraries) computes `isColorSupported` once, when the
// module is first imported — which happens before bin.ts has even parsed
// --no-color off argv. Re-checking `getContext().noColor` on every call
// means --no-color (and NO_COLOR/FORCE_COLOR, which can't change at runtime
// either way) are honoured for every single line printed, not just the ones
// printed by a module that happened to import picocolors after the flag was
// known.

const CODES = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  cyan: '\u001b[36m',
} as const

function colourEnabled(): boolean {
  if (getContext().noColor) return false
  if (process.env.NO_COLOR) return false
  if (process.env.FORCE_COLOR) return true
  return process.stdout.isTTY === true
}

function wrap(code: string): (text: string) => string {
  return (text: string) => (colourEnabled() ? `${code}${text}${CODES.reset}` : text)
}

export const theme = {
  bold: wrap(CODES.bold),
  dim: wrap(CODES.dim),
  success: wrap(CODES.green),
  error: wrap(CODES.red),
  warn: wrap(CODES.yellow),
  info: wrap(CODES.cyan),
}

/** Exposed for callers (doctor.ts) that need a plain yes/no rather than a wrapped string. */
export function isColourEnabled(): boolean {
  return colourEnabled()
}
