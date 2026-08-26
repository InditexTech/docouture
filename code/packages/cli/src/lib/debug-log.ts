'use strict'

import { getContext } from './cli-context.js'

// Node.js CLI convention (see the debug package, and most CLIs that follow
// it): DEBUG=pdocs or DEBUG=* turns this on from the environment, the same
// as --verbose does from a flag — either is enough. Always written to
// stderr, never stdout, so it never contaminates a command's actual output
// (in particular `pdocs doctor --json`'s piped-and-parsed JSON).
function enabled(): boolean {
  if (getContext().verbose) return true
  const debug = process.env.DEBUG
  if (!debug) return false
  return debug.split(',').some((token) => token.trim() === 'pdocs' || token.trim() === '*')
}

export function debugLog(message: string): void {
  if (!enabled()) return
  console.error(`[pdocs debug] ${message}`)
}
