# Design

## Context

See proposal.md. After `release-resolve-descriptor`, `docouture release resolve` implements only the `descriptor` resolver (`src/lib/release-resolve.ts`, a pure function plus file IO in `src/commands/release.ts`), and the release workflow's "Resolve version" step calls it. The preview workflow (`docouture-release-preview.yml`) still resolves in bash and has no Node, package-manager or install steps; a parity test guards its SemVer regex.

The release workflow gates itself on `docs/release` in its job `if:`, runs the descriptor bump on the release branch, and runs `sync-prerelease` under git-flow when the bump happened. `docs/package.json`'s `docouture` block is written by `src/lib/package-branching.ts` (`setBranching`), and `new`, `branch-model` and `upgrade` already maintain it.

## Goals / Non-Goals

**Goals:**
- Per-site choice of version source, with `descriptor` as an unchanged default.
- One tested resolver implementation for all three sources, used by both workflows where a version must be computed.
- The descriptor-only machinery (bump push, sync job, `.release-version`) is cleanly skipped for the other sources.

**Non-Goals:**
- Custom script or npm resolvers, automatic migration during `upgrade`, standalone mode, and any GitHub API call from the CLI.

## Decisions

- **`versionSource` lives in `docs/package.json`'s `docouture` block**, read by workflows through `release resolve` (and by the preview with `node -p`). Alternative: a repo variable or workflow input; rejected because the declaration must travel with the site, like `branching`, and be checked by `doctor`. A shared writer `package-version-source.ts` mirrors `package-branching.ts`, keeping key order and idempotency.
- **Pure resolvers with injected inputs.** `resolveRelease({ mode, source, explicit, descriptor, event, releaseTag, labels, tags, prefix })` returns the existing `ReleaseResolution` plus `usesDescriptor`. The command gathers the inputs (reads `.release-version`, runs `git tag -l 'docs/v*'`, parses `--event`, `--release-tag`, `--labels`) and prints `key=value` lines. This keeps every rule unit-testable without git or GitHub.
- **Hand-written SemVer comparison** in a lib module (precedence including prerelease identifiers, build metadata ignored), plus a `bumpVersion(version, level)` that matches `semver.inc` for patch/minor/major on stable and prerelease inputs. Alternative: depend on `semver`; rejected for one small, well-specified function, and revisited if the test corpus gets awkward.
- **Bump selection from labels.** `docs/release` is patch, `docs/release-minor` minor, `docs/release-major` major, highest wins. A `workflow_dispatch` run has no labels, so under `tag-bump` it needs an explicit version (the same override covers republish and the first release).
- **Descriptor-only steps gate on `uses_descriptor`.** The "Resolve version" step writes `uses_descriptor` to `$GITHUB_OUTPUT`; "Bump release descriptor" and the `sync-prerelease` condition test it. The git-flow check that demands `prereleaseBranch` runs only when it is true.
- **Trigger conditions** in the release workflow's job `if:` and the preview's job conditions also match `docs/release-minor` and `docs/release-major`. These labels are harmless under other sources because `resolve` fails or ignores them as the specs state.
- **Preview stays cheap for `descriptor`.** A first step reads `versionSource` with `node -p` (Node is preinstalled on runners). `descriptor` keeps the existing bash path with no install; `github-release` posts a fixed message; `tag-bump` runs the same setup-node, package-manager and install steps as the release workflow (same template placeholders), fetches tags, and calls `release resolve`. Alternative: always install; rejected on cost for the common case. This reverses change 1's "preview never calls the CLI" decision only for `tag-bump`, where the logic cannot reasonably stay in bash.
- **Wizard and flags.** `new` adds one `select` prompt after the versioning-mode and branching questions, versioned only, plus `--version-source`. `upgrade` backfills `descriptor` without prompting. `version-source` mirrors `branch-model`'s structure: argument parsing, `--dry-run`, `--dir`, shared `package-version-source.ts`, and re-uses nothing from workflow re-rendering (workflows read the source at run time, so no re-render is needed).
- **CLI skew warning.** `upgrade` and `doctor` compare the running CLI version with the one resolved by the project's `docs/package.json`/lockfile and warn on a mismatch, since workflows use the project's installed CLI. `doctor` also warns when the project's CLI lacks `release resolve` (probed through the resolved package's version).

## Risks / Trade-offs

- [Workflow upgraded before the CLI] → the documented order is bump CLI, install, `docouture upgrade`, then optionally `version-source`; `upgrade` and `doctor` warn on skew.
- [Concurrent releases under `tag-bump`] → the preview says "if merged now"; the release workflow's existing concurrency group serializes runs and the tag is recomputed at run time.
- [Race between the code release and the docs release under `github-release`] → the existing `release: published` trigger fires the docs release; `workflow_dispatch` with an explicit version remains the repair path.
- [Switching sources by hand] → `version-source` makes the file and label side effects explicit and supports `--dry-run`; `doctor` catches a stray or missing `.release-version`.
- [A larger change than the first half] → tasks are ordered resolver library first, then command inputs, workflows, commands and docs, with each group landing its own tests.

## Migration Plan

Existing sites need no action: an absent `versionSource` means `descriptor`, and `upgrade` writes it explicitly. A site moves to another source with `docouture version-source <source>`, after upgrading its CLI.
