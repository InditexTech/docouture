'use strict'

export interface GlobalFlags {
  json: boolean
  verbose: boolean
  noColor: boolean
  rest: string[]
}

/**
 * Recognises the three global flags (--json, --verbose, --no-color/--color)
 * anywhere in argv — before or after the command name, so both
 * `docouture --verbose dev` and `docouture dev --verbose` work — strips them out,
 * and returns what's left for command dispatch. Kept separate from
 * lib/args.ts's per-command parser: these are process-wide concerns (see
 * lib/cli-context.ts), never a value a specific command's own flags need to
 * see, and separate from bin.ts itself so it's testable without triggering
 * bin.ts's own top-level `main()` call.
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
