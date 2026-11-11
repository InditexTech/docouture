# Tasks

## 1. Resolver library

- [x] 1.1 Add SemVer precedence comparison and a `bumpVersion` helper in a lib module; verify unit tests cover stable, prerelease ordering, build metadata ignored, and `semver.inc` parity for patch/minor/major (including `1.2.0-rc.1` patch becomes `1.2.0`)
- [x] 1.2 Extend `resolveRelease` with the `github-release` resolver (prefix stripping, wrong-prefix and `docs/release` PR failures) and the `tag-bump` resolver (label precedence, no-tag failure, explicit override); verify unit tests cover every scenario in `docs-release-resolve`
- [x] 1.3 Add `usesDescriptor` to the resolution and reject unknown sources; verify tests for standalone, each source and the typo case

## 2. `release resolve` command

- [x] 2.1 Add `--event`, `--release-tag`, `--labels` inputs, read `versionSource`/`versionSourcePrefix` from `docs/package.json`, list `docs/v*` tags with git, and print `source` and `uses_descriptor`; verify `release.spec.ts` asserts the new output lines and exit codes against a temp git repo with tags
- [x] 2.2 Update the command's help text and `docs/.../reference-cli.adoc`; verify the help and completion specs pass and the docs build passes

## 3. Declaration writer

- [x] 3.1 Add `package-version-source.ts` (read, validate, write after `branching`/`prereleaseBranch`, idempotent, key order preserved); verify unit tests for absent, valid, invalid, rewrite and idempotent cases

## 4. Workflows

- [x] 4.1 In `docouture-release.yml` gate the bump step, the `prereleaseBranch` requirement and `sync-prerelease` on `uses_descriptor`, and extend the job `if:` with `docs/release-minor` and `docs/release-major`; verify `actionlint` passes and the template-render tests pass
- [x] 4.2 In `docouture-release-preview.yml` read the source with `node -p`, keep the bash path for `descriptor`, post the fixed message for `github-release`, and for `tag-bump` add setup, install, tag fetch and `release resolve`; extend the job conditions with the bump labels; verify `actionlint` passes and the SemVer parity test still passes
- [x] 4.3 Mirror both workflow edits in `.github/workflows/docouture-release*.yml`; verify the diff matches the templates apart from placeholders

## 5. CLI commands

- [x] 5.1 Add the `version-source` command (target argument, `--dry-run`, `--version`, `--dir`, standalone refusal, descriptor seeding from the latest tag, file removal with pending-value warning, label commands for `tag-bump`); verify its spec covers each scenario in `docs-version-source`
- [x] 5.2 Register `version-source` in `bin.ts` and `completion.ts`; verify completion and help specs pass
- [x] 5.3 Add the wizard prompt and `--version-source` to `new` (versioned only, label commands for `tag-bump`, `.release-version` only for `descriptor`); verify `new.spec.ts` covers default, each source and the standalone rejection
- [x] 5.4 Backfill `versionSource: descriptor` in `upgrade` (idempotent, versioned only, no prompt, pointer message) and add the CLI skew warning; verify `upgrade.spec.ts` covers legacy, second-run and standalone cases
- [x] 5.5 Add the doctor checks (active source, stray or missing `.release-version`, CLI lacks `release resolve`, skew); verify `doctor-checks.spec.ts` covers each warning and the clean case

## 6. Documentation

- [x] 6.1 Document the sources in the releasing and branching guides and the CLI reference, update the `docouture-docs-versioning` skill, the starter `getting-started.adoc` and `agent-support/AGENTS.md`, and the AGENTS.md documentation-state ledger; verify the docs build passes and the skills sync check passes
- [x] 6.2 Add the release-notes entry with the upgrade order (bump and install the CLI, `docouture upgrade`, optionally `docouture version-source`); verify the docs build passes
