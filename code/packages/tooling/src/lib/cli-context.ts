'use strict'

// Global flags (--json, --verbose, --no-color) are parsed once in bin.ts,
// before any command dispatch, and stashed here — every command, plus
// lib/theme.ts, reads them back through getContext() rather than
// re-parsing argv or reaching for process.env directly. Ported from
// packages/cli/src/lib/cli-context.ts (GH-140) — same contract, smaller
// surface (no debug-log consumer yet).

export interface CliContext {
  /** Switches doctor's output to machine-readable JSON. */
  json: boolean
  /** Reserved for future debug-log output; parsed and stored today, not yet read anywhere. */
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
// to guarantee a clean slate — vitest runs every *.spec.ts in the same
// process, so a --json/--verbose/--no-color set by one test would
// otherwise leak into the next.
export function resetContext(): void {
  context = { ...DEFAULT_CONTEXT }
}
