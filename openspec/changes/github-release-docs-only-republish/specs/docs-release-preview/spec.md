## MODIFIED Requirements

### Requirement: Preview by version source
The preview SHALL read the version source from `docs/package.json`. Under `descriptor` it SHALL NOT install dependencies. Under `github-release`, for a pull request carrying `docs/release` and no `release-type/*` label, it SHALL list the repository's published Releases, compute the version with `docouture release resolve`, and state it as the version republished if the pull request merged now, noting the version can change if another Release publishes first; when no Release yields a version it SHALL say the merge will fail until a Release is published or the docs are released manually. Under `github-release`, for a pull request that also carries a `release-type/*` label without `skip-release`, it SHALL state that the docs are released when the code release publishes a GitHub Release, with no version. Under `tag-bump` it SHALL compute the version with `docouture release resolve` and state it as the version released if the pull request merged now, noting the version can change if another release lands first.

#### Scenario: github-release
- **WHEN** a `github-release` pull request has `docs/release` and no `release-type/*` label, and the highest published Release is `1.4.0`
- **THEN** the comment says merging now republishes `docs/v1.4.0`, and that the version can change if another Release publishes first

#### Scenario: github-release, no Release yet
- **WHEN** a `github-release` pull request has `docs/release` and the repository has no matching published Release
- **THEN** the comment says the merge will fail until a Release is published or the docs are released manually

#### Scenario: github-release alongside a code release
- **WHEN** a `github-release` pull request has `docs/release` and a `release-type/*` label without `skip-release`
- **THEN** the comment says the docs follow the code release and names no version

#### Scenario: tag-bump
- **WHEN** a `tag-bump` pull request has `docs/release-minor` and the latest tag is `docs/v1.2.3`
- **THEN** the comment says merging now releases `docs/v1.3.0`, and that the version can change if another release merges first

#### Scenario: Descriptor stays cheap
- **WHEN** the version source is `descriptor`
- **THEN** the job runs no install step
