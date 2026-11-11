## MODIFIED Requirements

### Requirement: Flow detection from package.json
The release workflow SHALL read `docouture.branching` and `prereleaseBranch` from `docs/package.json`. An absent `branching` SHALL be treated as trunk-based. `git-flow` without `prereleaseBranch` SHALL fail in versioned mode under the `descriptor` version source with a message pointing at `docouture upgrade`. Under other version sources it SHALL NOT fail, since no sync pull request is opened.

#### Scenario: Missing prerelease name
- **WHEN** `branching` is `git-flow`, the source is `descriptor` and `prereleaseBranch` is absent
- **THEN** the run fails naming `docouture upgrade`

#### Scenario: Missing prerelease name, other source
- **WHEN** `branching` is `git-flow`, the source is `tag-bump` and `prereleaseBranch` is absent
- **THEN** the run does not fail on that account

### Requirement: Skip conditions
The sync SHALL be skipped for trunk-based sites, standalone mode, a version source other than `descriptor`, republishes (tag already existed), a missing prerelease branch, or when the prerelease branch already contains the release branch. The descriptor bump SHALL likewise run only under `descriptor`.

#### Scenario: Trunk-based
- **WHEN** `branching` is `trunk-based`
- **THEN** the sync job is skipped

#### Scenario: Other source
- **WHEN** the version source is `github-release` or `tag-bump`
- **THEN** neither the descriptor bump nor the sync job runs
