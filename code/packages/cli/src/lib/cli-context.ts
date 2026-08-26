'use strict'

// Global flags (--json, --verbose, --no-color) are parsed once in bin.ts,
// before any command dispatch, and stashed here — every command, plus
// lib/theme.ts and lib/debug-log.ts, reads them back through getContext()
// rather than re-parsing argv or reaching for process.env directly. A
// module-level singleton (not passed down as an argument) because these
// three flags are cross-cutting concerns of the whole process, the same
// way NO_COLOR/DEBUG themselves are process-wide rather than per-function.

export interface CliContext {
  /** Suppresses the banner and switches doctor's output to machine-readable JSON. */
  json: boolean
  /** Enables lib/debug-log.ts's debugLog() output on stderr. */
  verbose: boolean
  /** Forces colour off regardless of TTY/NO_COLOR/FORCE_COLOR — see lib/theme.ts. */
  noColor: boolean
}

const DEFAULT_CONTEXT: CliContext = { json: false, verbose: false, noColor: false }

let context: CliContext = { ...DEFAULT_CONTEXT }

export function setContext(next: Partial<CliContext>): void {
  context = { ...context, ...next }
}

export function getContext(): CliContext {
  return context
}

// Test-only: every other consumer only ever wants to add to context, never
// to guarantee a clean slate — vitest, however, runs every *.spec.ts in the
// same process, so a --json/--verbose/--no-color set by one test would
// otherwise leak into the next.
export function resetContext(): void {
  context = { ...DEFAULT_CONTEXT }
}
