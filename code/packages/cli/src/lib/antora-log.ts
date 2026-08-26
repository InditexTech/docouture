'use strict'

// Antora's own default log level is `warn` — set explicitly by @antora/
// playbook-builder's convict schema, not the `info` @antora/logger falls
// back to on its own when nothing configures it. Left alone, every one of
// docouture's own Antora pipeline extensions (kroki-prewarm.js, search-index.js,
// llms-txt.js, footer.js, nav-modules.js, not-found-page.js,
// version-report.js — anything calling `context.getLogger('docouture-...')`)
// logs its own healthy-run observability at `info` and is silently dropped
// before it ever reaches stdout. `docouture build`/`docouture dev` pass this to
// every Antora invocation they make so those lines are actually emitted —
// the monorepo's own `just dev`/`just build-site` recipes do the same for
// the identical reason (see justfile's own comments on this).
export const ANTORA_LOG_LEVEL_ARGS: readonly string[] = ['--log-level=info']

// Matches a JSON log line carrying `"level":"warn"` or `"level":"error"`
// (Antora's own genuine signal, regardless of source), or one from any
// `docouture-*` named logger regardless of level (every current and future
// docouture extension follows that naming convention — see the file list
// above) — docouture's own healthy-run observability, which is otherwise
// indistinguishable from Antora's own internal `info` chatter that
// `--log-level=info` also just turned on.
const OBSERVABLE_LINE = /"level":"(?:warn|error)"|"name":"docouture-/

/**
 * Filters raw Antora output (stdout, or stdout+stderr concatenated) down to
 * the lines worth showing on an otherwise-quiet, successful run: see
 * `OBSERVABLE_LINE`'s own comment for exactly which ones. Returns '' when
 * nothing qualifies — callers should skip printing entirely rather than
 * print a blank line. A failed run should show its raw, unfiltered output
 * instead of this — the whole story a filter might otherwise cut short.
 */
export function filterObservableAntoraLog(output: string): string {
  return output
    .split('\n')
    .filter((line) => OBSERVABLE_LINE.test(line))
    .join('\n')
}
