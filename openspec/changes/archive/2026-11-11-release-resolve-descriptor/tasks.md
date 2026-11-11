# Tasks

## 1. Resolver library

- [x] 1.1 Add a lib module with the descriptor resolver and SemVer 2.0.0 validation; verify unit tests cover valid, prerelease, `v1.2`, `1.2`, `stable`, missing file, explicit-over-file and standalone cases
- [x] 1.2 Add the `release resolve` command (`src/commands/release.ts`) with `--mode`, `--version`, `--report`, `--dir`; verify its spec asserts `key=value` output, exit codes and report mode

## 2. CLI wiring and docs

- [x] 2.1 Register `release` in `bin.ts` (COMMAND_INFO, command map) and `completion.ts`; verify the completion and help specs pass
- [x] 2.2 Document the command in `docs/.../reference-cli.adoc` and update the AGENTS.md documentation-state row; verify the docs build passes

## 3. Workflows

- [x] 3.1 Replace "Resolve version" and "Validate version" in `templates/workflows/docouture-release.yml` with `npx docouture release resolve`; verify `actionlint` or the template copy tests pass and outputs keep the same names
- [x] 3.2 Add a parity test that extracts the SemVer regex from `docouture-release-preview.yml` and checks it agrees with the CLI's on the same corpus; verify it passes
- [x] 3.3 Apply the same edit to the repo's own `.github/workflows/docouture-release.yml`; verify the diff matches the templates apart from placeholders
