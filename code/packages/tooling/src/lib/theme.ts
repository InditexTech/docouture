'use strict'

import { getContext } from './cli-context.js'

// A small themed colour layer — ported from packages/cli/src/lib/theme.ts
// (GH-140) so this CLI's output honours --no-color/NO_COLOR/FORCE_COLOR the
// same way docouture-cli's does, rather than reintroducing the hand-rolled
// raw ANSI escapes the justfile's own `doctor`/`_hdr`/`local-registry-start`
// recipes had before this package existed.
//
// Re-checks getContext().noColor on every call rather than computing once at
// import time, so --no-color (parsed off argv in bin.ts, after this module
// may already have been imported transitively) is honoured for every line
// printed, not just ones printed after the flag was known.

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

/** Exposed for callers that need a plain yes/no rather than a wrapped string. */
export function isColourEnabled(): boolean {
  return colourEnabled()
}
