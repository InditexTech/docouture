## Why

The docs version is resolved by bash duplicated in `docouture-release.yml` and `docouture-release-preview.yml` (resolve source, SemVer validation, error wording). The logic is untested and the two copies can drift. This is step one of #299 (pluggable version resolvers): put resolution in one tested CLI command, with no behavior change, so the later `github-release` and `tag-bump` resolvers (change 2) have a single place to land.

## What Changes

- Add `docouture release resolve`: given the trigger context (event, dispatch version, mode), it prints the resolved version, its source, and validation errors, using the `descriptor` resolver only (`workflow_dispatch` input, else `docs/.release-version`).
- Move SemVer validation and the "missing / invalid version" decisions into the command. Exit non-zero with a message on failure.
- Replace the inline "Resolve version" and "Validate version" bash in `docouture-release.yml` (template and the repo's own copy) with a call to the command.
- The preview workflow keeps its own bash resolve and SemVer check, since it has no Node or install steps and only posts a comment. A parity test fails if its regex diverges from the CLI's.
- Keep the `release: published` trigger reading `docs/.release-version` under `descriptor` (decision A of #299). Behavior is unchanged.
- No new config key: `docouture.versionSource` is introduced in change 2. Absence means `descriptor`.

Non-goals: the `github-release` and `tag-bump` resolvers, the `version-source` command, `new`/`upgrade`/`doctor` changes (all change 2).

## Capabilities

### New Capabilities
- `docs-release-resolve`: contract of `docouture release resolve` (inputs, outputs, validation, exit codes) for the `descriptor` resolver.

### Modified Capabilities
None. The preview's observable behavior is unchanged.

## Impact

- `code/packages/cli`: new `src/commands/release.ts` (plus spec, `bin.ts` COMMAND_INFO, completion), workflow templates.
- `.github/workflows/docouture-release.yml`: the repo's own copy.
- Sites need the new CLI installed before their workflows are upgraded (workflows run the project's installed CLI). `docs/reference-cli.adoc` and release notes updated.
- `docs-release-prerelease-sync` is untouched here (the bump and sync job stay).
