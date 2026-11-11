## MODIFIED Requirements

### Requirement: Version errors
Under the `descriptor` version source in versioned mode, when `docs/.release-version` is missing or not valid SemVer, the preview SHALL post an error instead of the release preview and SHALL say that the docs release will fail. For a pull request with T, it SHALL say the failure happens when the code release publishes a GitHub Release, after the code release has gone out, not on merge.

#### Scenario: Missing version, docs only
- **WHEN** a versioned-mode `descriptor` pull request has `docs/release`, no T and no `docs/.release-version`
- **THEN** the comment says the docs release will fail and asks to add the file before merging

#### Scenario: Invalid version with a code release
- **WHEN** a versioned-mode `descriptor` pull request has `docs/release`, T and an invalid `docs/.release-version`
- **THEN** the comment says the docs release will fail when the code Release is published, not on merge

## ADDED Requirements

### Requirement: Preview by version source
The preview SHALL read the version source from `docs/package.json`. Under `descriptor` it SHALL NOT install dependencies. Under `github-release` it SHALL state that the docs are released when the code release publishes a GitHub Release, with no version, and that a `docs/release` label does not release them on merge. Under `tag-bump` it SHALL compute the version with `docouture release resolve` and state it as the version released if the pull request merged now, noting the version can change if another release lands first.

#### Scenario: github-release
- **WHEN** a `github-release` pull request has `docs/release`
- **THEN** the comment says the docs follow the code release and names no version

#### Scenario: tag-bump
- **WHEN** a `tag-bump` pull request has `docs/release-minor` and the latest tag is `docs/v1.2.3`
- **THEN** the comment says merging now releases `docs/v1.3.0`, and that the version can change if another release merges first

#### Scenario: Descriptor stays cheap
- **WHEN** the version source is `descriptor`
- **THEN** the job runs no install step

### Requirement: Bump labels trigger the preview
Under `tag-bump`, a pull request with `docs/release-minor` or `docs/release-major` SHALL be previewed like one with `docs/release`.

#### Scenario: Minor label only
- **WHEN** a `tag-bump` pull request has `docs/release-minor` and no `docs/release`
- **THEN** the release preview is posted
