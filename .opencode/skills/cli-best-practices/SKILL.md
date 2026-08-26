---
name: cli-best-practices
description: How the pdocs CLI (code/packages/cli) is built to Node.js CLI best practices — global flags, colour/output discipline, the banner, signal handling for spawned children, and config precedence. USE WHEN adding or editing a command in code/packages/cli, wiring a new flag, touching bin.ts, or reviewing a change to that package for polish/consistency.
---

## House rules for the pdocs CLI

These conventions came out of a deliberate pass to align `code/packages/cli`
with community Node.js CLI best practices (see
`reference/nodejs-cli-best-practices.md` for the checklist this was measured
against). Follow them when adding a command or touching `bin.ts` — most of
this is about *not quietly reintroducing* a gap that was closed on purpose.

### No argument-parsing framework, on purpose

`src/lib/args.ts` is a ~30-line hand-rolled `--flag value` / `--flag`
parser, not commander/yargs. This is a deliberate, documented choice (see
that file's own header comment): the surface here is small enough that a
dependency doesn't earn its weight. Per-subcommand `--help` is instead
handled centrally in `bin.ts` via a `COMMAND_HELP` map, intercepted *before*
a command's own `parseArgs` ever sees argv. Don't reach for commander/yargs
to "fix" this — extend `COMMAND_HELP` instead when a command gains an
option worth documenting.

### Global flags vs per-command flags

Three flags are global, recognised anywhere in argv by
`src/lib/global-flags.ts`'s `extractGlobalFlags()`, and stripped before a
command's own `parseArgs` runs:

- `--json` — machine-readable output where a command supports it (currently
  `doctor`). Extend a command's own output path, gated on
  `getContext().json`, rather than adding a second ad hoc `--json` per
  command.
- `--verbose` — same effect as `DEBUG=pdocs` (see `src/lib/debug-log.ts`);
  logs to stderr only, never stdout.
- `--no-color` / `--color` — forces colour off/on regardless of TTY
  detection; read by `src/lib/theme.ts`.

They're read from `src/lib/cli-context.ts`'s module-level `getContext()`,
set once in `bin.ts` before dispatch. Never re-parse `process.argv` for
these inside a command — read the context instead.

### Colour: `theme.ts`, not picocolors directly

`src/lib/theme.ts` exposes semantic roles (`bold`, `dim`, `success`,
`error`, `warn`, `info`) built on raw ANSI codes, deciding whether colour is
on **fresh on every call** — never cached at import time. This is why it's
not a picocolors re-export: picocolors (like most colour libraries)
computes colour support once, at first import, which is *before* `bin.ts`
has parsed `--no-color` off argv. Always import `theme` for anything
printed to the user; don't hand-roll a raw `\u001b[...]` escape or add a
new colour dependency.

### The banner

`bin.ts`'s `banner()` prints `<name> v<version>` to **stderr**, once per
invocation, right before a command actually runs — not just on
`--version`/`--help`/error paths. Suppressed under `--json` (stdout is
promised clean there) and for `completion` (its output is meant to be
`eval`'d or redirected silently). A new command is included automatically;
only opt a command out via `QUIET_COMMANDS` if its output is also meant to
be machine-consumed or sourced.

### stdout vs stderr

Primary output → stdout (banner excluded — it's presentational, not data).
Errors, warnings, diagnostics, the banner, spinners → stderr. `doctor`'s
human-readable report is itself primary output (its whole purpose), so it
stays on stdout; `--json` is the structured-output escape hatch rather than
splitting the human report across streams.

### Signals and spawned children

Every place this CLI spawns a real child process now forwards SIGINT/SIGTERM
to it and tracks it for cleanup:

- `src/lib/run-script.ts` (`pdocs build`'s `npm run build`) forwards both
  signals to the child and removes the listeners once it exits.
- `src/lib/dev-server.ts` tracks the in-flight `antora` rebuild child so
  `close()` (itself called from `dev.ts`'s own SIGINT/SIGTERM handler) can
  kill a rebuild that's still running when shutdown starts.

A new command that spawns a long-running child process should do the same:
register `process.once('SIGINT'/'SIGTERM', ...)` for the child's lifetime,
and remove the listeners once it's done (a `once` that's never fired is a
listener leak across repeated calls in a test suite).

### Cross-platform spawn

Anything invoked by bare name — `npm`, a project-local `.bin/antora` — needs
a platform-specific binary name on Windows (`npm.cmd`, `antora.cmd`), not
`shell: true` (which changes quoting rules for no benefit here). See
`run-script.ts` and `dev-server.ts`'s `defaultRunBuild` for the pattern:

```ts
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
```

### Config precedence

`src/lib/config-resolver.ts`'s `resolveConfig(defaults, configured, flags)`
is the one place the "CLI flag > configured value > default" merge rule
lives. `publish.ts` (options) and `upgrade.ts` (title) both use it. Add a
new precedence-merged value through this function rather than hand-rolling
another `{ ...a, ...b }` spread — an `undefined` in a higher-precedence
layer must never silently erase a real lower-precedence value, which is
exactly what a naive spread gets wrong and `resolveConfig` gets right.

### Debug logging

`src/lib/debug-log.ts`'s `debugLog(message)` prints to stderr only when
`--verbose` or `DEBUG=pdocs`/`DEBUG=*` is set. Use it for "what did we just
spawn and where" detail (see its call sites in `run-script.ts`/
`dev-server.ts`) — not for anything a user needs to see by default.

### Shell completion

`src/commands/completion.ts` generates bash/zsh scripts from one literal
`COMMANDS` array. When adding a new top-level command to `bin.ts`'s
`RUNNERS`, add it to `COMMANDS` too — there's a test
(`completion.spec.ts`) asserting every entry appears in both generated
scripts, but nothing enforces the two lists stay in sync automatically.

### Testing expectations for a new/changed command

- Reset `src/lib/cli-context.ts` between tests (`resetContext()` in
  `afterEach`/`beforeEach`) if the test touches `--json`/`--verbose`/
  `--no-color` — it's a module-level singleton and vitest runs every spec
  file in the same process.
- Assert on `console.error`/`console.log` spies for text, and on the actual
  return code — not on ANSI escape sequences (theme output is
  environment-dependent; tests run under a non-TTY, so colour is off by
  default anyway).
- A command that spawns a child process should have at least one test
  proving signal listeners don't leak (see `run-script.spec.ts`).
