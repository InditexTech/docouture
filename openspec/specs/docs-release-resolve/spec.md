# docs-release-resolve Specification

## Purpose
Defines how `docouture release resolve` decides which docs version a release run targets, so the release and preview workflows share one validated source of truth instead of duplicated shell.

## Requirements

### Requirement: Resolve command interface
`docouture release resolve` SHALL accept the site mode (`versioned` or `standalone`), an optional explicit version, the repository root (default: cwd, or its enclosing repo), the event name, the published release tag and the pull request labels, and SHALL print the resolved version, the release tag, the source the version came from and the active version source. It SHALL expose these as `key=value` lines suitable for appending to `$GITHUB_OUTPUT`. It SHALL read the active version source from `docs/package.json`, defaulting to `descriptor`, and SHALL print whether the descriptor bump and prerelease sync apply.

#### Scenario: Versioned, version from the descriptor
- **WHEN** it runs in `versioned` mode with source `descriptor`, without an explicit version, and `docs/.release-version` contains `1.2.0`
- **THEN** it reports version `1.2.0`, tag `docs/v1.2.0` and source `docs/.release-version`, says the descriptor steps apply, and exits 0

#### Scenario: Standalone
- **WHEN** it runs in `standalone` mode
- **THEN** it reports version `stable` and tag `docs/stable` regardless of any file, version source or explicit version, says the descriptor steps do not apply, and exits 0

### Requirement: Explicit version takes precedence
When an explicit version is supplied (the `workflow_dispatch` input), the command SHALL use it instead of `docs/.release-version`, and SHALL report its source as the explicit input.

#### Scenario: Dispatch version
- **WHEN** it runs in `versioned` mode with explicit version `2.0.0` and `docs/.release-version` contains `1.2.0`
- **THEN** it reports version `2.0.0`

### Requirement: Version validation
In `versioned` mode the command SHALL fail with a non-zero exit and a message naming the source when the resolved version is missing, equals `stable`, or is not valid SemVer 2.0.0. Prerelease and build-metadata suffixes SHALL be accepted; a leading `v` and a two-part version SHALL be rejected.

#### Scenario: Missing file
- **WHEN** it runs in `versioned` mode with no explicit version and no `docs/.release-version`
- **THEN** it exits non-zero and says the file is missing

#### Scenario: Invalid SemVer
- **WHEN** the resolved version is `v1.2` or `1.2`
- **THEN** it exits non-zero and says the version is not valid SemVer

#### Scenario: Prerelease suffix
- **WHEN** the resolved version is `1.2.0-rc.1`
- **THEN** it exits 0 and reports tag `docs/v1.2.0-rc.1`

#### Scenario: Reserved name
- **WHEN** versioned mode resolves the version `stable`
- **THEN** it exits non-zero and says `stable` is not a valid versioned version

### Requirement: Descriptor is the default resolver
When `docs/package.json` declares no `versionSource`, or declares `descriptor`, the command SHALL resolve versions only from the explicit input or `docs/.release-version`, SHALL NOT read the GitHub Release tag, and SHALL say the descriptor bump and prerelease sync apply. A `release: published` run under `descriptor` therefore keeps reading `docs/.release-version`.

#### Scenario: Release event
- **WHEN** a workflow runs the command for a `release: published` event, source `descriptor`, with no explicit version
- **THEN** the version comes from `docs/.release-version`

### Requirement: Validation-only reporting
The command SHALL provide a mode that reports a validation failure as output (an error kind: missing or invalid) with exit 0, so the preview workflow can post a comment instead of failing the job.

#### Scenario: Preview with a bad version
- **WHEN** the command runs in report mode with an invalid `docs/.release-version`
- **THEN** it exits 0 and reports the error kind `invalid` and the offending value

### Requirement: Unknown version source
The command SHALL fail with exit 1, naming the valid values, when `versionSource` is not `descriptor`, `github-release` or `tag-bump`.

#### Scenario: Typo
- **WHEN** `versionSource` is `tag_bump`
- **THEN** it exits non-zero and lists `descriptor`, `github-release` and `tag-bump`

### Requirement: github-release resolver
Under `github-release` the version SHALL be the published release tag with `versionSourcePrefix` stripped when declared, and SHALL be validated as SemVer. A tag that does not start with the declared prefix SHALL fail. An explicit version SHALL still take precedence. A pull request event carrying `docs/release` SHALL fail with a message that explains the docs follow the code release and names the configured source. The descriptor steps SHALL NOT apply.

#### Scenario: Plain tag
- **WHEN** the release tag is `1.4.0` and no prefix is declared
- **THEN** it reports version `1.4.0` and tag `docs/v1.4.0`

#### Scenario: Prefixed tag
- **WHEN** the release tag is `docs-site@1.4.0` and the prefix is `docs-site@`
- **THEN** it reports version `1.4.0`

#### Scenario: Wrong prefix
- **WHEN** the release tag is `other@1.4.0` and the prefix is `docs-site@`
- **THEN** it exits non-zero and says the tag does not start with the prefix

#### Scenario: Release label on a merged PR
- **WHEN** a pull request event has `docs/release` and the source is `github-release`
- **THEN** it exits non-zero and says the docs release follows the code release

### Requirement: tag-bump resolver
Under `tag-bump` the version SHALL be the highest existing `docs/v*` tag, by SemVer ordering including prerelease precedence, incremented by the bump the pull request labels select: `docs/release` patch, `docs/release-minor` minor and `docs/release-major` major, the highest bump winning when several labels are present. A bump from a prerelease tag SHALL follow `semver.inc`. An explicit version SHALL take precedence over any bump. The descriptor steps SHALL NOT apply.

#### Scenario: Implicit patch
- **WHEN** the latest tag is `docs/v1.2.3` and only `docs/release` is present
- **THEN** it reports version `1.2.4`

#### Scenario: Minor and major labels
- **WHEN** both `docs/release-minor` and `docs/release-major` are present on top of `docs/v1.2.3`
- **THEN** it reports version `2.0.0`

#### Scenario: Prerelease ordering
- **WHEN** the tags are `docs/v1.2.0-rc.1` and `docs/v1.1.9`
- **THEN** the latest is `1.2.0-rc.1` and a patch bump reports `1.2.0`

#### Scenario: Explicit version
- **WHEN** `--version 3.0.0` is passed on top of `docs/v1.2.3`
- **THEN** it reports version `3.0.0` without bumping

### Requirement: tag-bump without a tag
Under `tag-bump` with no existing `docs/v*` tag and no explicit version, the command SHALL fail saying an explicit version is needed for the first release, for example through `workflow_dispatch`.

#### Scenario: First release
- **WHEN** no `docs/v*` tag exists and no version is given
- **THEN** it exits non-zero and asks for an explicit version

### Requirement: Descriptor-only steps signal
The command SHALL print `uses_descriptor=true` only when the mode is versioned and the source is `descriptor`, so a workflow runs the descriptor bump and the prerelease sync only then.

#### Scenario: tag-bump
- **WHEN** the source is `tag-bump`
- **THEN** it prints `uses_descriptor=false`
