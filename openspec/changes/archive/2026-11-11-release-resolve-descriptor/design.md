# Design

## Context

See proposal.md. The release workflow runs from `docs/` (working-directory) and already detects mode via the playbook `tags:` line. The release workflow resolves from `workflow_dispatch` input or `.release-version`; the preview resolves from `.release-version` only and has no Node setup. The release workflow calls the project's installed CLI (`npx docouture ...`).

## Goals / Non-Goals

**Goals:**
- One tested implementation of resolve plus SemVer validation, shared by both workflows.
- Identical observable behavior (tags, messages, comments) to today.

**Non-Goals:**
- New resolvers, `versionSource` config, mode detection in the CLI (workflows keep passing `--mode`).

## Decisions

- **Command shape: `docouture release resolve --mode <versioned|standalone> [--version <v>] [--report] [--dir <path>]`.** `release` is a command group so `version-source`-adjacent subcommands can follow. Alternative: a flat `release-resolve` command; rejected because change 2 and later work extend the group naturally.
- **Output as `key=value` lines** (`version`, `tag`, `source`, `error`, `error_value`) on stdout, appended to `$GITHUB_OUTPUT` by the workflow. Alternative: JSON; rejected because shell consumers need no `jq`.
- **`--report` mode** exits 0 and emits `error=missing|invalid` so a caller that wants to comment instead of fail can (no workflow uses it yet, since the preview stays on bash); without it, errors go to stderr with exit 1 (release workflow). One validator, two reporting modes.
- **SemVer regex moved to a lib module** with unit tests; the bash copies are deleted.
- **The preview does not call the CLI.** It has no Node, package-manager or install steps, and only posts a comment. Adding them would slow every docs-label PR. Alternative: install and call `release resolve --report` there; rejected on cost. The duplicated SemVer regex is guarded by a parity test that extracts it from the template and runs it against the same corpus as the CLI's.
- **Mode stays a workflow input.** Detection from the playbook stays in bash for now; moving it in would widen scope.

## Risks / Trade-offs

- [Workflow template upgraded before the CLI] → the `docouture upgrade` ordering is documented in release notes; `doctor` support for this lands in change 2.
- [Preview's bash SemVer regex drifts from the CLI's] → parity test in `release-resolve.spec.ts`.
- [Repo copies of workflows diverge from templates] → update both in the same task group.
