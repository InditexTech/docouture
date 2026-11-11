# docs-release-prerelease-sync Specification

## Purpose
Defines how the docs release workflow detects the branching model and, under git-flow, opens a sync PR from the stable branch back to the prerelease branch without blocking publication.

## Requirements

### Requirement: Flow detection from package.json
The release workflow SHALL read `docouture.branching` and `prereleaseBranch` from `docs/package.json`. An absent `branching` SHALL be treated as trunk-based. `git-flow` without `prereleaseBranch` SHALL fail in versioned mode under the `descriptor` version source with a message pointing at `docouture upgrade`. Under other version sources it SHALL NOT fail, since no sync pull request is opened.

#### Scenario: Missing prerelease name
- **WHEN** `branching` is `git-flow`, the source is `descriptor` and `prereleaseBranch` is absent
- **THEN** the run fails naming `docouture upgrade`

#### Scenario: Missing prerelease name, other source
- **WHEN** `branching` is `git-flow`, the source is `tag-bump` and `prereleaseBranch` is absent
- **THEN** the run does not fail on that account

### Requirement: Sync PR to the prerelease branch
After a versioned release that bumped `docs/.release-version`, under git-flow the workflow SHALL open a pull request from `automated/sync-docs-release-<version>-to-<prerelease>` into the prerelease branch, containing the release branch state. It SHALL reuse an existing open PR, force-update the branch with lease, retry creation up to 3 times on 5xx after re-checking for an existing PR, and label it `kind/internal` when that label exists.

#### Scenario: Git-flow release
- **WHEN** a versioned release bumps the version on `main` and flow is git-flow
- **THEN** a PR into `develop` carrying the bump exists

#### Scenario: Open PR exists
- **WHEN** an open sync PR for that branch already exists
- **THEN** no second PR is created

### Requirement: Skip conditions
The sync SHALL be skipped for trunk-based sites, standalone mode, a version source other than `descriptor`, republishes (tag already existed), a missing prerelease branch, or when the prerelease branch already contains the release branch. The descriptor bump SHALL likewise run only under `descriptor`.

#### Scenario: Trunk-based
- **WHEN** `branching` is `trunk-based`
- **THEN** the sync job is skipped

#### Scenario: Other source
- **WHEN** the version source is `github-release` or `tag-bump`
- **THEN** neither the descriptor bump nor the sync job runs

### Requirement: Publish is not blocked by sync
The `sync-prerelease` job SHALL run before `publish`, and `publish` SHALL run whenever `release` succeeded, regardless of the sync result. A sync failure SHALL leave the run failed and SHALL comment on the merged `docs/release` PR with the run link when one exists.

#### Scenario: Sync fails
- **WHEN** sync fails after a successful release
- **THEN** docs are still published and the run is red
