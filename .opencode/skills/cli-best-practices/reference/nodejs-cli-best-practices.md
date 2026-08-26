# Node.js CLI best practices — checklist applied to pdocs

Adapted from lirantal/nodejs-cli-apps-best-practices
(https://github.com/lirantal/nodejs-cli-apps-best-practices), trimmed to the
items actually relevant to a single-binary, no-daemon CLI like `pdocs`, with
notes on what this codebase does for each and where to look.

## Command line experience

| Practice | Status | Where |
|---|---|---|
| POSIX-ish args, `-h`/`--help` per subcommand | Done | `bin.ts`'s `COMMAND_HELP` map, `src/lib/args.ts` |
| Colour with opt-out | Done | `src/lib/theme.ts`, `--no-color`/`NO_COLOR`/`FORCE_COLOR` |
| Rich interactions (prompts, spinners) | Done | `@inquirer/prompts` in `new.ts`; `ora` spinners in `dev.ts`/`publish.ts` |
| Zero configuration / sane defaults | Done | every command defaults `--dir` to cwd (or its enclosing repo via `findRepoRoot`) |
| Respect POSIX signals | Done | `dev.ts`, `run-script.ts`, `dev-server.ts` all forward/handle SIGINT/SIGTERM |
| Helpful help on bad/no invocation | Done | bare `pdocs` prints help and exits 0 (not an error — matches git/npm) |

## Distribution

| Practice | Status | Notes |
|---|---|---|
| Small dependency footprint | Done | 2 prod deps: `@inquirer/prompts`, `ora`; no arg-parsing framework, no colour library |
| Lockfile | Done | pnpm workspace lockfile at the monorepo root |
| Shebang autodetects runtime | Done | `#!/usr/bin/env node` in `bin.ts`, preserved into `build/bin.js` |

## Interoperability

| Practice | Status | Notes |
|---|---|---|
| Structured (`--json`) output | Partial | `doctor --json` only, the command most likely to be scripted; extend per-command as needed |
| Cross-platform spawn | Done | `npm.cmd`/`antora.cmd` on win32 (see `run-script.ts`, `dev-server.ts`) |
| Config precedence (flags > configured > default) | Done | `src/lib/config-resolver.ts`, used by `publish.ts`/`upgrade.ts` |
| Gate interactive behaviour | Done | `new.ts`'s wizard only runs on a real TTY, or with an explicit `--yes` skip |
| Distinguish stdout/stderr | Done | primary output → stdout; banner/errors/warnings/spinners → stderr |
| Shell completion | Done | `pdocs completion bash\|zsh` (`src/commands/completion.ts`) |

## Accessibility / errors / versioning

| Practice | Status | Notes |
|---|---|---|
| `--version`/`-v` | Done | reads the CLI's own installed `package.json` at runtime — never a compile-time constant (`lib/cli-info.ts`) |
| Debug mode | Done | `--verbose` / `DEBUG=pdocs` (`lib/debug-log.ts`) |
| Exit codes | Done | every command returns 0/1; `process.exitCode`, never an abrupt `process.exit()` |
| Actionable errors | Done | most failure messages name the next command to run (`pdocs new` first, `npm install --save-dev <driver>`, etc.) |
| Trackable/coded errors | Not done | no `E1234`-style error codes; deferred — errors are prose, not codes, and this is a small enough surface that grep-the-message works fine today |

## Deliberately not adopted

- **A CLI framework (commander/yargs).** See the skill's own "No
  argument-parsing framework" section — the surface is small enough that
  `lib/args.ts`'s ~30 lines plus `bin.ts`'s help-interception cover the same
  user-visible behaviour (per-subcommand help, global flags) without a new
  dependency or an invasive rewrite of every command's argv handling.
- **Docker distribution.** `pdocs` is only ever installed as a devDependency
  of a documentation site's own `docs/package.json` — there is no
  standalone/public-facing use case a container would serve here.
