## Purpose

Defines how `docouture release resolve` decides which docs version a release run targets, so the release and preview workflows share one validated source of truth instead of duplicated shell.

## ADDED Requirements

### Requirement: Resolve command interface
`docouture release resolve` SHALL accept the site mode (`versioned` or `standalone`), an optional explicit version, and the repository root (default: cwd, or its enclosing repo), and SHALL print the resolved version, the release tag and the source the version came from. It SHALL expose these as `key=value` lines suitable for appending to `$GITHUB_OUTPUT`.

#### Scenario: Versioned, version from the descriptor
- **WHEN** it runs in `versioned` mode without an explicit version and `docs/.release-version` contains `1.2.0`
- **THEN** it reports version `1.2.0`, tag `docs/v1.2.0` and source `docs/.release-version`, and exits 0

#### Scenario: Standalone
- **WHEN** it runs in `standalone` mode
- **THEN** it reports version `stable` and tag `docs/stable` regardless of any file or explicit version, and exits 0

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

### Requirement: Descriptor is the only resolver
Until a different resolver is configured, the command SHALL resolve versions only from the explicit input or `docs/.release-version`, and SHALL NOT read the GitHub Release tag. A `release: published` run therefore keeps reading `docs/.release-version`.

#### Scenario: Release event
- **WHEN** a workflow runs the command for a `release: published` event with no explicit version
- **THEN** the version comes from `docs/.release-version`

### Requirement: Validation-only reporting
The command SHALL provide a mode that reports a validation failure as output (an error kind: missing or invalid) with exit 0, so the preview workflow can post a comment instead of failing the job.

#### Scenario: Preview with a bad version
- **WHEN** the command runs in report mode with an invalid `docs/.release-version`
- **THEN** it exits 0 and reports the error kind `invalid` and the offending value
